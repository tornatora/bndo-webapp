import fs from 'node:fs';
import path from 'node:path';

async function loadBrowserbaseCtor() {
  const dynamicImport = new Function('moduleName', 'return import(moduleName)') as (
    moduleName: string
  ) => Promise<Record<string, unknown>>;

  const mod = await dynamicImport('@browserbasehq/sdk');
  const maybeDefault = mod.default as new (...args: unknown[]) => any;
  const maybeNamed = mod.Browserbase as new (...args: unknown[]) => any;
  const Ctor = maybeDefault ?? maybeNamed;

  if (!Ctor) {
    throw new Error('SDK Browserbase non trovato. Installa @browserbasehq/sdk prima di eseguire lo script.');
  }

  return Ctor;
}

async function main() {
  if (!process.env.BROWSERBASE_API_KEY) {
    throw new Error('BROWSERBASE_API_KEY mancante.');
  }

  const zipPath = path.join(process.cwd(), 'extensions', 'bndo-extension.zip');
  const fallbackZipPath = path.join(process.cwd(), 'extensions', 'bndo-copilot', 'bndo-extension.zip');

  const targetZipPath = fs.existsSync(zipPath) ? zipPath : fallbackZipPath;

  if (!fs.existsSync(targetZipPath)) {
    throw new Error(`Zip extension non trovata: ${targetZipPath}`);
  }

  const Browserbase = await loadBrowserbaseCtor();
  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });

  const created = await bb.extensions.create({
    file: fs.createReadStream(targetZipPath),
  });

  console.log(`BROWSERBASE_EXTENSION_ID=${created.id}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
