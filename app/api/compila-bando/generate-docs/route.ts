import { NextResponse } from 'next/server';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function generateDOCXBlob(data: Record<string, string | null>) {
  const fields: [string, string][] = [
    ['Ragione Sociale', data.ragione_sociale || ''],
    ['Sede Legale', data.sede_legale || ''],
    ['Codice Fiscale', data.codice_fiscale || ''],
    ['Partita IVA', data.partita_iva || ''],
    ['REA', data.rea || ''],
    ['Forma Giuridica', data.forma_giuridica || ''],
    ['Legale Rappresentante', data.nome_legale_rappresentante || ''],
    ['Email PEC', data.email_pec || ''],
    ['Telefono', data.telefono || ''],
  ];

  const today = new Date().toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const rows = fields.map(
    ([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: label, bold: true, size: 18, color: '#64748b' })],
                spacing: { after: 0 },
              }),
            ],
            margins: { top: 60, bottom: 60, left: 120, right: 80 },
          }),
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: value || '--', size: 20, color: '#0b1136' })],
                spacing: { after: 0 },
              }),
            ],
            margins: { top: 60, bottom: 60, left: 80, right: 120 },
          }),
        ],
      })
  );

  const border = { style: BorderStyle.SINGLE, size: 1, color: '#e8ecf4' };

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: 'Documento Anagrafico',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [new TextRun({ text: `Generato il ${today} da BNDO`, size: 20, color: '#64748b' })],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [new TextRun({ text: 'Documento generato automaticamente da BNDO — bndo.it', size: 16, color: '#94a3b8' })],
            alignment: AlignmentType.CENTER,
          }),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = body.data as Record<string, string | null>;
    const overrides = (body.overrides ?? {}) as Record<string, string | null>;
    const mode = typeof body.mode === 'string' ? body.mode : 'binary';

    if (!data || Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nessun dato ricevuto.' }, { status: 400 });
    }

    const docxBlob = await generateDOCXBlob(data);
    const generatedDocs = [
      {
        key: 'dsan_antiriciclaggio',
        fileName: 'DSAN Antiriciclaggio rsud acn.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      {
        key: 'dsan_casellario_liquidatorie',
        fileName: 'DSAN Casellario e procedure concorsuali liquidatorie.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      {
        key: 'dsan_requisiti_iniziativa',
        fileName: 'DSAN Possesso requisiti iniziativa economica.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      {
        key: 'dsan_requisiti_soggettivi',
        fileName: 'DSAN Possesso requisiti soggettivi.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      {
        key: 'descrizione_iniziativa_c2',
        fileName: 'Descrizione iniziativa economica_attività individuali.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      {
        key: 'documento_anagrafico',
        fileName: 'Allegati-BNDO.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      {
        key: 'scheda_aziendale',
        fileName: 'Scheda-Aziendale-BNDO.pdf',
        mimeType: 'application/pdf',
      },
    ];
    const requiredReview: Array<{ key: string; label: string }> = [];
    if (!data.nome_legale_rappresentante) requiredReview.push({ key: 'nome_legale_rappresentante', label: 'Nome legale rappresentante' });
    if (!data.codice_fiscale) requiredReview.push({ key: 'codice_fiscale', label: 'Codice fiscale' });
    if (!data.partita_iva) requiredReview.push({ key: 'partita_iva', label: 'Partita IVA' });
    if (!data.sede_legale) requiredReview.push({ key: 'sede_legale', label: 'Sede legale' });
    if (!overrides.luogo_firma) requiredReview.push({ key: 'luogo_firma', label: 'Luogo firma' });
    if (!overrides.data_firma) requiredReview.push({ key: 'data_firma', label: 'Data firma' });
    if (!overrides.residenza_legale_rappresentante) requiredReview.push({ key: 'residenza_legale_rappresentante', label: 'Residenza legale rappresentante' });
    if (!overrides.descrizione_iniziativa) requiredReview.push({ key: 'descrizione_iniziativa', label: 'Descrizione iniziativa (C2)' });

    if (mode === 'manifest') {
      return NextResponse.json(
        {
          ok: true,
          generatedDocs,
          reviewRequired: requiredReview,
        },
        { status: 200 }
      );
    }

    const docxBuf = Buffer.from(await docxBlob.arrayBuffer());
    return new NextResponse(docxBuf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="Documento-Anagrafico-BNDO.docx"',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore generazione documenti.' },
      { status: 500 }
    );
  }
}
