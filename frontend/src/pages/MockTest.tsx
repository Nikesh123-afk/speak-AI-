import { useEffect, useMemo, useState } from 'react';
import { useMockTests } from '../lib/queries';
import { speak, speechInputSupported, stopSpeaking } from '../lib/useSpeech';
import { useLeaveWarning, usePersistentState } from '../lib/usePersistentState';
import type { Answer, MockTest, User } from '../lib/types';
import { Button, ButtonLink, Eyebrow, Spinner } from '../components/ui';
import {
  AnswerBox, AssessingView, FailedView, LongTurn, PACE, Preparation, ResultView, SavedAnswers, useAssessment,
} from '../components/session';

/** A sitting in progress. Persisted, so a reload resumes at the same step instead of losing every answer. */
interface Sitting {
  test: MockTest;
  key: string;
  index: number;
  answers: Answer[];
  finished: boolean;
}

type Step =
  | { type: 'intro'; part: 1 | 2 | 3; script: string }
  | { type: 'question'; part: 1 | 3; question: string; number: number; of: number }
  | { type: 'prep' }
  | { type: 'longTurn' };

/** The examiner's script, in exam order. */
export function buildSteps(test: MockTest): Step[] {
  const questions = (part: 1 | 3, list: string[]): Step[] =>
    list.map((question, i) => ({ type: 'question', part, question, number: i + 1, of: list.length }));
  return [
    { type: 'intro', part: 1, script: `In this first part, I'd like to ask you some questions about yourself. Let's talk about ${test.part1.topic.toLowerCase()}.` },
    ...questions(1, test.part1.questions),
    { type: 'intro', part: 2, script: "Now I'm going to give you a topic, and I'd like you to talk about it for one to two minutes. You have one minute to think about what you're going to say. You can make some notes if you wish." },
    { type: 'prep' },
    { type: 'longTurn' },
    { type: 'intro', part: 3, script: `We've been talking about ${test.part2.prompt.replace(/^Describe /, '').replace(/\.$/, '')}. Now I'd like to discuss with you some more general questions about ${test.part3.topic.toLowerCase()}.` },
    ...questions(3, test.part3.questions),
  ];
}

export function MockTestPage({ user }: { user: User }) {
  const [running, setRunning] = usePersistentState<Sitting | null>('mock-sitting', null);
  const assessment = useAssessment(() => setRunning(null));
  useEffect(() => () => stopSpeaking(), []);
  const submit = (sitting: Sitting) => assessment.submit({ kind: 'mock', topic: sitting.test.title, answers: sitting.answers }, sitting.key);

  const restart = () => {
    assessment.reset();
    setRunning(null);
  };

  let content;
  if (assessment.state.name === 'assessing') content = <AssessingView mock />;
  else if (assessment.state.name === 'failed') content = <FailedView error={assessment.state.error} onRetry={assessment.retry} onExit={restart} exitLabel="Back to mock tests" />;
  else if (assessment.state.name === 'result') content = <ResultView practice={assessment.state.practice} onAgain={restart} againLabel="Take another mock test" />;
  else if (running?.finished) content = <SavedAnswers onSubmit={() => submit(running)} onDiscard={restart} />;
  else if (running)
    content = (
      <Runner
        sitting={running}
        onChange={setRunning}
        onExit={() => setRunning(null)}
        onFinish={finished => {
          setRunning(finished);
          submit(finished);
        }}
      />
    );
  else content = <Intro user={user} onStart={test => setRunning({ test, key: crypto.randomUUID(), index: 0, answers: [], finished: false })} />;

  return <div className="container-page py-12 sm:py-16">{content}</div>;
}

function Intro({ user, onStart }: { user: User; onStart: (test: MockTest) => void }) {
  const { data: tests, isLoading, error } = useMockTests();
  const [selected, setSelected] = useState<string | null>(null);
  const locked = user.plan === 'free';
  const parts = [
    ['Part 1', 'Interview', '4–5 min', 'Short questions about you and familiar topics.'],
    ['Part 2', 'Long turn', '3–4 min', '1 minute to prepare a cue card, then speak for up to 2 minutes.'],
    ['Part 3', 'Discussion', '4–5 min', 'Deeper, more abstract questions linked to Part 2.'],
  ];

  return (
    <div>
      <Eyebrow>Full mock test</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold sm:text-5xl">Sit a complete Speaking test.</h1>
      <p className="mt-3 max-w-2xl text-base text-muted sm:text-lg">
        The same three parts, order and timings as the real exam, marked together at the end. Find a quiet room and allow about 15 minutes.
      </p>

      <ol className="mt-10 grid gap-4 md:grid-cols-3">
        {parts.map(([part, name, time, body]) => (
          <li key={part} className="rounded-2xl border border-line bg-card p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-signal-strong">{part}</span>
              <span className="text-sm tabular-nums text-muted">{time}</span>
            </div>
            <h2 className="mt-2 text-xl font-semibold">{name}</h2>
            <p className="mt-1 text-[15px] text-muted">{body}</p>
          </li>
        ))}
      </ol>

      {locked && (
        <div className="mt-10 flex flex-col gap-4 rounded-3xl border border-line bg-sunken p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Mock tests are part of Standard and Premium</h2>
            <p className="mt-1 text-muted">Your free plan covers Part 1 practice. Upgrade to sit full tests with Parts 2 and 3.</p>
          </div>
          <ButtonLink to="/#pricing" className="shrink-0">See plans</ButtonLink>
        </div>
      )}

      <h2 className="mt-12 text-2xl font-semibold">Choose a test</h2>
      {isLoading && <div className="mt-6"><Spinner label="Loading tests" /></div>}
      {error && <p className="mt-6 text-danger">{error.message}</p>}
      {tests && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Mock tests">
          {tests.map(test => (
            <button
              key={test.id}
              role="radio"
              aria-checked={selected === test.id}
              disabled={locked}
              onClick={() => setSelected(test.id)}
              className="rounded-2xl border border-line bg-card p-6 text-left transition enabled:hover:border-ink disabled:opacity-60 aria-checked:border-signal aria-checked:ring-2 aria-checked:ring-signal/25"
            >
              <span className="font-display text-lg font-semibold">{test.title}</span>
              <span className="mt-3 block text-sm text-muted">Part 2: {test.part2.prompt}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button size="lg" disabled={locked || !selected} onClick={() => { const t = tests?.find(x => x.id === selected); if (t) onStart(t); }}>
          Start the test
        </Button>
        <span className="text-sm text-muted">{speechInputSupported ? 'You’ll be asked for microphone access.' : 'Your browser can’t transcribe speech, so you’ll type your answers.'}</span>
      </div>
    </div>
  );
}

function Runner({ sitting, onChange, onExit, onFinish }: {
  sitting: Sitting; onChange: (s: Sitting) => void; onExit: () => void; onFinish: (s: Sitting) => void;
}) {
  const { test, index, answers, key } = sitting;
  const steps = useMemo(() => buildSteps(test), [test]);
  const step = steps[Math.min(index, steps.length - 1)];
  const part = step.type === 'prep' || step.type === 'longTurn' ? 2 : step.part;
  useLeaveWarning(true);

  useEffect(() => {
    if (step.type === 'intro') speak(step.script);
    else if (step.type === 'question') speak(step.question);
    else if (step.type === 'prep') speak(test.part2.prompt);
    // No speech during the long turn: recording is already running and would transcribe the examiner's voice.
  }, [step, test]);

  const next = () => onChange({ ...sitting, index: index + 1 });
  function record(answer: Answer) {
    const all = [...answers, answer];
    if (index + 1 < steps.length) {
      onChange({ ...sitting, answers: all, index: index + 1 });
    } else {
      stopSpeaking();
      onFinish({ ...sitting, answers: all, finished: true });
    }
  }
  function exit() {
    if (window.confirm('Leave the mock test? Your answers so far will be lost.')) {
      stopSpeaking();
      onExit();
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted">{test.title}</span>
        <Button variant="ghost" className="h-auto! px-0!" onClick={exit}>Exit test</Button>
      </div>
      <ol className="mt-3 grid grid-cols-3 gap-2" aria-label="Test progress">
        {[1, 2, 3].map(p => (
          <li key={p} aria-current={p === part ? 'step' : undefined}>
            <span className={`block h-1 rounded-full ${p <= part ? 'bg-signal' : 'bg-line'}`} />
            <span className={`mt-2 block text-xs font-medium ${p === part ? 'text-ink' : 'text-muted'}`}>Part {p}</span>
          </li>
        ))}
      </ol>

      <div className="mt-10" key={index}>
        {step.type === 'intro' && <PartIntro part={step.part} script={step.script} onContinue={next} />}
        {step.type === 'question' && (
          <>
            <Eyebrow>Part {step.part} · Question {step.number} of {step.of}</Eyebrow>
            <h1 className="mt-4 text-2xl font-medium leading-snug sm:text-4xl">{step.question}</h1>
            <button onClick={() => speak(step.question)} className="mt-4 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">Hear it again</button>
            <div className="mt-10">
              <AnswerBox
                draftKey={`${key}:${index}`}
                pace={PACE[step.part]}
                submitLabel={index + 1 < steps.length ? 'Next question →' : 'Finish test and get feedback'}
                onSubmit={answer => record({ part: step.part, question: step.question, answer })}
              />
            </div>
          </>
        )}
        {step.type === 'prep' && <Preparation card={test.part2} onDone={next} />}
        {step.type === 'longTurn' && (
          <LongTurn card={test.part2} draftKey={`${key}:${index}`} submitLabel="Finish Part 2 →"
            onSubmit={answer => record({ part: 2, question: test.part2.question, answer })} />
        )}
      </div>
    </div>
  );
}

function PartIntro({ part, script, onContinue }: { part: number; script: string; onContinue: () => void }) {
  const names = ['', 'Interview', 'Long turn', 'Discussion'];
  return (
    <section className="rounded-3xl border border-line bg-card p-6 sm:p-10">
      <Eyebrow>Part {part}</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{names[part]}</h1>
      <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">“{script}”</p>
      <Button size="lg" className="mt-8" onClick={onContinue}>{part === 2 ? 'See my topic' : 'Begin Part ' + part}</Button>
    </section>
  );
}
