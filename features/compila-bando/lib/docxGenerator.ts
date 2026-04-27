import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from 'docx';
import type { ExtractedData, CustomField } from './types';

export async function generateDOCX(
  extracted: ExtractedData,
  customFields: CustomField[]
): Promise<Blob> {
  const allFields: [string, string][] = [
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

  const today = new Date().toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const rows = allFields.map(
    ([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: label,
                    bold: true,
                    size: 18,
                    color: '#64748b',
                  }),
                ],
              }),
            ],
            margins: { top: 60, bottom: 60, left: 120, right: 80 },
          }),
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: value || '--',
                    size: 20,
                    color: '#0b1136',
                  }),
                ],
              }),
            ],
            margins: { top: 60, bottom: 60, left: 80, right: 120 },
          }),
        ],
      })
  );

  const border = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: '#e8ecf4',
  };

  const doc = new Document({
    sections: [
      {
        children: [
          // Header
          new Paragraph({
            text: 'Documento Anagrafico',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generato il ${today} da BNDO`,
                size: 20,
                color: '#64748b',
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '' }),

          // Data table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          }),

          new Paragraph({ text: '' }),

          // Footer
          new Paragraph({
            children: [
              new TextRun({
                text: 'Documento generato automaticamente da BNDO — bndo.it',
                size: 16,
                color: '#94a3b8',
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}
