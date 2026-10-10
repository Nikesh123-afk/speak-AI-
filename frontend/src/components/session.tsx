import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { keys } from '../lib/queries';
import { averageScore } from '../lib/score';
import { speechInputSupported, stopSpeaking, useDictation } from '../lib/useSpeech';
import type { Answer, Practice } from '../lib/types';
import { Bars, Button, ButtonLink, Eyebrow, ScoreDial } from './ui';

export interface AssessmentBody {
  kind: 'practice' | 'mock';
  topic: string;
  part?: number;
  answers: Answer[];
}

type AssessmentState =
  | { name: 'idle' }
  | { name: 'assessing' }
  | { name: 'failed'; error: ApiError }
  | { name: 'result'; practice: Practice };

/** Submits a finished session. Retries reuse the same idempotency key, so nothing is assessed or counted twice. */
export function useAssessment() {
  const client = useQueryClient();
  const [state, setState] = useState<AssessmentState>({ name: 'idle' });
  const last = useRef<{ body: AssessmentBody; key: string } | null>(null);

  const submit = useCallback(
    async (body: AssessmentBody, key: string) => {
      last.current = { body, key };
      setState({ name: 'assessing' });
      try {
        const { practice } = await api<{ practice: Practice }>('/api/feedback', { method: 'POST', headers: { 'Idempotency-Key': key }, body });
        client.invalidateQueries({ queryKey: keys.practices });
        setState({ name: 'result', practice });
      } catch (error) {
        setState({ name: 'failed', error: error instanceof ApiError ? error : new ApiError(0, 'Something went wrong.') });
      }
    },
    [client],
  );
  const retry = useCallback(() => last.current && submit(last.current.body, last.current.key), [submit]);
  const reset = useCallback(() => setState({ name: 'idle' }), []);
  return { state, submit, retry, reset };
}

export function useCountdown(seconds: number, onDone?: () => void) {
  const [left, setLeft] = useState(seconds);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        window.clearInterval(timer);
        done.current?.();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [seconds]);
  return left;
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

interface AnswerBoxProps {
  submitLabel: string;
  onSubmit: (text: string) => void;
  /** Hard speaking limit in seconds; recording stops when it runs out. */
  timeLimit?: number;
  autoRecord?: boolean;
  placeholder?: string;
}

export function AnswerBox({ submitLabel, onSubmit, timeLimit, autoRecord, placeholder }: AnswerBoxProps) {
  const [text, setText] = useState('');
  const dictation = useDictation(setText);
  const { start, stop } = dictation;

  useEffect(() => {
    if (autoRecord && speechInputSupported) start('');
  }, [autoRecord, start]);

  function submit() {
    stop();
    if (text.trim()) onSubmit(text.trim());
  }

  return (
    <div className="rounded-3xl border border-line bg-card p-5 sm:p-6">
      {timeLimit !== undefined && <SpeakingTimer seconds={timeLimit} onDone={stop} />}
      <label htmlFor="answer" className="sr-only">Your answer</label>
      <textarea
        id="answer"
        value={text}
        onChange={e => setText(e.target.value)}
        rows={timeLimit ? 9 : 6}
        maxLength={10000}
        placeholder={placeholder ?? (speechInputSupported ? 'Press “Record” and start speaking, or type here.' : 'Type your answer here.')}
        className="block w-full resize-y bg-transparent text-lg leading-relaxed placeholder:text-muted/70 focus:outline-none"
      />
      {dictation.error && <p className="mt-2 text-sm text-warn">{dictation.error}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        {speechInputSupported ? (
          <Button
            variant="secondary"
            aria-pressed={dictation.listening}
            onClick={() => (dictation.listening ? stop() : start(text))}
            className={dictation.listening ? 'border-signal! text-signal-strong!' : ''}
          >
            {dictation.listening ? <><Bars animated className="h-4" /> Stop recording</> : <><span className="size-2.5 rounded-full bg-signal" aria-hidden="true" /> Record</>}
          </Button>
        ) : <span />}
        <Button onClick={submit} disabled={!text.trim()}>{submitLabel}</Button>
      </div>
    </div>
  );
}

function SpeakingTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const left = useCountdown(seconds, onDone);
  const elapsed = seconds - left;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className={`font-display text-base font-semibold tabular-nums ${left === 0 ? 'text-danger' : 'text-ink'}`} aria-live="off">{clock(left)}</span>
      <div className="h-1 min-w-24 flex-1 rounded-full bg-sunken">
        <div className="h-full rounded-full bg-signal transition-[width] duration-300" style={{ width: `${(elapsed / seconds) * 100}%` }} />
      </div>
      <span className="w-full text-muted sm:w-auto">{left === 0 ? 'Time’s up — finish your sentence' : elapsed < 60 ? 'Aim for at least 1 minute' : 'Good length — keep going'}</span>
    </div>
  );
}

export function AssessingView({ mock = false }: { mock?: boolean }) {
  return (
    <div className="grid min-h-[50vh] place-items-center text-center">
      <div>
        <Bars animated className="h-10 text-signal" />
        <h1 className="mt-6 text-3xl font-medium">{mock ? 'Marking your mock test…' : 'Reading your answers…'}</h1>
        <p className="mt-2 text-muted">Checking coherence, vocabulary and grammar. This usually takes under {mock ? '40' : '20'} seconds.</p>
      </div>
    </div>
  );
}

export function FailedView({ error, onRetry, onExit, exitLabel }: { error: ApiError; onRetry: () => void; onExit: () => void; exitLabel: string }) {
  const locked = error.status === 403;
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <h1 className="text-3xl font-medium">{locked ? 'This needs a paid plan' : 'We couldn’t assess your answers'}</h1>
      <p className="mt-3 text-muted">{error.message}</p>
      {!locked && <p className="mt-1 text-sm text-muted">Your answers are kept here — retrying won’t count twice.</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {locked ? <ButtonLink to="/#pricing">See plans</ButtonLink> : <Button onClick={onRetry}>Try again</Button>}
        <Button variant="secondary" onClick={onExit}>{exitLabel}</Button>
      </div>
    </div>
  );
}

const PART_NAMES: Record<number, string> = { 1: 'Part 1 · Interview', 2: 'Part 2 · Long turn', 3: 'Part 3 · Discussion' };

export function ResultView({ practice, onAgain, againLabel }: { practice: Practice; onAgain: () => void; againLabel: string }) {
  const feedback = practice.feedback!;
  const mock = practice.kind === 'mock';
  const groups = mock ? [1, 2, 3].map(part => ({ part, answers: practice.answers.filter(a => a.part === part) })) : [{ part: 0, answers: practice.answers }];
  useEffect(() => stopSpeaking(), []);

  return (
    <div className="mx-auto max-w-4xl">
      <Eyebrow>{mock ? 'Mock test result' : 'Feedback'} · {practice.topic}</Eyebrow>
      <div className="mt-6 grid items-center justify-items-center gap-8 rounded-3xl border border-line bg-card p-5 sm:p-8 md:grid-cols-[auto_1fr] md:justify-items-stretch md:gap-10">
        <ScoreDial value={averageScore(feedback)} label="Transcript score" />
        <dl className="w-full space-y-4">
          {Object.entries(feedback.criteria).map(([name, value]) => (
            <div key={name}>
              <div className="flex items-baseline justify-between text-sm">
                <dt className="font-medium">{name}</dt>
                <dd className="tabular-nums text-muted">{value === null ? 'Not scored' : value.toFixed(1)}</dd>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-sunken">
                <div className="h-full rounded-full bg-signal" style={{ width: `${((value ?? 0) / 9) * 100}%` }} />
              </div>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <FeedbackList title="What worked" tone="good" items={feedback.strengths} />
        <FeedbackList title="Work on next" tone="warn" items={feedback.improvements} />
      </div>
      <p className="mt-6 leading-relaxed text-muted">{feedback.summary}</p>

      <details className="mt-8 rounded-2xl border border-line">
        <summary className="cursor-pointer px-5 py-4 font-medium">Your answers</summary>
        <div className="space-y-6 border-t border-line px-5 py-5">
          {groups.map(group => (
            <section key={group.part}>
              {mock && <h3 className="mb-3 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-signal-strong">{PART_NAMES[group.part]}</h3>}
              <ol className="space-y-5">
                {group.answers.map((a, i) => (
                  <li key={i}>
                    <p className="text-sm font-medium">{a.question}</p>
                    <p className="mt-1 whitespace-pre-line text-muted">{a.answer}</p>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </details>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button size="lg" onClick={onAgain}>{againLabel}</Button>
        <Link to="/dashboard" className="inline-flex h-13 items-center px-3 text-muted hover:text-ink">View progress</Link>
      </div>
    </div>
  );
}

function FeedbackList({ title, tone, items }: { title: string; tone: 'good' | 'warn'; items: string[] }) {
  const style = tone === 'good' ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn';
  return (
    <section className="rounded-3xl border border-line bg-card p-6">
      <h2 className={`inline-block rounded-full px-3 py-1 font-sans text-xs font-semibold uppercase tracking-[0.14em] ${style}`}>{title}</h2>
      <ul className="mt-4 space-y-3">
        {items.map(item => <li key={item} className="leading-relaxed">{item}</li>)}
      </ul>
    </section>
  );
}
