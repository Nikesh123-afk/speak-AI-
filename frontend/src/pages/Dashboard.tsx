import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { keys, useBillingRedirect, useConfig, useLogout, usePractices } from '../lib/queries';
import { averageScore, formatScore } from '../lib/score';
import type { User } from '../lib/types';
import { Button, ButtonLink, Eyebrow, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';

const PLAN_LABEL = { free: 'Free', standard: 'Standard', premium: 'Premium' } as const;

export function Dashboard({ user }: { user: User }) {
  const { data, isLoading } = usePractices();
  const { data: config } = useConfig();
  const billing = useBillingRedirect();
  const logout = useLogout();
  const navigate = useNavigate();
  const toast = useToast();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    if (params.get('checkout') !== 'success') return;
    // Stripe's webhook grants the plan, and can land a few seconds after this redirect.
    toast('Payment received — your plan will update in a moment.');
    setParams({}, { replace: true });
    const timer = window.setTimeout(() => client.invalidateQueries({ queryKey: keys.me }), 4000);
    return () => window.clearTimeout(timer);
  }, [params, setParams, toast, client]);

  const practices = data?.practices ?? [];
  const scores = practices.map(p => averageScore(p.feedback)).filter((v): v is number => v !== null);
  const stats = [
    ['Sessions', String(data?.total ?? 0)],
    ['Latest score', formatScore(scores[0])],
    ['Best score', formatScore(scores.length ? Math.max(...scores) : null)],
  ];

  return (
    <div className="container-page py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow>Dashboard</Eyebrow>
          <h1 className="mt-3 text-3xl font-medium sm:text-5xl">Hello, {user.name.split(' ')[0]}.</h1>
          <p className="mt-2 break-all text-muted">
            {user.email} · <span className="font-medium text-ink">{PLAN_LABEL[user.plan]} plan</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink to="/practice">New session</ButtonLink>
          {config?.billingAvailable &&
            (user.plan === 'free' ? (
              <ButtonLink to="/#pricing" variant="secondary">Upgrade</ButtonLink>
            ) : (
              <Button variant="secondary" disabled={billing.isPending} onClick={() => billing.mutate(undefined, { onError: e => toast(e.message) })}>
                Manage billing
              </Button>
            ))}
          <Button variant="ghost" onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}>Log out</Button>
        </div>
      </div>

      <dl className="mt-10 grid grid-cols-3 divide-x divide-line rounded-3xl border border-line bg-card">
        {stats.map(([label, value]) => (
          <div key={label} className="min-w-0 p-3.5 sm:p-7">
            <dt className="truncate text-xs text-muted sm:text-sm">{label}</dt>
            <dd className="mt-1 font-display text-2xl tabular-nums sm:text-4xl">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-12">
        <h2 className="text-2xl font-medium">History</h2>
        {isLoading ? (
          <div className="mt-6"><Spinner label="Loading history" /></div>
        ) : practices.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-line p-10 text-center">
            <p className="text-muted">No sessions yet. Your first one takes about five minutes.</p>
            <ButtonLink to="/practice" className="mt-5">Start practising</ButtonLink>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-line rounded-3xl border border-line bg-card">
            {practices.map(p => (
              <li key={p.id} className="flex items-center justify-between gap-4 p-4 sm:p-5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.topic}</p>
                  <p className="text-sm text-muted">
                    {new Date(p.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · {p.kind === 'mock' ? 'Full mock test' : `Part ${p.part}`} · {p.answers.length} {p.answers.length === 1 ? 'answer' : 'answers'}
                  </p>
                </div>
                <div className="flex items-center gap-5">
                  <div className="hidden gap-4 text-xs text-muted md:flex">
                    {Object.entries(p.feedback?.criteria ?? {}).filter(([, v]) => v !== null).map(([k, v]) => (
                      <span key={k}>{k.split(' ')[0]} <span className="tabular-nums text-ink">{formatScore(v)}</span></span>
                    ))}
                  </div>
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-signal-soft font-display text-lg tabular-nums text-signal-strong">
                    {formatScore(averageScore(p.feedback))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
