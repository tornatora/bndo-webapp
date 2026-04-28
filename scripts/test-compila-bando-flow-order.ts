import assert from 'node:assert/strict';
import { loadFlowTemplate } from '../lib/compila-bando/flow-template';
import { buildStrictExecutionQueue } from '../lib/compila-bando/flow-runtime';

const { template } = loadFlowTemplate();
const queue = buildStrictExecutionQueue(template);

assert.equal(queue.length, template.steps.length, 'La queue deve avere lo stesso numero di step');
assert.ok(queue.length > 0, 'La queue non puo essere vuota');

for (let i = 0; i < queue.length; i += 1) {
  assert.equal(queue[i].stepIndex, i, `Indice queue non sequenziale in posizione ${i}`);
  assert.equal(queue[i].step, template.steps[i], `Step ${i} non preservato in ordine originale`);
}

const findIndexById = (id: string) => queue.findIndex((entry) => entry.step.target?.id === id);
const idxLinea = findIndexById('lineaIntervento');
const idxTipologia = findIndexById('tipologiaProponente');
const idxNome = findIndexById('Nome');
const idxCognome = findIndexById('Cognome');
const idxData = findIndexById('DataDiNascita');
const idxLuogo = findIndexById('LuogoDiNascita');

assert.ok(idxLinea >= 0, 'lineaIntervento deve esistere nel flow');
assert.ok(idxTipologia >= 0, 'tipologiaProponente deve esistere nel flow');
assert.ok(idxNome >= 0, 'Nome deve esistere nel flow');
assert.ok(idxCognome >= 0, 'Cognome deve esistere nel flow');
assert.ok(idxData >= 0, 'DataDiNascita deve esistere nel flow');
assert.ok(idxLuogo >= 0, 'LuogoDiNascita deve esistere nel flow');

assert.ok(idxLinea < idxTipologia, 'lineaIntervento deve precedere tipologiaProponente');
assert.ok(idxTipologia < idxNome, 'tipologiaProponente deve precedere Nome');
assert.ok(idxNome < idxCognome, 'Nome deve precedere Cognome');
assert.ok(idxCognome < idxData, 'Cognome deve precedere DataDiNascita');
assert.ok(idxData < idxLuogo, 'DataDiNascita deve precedere LuogoDiNascita');

console.log('[OK] Strict flow order preserved for compila-bando.');
