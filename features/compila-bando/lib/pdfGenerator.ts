import { jsPDF } from 'jspdf';
import type { ExtractedData, CustomField } from './types';

export function generatePDF(
  extracted: ExtractedData,
  customFields: CustomField[]
): Blob {
  const doc = new jsPDF();

  // Header — BNDO navy
  doc.setTextColor(11, 17, 54);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Scheda Aziendale', 105, 20, { align: 'center' });

  // Subtitle
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const today = new Date().toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  doc.text(`Generato il ${today} da BNDO`, 105, 28, { align: 'center' });

  // Separator
  doc.setDrawColor(232, 236, 244);
  doc.line(15, 34, 195, 34);

  // Fields — two-column layout
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

    // Label
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(label, x, y);

    // Value
    doc.setTextColor(11, 17, 54);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(value || '--', x, y + 6);

    if (col === 1) y += 18;
  }

  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setDrawColor(232, 236, 244);
  doc.line(15, pageHeight - 18, 195, pageHeight - 18);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Documento generato automaticamente da BNDO — bndo.it', 105, pageHeight - 11, {
    align: 'center',
  });

  return doc.output('blob');
}
