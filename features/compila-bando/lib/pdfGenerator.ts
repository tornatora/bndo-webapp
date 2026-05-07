import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ExtractedData, CustomField } from './types';

/* ============================================================
   Helpers
   ============================================================ */

function addHeader(doc: jsPDF, title: string, subtitle?: string) {
  doc.setTextColor(11, 17, 54);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 105, 18, { align: 'center' });

  if (subtitle) {
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(subtitle, 105, 25, { align: 'center' });
  }

  doc.setDrawColor(11, 17, 54);
  doc.setLineWidth(0.5);
  doc.line(15, 28, 195, 28);
}

function addFooter(doc: jsPDF) {
  const pageHeight = doc.internal.pageSize.height;
  doc.setDrawColor(232, 236, 244);
  doc.setLineWidth(0.2);
  doc.line(15, pageHeight - 20, 195, pageHeight - 20);
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Documento generato automaticamente da BNDO — bndo.it', 105, pageHeight - 14, { align: 'center' });
  doc.text('Pagina ' + String(doc.getNumberOfPages()), 105, pageHeight - 10, { align: 'center' });
}

function addDataTable(doc: jsPDF, extracted: ExtractedData, startY: number): number {
  const rows = [
    ['Ragione Sociale', extracted.ragione_sociale || ''],
    ['Sede Legale', extracted.sede_legale || ''],
    ['Codice Fiscale', extracted.codice_fiscale || ''],
    ['Partita IVA', extracted.partita_iva || ''],
    ['REA', extracted.rea || ''],
    ['Forma Giuridica', extracted.forma_giuridica || ''],
    ['Legale Rappresentante', extracted.nome_legale_rappresentante || ''],
    ['Email PEC', extracted.email_pec || ''],
    ['Telefono', extracted.telefono || ''],
  ];

  autoTable(doc, {
    startY,
    head: [['Campo', 'Valore']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [11, 17, 54], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [11, 17, 54] },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
    },
    styles: { font: 'helvetica', overflow: 'linebreak' },
    margin: { left: 15, right: 15 },
  });

  return (doc as any).lastAutoTable.finalY + 8;
}

function addDeclaratoryText(doc: jsPDF, text: string, startY: number): number {
  doc.setTextColor(11, 17, 54);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const split = doc.splitTextToSize(text, 170);
  doc.text(split, 15, startY);
  return startY + split.length * 4.5 + 6;
}

function addSignatureBlock(doc: jsPDF, extracted: ExtractedData, overrides: Record<string, string>, startY: number) {
  const today = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const luogo = overrides.luogo_firma || '_________________';

  doc.setTextColor(11, 17, 54);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Luogo e data: ${luogo}, ${today}`, 15, startY);

  doc.text('Firma del Legale Rappresentante', 15, startY + 18);
  doc.setDrawColor(100, 116, 139);
  doc.line(15, startY + 22, 100, startY + 22);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(extracted.nome_legale_rappresentante || '', 15, startY + 28);
}

/* ============================================================
   1. Scheda Aziendale (esistente)
   ============================================================ */

export function generatePDF(
  extracted: ExtractedData,
  customFields: CustomField[]
): Blob {
  const doc = new jsPDF();

  doc.setTextColor(11, 17, 54);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Scheda Aziendale', 105, 20, { align: 'center' });

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const today = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  doc.text(`Generato il ${today} da BNDO`, 105, 28, { align: 'center' });

  doc.setDrawColor(232, 236, 244);
  doc.line(15, 34, 195, 34);

  const fields: [string, string][] = [
    ['Ragione Sociale', extracted.ragione_sociale],
    ['Sede Legale', extracted.sede_legale],
    ['Codice Fiscale', extracted.codice_fiscale],
    ['Partita IVA', extracted.partita_iva],
    ['REA', extracted.rea],
    ['Forma Giuridica', extracted.forma_giuridica],
    ['Legale Rappresentante', extracted.nome_legale_rappresentante],
    ['Email PEC', extracted.email_pec],
    ['Telefono', extracted.telefono],
    ...customFields.map((cf) => [cf.key, cf.value] as [string, string]),
  ];

  let y = 44;
  for (let i = 0; i < fields.length; i++) {
    const [label, value] = fields[i];
    const col = i % 2;
    const x = col === 0 ? 15 : 110;
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(label, x, y);
    doc.setTextColor(11, 17, 54);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(value || '--', x, y + 6);
    if (col === 1) y += 18;
  }

  addFooter(doc);
  return doc.output('blob');
}

/* ============================================================
   2. DSAN Antiriciclaggio
   ============================================================ */

export function generateDsanAntiriciclaggioPDF(
  extracted: ExtractedData,
  overrides: Record<string, string> = {}
): Blob {
  const doc = new jsPDF();
  addHeader(doc, 'DICHIARAZIONE SOSTITUTIVA DI ATTO NOTORIO', '(Art. 47 D.P.R. 445/2000 e s.m.i.)');

  doc.setTextColor(11, 17, 54);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('ANTIRICICLAGGIO E FINANZIAMENTO AL TERRORISMO', 105, 38, { align: 'center' });

  let y = 50;

  const nome = extracted.nome_legale_rappresentante || '_____________________';
  const rs = extracted.ragione_sociale || '_____________________';
  const sede = extracted.sede_legale || '_____________________';
  const cf = extracted.codice_fiscale || '_____________________';
  const piva = extracted.partita_iva || '_____________________';

  const decl = `Il/La sottoscritto/a ${nome}, in qualità di Legale Rappresentante della società ${rs}, con sede in ${sede}, C.F. ${cf} e P.IVA ${piva}, consapevole delle responsabilità penali previste dall'art. 76 del D.P.R. 445/2000 per dichiarazioni mendaci,`;
  y = addDeclaratoryText(doc, decl, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DICHIARA SOTTO LA PROPRIA RESPONSABILITÀ', 105, y, { align: 'center' });
  y += 10;

  y = addDeclaratoryText(doc, 'di non trovarsi nelle condizioni di cui all\'art. 94 del D.Lgs. 231/2007 (esclusione dall\'accesso ai benefici in caso di condanne definitive per i reati di riciclaggio e finanziamento del terrorismo).', y);

  y = addDataTable(doc, extracted, y);
  addSignatureBlock(doc, extracted, overrides, y);
  addFooter(doc);

  return doc.output('blob');
}

/* ============================================================
   3. DSAN Casellario
   ============================================================ */

export function generateDsanCasellarioPDF(
  extracted: ExtractedData,
  overrides: Record<string, string> = {}
): Blob {
  const doc = new jsPDF();
  addHeader(doc, 'DICHIARAZIONE SOSTITUTIVA DI ATTO NOTORIO', '(Art. 47 D.P.R. 445/2000 e s.m.i.)');

  doc.setTextColor(11, 17, 54);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('CASELLARIO GIUDIZIALE E PROCEDURE CONCORSUALI LIQUIDATORIE', 105, 38, { align: 'center' });

  let y = 50;

  const nome = extracted.nome_legale_rappresentante || '_____________________';
  const rs = extracted.ragione_sociale || '_____________________';
  const sede = extracted.sede_legale || '_____________________';
  const cf = extracted.codice_fiscale || '_____________________';
  const piva = extracted.partita_iva || '_____________________';

  const decl = `Il/La sottoscritto/a ${nome}, in qualità di Legale Rappresentante della società ${rs}, con sede in ${sede}, C.F. ${cf} e P.IVA ${piva}, consapevole delle responsabilità penali previste dall'art. 76 del D.P.R. 445/2000 per dichiarazioni mendaci,`;
  y = addDeclaratoryText(doc, decl, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DICHIARA SOTTO LA PROPRIA RESPONSABILITÀ', 105, y, { align: 'center' });
  y += 10;

  const points = [
    'a) di non essere sottoposto/a a procedure concorsuali liquidatorie (fallimento, concordato preventivo, liquidazione coatta amministrativa) né a divieto di ricettazione di subvenzioni, sovvenzioni, contributi, agevolazioni o finanziamenti pubblici;',
    'b) di non aver riportato condanne definitive per i reati previsti dall\'art. 67 del D.Lgs. 159/2011 (codice antimafia);',
    'c) di non aver riportato condanne definitive per i reati previsti dall\'art. 69 del D.Lgs. 159/2011 (reati contro la Pubblica Amministrazione).',
  ];

  for (const p of points) {
    y = addDeclaratoryText(doc, p, y);
    y += 2;
  }

  y = addDataTable(doc, extracted, y);
  addSignatureBlock(doc, extracted, overrides, y);
  addFooter(doc);

  return doc.output('blob');
}

/* ============================================================
   4. DSAN Requisiti Iniziativa Economica
   ============================================================ */

export function generateDsanRequisitiIniziativaPDF(
  extracted: ExtractedData,
  overrides: Record<string, string> = {}
): Blob {
  const doc = new jsPDF();
  addHeader(doc, 'DICHIARAZIONE SOSTITUTIVA DI ATTO NOTORIO', '(Art. 47 D.P.R. 445/2000 e s.m.i.)');

  doc.setTextColor(11, 17, 54);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('POSSESSO REQUISITI INIZIATIVA ECONOMICA', 105, 38, { align: 'center' });

  let y = 50;

  const nome = extracted.nome_legale_rappresentante || '_____________________';
  const rs = extracted.ragione_sociale || '_____________________';
  const sede = extracted.sede_legale || '_____________________';
  const cf = extracted.codice_fiscale || '_____________________';
  const piva = extracted.partita_iva || '_____________________';

  const decl = `Il/La sottoscritto/a ${nome}, in qualità di Legale Rappresentante della società ${rs}, con sede in ${sede}, C.F. ${cf} e P.IVA ${piva}, consapevole delle responsabilità penali previste dall'art. 76 del D.P.R. 445/2000 per dichiarazioni mendaci,`;
  y = addDeclaratoryText(doc, decl, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DICHIARA SOTTO LA PROPRIA RESPONSABILITÀ', 105, y, { align: 'center' });
  y += 10;

  const points = [
    'a) di essere in possesso dei requisiti soggettivi previsti dal bando per l\'accesso all\'agevolazione;',
    'b) che l\'iniziativa economica proposta rientra tra le categorie ammesse al finanziamento;',
    'c) che l\'iniziativa non è stata avviata prima della data di presentazione della domanda.',
  ];

  for (const p of points) {
    y = addDeclaratoryText(doc, p, y);
    y += 2;
  }

  if (overrides.descrizione_iniziativa) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Descrizione iniziativa economica:', 15, y);
    y += 6;
    y = addDeclaratoryText(doc, overrides.descrizione_iniziativa, y);
  }

  y = addDataTable(doc, extracted, y);
  addSignatureBlock(doc, extracted, overrides, y);
  addFooter(doc);

  return doc.output('blob');
}

/* ============================================================
   5. DSAN Requisiti Soggettivi
   ============================================================ */

export function generateDsanRequisitiSoggettiviPDF(
  extracted: ExtractedData,
  overrides: Record<string, string> = {}
): Blob {
  const doc = new jsPDF();
  addHeader(doc, 'DICHIARAZIONE SOSTITUTIVA DI ATTO NOTORIO', '(Art. 47 D.P.R. 445/2000 e s.m.i.)');

  doc.setTextColor(11, 17, 54);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('POSSESSO REQUISITI SOGGETTIVI', 105, 38, { align: 'center' });

  let y = 50;

  const nome = extracted.nome_legale_rappresentante || '_____________________';
  const rs = extracted.ragione_sociale || '_____________________';
  const sede = extracted.sede_legale || '_____________________';
  const cf = extracted.codice_fiscale || '_____________________';
  const piva = extracted.partita_iva || '_____________________';

  const decl = `Il/La sottoscritto/a ${nome}, in qualità di Legale Rappresentante della società ${rs}, con sede in ${sede}, C.F. ${cf} e P.IVA ${piva}, consapevole delle responsabilità penali previste dall'art. 76 del D.P.R. 445/2000 per dichiarazioni mendaci,`;
  y = addDeclaratoryText(doc, decl, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DICHIARA SOTTO LA PROPRIA RESPONSABILITÀ', 105, y, { align: 'center' });
  y += 10;

  const points = [
    'a) di essere cittadino/a italiano/a o di uno Stato membro dell\'Unione Europea, ovvero di uno Stato aderente all\'Accordo sullo Spazio Economico Europeo, ovvero di un paese terzo con cui l\'Unione Europea abbia concluso accordi diversi;',
    'b) di essere maggiorenne e avere capacità di agire;',
    'c) di non trovarsi in alcuna delle situazioni di esclusione previste dall\'art. 94 del D.Lgs. 231/2007.',
  ];

  for (const p of points) {
    y = addDeclaratoryText(doc, p, y);
    y += 2;
  }

  y = addDataTable(doc, extracted, y);
  addSignatureBlock(doc, extracted, overrides, y);
  addFooter(doc);

  return doc.output('blob');
}

/* ============================================================
   6. Descrizione Iniziativa Economica — Allegato C2
   ============================================================ */

export function generateDescrizioneIniziativaC2PDF(
  extracted: ExtractedData,
  overrides: Record<string, string> = {}
): Blob {
  const doc = new jsPDF();
  addHeader(doc, 'DESCRIZIONE DELL\'INIZIATIVA ECONOMICA', '(Allegato C2 — Attività individuali)');

  let y = 38;

  doc.setTextColor(11, 17, 54);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  doc.setFont('helvetica', 'bold');
  doc.text('Ditta/Impresa:', 15, y);
  doc.setFont('helvetica', 'normal');
  doc.text(extracted.ragione_sociale || '_____________________', 50, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.text('Sede:', 15, y);
  doc.setFont('helvetica', 'normal');
  doc.text(extracted.sede_legale || '_____________________', 50, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.text('C.F.:', 15, y);
  doc.setFont('helvetica', 'normal');
  doc.text(extracted.codice_fiscale || '_____________________', 50, y);
  doc.setFont('helvetica', 'bold');
  doc.text('P.IVA:', 100, y);
  doc.setFont('helvetica', 'normal');
  doc.text(extracted.partita_iva || '_____________________', 120, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.text('Legale Rappresentante:', 15, y);
  doc.setFont('helvetica', 'normal');
  doc.text(extracted.nome_legale_rappresentante || '_____________________', 65, y);
  y += 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('1. DESCRIZIONE DETTAGLIATA DELL\'INIZIATIVA', 15, y);
  y += 8;

  const descrizione = overrides.descrizione_iniziativa || '_________________________________________________';
  y = addDeclaratoryText(doc, descrizione, y);

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('2. IMPORTO DEL PROGRAMMA', 15, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Importo stimato del programma di investimento: € ', 15, y);
  doc.setFont('helvetica', 'bold');
  doc.text(overrides.importo_programma || '_________________', 115, y);
  y += 14;

  y = addDataTable(doc, extracted, y);
  addSignatureBlock(doc, extracted, overrides, y);
  addFooter(doc);

  return doc.output('blob');
}

/* ============================================================
   Factory — genera tutti i 5 PDF
   ============================================================ */

export type GeneratedPdfDoc = {
  key: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
};

export function generateAllDsanPdfs(
  extracted: ExtractedData,
  overrides: Record<string, string> = {}
): GeneratedPdfDoc[] {
  return [
    { key: 'dsan_antiriciclaggio', fileName: 'DSAN_Antiriciclaggio.pdf', mimeType: 'application/pdf', blob: generateDsanAntiriciclaggioPDF(extracted, overrides) },
    { key: 'dsan_casellario_liquidatorie', fileName: 'DSAN_Casellario.pdf', mimeType: 'application/pdf', blob: generateDsanCasellarioPDF(extracted, overrides) },
    { key: 'dsan_requisiti_iniziativa', fileName: 'DSAN_Requisiti_Iniziativa.pdf', mimeType: 'application/pdf', blob: generateDsanRequisitiIniziativaPDF(extracted, overrides) },
    { key: 'dsan_requisiti_soggettivi', fileName: 'DSAN_Requisiti_Soggettivi.pdf', mimeType: 'application/pdf', blob: generateDsanRequisitiSoggettiviPDF(extracted, overrides) },
    { key: 'descrizione_iniziativa_c2', fileName: 'Descrizione_Iniziativa_C2.pdf', mimeType: 'application/pdf', blob: generateDescrizioneIniziativaC2PDF(extracted, overrides) },
  ];
}
