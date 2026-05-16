'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from 'react';

export type VoiceState = 'idle' | 'connecting' | 'connected' | 'recording' | 'responding' | 'playing';

export type RealtimeVoiceHandle = {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
};

type RealtimeVoiceProps = {
  /** Endpoint per ottenere token sessione (usato solo se si passa a Realtime API) */
  sessionUrl: string;
  /** Endpoint per trascrizione whisper */
  transcribeUrl: string;
  onTextDelta: (delta: string) => void;
  onTextDone: (fullText: string) => void;
  onUserTranscript: (transcript: string) => void;
  onAudioDone: () => void;
  onStateChange: (state: VoiceState) => void;
  onError: (error: string) => void;
  /** Chiamato quando il parlato è stato trascritto e pronto per l'invio alla chat */
  onTranscriptReady?: (transcript: string) => void;
  disabled?: boolean;
};

/** Restituisce il MIME type audio supportato dal browser */
function getSupportedAudioMime(): string {
  if (typeof window === 'undefined') return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  if (MediaRecorder.isTypeSupported('audio/aac')) return 'audio/aac';
  return 'audio/webm';
}

export const RealtimeVoice = forwardRef<RealtimeVoiceHandle, RealtimeVoiceProps>(function RealtimeVoice(
  { sessionUrl: _sessionUrl, transcribeUrl, onTextDelta, onTextDone, onUserTranscript, onAudioDone, onStateChange, onError, onTranscriptReady, disabled },
  ref
) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef('audio/webm');

  const cleanupMedia = useCallback(() => {
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (disabled) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mime = getSupportedAudioMime();
      mimeRef.current = mime;

      const recorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        if (chunksRef.current.length === 0) {
          onStateChange('idle');
          return;
        }

        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        cleanupMedia();

        onStateChange('connecting');

        try {
          const formData = new FormData();
          formData.append('audio', blob, 'recording.' + (mime.includes('mp4') ? 'm4a' : 'webm'));

          const res = await fetch(transcribeUrl, {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Errore trascrizione');
          }

          const { text } = await res.json();
          if (text) {
            onTranscriptReady?.(text.trim());
          }
          onStateChange('idle');
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Errore durante la trascrizione.';
          onError(msg);
          onStateChange('idle');
        }
      };

      recorder.onerror = () => {
        onError('Errore durante la registrazione.');
        cleanupMedia();
        onStateChange('idle');
      };

      recorder.start();
      onStateChange('recording');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microfono non disponibile.';
      onError(msg);
      cleanupMedia();
      onStateChange('idle');
    }
  }, [disabled, transcribeUrl, onTranscriptReady, onError, onStateChange, cleanupMedia]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    } else {
      cleanupMedia();
    }
  }, [cleanupMedia]);

  useImperativeHandle(ref, () => ({ startRecording, stopRecording }), [startRecording, stopRecording]);

  useEffect(() => {
    return () => { cleanupMedia(); };
  }, [cleanupMedia]);

  return null;
});
