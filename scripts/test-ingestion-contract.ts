import assert from 'node:assert/strict';
import { SOURCE_REGISTRY } from '../lib/matching/sourceRegistry';

const requiredScopes = new Set(['national', 'regional', 'camera_commercio', 'gal']);
const coveredScopes = new Set<string>();

assert(SOURCE_REGISTRY.length >= 4, 'Il source registry deve contenere almeno 4 fonti.');

for (const source of SOURCE_REGISTRY) {
  assert(source.id && source.id.trim().length > 2, `Source id non valido: ${source.id}`);
  assert(source.name && source.name.trim().length > 2, `Source name non valido: ${source.name}`);
  assert(source.cadenceHours > 0, `cadenceHours non valido per ${source.id}`);
  coveredScopes.add(source.scope);
}

for (const scope of requiredScopes) {
  assert(coveredScopes.has(scope), `Copertura mancante per scope: ${scope}`);
}

console.log('Ingestion contract OK');

