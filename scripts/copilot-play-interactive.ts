#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { runTemplate } from './run-copilot-playwright';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function askChoice(question: string, choices: string[], allowSkip = false): Promise<number | null> {
  console.log(`\n${question}`);
  choices.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
  if (allowSkip) console.log(`  0. Salta`);

  while (true) {
    const answer = await ask('Scegli un numero: ');
    const num = parseInt(answer, 10);
    if (allowSkip && num === 0) return null;
    if (!isNaN(num) && num >= 1 && num <= choices.length) return num - 1;
    console.log('Scelta non valida, riprova.');
  }
}

async function findJsonFiles(dir: string): Promise<string[]> {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f));
}

async function suggestDataFile(templatePath: string, dataFiles: string[]): Promise<string | null> {
  const base = path.basename(templatePath, '.json');
  const candidates = dataFiles.filter((f) => {
    const name = path.basename(f, '.json').toLowerCase();
    return name.includes(`${base}-data`) || name.includes(`${base}_data`) || name.includes('cliente') || name.includes('client');
  });
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const idx = await askChoice('Trovati più file dati compatibili:', candidates.map((f) => path.basename(f)), true);
    return idx !== null ? candidates[idx] : null;
  }
  return null;
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     BNDO Co-pilot — Playwright Runner        ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // 1. Directory
  const defaultDir = process.cwd();
  const dirInput = await ask(`Directory dove cercare i file (default: ${defaultDir}): `);
  const searchDir = dirInput || defaultDir;

  // 2. Trova template
  const allJson = await findJsonFiles(searchDir);
  const templateFiles = allJson.filter((f) => {
    try {
      const content = JSON.parse(fs.readFileSync(f, 'utf8'));
      return content && Array.isArray(content.steps);
    } catch {
      return false;
    }
  });

  if (templateFiles.length === 0) {
    console.error(`\n❌ Nessun template JSON trovato in ${searchDir}`);
    console.log('   Un template valido deve avere una proprietà "steps" (array).');
    rl.close();
    process.exit(1);
  }

  const templateIdx = await askChoice('Seleziona il template da eseguire:', templateFiles.map((f) => path.basename(f)));
  const templatePath = templateFiles[templateIdx];
  console.log(`\n📄 Template: ${path.basename(templatePath)}`);

  // 3. File dati
  const dataFiles = allJson.filter((f) => f !== templatePath);
  let dataPath: string | undefined;

  const suggested = await suggestDataFile(templatePath, dataFiles);
  if (suggested) {
    const useSuggested = await ask(`Usare il file dati suggerito: ${path.basename(suggested)}? (s/n): `);
    if (useSuggested.toLowerCase() === 's') {
      dataPath = suggested;
    }
  }

  if (!dataPath && dataFiles.length > 0) {
    const dataIdx = await askChoice('Seleziona il file dati cliente:', dataFiles.map((f) => path.basename(f)), true);
    if (dataIdx !== null) dataPath = dataFiles[dataIdx];
  }

  if (dataPath) {
    console.log(`📋 Dati: ${path.basename(dataPath)}`);
  } else {
    console.log('📋 Dati: nessuno (verrà usato solo il fieldMapping del template)');
  }

  // 4. Documenti
  const uploadsDirInput = await ask('Cartella documenti (lascia vuoto se non serve): ');
  const uploadsDir = uploadsDirInput || undefined;
  if (uploadsDir) console.log(`📁 Documenti: ${uploadsDir}`);

  // 5. Headless
  const headlessAnswer = await ask('Headless? (nascosto, senza finestra) (s/n, default: n): ');
  const headless = headlessAnswer.toLowerCase() === 's';
  console.log(`👁️  Modalità: ${headless ? 'headless' : 'visibile'}`);

  // 6. Slow mo
  const slowMoAnswer = await ask('Ritardo tra azioni in ms (default: 80): ');
  const slowMo = slowMoAnswer ? Number(slowMoAnswer) : 80;
  console.log(`⏱️  Slow-mo: ${slowMo}ms`);

  // 7. Screenshot dir
  const screenshotDir = await ask('Cartella screenshot (default: bndo-screenshots): ');
  const finalScreenshotDir = screenshotDir || 'bndo-screenshots';

  console.log('\n▶️  Avvio Playwright...\n');

  try {
    await runTemplate({
      templatePath,
      dataPath,
      uploadsDir,
      headless,
      slowMo,
      screenshotDir: finalScreenshotDir,
    });
  } catch (err) {
    console.error('\n❌ Errore durante l\'esecuzione:', err);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  rl.close();
  process.exit(1);
});
