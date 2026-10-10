import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../App';
import { ToastProvider } from '../components/Toast';
import { ErrorBoundary } from '../components/ErrorBoundary';
import type { Practice, User } from '../lib/types';

const user = (overrides: Partial<User> = {}): User => ({
  id: 'u1', name: 'Asha Rao', email: 'asha@example.com', plan: 'standard', emailVerifiedAt: '2026-01-01T00:00:00Z', isAdmin: false, createdAt: '2026-01-01T00:00:00Z', ...overrides,
});

const feedback = { criteria: { Coherence: 6.5, 'Lexical Resource': 6, 'Grammatical Range': 7, Pronunciation: null }, strengths: ['Clear structure'], improvements: ['Add examples'], summary: 'Solid answer. Transcript only.' };
const practice = (id: string, overrides: Partial<Practice> = {}): Practice => ({
  id, kind: 'practice', topic: `Topic ${id}`, part: 1, answers: [{ question: 'Where are you from?', answer: 'A coastal town.' }], feedback, status: 'complete', createdAt: '2026-09-01T10:00:00Z', ...overrides,
});

const topics = {
  part1: { hometown: { title: 'Hometown & Home', questions: ['Where are you from?', 'Do you like it?'] } },
  part2: [{ id: 'skills', prompt: 'Describe a skill you learned.', points: ['what it was'], closing: 'and explain why.', question: 'Describe a skill you learned. You should say: what it was; and explain why.' }],
  part3: { skills: { title: 'Learning and skills', questions: ['Which skills matter most?'] } },
};
const config = { feedbackAvailable: true, billingAvailable: false, freeAssessments: 3, supportEmail: 'help@example.com' };

type Routes = Record<string, unknown | ((init?: RequestInit) => unknown)>;

/** Routes requests by path prefix; the longest matching prefix wins. Unmatched requests get a 404. */
function serve(routes: Routes) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const match = Object.keys(routes).filter(p => path.startsWith(p)).sort((a, b) => b.length - a.length)[0];
    const value = match === undefined ? undefined : routes[match];
    const body = typeof value === 'function' ? (value as (i?: RequestInit) => unknown)(init) : value;
    const status = match === undefined ? 404 : 200;
    return Promise.resolve(new Response(JSON.stringify(body ?? { error: 'Not found.' }), { status, headers: { 'Content-Type': 'application/json' } }));
  });
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});
afterEach(() => window.sessionStorage.clear());

describe('practice', () => {
  it('locks Parts 2 and 3 for free users and shows server-side usage', async () => {
    serve({ '/api/auth/me': { user: user({ plan: 'free' }) }, '/api/topics': topics, '/api/config': config, '/api/usage': { limit: 3, used: 1, left: 2 } });
    renderAt('/practice');
    expect(await screen.findByText('of 3 free assessments left')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Part 2/ }));
    expect(screen.getByText('Part 2 practice is in Standard and Premium')).toBeInTheDocument();
  });

  it('runs a Part 2 cue card: preparation, then a long turn, then submits with the full card', async () => {
    const feedbackCall = vi.fn(() => ({ practice: practice('p2', { part: 2, topic: topics.part2[0].prompt }) }));
    serve({ '/api/auth/me': { user: user() }, '/api/topics': topics, '/api/config': config, '/api/usage': { limit: null, used: null, left: null },
      '/api/feedback': feedbackCall });
    renderAt('/practice');
    const ui = userEvent.setup();
    await ui.click(await screen.findByRole('tab', { name: /Part 2/ }));
    await ui.click(await screen.findByRole('button', { name: /Describe a skill you learned/ }));
    expect(screen.getByText('You have one minute to prepare.')).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: /I’m ready/ }));
    await ui.type(screen.getByLabelText('Your answer'), 'I learned to swim as an adult.');
    await ui.click(screen.getByRole('button', { name: 'Finish and get feedback' }));
    expect(await screen.findByText('Solid answer. Transcript only.')).toBeInTheDocument();
    const body = JSON.parse(String((feedbackCall.mock.calls[0] as unknown as [RequestInit])[0].body));
    expect(body).toMatchObject({ kind: 'practice', part: 2, answers: [{ question: topics.part2[0].question }] });
    // Finished and marked: nothing is left in storage to resume.
    expect(JSON.parse(window.sessionStorage.getItem('practice-stage') ?? 'null')).toEqual({ name: 'choose' });
  });

  it('resumes a session after a reload, including the unfinished answer', async () => {
    window.sessionStorage.setItem('practice-stage', JSON.stringify({
      name: 'session', part: 1, topic: topics.part1.hometown, index: 1, answers: [{ question: 'Where are you from?', answer: 'Pune.' }], key: 'k1',
    }));
    window.sessionStorage.setItem('draft:k1:1', JSON.stringify('Yes, because'));
    serve({ '/api/auth/me': { user: user() }, '/api/config': config });
    renderAt('/practice');
    expect(await screen.findByRole('heading', { name: 'Do you like it?' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your answer')).toHaveValue('Yes, because');
  });
});

describe('dashboard and history', () => {
  it('links each session to its feedback and loads more on demand', async () => {
    const first = Array.from({ length: 20 }, (_, i) => practice(`p${i}`));
    serve({
      '/api/auth/me': { user: user() }, '/api/config': config,
      '/api/practices?limit=20&offset=0': { practices: first, total: 21, offset: 0 },
      '/api/practices?limit=20&offset=20': { practices: [practice('p20')], total: 21, offset: 20 },
      '/api/progress': { points: first.slice(0, 3).map(p => ({ id: p.id, createdAt: p.createdAt, kind: p.kind, part: p.part, criteria: feedback.criteria })) },
    });
    renderAt('/dashboard');
    expect(await screen.findByText('Showing 20 of 21')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Topic p0/ })).toHaveAttribute('href', '/history/p0');
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Showing 21 of 21')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    // The chart has a table view for screen readers and low-vision users.
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
  });

  it('opens a past session', async () => {
    serve({ '/api/auth/me': { user: user() }, '/api/config': config, '/api/practices/p1': { practice: practice('p1') } });
    renderAt('/history/p1');
    expect(await screen.findByText('Solid answer. Transcript only.')).toBeInTheDocument();
    expect(screen.getByText('Clear structure')).toBeInTheDocument();
  });
});

describe('accounts', () => {
  it('asks unverified users to confirm their email', async () => {
    const resend = vi.fn(() => ({ message: 'We’ve sent a new confirmation link.' }));
    serve({ '/api/auth/me': { user: user({ emailVerifiedAt: null }) }, '/api/config': config, '/api/auth/resend-verification': resend });
    renderAt('/');
    expect(await screen.findByText(/Please confirm your email/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resend link' }));
    expect(await screen.findByText('We’ve sent a new confirmation link.')).toBeInTheDocument();
  });

  it('requests a password reset from the login page', async () => {
    serve({ '/api/auth/me': { user: null }, '/api/config': config, '/api/auth/forgot-password': { message: 'If an account exists, we sent a link.' } });
    renderAt('/login');
    const ui = userEvent.setup();
    await ui.click(await screen.findByRole('link', { name: 'Forgot password?' }));
    await ui.type(screen.getByLabelText('Email'), 'asha@example.com');
    await ui.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('If an account exists, we sent a link.')).toBeInTheDocument();
  });

  it('confirms before deleting an account', async () => {
    const remove = vi.fn(() => ({ ok: true }));
    serve({ '/api/auth/me': { user: user() }, '/api/config': config, '/api/account/sessions': { active: 1 }, '/api/account/delete': remove });
    renderAt('/account');
    const ui = userEvent.setup();
    await ui.click(await screen.findByRole('button', { name: 'Delete my account…' }));
    await ui.type(screen.getByLabelText('Enter your password to confirm'), 'correct horse battery');
    await ui.click(screen.getByRole('button', { name: 'Delete everything' }));
    await waitFor(() => expect(remove).toHaveBeenCalledOnce());
    expect(await screen.findByText('Your account and data have been deleted.')).toBeInTheDocument();
  });

  it('hides the admin page from non-admins', async () => {
    serve({ '/api/auth/me': { user: user() }, '/api/config': config });
    renderAt('/admin');
    expect(await screen.findByText('This page doesn’t exist.')).toBeInTheDocument();
  });
});

describe('legal and support', () => {
  it('shows the support address and links the policies from the footer', async () => {
    serve({ '/api/auth/me': { user: null }, '/api/config': config });
    renderAt('/contact');
    expect(await screen.findByRole('link', { name: 'help@example.com' })).toHaveAttribute('href', 'mailto:help@example.com');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  });
});

describe('error boundary', () => {
  it('replaces a crashed page with a way out', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Broken(): never {
      throw new Error('boom');
    }
    render(<ErrorBoundary><Broken /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on this page.');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});
