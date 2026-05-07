import assert from 'node:assert/strict';
import type { ClientData, FlowStep, FlowTemplate } from '../lib/compila-bando/types';
import {
  getFlowStepSelectorCandidates,
  resolveFlowStepValue,
  resolveTipologiaProponente,
} from '../lib/compila-bando/flow-runtime';

const mockTemplate: FlowTemplate = {
  name: 'test',
  bandoKey: 'test',
  steps: [],
  fieldMapping: {
    'recorded.choice': 'VALUE_RECORDED',
  },
};

const mockClient: ClientData = {
  firstName: 'Mario',
  lastName: 'Rossi',
  fullName: 'Mario Rossi',
  zip: '89021',
  province: 'RC',
  city: 'Cinquefrondi',
  pec: 'mario@pec.it',
  phone: '+3900000000',
  ragioneSociale: 'OFFICINE SRL',
  codiceFiscale: 'RSSMRA80A01F205X',
  partitaIva: 'IT12345678901',
  rea: 'RC-123456',
  sedeLegale: 'Via Roma 1, 89021 Cinquefrondi (RC)',
  formaGiuridica: 'Societa a responsabilita limitata',
};

const selectorStep: FlowStep = {
  type: 'click',
  target: {
    css: '#selector-css',
    id: 'selector-id',
    name: 'selector-name',
    testId: 'selector-test',
    placeholder: 'Inserisci valore',
    text: 'Clicca qui',
    tag: 'button',
    label: 'Campo target',
    role: 'option',
    xpath: '/html/body/div[1]/button[1]',
  },
};

const selectors = getFlowStepSelectorCandidates(selectorStep);
assert.ok(selectors.includes('#selector-css'), 'Manca fallback css');
assert.ok(selectors.includes('#selector-id'), 'Manca fallback id');
assert.ok(selectors.includes('[name="selector-name"]'), 'Manca fallback name');
assert.ok(selectors.includes('[data-testid="selector-test"]'), 'Manca fallback testId');
assert.ok(selectors.some((value) => value.startsWith('xpath=')), 'Manca fallback xpath normalizzato');

const lineaStep: FlowStep = {
  type: 'select',
  target: { id: 'lineaIntervento' },
  valueFrom: 'client.zip',
};
assert.equal(
  resolveFlowStepValue(lineaStep, mockTemplate, mockClient),
  'Capo IV - Resto al Sud 2.0',
  'lineaIntervento deve essere deterministico'
);

const tipologiaStep: FlowStep = {
  type: 'select',
  target: { id: 'tipologiaProponente' },
  valueFrom: 'recorded.choice',
};
assert.equal(
  resolveFlowStepValue(tipologiaStep, mockTemplate, mockClient),
  'Voucher Società e ditte individuali',
  'tipologiaProponente deve dipendere dalla forma giuridica'
);

assert.equal(
  resolveTipologiaProponente('libero professionista'),
  'Voucher Lavoratore autonomo-libero professionista',
  'fallback tipologia per non-societa non valido'
);

console.log('[OK] Selector fallbacks and deterministic mappings validated.');
