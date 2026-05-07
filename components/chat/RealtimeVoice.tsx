'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';

export type VoiceState = 'idle' | 'connecting' | 'connected' | 'recording' | 'responding' | 'playing';

export type RealtimeVoiceHandle = {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
};

type RealtimeVoiceProps = {
  sessionUrl: string;
  onTextDelta: (delta: string) => void;
  onTextDone: (fullText: string) => void;
  onUserTranscript: (transcript: string) => void;
  onAudioDone: () => void;
  onStateChange: (state: VoiceState) => void;
  onError: (error: string) => void;
  disabled?: boolean;
};

function float32ToInt16(float32: Float32Array): Int16Array {
  const len = float32.length;
  const int16 = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

function base64FromArrayBuffer(buf: ArrayBufferLike): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export const RealtimeVoice = forwardRef<RealtimeVoiceHandle, RealtimeVoiceProps>(function RealtimeVoice(
  { sessionUrl, onTextDelta, onTextDone, onUserTranscript, onAudioDone, onStateChange, onError, disabled },
  ref
) {
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const responseTextRef = useRef('');
  const audioChunksRef = useRef<Blob[]>([]);
  const isRespondingRef = useRef(false);

  const cleanupMedia = useCallback(() => {
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const cleanupWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  const playAudioChunks = useCallback(async () => {
    const chunks = audioChunksRef.current;
    audioChunksRef.current = [];

    if (chunks.length === 0) {
      onAudioDone();
      return;
    }

    try {
      const totalLength = chunks.reduce((acc, c) => acc + c.size, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const c of chunks) {
        const arr = new Uint8Array(await c.arrayBuffer());
        combined.set(arr, offset);
        offset += arr.length;
      }

      // Build WAV from PCM16
      const sampleRate = 24000;
      const numChannels = 1;
      const bitsPerSample = 16;
      const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
      const blockAlign = (numChannels * bitsPerSample) / 8;
      const dataSize = combined.length;
      const headerSize = 44;
      const wavBuffer = new ArrayBuffer(headerSize + dataSize);
      const wavView = new DataView(wavBuffer);

      const writeStr = (off: number, str: string) => {
        for (let i = 0; i < str.length; i++) wavView.setUint8(off + i, str.charCodeAt(i));
      };
      writeStr(0, 'RIFF');
      wavView.setUint32(4, 36 + dataSize, true);
      writeStr(8, 'WAVE');
      writeStr(12, 'fmt ');
      wavView.setUint32(16, 16, true);
      wavView.setUint16(20, 1, true);
      wavView.setUint16(22, numChannels, true);
      wavView.setUint32(24, sampleRate, true);
      wavView.setUint32(28, byteRate, true);
      wavView.setUint16(32, blockAlign, true);
      wavView.setUint16(34, bitsPerSample, true);
      writeStr(36, 'data');
      wavView.setUint32(40, dataSize, true);

      new Uint8Array(wavBuffer, headerSize).set(combined);

      const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(wavBlob);
      const audio = new Audio(url);

      audio.onended = () => {
        URL.revokeObjectURL(url);
        onAudioDone();
        onStateChange('connected');
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        onAudioDone();
        onStateChange('connected');
      };

      await audio.play();
    } catch (err) {
      console.error('Audio playback error:', err);
      onAudioDone();
      onStateChange('connected');
    }
  }, [onAudioDone, onStateChange]);

  const handleServerEvent = useCallback(
    (event: any) => {
      switch (event.type) {
        case 'conversation.item.created':
          if (event.item?.role === 'user' && event.item?.content?.[0]?.text) {
            onUserTranscript(event.item.content[0].text);
          }
          break;

        case 'response.text.delta':
          responseTextRef.current += event.delta;
          onTextDelta(event.delta);
          break;

        case 'response.text.done':
          onTextDone(event.text || responseTextRef.current);
          responseTextRef.current = '';
          break;

        case 'response.audio.delta':
          audioChunksRef.current.push(
            new Blob([Uint8Array.from(atob(event.delta), (c) => c.charCodeAt(0))])
          );
          break;

        case 'response.audio.done':
          onStateChange('playing');
          playAudioChunks();
          break;

        case 'response.done':
          isRespondingRef.current = false;
          onStateChange('connected');
          break;

        case 'error':
          console.error('Realtime API error:', event.error);
          if (event.error?.message) {
            onError(event.error.message);
          }
          break;
      }
    },
    [onTextDelta, onTextDone, onUserTranscript, onAudioDone, onStateChange, onError, playAudioChunks]
  );

  const sendAudio = useCallback(
    async (audioBlob: Blob) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      isRespondingRef.current = true;
      onStateChange('responding');

      try {
        const ac = audioContextRef.current || new AudioContext();
        audioContextRef.current = ac;

        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await ac.decodeAudioData(arrayBuffer);
        let pcmData = audioBuffer.getChannelData(0);

        // Resample to 24kHz if needed
        if (audioBuffer.sampleRate !== 24000) {
          const ratio = 24000 / audioBuffer.sampleRate;
          const newLength = Math.floor(pcmData.length * ratio);
          const resampled = new Float32Array(newLength);
          for (let i = 0; i < newLength; i++) {
            const srcIdx = i / ratio;
            const idx1 = Math.floor(srcIdx);
            const idx2 = Math.min(idx1 + 1, pcmData.length - 1);
            const frac = srcIdx - idx1;
            resampled[i] = pcmData[idx1] * (1 - frac) + pcmData[idx2] * frac;
          }
          pcmData = resampled;
        }

        // Convert to PCM16 and send in chunks
        const int16 = float32ToInt16(pcmData);
        const CHUNK_SIZE = 16000;
        for (let i = 0; i < int16.length; i += CHUNK_SIZE) {
          const chunk = int16.subarray(i, i + CHUNK_SIZE);
          ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64FromArrayBuffer(chunk.buffer) }));
        }

        ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
        ws.send(JSON.stringify({ type: 'response.create' }));
      } catch (err) {
        console.error('Audio processing error:', err);
        onError("Errore nell'elaborazione dell'audio.");
        isRespondingRef.current = false;
        onStateChange('connected');
      }
    },
    [onStateChange, onError]
  );

  const connect = useCallback(async () => {
    onStateChange('connecting');

    try {
      const res = await fetch(sessionUrl, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Impossibile creare sessione Realtime');
      }
      const { client_secret } = await res.json();
      if (!client_secret) throw new Error('Nessun client_secret ricevuto');

      const ws = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview`,
        ['openai-insecure-api-key', client_secret]
      );

      wsRef.current = ws;

      // Wait for WebSocket to actually open before resolving
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout connessione WebSocket (10s)'));
        }, 10000);

        ws.onopen = () => {
          clearTimeout(timeout);
          onStateChange('connected');
          resolve();
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Connessione WebSocket fallita'));
        };

        ws.onmessage = (event) => {
          try {
            handleServerEvent(JSON.parse(event.data));
          } catch {
            // ignore parse errors
          }
        };

        ws.onclose = (ev) => {
          clearTimeout(timeout);
          if (wsRef.current === ws) {
            onStateChange('idle');
          }
        };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connessione vocale fallita.';
      onError(msg);
      cleanupWs();
      onStateChange('idle');
    }
  }, [sessionUrl, onStateChange, onError, cleanupWs, handleServerEvent]);

  const startRecording = useCallback(async () => {
    if (disabled) return;

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connect();
      // connect() already called onError() with the real error if it failed
      // and cleanupWs() nullified wsRef.current. Don't show generic error.
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
    }
    // Safety check for edge case where ws closed between connect and here
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      onError('Connessione persa. Riprova.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      responseTextRef.current = '';
      audioChunksRef.current = [];
      isRespondingRef.current = false;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];
        await sendAudio(blob);
      };

      recorder.start();
      onStateChange('recording');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microfono non disponibile.';
      onError(msg);
      onStateChange('connected');
      cleanupMedia();
    }
  }, [disabled, connect, onError, onStateChange, cleanupMedia, sendAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    cleanupMedia();
  }, [cleanupMedia]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({ startRecording, stopRecording }), [startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupWs();
      cleanupMedia();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [cleanupWs, cleanupMedia]);

  return null;
});
