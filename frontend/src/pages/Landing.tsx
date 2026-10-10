import { useConfig, useMe, useBillingRedirect } from '../lib/queries';
import { useNavigate } from 'react-router';
import { Bars, Button, ButtonLink, Eyebrow } from '../components/ui';
import { useToast } from '../components/Toast';
import type { Plan } from '../lib/types';

export function Landing() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Scoring />
      <Pricing />
      <Faq />
      <ClosingCta />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="container-page grid items-center gap-14 pb-20 pt-14 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:pb-28">
        <div>
          <Eyebrow>IELTS Speaking · Parts 1–3</Eyebrow>
          <h1 className="mt-5 text-[clamp(2.4rem,5.2vw,4rem)] font-semibold leading-[1.08]">
            Rehearse out loud.
            <br />
            <span className="text-signal-strong">Know what to fix.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            An examiner asks the questions aloud, you answer by voice, and you get criterion-by-criterion feedback quoting your own words — in minutes, any time of day.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink to="/practice" size="lg">
              <Bars className="h-4" /> Start a free session
            </ButtonLink>
            <a href="#how" className="inline-flex h-13 items-center px-3 text-base text-muted underline-offset-4 hover:text-ink hover:underline">
              How it works
            </a>
          </div>
          <p className="mt-5 text-sm text-muted">3 free assessments · No card required</p>
        </div>
        <ExaminerPreview />
      </div>
    </section>
  );
}

function ExaminerPreview() {
  return (
    <div className="relative" aria-label="Example practice session" role="img">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-signal-soft/70 blur-2xl" aria-hidden="true" />
      <div className="rounded-3xl border border-line bg-card p-6 shadow-[0_30px_60px_-30px_rgb(28_25_23/0.35)] sm:p-7">
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="font-medium uppercase tracking-[0.16em]">Part 1 · Hometown</span>
          <span>Question 2 of 4</span>
        </div>
        <p className="mt-5 font-display text-2xl font-medium leading-snug">“What do you like most about your hometown?”</p>
        <div className="mt-6 rounded-2xl bg-sunken p-4">
          <div className="flex items-center gap-3 text-signal">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-signal" />
            </span>
            <Bars animated className="h-6" />
            <span className="text-xs font-medium text-muted">Listening</span>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed">
            Honestly, it’s the food. There’s a night market by the river where every stall has been run by the same family for decades, so…
          </p>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          {[['Coherence', '6.5'], ['Lexical', '7.0'], ['Grammar', '6.0']].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line px-2 py-3">
              <div className="font-display text-2xl tabular-nums">{v}</div>
              <div className="text-xs text-muted">{k}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-muted">Sample output</p>
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    ['Pick a topic', 'Choose a common Part 1 topic, or paste the questions your teacher gave you.'],
    ['Answer aloud', 'The examiner reads each question in a British voice. Speak — or type if your browser can’t transcribe.'],
    ['Review and repeat', 'See scores per criterion, what worked, and two or three precise things to change next time.'],
  ];
  return (
    <section id="how" className="scroll-mt-20 border-y border-line bg-card/50">
      <div className="container-page py-20">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-3 max-w-xl text-3xl font-medium sm:text-4xl">A full speaking round in about five minutes.</h2>
        <ol className="mt-12 grid gap-10 md:grid-cols-3">
          {steps.map(([title, body], i) => (
            <li key={title} className="border-t border-ink pt-5">
              <span className="font-display text-sm text-signal-strong">0{i + 1}</span>
              <h3 className="mt-2 text-xl font-medium">{title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Scoring() {
  const scored = [
    ['Coherence', 'How well your answers are organised, linked and developed.'],
    ['Lexical Resource', 'Range and precision of vocabulary, including collocation and paraphrase.'],
    ['Grammatical Range', 'Variety and accuracy of sentence structures.'],
  ];
  return (
    <section className="container-page grid gap-12 py-16 sm:py-24 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <Eyebrow>What we score</Eyebrow>
        <h2 className="mt-3 text-3xl font-medium sm:text-4xl">Honest feedback, including about its limits.</h2>
        <p className="mt-5 leading-relaxed text-muted">
          Feedback is generated from the transcript of what you said. That makes it strong on structure, vocabulary and grammar — and unable to judge pronunciation. So we don’t pretend to.
        </p>
      </div>
      <ul className="divide-y divide-line rounded-3xl border border-line bg-card">
        {scored.map(([title, body]) => (
          <li key={title} className="flex gap-4 p-6">
            <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-good-soft text-good" aria-hidden="true">✓</span>
            <div>
              <h3 className="font-sans text-base font-semibold tracking-normal">{title}</h3>
              <p className="mt-1 text-[15px] text-muted">{body}</p>
            </div>
          </li>
        ))}
        <li className="flex gap-4 p-6">
          <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-sunken text-muted" aria-hidden="true">–</span>
          <div>
            <h3 className="font-sans text-base font-semibold tracking-normal">Pronunciation</h3>
            <p className="mt-1 text-[15px] text-muted">Not scored. Practise it with a teacher or by recording and listening back.</p>
          </div>
        </li>
      </ul>
    </section>
  );
}

const PLANS: { id: Plan; name: string; price: string; period: string; blurb: string; features: string[] }[] = [
  { id: 'free', name: 'Free', price: '$0', period: '', blurb: 'Try the format.', features: ['3 assessed sessions', 'Part 1 topics', 'Voice or typed answers'] },
  { id: 'standard', name: 'Standard', price: '$15', period: '/ month', blurb: 'For steady weekly practice.', features: ['Unlimited sessions', 'Parts 1, 2 and 3', 'Full timed mock tests', 'Progress history', 'Custom question sets'] },
  { id: 'premium', name: 'Premium', price: '$35', period: '/ 3 months', blurb: 'For the final stretch before test day.', features: ['Everything in Standard', 'Best value for 12 weeks', 'Priority email support'] },
];

function Pricing() {
  const { data: user } = useMe();
  const { data: config } = useConfig();
  const navigate = useNavigate();
  const toast = useToast();
  const billing = useBillingRedirect();

  function choose(plan: Plan) {
    if (plan === 'free') return navigate(user ? '/practice' : '/signup');
    if (!user) return navigate(`/signup?next=${encodeURIComponent('/#pricing')}`);
    if (!config?.billingAvailable) return toast('Paid plans are not available yet.');
    billing.mutate(user.plan === 'free' ? plan : undefined, { onError: e => toast(e.message) });
  }

  return (
    <section id="pricing" className="scroll-mt-20 border-t border-line bg-card/50">
      <div className="container-page py-16 sm:py-24">
        <div className="max-w-xl">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="mt-3 text-3xl font-medium sm:text-4xl">Start free. Upgrade when it’s working for you.</h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PLANS.map(plan => {
            const featured = plan.id === 'standard';
            const current = user?.plan === plan.id;
            return (
              <article key={plan.id} className={`flex flex-col rounded-3xl border p-6 sm:p-7 ${featured ? 'border-ink bg-ink text-paper' : 'border-line bg-card'}`}>
                <h3 className="font-sans text-sm font-semibold uppercase tracking-[0.14em]">{plan.name}</h3>
                <p className={`mt-1 text-sm ${featured ? 'text-paper/70' : 'text-muted'}`}>{plan.blurb}</p>
                <p className="mt-6 font-display text-5xl">
                  {plan.price}
                  <span className={`ml-1 font-sans text-base ${featured ? 'text-paper/70' : 'text-muted'}`}>{plan.period}</span>
                </p>
                <ul className="mt-6 flex-1 space-y-2.5 text-[15px]">
                  {plan.features.map(f => (
                    <li key={f} className="flex gap-2.5">
                      <span className={featured ? 'text-signal' : 'text-good'} aria-hidden="true">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className={`mt-8 w-full ${featured ? 'bg-signal! text-white! hover:bg-signal-strong!' : ''}`}
                  variant={featured ? 'primary' : 'secondary'}
                  disabled={current || billing.isPending}
                  onClick={() => choose(plan.id)}
                >
                  {current ? 'Current plan' : plan.id === 'free' ? 'Start free' : `Choose ${plan.name}`}
                </Button>
              </article>
            );
          })}
        </div>
        <p className="mt-6 text-sm text-muted">Payments are handled by Stripe. Cancel any time from your dashboard.</p>
      </div>
    </section>
  );
}

function Faq() {
  const items = [
    ['Is this an official IELTS score?', 'No. Scores are practice guidance based on the public band descriptors, generated from your transcript. Only an IELTS test gives an official band.'],
    ['Why isn’t pronunciation scored?', 'We analyse the text of your answer, not the audio. Rather than guess at pronunciation, we leave it unscored.'],
    ['Which browsers support voice answers?', 'Chrome, Edge and Safari support speech transcription. In other browsers you can type your answers.'],
    ['What happens to my voice?', 'Your browser’s built-in speech service turns your voice into text (in Chrome, Google processes the audio). We never receive audio — only the text of your answers, stored with your feedback.'],
    ['Can I cancel?', 'Yes. Manage or cancel your subscription from your dashboard at any time; you keep access until the end of the period.'],
  ];
  return (
    <section id="faq" className="container-page scroll-mt-20 py-16 sm:py-24">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="mt-3 text-3xl font-medium sm:text-4xl">Questions, answered.</h2>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {items.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium [&::-webkit-details-marker]:hidden">
                {q}
                <span className="text-2xl text-muted transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="mt-3 max-w-2xl leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="container-page">
      <div className="rounded-[2rem] bg-signal px-6 py-16 text-center text-white sm:px-12">
        <h2 className="mx-auto max-w-2xl text-3xl font-medium sm:text-5xl">Your next answer could be your best one.</h2>
        <ButtonLink to="/practice" size="lg" className="mt-8 bg-white! text-stone-900! hover:bg-stone-100!">
          Start a free session
        </ButtonLink>
      </div>
    </section>
  );
}
