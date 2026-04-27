import { spawn } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export const DEFAULT_LIVE_URL = 'https://bndo.it';
export const DEFAULT_EXPECTED_REPO_NAME = 'bndo-webapp';
export const DEFAULT_EXPECTED_REMOTE_FRAGMENT = 'tornatora/bndo-webapp';

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const raw = token.slice(2);
    const equalsIndex = raw.indexOf('=');
    if (equalsIndex >= 0) {
      const key = raw.slice(0, equalsIndex);
      const value = raw.slice(equalsIndex + 1);
      args[key] = value;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[raw] = true;
      continue;
    }
    args[raw] = next;
    i += 1;
  }
  return args;
}

export function getArg(args, key, fallback = undefined) {
  const value = args[key];
  if (value === undefined || value === true || value === '') return fallback;
  return String(value);
}

export function getIntArg(args, key, fallback) {
  const raw = getArg(args, key);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Argomento --${key} non valido: ${raw}`);
  }
  return parsed;
}

export async function runCommand(command, commandArgs, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(
        new Error(
          [
            `Comando fallito (${code}): ${command} ${commandArgs.join(' ')}`,
            stdout.trim(),
            stderr.trim()
          ]
            .filter(Boolean)
            .join('\n')
        )
      );
    });
  });
}

export function parsePossiblyNoisyJson(raw) {
  const text = raw.trim();
  if (!text) throw new Error('Output JSON vuoto');
  try {
    return JSON.parse(text);
  } catch {
    // Netlify CLI a volte stampa extra linee prima del JSON.
  }
  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    const maybeObject = text.slice(objectStart, objectEnd + 1);
    try {
      return JSON.parse(maybeObject);
    } catch {
      // no-op
    }
  }
  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    const maybeArray = text.slice(arrayStart, arrayEnd + 1);
    try {
      return JSON.parse(maybeArray);
    } catch {
      // no-op
    }
  }
  throw new Error('Impossibile parsare output JSON Netlify');
}

export async function netlifyApi(method, data, cwd = process.cwd()) {
  const args = ['api', method];
  if (data !== undefined) {
    args.push('--data', JSON.stringify(data));
  }
  const output = await runCommand('netlify', args, { cwd });
  return parsePossiblyNoisyJson(output);
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

export async function readJson(filePath) {
  const raw = await readText(filePath);
  return JSON.parse(raw);
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function writeText(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, value, 'utf8');
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function getRepoRoot(cwd = process.cwd()) {
  return runCommand('git', ['rev-parse', '--show-toplevel'], { cwd });
}

export async function getGitHead(cwd = process.cwd()) {
  return runCommand('git', ['rev-parse', 'HEAD'], { cwd });
}

export async function getGitBranch(cwd = process.cwd()) {
  return runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
}

export async function getGitRemoteOriginUrl(cwd = process.cwd()) {
  try {
    return await runCommand('git', ['config', '--get', 'remote.origin.url'], { cwd });
  } catch {
    return '';
  }
}

export async function getGitStatusPorcelain(cwd = process.cwd()) {
  return runCommand('git', ['status', '--porcelain'], { cwd });
}

export async function assertWorkspaceClean(cwd = process.cwd()) {
  const status = await getGitStatusPorcelain(cwd);
  if (!status.trim()) return;
  const preview = status
    .split('\n')
    .slice(0, 20)
    .join('\n');
  throw new Error(
    [
      `Workspace sporco in ${cwd}.`,
      'Blocco deploy attivo: rendi il workspace pulito prima di continuare.',
      preview
    ].join('\n')
  );
}

export async function normalizeExistingPath(targetPath) {
  const absolute = path.resolve(targetPath);
  try {
    return await fs.realpath(absolute);
  } catch {
    return absolute;
  }
}

export async function assertExpectedRoot(actualRoot, expectedRoot) {
  const normalizedActual = await normalizeExistingPath(actualRoot);
  const normalizedExpected = await normalizeExistingPath(expectedRoot);
  if (normalizedActual !== normalizedExpected) {
    throw new Error(
      [
        'Blocco root mismatch attivo.',
        `Root rilevata: ${normalizedActual}`,
        `Root attesa:   ${normalizedExpected}`
      ].join('\n')
    );
  }
}

export async function assertRepoFingerprint(cwd = process.cwd(), options = {}) {
  const expectedRepoName = options.expectedRepoName;
  const expectedRemoteFragment =
    options.expectedRemoteFragment ?? DEFAULT_EXPECTED_REMOTE_FRAGMENT;
  const repoRoot = await getRepoRoot(cwd);
  if (expectedRepoName) {
    const rootBaseName = path.basename(repoRoot);
    if (rootBaseName !== expectedRepoName) {
      throw new Error(
        [
          'Blocco root mismatch attivo.',
          `Repo rilevata: ${repoRoot}`,
          `Nome atteso: ${expectedRepoName}`
        ].join('\n')
      );
    }
  }
  const originUrl = await getGitRemoteOriginUrl(repoRoot);
  if (!originUrl || !originUrl.includes(expectedRemoteFragment)) {
    throw new Error(
      [
        'Blocco remote mismatch attivo.',
        `Origin rilevato: ${originUrl || '(vuoto)'}`,
        `Remote atteso contiene: ${expectedRemoteFragment}`
      ].join('\n')
    );
  }
  return { repoRoot, originUrl };
}

export function defaultStateDir(repoRoot) {
  return path.join(repoRoot, '.netlify', 'live-alignment');
}

export async function resolveSiteId(repoRoot, explicitSiteId = undefined) {
  if (explicitSiteId) return explicitSiteId;
  const statePath = path.join(repoRoot, '.netlify', 'state.json');
  if (!(await fileExists(statePath))) {
    throw new Error(
      `Site ID non trovato. Passa --site-id oppure crea ${statePath} con netlify link.`
    );
  }
  const state = await readJson(statePath);
  if (!state?.siteId) {
    throw new Error(`siteId mancante in ${statePath}`);
  }
  return String(state.siteId);
}

export function sanitizeAlias(rawAlias) {
  const normalized = rawAlias
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized) {
    throw new Error(`Alias non valido: "${rawAlias}"`);
  }
  if (normalized.length > 37) {
    throw new Error(
      `Alias troppo lungo (${normalized.length}). Massimo 37 caratteri: ${normalized}`
    );
  }
  return normalized;
}

export function toIsoUtc(date = new Date()) {
  return date.toISOString();
}

export function todayStamp(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  const hour = `${date.getUTCHours()}`.padStart(2, '0');
  const minute = `${date.getUTCMinutes()}`.padStart(2, '0');
  const second = `${date.getUTCSeconds()}`.padStart(2, '0');
  return `${year}${month}${day}-${hour}${minute}${second}z`;
}

export async function waitForDeployReady({ deployId, cwd, timeoutMs = 180_000, pollMs = 2_000 }) {
  const startedAt = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const deploy = await netlifyApi('getDeploy', { deploy_id: deployId }, cwd);
    const state = String(deploy?.state ?? '').toLowerCase();
    if (state === 'ready') return deploy;
    if (state === 'error' || state === 'failed') {
      throw new Error(
        `Deploy ${deployId} fallito. state=${deploy?.state} error=${deploy?.error_message ?? 'n/a'}`
      );
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timeout attesa deploy ${deployId} (${timeoutMs} ms)`);
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(pollMs);
  }
}

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function normalizeBaseUrl(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function firstMatch(text, regex) {
  const match = text.match(regex);
  return match ? match[0] : null;
}

export function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function stableStringify(value) {
  return JSON.stringify(sortForStableStringify(value));
}

function sortForStableStringify(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortForStableStringify(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortForStableStringify(value[key]);
        return acc;
      }, {});
  }
  return value;
}

export function hashJson(value) {
  return hashBytes(Buffer.from(stableStringify(value), 'utf8'));
}

export function buildFileMap(siteFiles) {
  const sorted = [...siteFiles].sort((a, b) => String(a.path).localeCompare(String(b.path)));
  const map = {};
  for (const entry of sorted) {
    const filePath = entry?.path;
    const sha = entry?.sha;
    if (!filePath || !sha) continue;
    map[String(filePath)] = String(sha);
  }
  return map;
}

export function buildFunctionMaps(availableFunctions) {
  const list = Array.isArray(availableFunctions) ? availableFunctions : [];
  const digestByName = {};
  const idByName = {};
  const oidByName = {};
  const runtimeByName = {};
  const sizeByName = {};
  for (const fn of list) {
    if (!fn?.n) continue;
    const name = String(fn.n);
    if (fn.d) digestByName[name] = String(fn.d);
    if (fn.id) idByName[name] = String(fn.id);
    if (fn.oid) oidByName[name] = String(fn.oid);
    if (fn.r) runtimeByName[name] = String(fn.r);
    if (Number.isFinite(fn.s)) sizeByName[name] = Number(fn.s);
  }
  return {
    digestByName,
    idByName,
    oidByName,
    runtimeByName,
    sizeByName
  };
}

export function pickPreviewUrlFromDeploy(deploy) {
  if (deploy?.links?.alias) return String(deploy.links.alias);
  if (deploy?.deploy_ssl_url) return String(deploy.deploy_ssl_url);
  if (deploy?.deploy_url) return String(deploy.deploy_url).replace(/^http:\/\//, 'https://');
  return '';
}
