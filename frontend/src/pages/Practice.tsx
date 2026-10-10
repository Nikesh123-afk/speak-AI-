import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useConfig, useMe, useTopics, useUsage } from '../lib/queries';
import { speak, speechInputSupported, stopSpeaking } from '../lib/useSpeech';
import { useLeaveWarning, usePersistentState } from '../lib/usePersistentState';
import type { Answer, CueCard, Topic } from '../lib/types';
import { Button, ButtonLink, Eyebrow, Spinner } from '../components/ui';
import {
  AnswerBox, AssessingView, FailedView, LongTurn, PACE, Preparation, ResultView, SavedAnswers, useAssessment,
  type AssessmentBody,
} from '../components/session';

type Part = 1 | 2 | 3;
type Stage =
  | { name: 'choose' }
  | { name: 'session'; part: 1 | 3; topic: Topic; index: number; answers: Answer[]; key: string }
  | { name: 'cue'; card: CueCard; step: 'prep' | 'speak'; key: string }
  | { name: 'done'; body: AssessmentBody; key: string };

const STAGE_KEY = 'practice-stage';

export function PracticePage() {
  // Persisted, so a reload or a click on the logo mid-session doesn't lose answers.
  const [stage, setStage] = usePersistentState<Stage>(STAGE_KEY, { name: 'choose' });
  // Once marked, there is nothing left to save.
  const assessment = useAssessment(() => setStage({ name: 'choose' }));
  useEffect(() => () => stopSpeaking(), []);
  useLeaveWarning(stage.name === 'session' || stage.name === 'cue');

  const restart = () => {
    assessment.reset();
    setStage({ name: 'choose' });
  };
  const finish = (body: AssessmentBody, key: string) => {
    setStage({ name: 'done', body, key });
    assessment.submit(body, key);
  };

  let content;
  if (assessment.state.name === 'assessing') content = <AssessingView />;
  else if (assessment.state.name === 'failed') content = <FailedView error={assessment.state.error} onRetry={assessment.retry} onExit={restart} exitLabel="Back to topics" />;
  else if (assessment.state.name === 'result') content = <ResultView practice={assessment.state.practice} onAgain={restart} againLabel="Practise another topic" />;
  else if (stage.name === 'done') content = <SavedAnswers onSubmit={() => assessment.submit(stage.body, stage.key)} onDiscard={restart} />;
  else if (stage.name === 'session')
    content = (
      <Session
        key={stage.index}
        stage={stage}
        onExit={() => setStage({ name: 'choose' })}
        onAnswer={answer => {
          const answers = [...stage.answers, answer];
          if (answers.length < stage.topic.questions.length) setStage({ ...stage, index: stage.index + 1, answers });
          else finish({ kind: 'practice', topic: stage.topic.title, part: stage.part, answers }, stage.key);
        }}
      />
    );
  else if (stage.name === 'cue')
    content = (
      <CueSession
        stage={stage}
        onSpeak={() => setStage({ ...stage, step: 'speak' })}
        onExit={() => setStage({ name: 'choose' })}
        onAnswer={answer => finish({ kind: 'practice', topic: stage.card.prompt, part: 2, answers: [{ question: stage.card.question, answer }] }, stage.key)}
      />
    );
  else
    content = (
      <ChooseTopic
        onStart={(part, topic) => setStage({ name: 'session', part, topic, index: 0, answers: [], key: crypto.randomUUID() })}
        onCard={card => setStage({ name: 'cue', card, step: 'prep', key: crypto.randomUUID() })}
      />
    );

  return <div className="container-page py-12 sm:py-16">{content}</div>;
}

const PARTS: { part: Part; name: string; time: string; blurb: string }[] = [
  { part: 1, name: 'Interview', time: '~3 min', blurb: 'Four short questions on a familiar topic.' },
  { part: 2, name: 'Long turn', time: '~3 min', blurb: 'One minute to prepare a cue card, then talk for up to two.' },
  { part: 3, name: 'Discussion', time: '~5 min', blurb: 'Abstract questions where you develop and justify opinions.' },
];

function ChooseTopic({ onStart, onCard }: { onStart: (part: 1 | 3, topic: Topic) => void; onCard: (card: CueCard) => void }) {
  const { data: user } = useMe();
  const { data: topics, isLoading, error } = useTopics();
  const { data: config } = useConfig();
  const { data: usage } = useUsage(Boolean(user));
  const free = user?.plan === 'free';
  const [part, setPart] = usePersistentState<Part>('practice-part', 1);
  const [custom, setCustom] = useState(false);
  const locked = free && part !== 1;

  function startCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const questions = String(new FormData(event.currentTarget).get('questions') ?? '')
      .split('\n').map(q => q.trim()).filter(Boolean).slice(0, 8);
    if (questions.length >= 2 && part !== 2) onStart(part, { title: 'Your questions', questions });
  }

  const list = part === 1 ? topics?.part1 : part === 3 ? topics?.part3 : undefined;

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow>Practice</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold sm:text-5xl">How do you want to practise today?</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {free && usage?.left !== null && usage?.left !== undefined && (
            <span className="rounded-full border border-line bg-card px-3.5 py-1.5">
              <span className="font-semibold tabular-nums text-ink">{usage.left}</span> <span className="text-muted">of {usage.limit} free assessments left</span>
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

      <Link
        to="/mock-test"
        className="group mt-10 flex flex-col gap-4 rounded-3xl border border-signal/40 bg-signal-soft p-5 transition hover:border-signal sm:flex-row sm:items-center sm:justify-between sm:p-7"
      >
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-signal-strong">Full mock test · 11–14 min</span>
          <h2 className="mt-2 text-2xl font-semibold">Sit the whole Speaking test</h2>
          <p className="mt-1 text-muted">Parts 1, 2 and 3 in exam order and timings, marked together at the end.</p>
        </div>
        <span className="inline-flex h-11 w-fit shrink-0 items-center gap-2 rounded-full bg-signal px-5 font-medium text-white transition group-hover:bg-signal-strong">
          {free ? '🔒 See mock tests' : 'Start a mock test'} <span aria-hidden="true">→</span>
        </span>
      </Link>

      <section id="topics" className="mt-14 scroll-mt-24 grid gap-10 lg:grid-cols-[1fr_300px]">
        <div>
          <h2 className="text-2xl font-semibold">Quick practice</h2>
          <div className="mt-5 grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Speaking part">
            {PARTS.map(p => (
              <button
                key={p.part}
                role="tab"
                aria-selected={part === p.part}
                onClick={() => { setPart(p.part); setCustom(false); }}
                className="rounded-2xl border border-line bg-card p-4 text-left transition hover:border-ink aria-selected:border-signal aria-selected:ring-2 aria-selected:ring-signal/25"
              >
                <span className="flex items-center justify-between text-xs">
                  <span className="font-semibold uppercase tracking-[0.14em] text-signal-strong">Part {p.part}</span>
                  <span className="text-muted">{free && p.part !== 1 ? '🔒 Paid' : p.time}</span>
                </span>
                <span className="mt-1 block font-display text-lg font-semibold">{p.name}</span>
                <span className="mt-1 block text-sm text-muted">{p.blurb}</span>
              </button>
            ))}
          </div>

          <div role="tabpanel" className="mt-8">
            {locked ? (
              <div className="flex flex-col gap-4 rounded-3xl border border-line bg-sunken p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xl font-semibold">Part {part} practice is in Standard and Premium</h3>
                  <p className="mt-1 text-muted">Your free plan covers Part 1. Upgrade to practise cue cards and discussion questions.</p>
                </div>
                <ButtonLink to="/#pricing" className="shrink-0">See plans</ButtonLink>
              </div>
            ) : (
              <>
                {part !== 2 && (
                  <div className="flex justify-end">
                    {!custom && <button onClick={() => setCustom(true)} className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline">Use my own questions</button>}
                  </div>
                )}
                {isLoading && <Spinner label="Loading topics" />}
                {error && <p className="text-danger">{error.message}</p>}

                {part === 2 && topics && (
                  <div className="mt-2 grid gap-4 sm:grid-cols-2">
                    {topics.part2.map(card => (
                      <button key={card.id} onClick={() => onCard(card)} className={TILE}>
                        <span className="font-display text-lg font-semibold leading-snug">{card.prompt}</span>
                        <span className="mt-3 text-sm text-muted">You should say: {card.points.join('; ')}</span>
                        <span className="mt-4 text-sm font-medium text-signal-strong">Prepare →</span>
                      </button>
                    ))}
                  </div>
                )}

                {list && !custom && (
                  <div className="mt-2 grid gap-4 sm:grid-cols-2">
                    {Object.entries(list).map(([id, topic]) => (
                      <button key={id} onClick={() => onStart(part as 1 | 3, topic)} className={TILE}>
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

                {custom && part !== 2 && (
                  <form onSubmit={startCustom} className="mt-2 space-y-4 rounded-2xl border border-line bg-card p-5">
                    <label htmlFor="questions" className="block font-medium">Paste 2–8 Part {part} questions, one per line</label>
                    <textarea id="questions" name="questions" required rows={6} maxLength={6000}
                      className="block w-full rounded-xl border border-line bg-paper p-4 leading-relaxed focus:border-ink focus:outline-none"
                      placeholder={part === 1 ? 'Do you like reading?\nWhat kind of books do you enjoy?' : 'Why do people read less than in the past?\nShould schools teach media literacy?'} />
                    <div className="flex gap-3">
                      <Button type="submit">Begin session</Button>
                      <Button variant="ghost" onClick={() => setCustom(false)}>Back to topics</Button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>

        <aside className="h-fit rounded-2xl border border-line bg-card p-6 lg:sticky lg:top-24">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-[0.14em] text-muted">Before you start</h2>
          <ul className="mt-4 space-y-4 text-[15px]">
            {TIPS[part].map(([title, body]) => (
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

const TILE = 'group flex flex-col rounded-2xl border border-line bg-card p-5 text-left transition hover:-translate-y-0.5 hover:border-ink hover:shadow-[0_12px_30px_-18px_rgb(0_0_0/0.4)]';

const TOPIC_ICONS: Record<string, string> = {
  hometown: '🏡', work: '💼', technology: '💻', travel: '✈️', food: '🍜', 'free-time': '🎨', sport: '⚽', friends: '🤝',
};

const QUIET = ['Find a quiet room', 'Background noise lowers transcription accuracy.'];
const TIPS: Record<Part, string[][]> = {
  1: [QUIET, ['Answer, then extend', 'Give a direct answer, a reason, and an example — two to four sentences.'],
    ['Don’t memorise', 'Examiners notice rehearsed answers. Speak naturally.'], ['Keep going', 'If you lose a word, paraphrase rather than stopping.']],
  2: [QUIET, ['Plan with key words', 'Note a word or two per bullet point, not full sentences.'],
    ['Tell a story', 'A specific memory with details is easier to sustain than general statements.'], ['Use the full two minutes', 'If you finish early, add how you felt or what you learned.']],
  3: [QUIET, ['Give an opinion, then justify it', 'State your view, explain why, and give an example or a contrast.'],
    ['Think beyond yourself', 'Talk about people and society in general, not only your own experience.'], ['It’s fine to pause', '“That’s an interesting question…” buys thinking time naturally.']],
};

function Session({ stage, onAnswer, onExit }: { stage: Extract<Stage, { name: 'session' }>; onAnswer: (a: Answer) => void; onExit: () => void }) {
  const question = stage.topic.questions[stage.index];
  const total = stage.topic.questions.length;
  useEffect(() => speak(question), [question]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted">Part {stage.part} · {stage.topic.title}</span>
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
          draftKey={`${stage.key}:${stage.index}`}
          pace={PACE[stage.part]}
          submitLabel={stage.index + 1 < total ? 'Next question →' : 'Finish and get feedback'}
          onSubmit={answer => onAnswer({ question, answer })}
        />
      </div>
    </div>
  );
}

function CueSession({ stage, onSpeak, onAnswer, onExit }: { stage: Extract<Stage, { name: 'cue' }>; onSpeak: () => void; onAnswer: (text: string) => void; onExit: () => void }) {
  useEffect(() => {
    // Read the card aloud while preparing; never while recording, or the transcript would pick up the examiner.
    if (stage.step === 'prep') speak(stage.card.prompt);
    else stopSpeaking();
  }, [stage.step, stage.card.prompt]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted">Part 2 · Long turn</span>
        <Button variant="ghost" className="h-auto! px-0!" onClick={() => { stopSpeaking(); onExit(); }}>Exit</Button>
      </div>
      <div className="mt-8" key={stage.step}>
        {stage.step === 'prep'
          ? <Preparation card={stage.card} onDone={onSpeak} />
          : <LongTurn card={stage.card} draftKey={stage.key} submitLabel="Finish and get feedback" onSubmit={onAnswer} />}
      </div>
    </div>
  );
}
