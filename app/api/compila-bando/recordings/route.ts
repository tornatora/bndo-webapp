import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RECORDINGS_DIR = path.join(process.cwd(), 'data', 'flows', 'recordings');

function safeBasename(input: string): string {
  const base = path.basename(input);
  return base.replace(/[^A-Za-z0-9._-]/g, '');
}

export async function GET() {
  try {
    if (!fs.existsSync(RECORDINGS_DIR)) {
      return NextResponse.json({ ok: true, recordings: [] });
    }
    const files = fs
      .readdirSync(RECORDINGS_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ ok: true, recordings: files });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Errore list recordings' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { filename?: unknown };
    const filenameRaw = typeof body.filename === 'string' ? body.filename.trim() : '';
    if (!filenameRaw) {
      return NextResponse.json({ ok: false, error: 'filename richiesto' }, { status: 400 });
    }
    const filename = safeBasename(filenameRaw);
    if (!filename.endsWith('.json')) {
      return NextResponse.json({ ok: false, error: 'filename deve terminare con .json' }, { status: 400 });
    }
    const fullPath = path.join(RECORDINGS_DIR, filename);
    if (!fullPath.startsWith(RECORDINGS_DIR)) {
      return NextResponse.json({ ok: false, error: 'filename non valido' }, { status: 400 });
    }
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ ok: false, error: 'file non trovato' }, { status: 404 });
    }
    const raw = fs.readFileSync(fullPath, 'utf8');
    const json = JSON.parse(raw);
    return NextResponse.json({ ok: true, filename, flowTemplate: json });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Errore get recording' },
      { status: 500 }
    );
  }
}

