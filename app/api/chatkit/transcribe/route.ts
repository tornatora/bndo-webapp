import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY non configurata.' }, { status: 500 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio');
    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json({ error: 'File audio mancante.' }, { status: 400 });
    }

    const whisperForm = new FormData();
    whisperForm.append('file', audioFile, 'recording.webm');
    whisperForm.append('model', 'whisper-1');
    whisperForm.append('language', 'it');
    whisperForm.append('response_format', 'json');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: whisperForm,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      console.error('Whisper transcription error:', res.status, errText);
      return NextResponse.json(
        { error: 'Errore durante la trascrizione.' },
        { status: 502 }
      );
    }

    const data = await res.json();
    const text: string = (data.text || '').trim();

    if (!text) {
      return NextResponse.json({ error: 'Nessun testo trascritto.' }, { status: 422 });
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error('Transcribe route error:', err);
    return NextResponse.json(
      { error: 'Errore durante la trascrizione.' },
      { status: 500 }
    );
  }
}
