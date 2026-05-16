import type { PiaAutomationDocumentSlot } from './types';

export type InvitaliaAttachmentTarget = {
  table: 'obbligatori' | 'facoltativi';
  rowText: string;
  buttonType: 'singolo' | 'multiplo';
  file: PiaAutomationDocumentSlot;
};

// Map BNDO requirement_key -> Invitalia row text + upload behavior.
// NOTE: rowText values are intentionally partial (hasText filter), to be resilient to minor label changes.
export function mapDocumentsToInvitaliaTargets(input: {
  documents: Record<string, PiaAutomationDocumentSlot | undefined>;
}): InvitaliaAttachmentTarget[] {
  const docs = input.documents;
  const out: InvitaliaAttachmentTarget[] = [];

  const push = (target: Omit<InvitaliaAttachmentTarget, 'file'> & { file?: PiaAutomationDocumentSlot }) => {
    if (!target.file) return;
    out.push({ table: target.table, rowText: target.rowText, buttonType: target.buttonType, file: target.file });
  };

  // Obbligatori (pattern validato da script "funzionante")
  push({ table: 'obbligatori', rowText: 'DSAN Antiriciclaggio', buttonType: 'singolo', file: docs.dsan_antiriciclaggio });

  // DSAN requisiti: portale spesso li raggruppa in una sezione multi-file.
  push({ table: 'obbligatori', rowText: 'DSAN Possesso requisiti', buttonType: 'multiplo', file: docs.dsan_requisiti_iniziativa });
  push({ table: 'obbligatori', rowText: 'DSAN Possesso requisiti', buttonType: 'multiplo', file: docs.dsan_requisiti_soggettivi });

  push({ table: 'obbligatori', rowText: 'DSAN Casellario', buttonType: 'multiplo', file: docs.dsan_casellario_procedure });
  push({ table: 'obbligatori', rowText: 'Documento di riconoscimento', buttonType: 'multiplo', file: docs.documento_riconoscimento });
  push({ table: 'obbligatori', rowText: 'Codice fiscale', buttonType: 'multiplo', file: docs.codice_fiscale });

  // "Atto costitutivo/statuto" oppure "Certificato P.IVA" spesso sono lo stesso slot unico (max 1).
  // Se entrambi esistono, preferiamo l'atto/statuto.
  push({
    table: 'obbligatori',
    rowText: 'Atto costitutivo',
    buttonType: 'singolo',
    file: docs.atto_costitutivo_statuto || docs.certificato_partita_iva,
  });

  // Piano d'impresa (per alcune procedure)
  push({ table: 'obbligatori', rowText: "Piano d'impresa", buttonType: 'singolo', file: docs.piano_impresa });

  // Facoltativi
  push({ table: 'facoltativi', rowText: 'DSAN Compagine', buttonType: 'singolo', file: docs.dsan_compagine_cooperativa });
  push({ table: 'facoltativi', rowText: 'Premialit', buttonType: 'multiplo', file: docs.dsan_premialita_minoranze_pf });
  push({ table: 'facoltativi', rowText: 'Premialit', buttonType: 'multiplo', file: docs.dsan_premialita_minoranze_pg });
  push({ table: 'facoltativi', rowText: 'Permesso di soggiorno', buttonType: 'multiplo', file: docs.permesso_soggiorno });
  push({ table: 'facoltativi', rowText: 'Attestato corso ENM', buttonType: 'singolo', file: docs.attestato_enm });
  push({ table: 'facoltativi', rowText: 'Estratto conto', buttonType: 'singolo', file: docs.estratto_conto_vincolato });

  // "Descrizione iniziativa economica" richiede firma digitale (p7m)
  push({ table: 'facoltativi', rowText: 'Descrizione Iniziativa', buttonType: 'singolo', file: docs.descrizione_iniziativa });

  return out;
}
