import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../App';
import { ToastProvider } from '../components/Toast';
import { safeNext } from '../pages/Auth';
import { averageScore } from '../lib/score';

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

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('score', () => {
  it('averages scored criteria to the nearest half band and ignores unscored ones', () => {
    expect(averageScore({ criteria: { a: 6.5, b: 7, c: 6, Pronunciation: null }, strengths: [], improvements: [], summary: '' })).toBe(6.5);
    expect(averageScore({ criteria: { Pronunciation: null }, strengths: [], improvements: [], summary: '' })).toBeNull();
  });
});

describe('safeNext', () => {
  it('only allows same-site paths', () => {
    expect(safeNext('/dashboard')).toBe('/dashboard');
    expect(safeNext('//evil.example')).toBe('/practice');
    expect(safeNext('https://evil.example')).toBe('/practice');
    expect(safeNext(null)).toBe('/practice');
  });
});

describe('routing and auth', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('sends signed-out visitors from /practice to signup', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => json({ user: null }));
    renderAt('/practice');
    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
  });

  it('shows server field errors next to the field and sends the CSRF header', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) =>
      String(input).endsWith('/signup')
        ? json({ error: 'Please check the submitted fields.', fields: [{ field: 'password', message: 'Too short' }] }, 400)
        : json({ user: null }),
    );
    renderAt('/signup');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Asha');
    await user.type(screen.getByLabelText('Email'), 'asha@example.com');
    await user.type(screen.getByLabelText('Password'), 'long enough password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Too short')).toBeInTheDocument();
    await waitFor(() => {
      const call = fetch.mock.calls.find(([url]) => String(url).endsWith('/signup'));
      expect((call?.[1]?.headers as Record<string, string>)['X-App-Request']).toBe('1');
    });
  });
});

describe('mock test', () => {
  const test = {
    id: 't', title: 'Test 1', part1: { topic: 'Music', questions: ['a', 'b'] },
    part2: { prompt: 'Describe a place you like.', points: ['where'], closing: 'and why.', question: 'full' },
    part3: { topic: 'Tourism', questions: ['c'] },
  };

  it('follows exam order: Part 1, cue-card preparation, long turn, then Part 3', async () => {
    const { buildSteps } = await import('../pages/MockTest');
    expect(buildSteps(test).map(s => s.type + ('part' in s ? s.part : ''))).toEqual(
      ['intro1', 'question1', 'question1', 'intro2', 'prep', 'longTurn', 'intro3', 'question3'],
    );
  });

  it('is locked for free users', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) =>
      String(input).endsWith('/mock-tests') ? json([test]) : json({ user: { id: '1', name: 'A', email: 'a@x.dev', plan: 'free', createdAt: '' } }),
    );
    renderAt('/mock-test');
    expect(await screen.findByText('Mock tests are part of Standard and Premium')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start the test' })).toBeDisabled();
  });
});
