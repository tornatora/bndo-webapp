#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

type Step = {
  type?: string;
  valueFrom?: string;
};

type TemplatePayload = {
  name?: string;
  bandoKey?: string;
  proceduraKey?: string;
  fieldMapping?: Record<string, string>;
  steps?: Step[];
};

function isRuntimeOnlyKey(key: string) {
  return /^credentials\.(password|otp)$/i.test(String(key || '').trim());
}

function setDeepValue(target: Record<string, unknown>, dottedPath: string, value: string) {
  const parts = dottedPath.split('.').filter(Boolean);
  if (parts.length === 0) return;
  let current: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    const existing = current[part];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

function demoValueForKey(key: string) {
  const k = key.toLowerCase();
  if (k.includes('fullname')) return 'Mario Rossi';
  if (k.endsWith('.name') || k.includes('.nome')) return 'Mario';
  if (k.includes('surname') || k.includes('cognome')) return 'Rossi';
  if (k.includes('email')) return 'demo@bndo.it';
  if (k.includes('phone') || k.includes('telefono')) return '3331234567';
  if (k.includes('zip') || k.includes('cap')) return '89021';
  if (k.includes('city') || k.includes('comune') || k.includes('luogo')) return 'Cinquefrondi';
  if (k.includes('birth') || k.includes('nascita') || k.includes('date')) return '1996-09-25';
  if (k.includes('vat') || k.includes('piva')) return '12345678901';
  if (k.includes('cf') || k.includes('codicefiscale')) return 'RSSMRA96P25C710V';
  if (k.includes('address') || k.includes('indirizzo')) return 'Via Roma 1';
  return 'VALORE_DEMO';
}

function buildDemoData(template: TemplatePayload) {
  const steps = Array.isArray(template.steps) ? template.steps : [];
  const fieldMapping = template.fieldMapping ?? {};
  const valueFromUsed = new Set<string>();

  for (const step of steps) {
    if ((step.type === 'type' || step.type === 'select') && step.valueFrom) {
      const key = String(step.valueFrom).trim();
      if (key) valueFromUsed.add(key);
    }
  }

  const runtimeOnly = [...valueFromUsed].filter((key) => isRuntimeOnlyKey(key));
  const coveredByFieldMapping = [...valueFromUsed].filter((key) => Object.prototype.hasOwnProperty.call(fieldMapping, key));
  const requiredInDataFile = [...valueFromUsed].filter(
    (key) => !isRuntimeOnlyKey(key) && !Object.prototype.hasOwnProperty.call(fieldMapping, key),
  );

  const data: Record<string, unknown> = {};
  for (const key of requiredInDataFile) {
    setDeepValue(data, key, demoValueForKey(key));
  }

  return {
    template: {
      name: template.name ?? null,
      bandoKey: template.bandoKey ?? null,
      proceduraKey: template.proceduraKey ?? null,
    },
    summary: {
      totalValueFrom: valueFromUsed.size,
      coveredByFieldMapping: coveredByFieldMapping.length,
      requiredInDataFile: requiredInDataFile.length,
      runtimeOnly: runtimeOnly.length,
    },
    required: {
      requiredInDataFile,
      coveredByFieldMapping,
      runtimeOnly,
    },
    demoData: data,
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  let templatePath = '';
  let outputPath = '';

  for (const arg of args) {
    if (arg.startsWith('--template=')) templatePath = arg.slice('--template='.length);
    else if (arg.startsWith('--out=')) outputPath = arg.slice('--out='.length);
    else if (!templatePath && !arg.startsWith('--')) templatePath = arg;
  }

  if (!templatePath) {
    throw new Error('Specifica --template=/path/template.json');
  }

  if (!outputPath) {
    const base = path.basename(templatePath, path.extname(templatePath));
    outputPath = path.join(path.dirname(templatePath), `${base}.demo-data.json`);
  }

  return { templatePath, outputPath };
}

function main() {
  const { templatePath, outputPath } = parseArgs();
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8')) as TemplatePayload;
  const payload = buildDemoData(template);
  const dataOnlyPath = outputPath.replace(/\.json$/i, '.data-only.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(dataOnlyPath, `${JSON.stringify(payload.demoData, null, 2)}\n`, 'utf8');

  console.log(`Template: ${templatePath}`);
  console.log(`Output:   ${outputPath}`);
  console.log(`DataOnly: ${dataOnlyPath}`);
  console.log(`ValueFrom totali: ${payload.summary.totalValueFrom}`);
  console.log(`Coperti da fieldMapping: ${payload.summary.coveredByFieldMapping}`);
  console.log(`Da data file: ${payload.summary.requiredInDataFile}`);
  console.log(`Runtime-only: ${payload.summary.runtimeOnly}`);
}

main();
