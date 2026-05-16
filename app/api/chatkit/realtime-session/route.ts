import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY non configurata.' }, { status: 500 });
  }

  try {
    const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: process.env.OPENAI_CHATKIT_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17',
          modalities: ['text', 'audio'],
          voice: 'alloy',
          input_audio_transcription: {
            model: 'whisper-1',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      console.error('OpenAI Realtime session error:', res.status, errText);
      return NextResponse.json(
        { error: 'Impossibile creare sessione Realtime.' },
        { status: 502 }
      );
    }

    const data = await res.json();

    return NextResponse.json(
      {
        client_secret: data.client_secret?.value ?? null,
        expires_at: data.client_secret?.expires_at ?? null,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('Realtime session error:', err);
    return NextResponse.json(
      { error: 'Errore durante la creazione della sessione.' },
      { status: 500 }
    );
  }
}
