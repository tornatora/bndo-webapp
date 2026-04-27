#!/usr/bin/env node
import fs from 'node:fs';
import { defaultChromeDebugProfilePath, runTemplate } from './run-copilot-playwright';

type CliOptions = {
  templatePath?: string;
  dataPath?: string;
  uploadsDir?: string;
  screenshotDir?: string;
  port: number;
  profilePath?: string;
  initialUrl?: string;
  slowMo?: number;
  authGate?: 'auto' | 'manual' | 'none';
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    port: 9222,
    authGate: 'auto',
  };

  for (const arg of args) {
    if (arg.startsWith('--template=')) {
      options.templatePath = arg.slice('--template='.length);
    } else if (arg.startsWith('--data=')) {
      options.dataPath = arg.slice('--data='.length);
    } else if (arg.startsWith('--uploads-dir=')) {
      options.uploadsDir = arg.slice('--uploads-dir='.length);
    } else if (arg.startsWith('--screenshot-dir=')) {
      options.screenshotDir = arg.slice('--screenshot-dir='.length);
    } else if (arg.startsWith('--port=')) {
      options.port = Number(arg.slice('--port='.length)) || 9222;
    } else if (arg.startsWith('--profile=')) {
      options.profilePath = arg.slice('--profile='.length);
    } else if (arg.startsWith('--chrome-profile=')) {
      options.profilePath = arg.slice('--chrome-profile='.length);
    } else if (arg.startsWith('--initial-url=')) {
      options.initialUrl = arg.slice('--initial-url='.length);
    } else if (arg.startsWith('--slow-mo=')) {
      options.slowMo = Number(arg.slice('--slow-mo='.length));
    } else if (arg.startsWith('--auth-gate=')) {
      const gate = arg.slice('--auth-gate='.length).trim().toLowerCase();
      if (gate === 'manual' || gate === 'none' || gate === 'auto') {
        options.authGate = gate;
      }
    } else if (!options.templatePath && !arg.startsWith('--')) {
      options.templatePath = arg;
    }
  }

  return options;
}

function printUsage() {
  console.log('Uso:');
  console.log('  npx tsx scripts/copilot-debug-run.ts --template=/path/template.json [--data=/path/data.json]');
  console.log('');
  console.log('Opzioni:');
  console.log('  --port=9222');
  console.log('  --profile="~/Library/Application Support/Google/Chrome BNDO Copilot Debug"');
  console.log('  --uploads-dir=./docs');
  console.log('  --screenshot-dir=./bndo-screenshots');
  console.log('  --initial-url=https://presentazione-domanda-pia.npi.invitalia.it/');
  console.log('  --auth-gate=auto|manual|none (default: auto)');
}

async function main() {
  const options = parseArgs();

  if (!options.templatePath || !fs.existsSync(options.templatePath)) {
    console.error('Template non valido o mancante.');
    printUsage();
    process.exit(1);
  }

  const profilePath = options.profilePath || defaultChromeDebugProfilePath();

  console.log('BNDO Co-pilot — Debug SPID start+run');
  console.log(`Template: ${options.templatePath}`);
  if (options.dataPath) console.log(`Dati: ${options.dataPath}`);
  console.log(`Porta debug: ${options.port}`);
  console.log(`Profilo Chrome debug: ${profilePath}`);
  console.log('');

  await runTemplate({
    templatePath: options.templatePath,
    dataPath: options.dataPath,
    uploadsDir: options.uploadsDir,
    screenshotDir: options.screenshotDir,
    debugPort: options.port,
    chromeProfile: profilePath,
    ensureDebugChrome: true,
    authGate: options.authGate || 'auto',
    initialUrl: options.initialUrl,
    slowMo: options.slowMo,
  });
}

main().catch((err) => {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  console.error('Errore fatale:', message);
  process.exit(1);
});
