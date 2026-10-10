import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useConfig, useMe, usePractices, useTopics } from '../lib/queries';
import { speak, speechInputSupported, stopSpeaking } from '../lib/useSpeech';
import type { Answer, Topic } from '../lib/types';
import { Button, Eyebrow, Spinner } from '../components/ui';
import { AnswerBox, AssessingView, FailedView, ResultView, useAssessment } from '../components/session';

type Stage = { name: 'choose' } | { name: 'session'; topic: Topic; index: number; answers: Answer[]; key: string };

export function PracticePage() {
  const [stage, setStage] = useState<Stage>({ name: 'choose' });
  const assessment = useAssessment();
  useEffect(() => () => stopSpeaking(), []);

  const restart = () => {
    assessment.reset();
    setStage({ name: 'choose' });
  };

  let content;
  if (assessment.state.name === 'assessing') content = <AssessingView />;
  else if (assessment.state.name === 'failed') content = <FailedView error={assessment.state.error} onRetry={assessment.retry} onExit={restart} exitLabel="Back to topics" />;
  else if (assessment.state.name === 'result') content = <ResultView practice={assessment.state.practice} onAgain={restart} againLabel="Practise another topic" />;
  else if (stage.name === 'session')
    content = (
      <Session
        key={stage.index}
        stage={stage}
        onExit={() => setStage({ name: 'choose' })}
        onAnswer={answer => {
          const answers = [...stage.answers, answer];
          if (answers.length < stage.topic.questions.length) setStage({ ...stage, index: stage.index + 1, answers });
          else assessment.submit({ kind: 'practice', topic: stage.topic.title, part: 1, answers }, stage.key);
        }}
      />
    );
  else content = <ChooseTopic onStart={topic => setStage({ name: 'session', topic, index: 0, answers: [], key: crypto.randomUUID() })} />;

  return <div className="container-page py-12 sm:py-16">{content}</div>;
}

const FREE_ASSESSMENTS = 3;

function ChooseTopic({ onStart }: { onStart: (topic: Topic) => void }) {
  const { data: user } = useMe();
  const { data: topics, isLoading, error } = useTopics();
  const { data: config } = useConfig();
  const free = user?.plan === 'free';
  const { data: history } = usePractices(Boolean(user));
  const left = free ? Math.max(0, FREE_ASSESSMENTS - (history?.total ?? 0)) : null;
  const [custom, setCustom] = useState(false);

  function startCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const questions = String(new FormData(event.currentTarget).get('questions') ?? '')
      .split('\n').map(q => q.trim()).filter(Boolean).slice(0, 8);
    if (questions.length >= 2) onStart({ title: 'Your questions', questions });
  }

  return (
    <div>
      {/* Page header */}
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow>Practice</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold sm:text-5xl">How do you want to practise today?</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {left !== null && (
            <span className="rounded-full border border-line bg-card px-3.5 py-1.5">
              <span className="font-semibold tabular-nums text-ink">{left}</span> <span className="text-muted">of {FREE_ASSESSMENTS} free assessments left</span>
            </span>
          )}
          <span className="rounded-full border border-line bg-card px-3.5 py-1.5 text-muted">
            {speechInputSupported ? '🎙 Voice answers on' : '⌨ Typed answers (no speech support)'}
          </span>
        </div>
      </header>

      {config && !config.feedbackAvailable && (
        <p role="status" className="mt-6 flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          <span aria-hidden="true">⚠</span>
          Feedback is temporarily unavailable. You can still practise — we’ll tell you before you submit.
        </p>
      )}

      {/* Two modes */}
      <div className="mt-10 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Link
          to="/mock-test"
          className="group relative flex flex-col overflow-hidden rounded-3xl border border-signal/40 bg-signal-soft p-5 transition hover:border-signal sm:p-8"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-signal-strong">Full mock test</span>
            <span className="rounded-full bg-card/70 px-3 py-1 text-xs font-medium text-muted">{free ? '🔒 Standard & Premium' : '11–14 min'}</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold sm:text-3xl">Sit the whole Speaking test</h2>
          <p className="mt-2 max-w-md text-muted">Real exam order and timings, marked together at the end.</p>
          <ol className="mt-6 grid grid-cols-3 gap-2 text-sm">
            {[['1', 'Interview', '4–5 min'], ['2', 'Long turn', '3–4 min'], ['3', 'Discussion', '4–5 min']].map(([n, name, time]) => (
              <li key={n} className="min-w-0 rounded-xl bg-card/70 p-2.5 sm:p-3">
                <span className="block text-xs text-muted">Part {n}</span>
                <span className="block truncate font-medium">{name}</span>
                <span className="block text-xs tabular-nums text-muted">{time}</span>
              </li>
            ))}
          </ol>
          <span className="mt-7 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-signal px-5 font-medium text-white transition group-hover:bg-signal-strong">
            {free ? 'See mock tests' : 'Start a mock test'} <span aria-hidden="true">→</span>
          </span>
        </Link>

        <a href="#topics" className="group flex flex-col rounded-3xl border border-line bg-card p-5 transition hover:border-ink sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Quick practice</span>
            <span className="rounded-full bg-sunken px-3 py-1 text-xs font-medium text-muted">~3 min</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold sm:text-3xl">Warm up with Part 1</h2>
          <p className="mt-2 text-muted">Four short questions on one topic, with feedback straight after.</p>
          <ul className="mt-6 space-y-2 text-sm text-muted">
            <li className="flex gap-2"><span className="text-good" aria-hidden="true">✓</span>Good for daily practice</li>
            <li className="flex gap-2"><span className="text-good" aria-hidden="true">✓</span>Pick a topic or bring your own questions</li>
          </ul>
          <span className="mt-auto pt-7 font-medium text-ink">
            Choose a topic <span aria-hidden="true" className="inline-block transition group-hover:translate-y-0.5">↓</span>
          </span>
        </a>
      </div>

      {/* Topics + tips */}
      <section id="topics" className="mt-16 scroll-mt-24 grid gap-10 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-2xl font-semibold">Quick practice topics</h2>
            {!custom && <button onClick={() => setCustom(true)} className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline">Use my own questions</button>}
          </div>

          {isLoading && <div className="mt-6"><Spinner label="Loading topics" /></div>}
          {error && <p className="mt-6 text-danger">{error.message}</p>}

          {topics && !custom && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {Object.entries(topics).map(([id, topic]) => (
                <button
                  key={id}
                  onClick={() => onStart(topic)}
                  className="group flex flex-col rounded-2xl border border-line bg-card p-5 text-left transition hover:-translate-y-0.5 hover:border-ink hover:shadow-[0_12px_30px_-18px_rgb(0_0_0/0.4)]"
                >
                  <span className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-sunken text-lg" aria-hidden="true">{TOPIC_ICONS[id] ?? '💬'}</span>
                    <span className="font-display text-lg font-semibold">{topic.title}</span>
                  </span>
                  <span className="mt-3 text-sm text-muted">“{topic.questions[0]}”</span>
                  <span className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-muted">{topic.questions.length} questions</span>
                    <span className="font-medium text-signal-strong opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100">Start →</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {custom && (
            <form onSubmit={startCustom} className="mt-6 space-y-4 rounded-2xl border border-line bg-card p-5">
              <label htmlFor="questions" className="block font-medium">Paste 2–8 questions, one per line</label>
              <textarea id="questions" name="questions" required rows={6} maxLength={6000}
                className="block w-full rounded-xl border border-line bg-paper p-4 leading-relaxed focus:border-ink focus:outline-none"
                placeholder={'Do you like reading?\nWhat kind of books do you enjoy?'} />
              <div className="flex gap-3">
                <Button type="submit">Begin session</Button>
                <Button variant="ghost" onClick={() => setCustom(false)}>Back to topics</Button>
              </div>
            </form>
          )}
        </div>

        <aside className="h-fit rounded-2xl border border-line bg-card p-6 lg:sticky lg:top-24">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-[0.14em] text-muted">Before you start</h2>
          <ul className="mt-4 space-y-4 text-[15px]">
            {TIPS.map(([title, body]) => (
              <li key={title}>
                <p className="font-medium">{title}</p>
                <p className="mt-0.5 text-sm text-muted">{body}</p>
              </li>
            ))}
          </ul>
        </aside>
      </section>
    </div>
  );
}

const TOPIC_ICONS: Record<string, string> = { hometown: '🏡', work: '💼', technology: '💻', travel: '✈️' };

const TIPS = [
  ['Find a quiet room', 'Background noise lowers transcription accuracy.'],
  ['Answer, then extend', 'Give a direct answer, a reason, and an example — two to four sentences.'],
  ['Don’t memorise', 'Examiners notice rehearsed answers. Speak naturally.'],
  ['Keep going', 'If you lose a word, paraphrase rather than stopping.'],
];

function Session({ stage, onAnswer, onExit }: { stage: Extract<Stage, { name: 'session' }>; onAnswer: (a: Answer) => void; onExit: () => void }) {
  const question = stage.topic.questions[stage.index];
  const total = stage.topic.questions.length;
  useEffect(() => speak(question), [question]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted">{stage.topic.title}</span>
        <Button variant="ghost" className="h-auto! px-0!" onClick={() => { stopSpeaking(); onExit(); }}>Exit</Button>
      </div>
      <div className="mt-3 flex gap-1.5" aria-label={`Question ${stage.index + 1} of ${total}`} role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={stage.index + 1}>
        {stage.topic.questions.map((_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= stage.index ? 'bg-signal' : 'bg-line'}`} />
        ))}
      </div>

      <section className="mt-10" aria-live="polite">
        <Eyebrow>Question {stage.index + 1} of {total}</Eyebrow>
        <h1 className="mt-4 text-2xl font-medium leading-snug sm:text-4xl">{question}</h1>
        <button onClick={() => speak(question)} className="mt-4 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          Hear it again
        </button>
      </section>

      <div className="mt-10">
        <AnswerBox
          submitLabel={stage.index + 1 < total ? 'Next question →' : 'Finish and get feedback'}
          onSubmit={answer => onAnswer({ question, answer })}
        />
      </div>
    </div>
  );
}
