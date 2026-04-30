#!/usr/bin/env node
/**
 * Convert Chrome DevTools Recorder "Export as Puppeteer" into BNDO flow JSON.
 *
 * Goals:
 * - Keep this conversion conservative: prefer stable targets (#id, aria label, text) over dynamic mat-* ids.
 * - Produce a FlowTemplate compatible with lib/compila-bando/types.ts.
 *
 * Usage:
 *   node scripts/recorder/convert_puppeteer_export_to_flow.mjs \
 *     --input "/path/to/export.js" \
 *     --bandoName "Resto al Sud 2.0" \
 *     --procedura "voucher" \
 *     --sub "libero-professionista" \
 *     --out "data/flows/recordings/resto-al-sud-2-0-voucher-libero-professionista.partial.json"
 */

import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function readFile(p) {
  return fs.readFileSync(p, 'utf8');
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function pickBestLocator(locators) {
  // locators: array of strings like "#id", "::-p-aria(Label)", "::-p-text(Text)", "::-p-xpath(...)"
  const clean = (s) => String(s || '').trim();
  const list = locators.map(clean).filter(Boolean);
  if (list.length === 0) return null;

  const rawTextLocator = list.find((s) => s.startsWith('::-p-text('));

  // Prefer stable selectors:
  const idSel = list.find((s) => s.startsWith('#') && !/mat-(select|option)-\d+/.test(s));
  if (idSel) {
    // ngb-typeahead ids are ephemeral; prefer text locator when available.
    if (rawTextLocator && /^#ngb-typeahead-\d+/.test(idSel)) {
      const m = rawTextLocator.match(/::-p-text\((.+)\)$/);
      const t = m ? m[1].trim() : rawTextLocator;
      const unquoted = t.replace(/^["']|["']$/g, '');
      return { text: unquoted };
    }
    // Only treat as id selector when it is exactly "#id" (no combinators).
    const idOnly = idSel.match(/^#([A-Za-z0-9_-]+)$/);
    return { css: idSel, ...(idOnly ? { id: idOnly[1] } : {}) };
  }

  const aria = list.find((s) => s.startsWith('::-p-aria('));
  if (aria) {
    const m = aria.match(/::-p-aria\((.+)\)$/);
    const label = m ? m[1].trim() : '';
    const unquoted = label.replace(/^["']|["']$/g, '');
    // DevTools sometimes exports nested aria chains like:
    //   ::-p-aria(Libero professionista) >>>> ::-p-aria([role="generic"])
    // This is brittle; prefer a plain text locator if available.
    const looksChained = unquoted.includes('>>>>') || unquoted.includes('[role=') || unquoted.includes('role=');
    if (!looksChained) return { label: unquoted };
  }

  const text = list.find((s) => s.startsWith('::-p-text(') || s.startsWith('text=') || s.startsWith('text="'));
  if (text) {
    const m = text.match(/::-p-text\((.+)\)$/);
    const t = m ? m[1].trim() : text;
    const unquoted = t.replace(/^["']|["']$/g, '');
    return { text: unquoted };
  }

  const cssAny = list.find((s) => s.startsWith('#') || s.startsWith('.') || s.includes(' ') || s.includes('>'));
  if (cssAny) {
    const id = cssAny.startsWith('#') ? cssAny.slice(1) : undefined;
    return { css: cssAny, ...(id ? { id } : {}) };
  }

  const xpath = list.find((s) => s.includes('xpath') || s.includes('::-p-xpath('));
  if (xpath) {
    const m = xpath.match(/::-p-xpath\((.+)\)$/);
    const xp = m ? m[1] : xpath;
    return { xpath: String(xp).replace(/^["']|["']$/g, '') };
  }

  return { css: list[0] };
}

function parseLocatorRaceBlock(block) {
  // Extract locator strings within: targetPage.locator('...')
  const locators = [];
  const re = /locator\(\s*'([^']+)'\s*\)/g;
  let m;
  while ((m = re.exec(block))) {
    locators.push(m[1]);
  }
  return locators;
}

function shouldDropDynamicMaterialTarget(target) {
  const css = target?.css || '';
  const id = target?.id || '';
  // These ids change run-to-run on Angular Material.
  if (/^mat-(select|option)-\d+$/.test(id)) return true;
  if (/^#mat-(select|option)-\d+/.test(css)) return true;
  if (css.includes('mat-option') && !target?.text && !target?.label) return true;
  return false;
}

function flowValueFrom(target) {
  // Map known ids to client-bound fields in our runtime.
  const id = target?.id || '';
  if (id === 'Nome') return 'client.firstName';
  if (id === 'Cognome') return 'client.lastName';
  if (id === 'PartitaIvaVatCode') return 'client.partitaIva';
  // For these the runtime overrides with deterministic defaults.
  if (id === 'lineaIntervento') return 'client.lineaIntervento';
  if (id === 'tipologiaProponente') return 'client.tipologiaProponente';
  return null;
}

function parsePuppeteerExport(src) {
  const steps = [];
  const fieldMapping = {};
  let recordedSeq = 0;

  // goto
  {
    const re = /await\s+targetPage\.goto\(\s*'([^']+)'\s*\)/g;
    let m;
    while ((m = re.exec(src))) {
      steps.push({
        type: 'goto',
        actionKind: 'goto',
        stepId: `rec_goto_${steps.length}`,
        url: m[1],
        waitUntil: 'domcontentloaded',
      });
    }
  }

  // Locator.race blocks: click or fill
  // Use a string-aware scanner so we don't get confused by `[` `]` and `()` inside locator strings
  // like: ::-p-aria([role="generic"]).
  const needle = 'await puppeteer.Locator.race([';
  let i = 0;
  const len = src.length;
  const isWS = (c) => c === ' ' || c === '\n' || c === '\r' || c === '\t';

  function scanToMatchingBracket(fromIdx) {
    // fromIdx points at '['
    let depth = 0;
    let inS = false;
    let inD = false;
    let esc = false;
    for (let k = fromIdx; k < len; k += 1) {
      const ch = src[k];
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\\\') {
        if (inS || inD) esc = true;
        continue;
      }
      if (ch === "'" && !inD) {
        inS = !inS;
        continue;
      }
      if (ch === '"' && !inS) {
        inD = !inD;
        continue;
      }
      if (inS || inD) continue;
      if (ch === '[') depth += 1;
      else if (ch === ']') {
        depth -= 1;
        if (depth === 0) return k;
      }
    }
    return -1;
  }

  function scanToMatchingParen(fromIdx) {
    // fromIdx points at '('
    let depth = 0;
    let inS = false;
    let inD = false;
    let esc = false;
    for (let k = fromIdx; k < len; k += 1) {
      const ch = src[k];
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\\\') {
        if (inS || inD) esc = true;
        continue;
      }
      if (ch === "'" && !inD) {
        inS = !inS;
        continue;
      }
      if (ch === '"' && !inS) {
        inD = !inD;
        continue;
      }
      if (inS || inD) continue;
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) return k;
      }
    }
    return -1;
  }

  while (i < len) {
    const start = src.indexOf(needle, i);
    if (start === -1) break;
    const arrStart = src.indexOf('[', start + needle.length - 1);
    if (arrStart === -1) break;
    const arrEnd = scanToMatchingBracket(arrStart);
    if (arrEnd === -1) break;

    // Expect "])" after array
    let p = arrEnd + 1;
    while (p < len && isWS(src[p])) p += 1;
    if (src[p] !== ')') {
      i = arrEnd + 1;
      continue;
    }

    const locBlock = src.slice(arrStart + 1, arrEnd);

    // Find action kind after the race: ".click(" or ".fill("
    const after = src.slice(p, Math.min(len, p + 2400));
    const m = after.match(/\.(click|fill)\s*\(/);
    if (!m) {
      i = arrEnd + 1;
      continue;
    }
    const kind = m[1];
    const actionPos = after.indexOf(`.${kind}`);
    const parenStart = p + actionPos + after.slice(actionPos).indexOf('(');
    const parenEnd = scanToMatchingParen(parenStart);
    const argBlock = parenStart !== -1 && parenEnd !== -1 ? src.slice(parenStart + 1, parenEnd) : '';
    const tail = src.slice(p, p + actionPos);

    const locators = parseLocatorRaceBlock(locBlock);
    const target = pickBestLocator(locators);
    if (!target) {
      i = arrEnd + 1;
      continue;
    }

    // For dynamic mat-select/mat-option with no stable info, keep only if aria/text is present.
    if (shouldDropDynamicMaterialTarget(target)) {
      i = arrEnd + 1;
      continue;
    }

    if (kind === 'click') {
      steps.push({
        type: 'click',
        actionKind: 'click_only',
        stepId: `rec_click_${steps.length}`,
        target,
      });
      i = parenEnd !== -1 ? parenEnd + 1 : arrEnd + 1;
      continue;
    }

    if (kind === 'fill') {
      const rawValueMatch = argBlock.match(/'([^']*)'/);
      const rawValue = rawValueMatch ? rawValueMatch[1] : '';
      const id = target.id || '';

      // Heuristic: treat as select when id looks like a select or when recorded value is "Object"/UUID.
      const looksLikeSelect =
        id.toLowerCase().includes('tipologia') ||
        id.toLowerCase().includes('linea') ||
        rawValue.includes(':') ||
        rawValue.toLowerCase().includes('object');

      const valueFrom = flowValueFrom(target);
      if (looksLikeSelect) {
        steps.push({
          type: 'select',
          actionKind: 'select',
          stepId: `rec_select_${steps.length}`,
          target,
          ...(valueFrom ? { valueFrom } : {}),
        });
      } else {
        let vf = valueFrom;
        if (!vf && rawValue) {
          recordedSeq += 1;
          vf = `recorded.${recordedSeq}`;
          fieldMapping[vf] = rawValue;
        }
        steps.push({
          type: 'type',
          actionKind: 'type',
          stepId: `rec_type_${steps.length}`,
          target,
          ...(vf ? { valueFrom: vf } : {}),
        });
      }
      i = parenEnd !== -1 ? parenEnd + 1 : arrEnd + 1;
      continue;
    }

    i = arrEnd + 1;
  }

  // Keyboard-only sequences are too ambiguous here (tabbing, digit presses). We intentionally ignore them.
  return { steps, fieldMapping };
}

const input = arg('--input');
if (!input) {
  console.error('Missing --input');
  process.exit(2);
}

const bandoName = arg('--bandoName', 'Bando');
const procedura = arg('--procedura', 'procedura');
const sub = arg('--sub', '');
const out = arg('--out', '');

const src = readFile(input);
const parsed = parsePuppeteerExport(src);
const steps = parsed.steps;
const fieldMapping = parsed.fieldMapping;

const bandoKey = slugify(bandoName) || 'bando';
const proceduraKey = slugify(procedura) || 'procedura';
const subKey = sub ? slugify(sub) : '';

const flow = {
  name: `Invitalia Flow ${bandoName} / ${procedura}${sub ? ` / ${sub}` : ''}`,
  bandoKey,
  ...(subKey ? { subProceduraKey: subKey } : {}),
  proceduraKey,
  version: 1,
  source: 'chrome-devtools-recorder-puppeteer',
  updatedAt: new Date().toISOString().slice(0, 10),
  expectedDurationSeconds: 320,
  fieldMapping,
  steps,
};

const outPath = out || path.join(process.cwd(), 'data', 'flows', 'recordings', `${bandoKey}-${proceduraKey}${subKey ? `-${subKey}` : ''}.partial.json`);
ensureDir(outPath);
fs.writeFileSync(outPath, JSON.stringify(flow, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`Steps: ${steps.length}`);
