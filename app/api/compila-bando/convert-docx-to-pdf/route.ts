import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CloudConvertJob = {
  data?: {
    id?: string;
    status?: string;
    tasks?: Array<{
      id: string;
      name: string;
      status: string;
      result?: any;
      message?: string;
      code?: string;
    }>;
  };
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cloudConvertDocxToPdf(opts: { fileBase64: string; fileName: string }) {
  const apiKey = process.env.CLOUDCONVERT_API_KEY;
  if (!apiKey) {
    throw new Error('CLOUDCONVERT_API_KEY mancante (Netlify env)');
  }

  // Create a job: import/base64 -> convert -> export/url
  const createRes = await fetch('https://api.cloudconvert.com/v2/jobs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tasks: {
        'import-1': {
          operation: 'import/base64',
          file: opts.fileBase64,
          filename: opts.fileName,
        },
        'convert-1': {
          operation: 'convert',
          input: 'import-1',
          output_format: 'pdf',
        },
        'export-1': {
          operation: 'export/url',
          input: 'convert-1',
          inline: false,
          archive_multiple_files: false,
        },
      },
    }),
  });

  if (!createRes.ok) {
    const errTxt = await createRes.text().catch(() => '');
    throw new Error(`CloudConvert create job failed: ${createRes.status} ${errTxt}`.slice(0, 500));
  }

  const created = (await createRes.json()) as CloudConvertJob;
  const jobId = created?.data?.id;
  if (!jobId) throw new Error('CloudConvert jobId mancante');

  const deadline = Date.now() + 45_000;
  let last: CloudConvertJob | null = null;

  while (Date.now() < deadline) {
    const jobRes = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!jobRes.ok) {
      const errTxt = await jobRes.text().catch(() => '');
      throw new Error(`CloudConvert get job failed: ${jobRes.status} ${errTxt}`.slice(0, 500));
    }

    const job = (await jobRes.json()) as CloudConvertJob;
    last = job;

    const tasks = job?.data?.tasks || [];
    const exportTask = tasks.find((t) => t.name === 'export-1');
    const failedTask = tasks.find((t) => t.status === 'error');

    if (failedTask) {
      throw new Error(`CloudConvert task error: ${failedTask.name} ${failedTask.code || ''} ${failedTask.message || ''}`.trim().slice(0, 500));
    }

    if (exportTask?.status === 'finished') {
      const fileUrl = exportTask?.result?.files?.[0]?.url as string | undefined;
      if (!fileUrl) throw new Error('CloudConvert export url mancante');

      const pdfRes = await fetch(fileUrl);
      if (!pdfRes.ok) {
        throw new Error(`CloudConvert download failed: ${pdfRes.status}`);
      }
      const buf = Buffer.from(await pdfRes.arrayBuffer());
      return buf;
    }

    await sleep(1200);
  }

  const lastStatus = last?.data?.status || 'unknown';
  throw new Error(`CloudConvert timeout (status=${lastStatus})`);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const fileBase64 = typeof body.fileBase64 === 'string' ? body.fileBase64 : null;
    const fileName = typeof body.fileName === 'string' ? body.fileName : 'documento.docx';

    if (!fileBase64) {
      return NextResponse.json({ error: 'fileBase64 mancante' }, { status: 400 });
    }

    const pdf = await cloudConvertDocxToPdf({ fileBase64, fileName });
    const outName = fileName.replace(/\.docx$/i, '.pdf');

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${outName}"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore conversione PDF' },
      { status: 500 }
    );
  }
}

