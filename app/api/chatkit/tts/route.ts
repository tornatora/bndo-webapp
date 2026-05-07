import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY non configurata.' }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const text: string = (body.text || '').trim();
    if (!text || text.length > 2000) {
      return NextResponse.json({ error: 'Testo non valido (max 2000 caratteri).' }, { status: 400 });
    }

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: 'alloy',
        response_format: 'wav',
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      console.error('OpenAI TTS error:', res.status, errText);
      return NextResponse.json({ error: 'Sintesi vocale non disponibile.' }, { status: 502 });
    }

    const audioBuffer = await res.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err) {
    console.error('TTS error:', err);
    return NextResponse.json({ error: 'Errore sintesi vocale.' }, { status: 500 });
  }
}
