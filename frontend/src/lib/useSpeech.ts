import { useCallback, useEffect, useRef, useState } from 'react';

// The Web Speech API is not in TypeScript's DOM lib; describe the small part we use.
interface RecognitionResultList {
  length: number;
  [index: number]: { 0: { transcript: string }; isFinal: boolean };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

const RecognitionImpl: RecognitionCtor | undefined =
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as Record<string, RecognitionCtor | undefined>).SpeechRecognition ??
      (window as unknown as Record<string, RecognitionCtor | undefined>).webkitSpeechRecognition);

export const speechInputSupported = Boolean(RecognitionImpl);

export function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-GB';
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/** Streams the transcript of one recording into `onTranscript`, appended to `base`. */
export function useDictation(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => () => recognition.current?.stop(), []);

  const start = useCallback(
    (base: string) => {
      if (!RecognitionImpl) return;
      stopSpeaking();
      const instance = new RecognitionImpl();
      instance.lang = 'en-GB';
      instance.continuous = true;
      instance.interimResults = true;
      instance.onresult = event => {
        let text = '';
        for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
        onTranscript(`${base} ${text}`.trim());
      };
      instance.onerror = event =>
        setError(event.error === 'not-allowed' ? 'Microphone access was blocked. Allow it in your browser, or type instead.' : 'Recording stopped. You can keep typing.');
      instance.onend = () => setListening(false);
      recognition.current = instance;
      setError(null);
      setListening(true);
      instance.start();
    },
    [onTranscript],
  );

  const stop = useCallback(() => recognition.current?.stop(), []);
  return { listening, error, start, stop };
}
