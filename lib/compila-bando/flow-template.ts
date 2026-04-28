import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FlowTemplate } from './types';

const FLOW_FILE = path.join(process.cwd(), 'data', 'flows', 'resto-al-sud-2-0.json');

export type LoadedFlowTemplate = {
  template: FlowTemplate;
  path: string;
  checksumSha256: string;
};

export function loadFlowTemplate(): LoadedFlowTemplate {
  const raw = fs.readFileSync(FLOW_FILE, 'utf-8');
  const checksumSha256 = crypto.createHash('sha256').update(raw).digest('hex');
  const template = JSON.parse(raw) as FlowTemplate;

  if (!Array.isArray(template.steps)) {
    throw new Error('Flow template non valido: steps assente o non array.');
  }
  if (!template.fieldMapping || typeof template.fieldMapping !== 'object') {
    throw new Error('Flow template non valido: fieldMapping assente.');
  }

  return { template, path: FLOW_FILE, checksumSha256 };
}
