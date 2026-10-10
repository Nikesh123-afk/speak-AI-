import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { keys, useForgetUser } from '../lib/queries';
import type { User } from '../lib/types';
import { Button, ButtonLink, Field, Spinner } from '../components/ui';

function Panel({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="container-page grid min-h-[calc(100dvh-4rem)] place-items-center py-10 sm:py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-medium sm:text-4xl">{title}</h1>
        {intro && <p className="mt-2 text-muted">{intro}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

const fieldErrors = (error: unknown) =>
  error instanceof ApiError ? Object.fromEntries(error.fields.map(f => [f.field, f.message])) : {};
const formError = (error: unknown) =>
  error && !(error instanceof ApiError && error.fields.length) ? (error as Error).message : null;

function Alert({ children }: { children: ReactNode }) {
  return <p role="alert" className="mb-5 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">{children}</p>;
}

export function ForgotPassword() {
  const send = useMutation({
    mutationFn: (email: string) => api<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: { email } }),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send.mutate(String(new FormData(event.currentTarget).get('email') ?? ''));
  }
  if (send.isSuccess) {
    return (
      <Panel title="Check your inbox" intro={send.data.message}>
        <p className="text-sm text-muted">The link works for one hour. Nothing arrived? Check spam, or <button className="font-medium text-ink underline underline-offset-4" onClick={() => send.reset()}>try again</button>.</p>
      </Panel>
    );
  }
  return (
    <Panel title="Reset your password" intro="Enter your account email and we’ll send you a link to choose a new password.">
      <form onSubmit={submit} className="space-y-5">
        {formError(send.error) && <Alert>{formError(send.error)}</Alert>}
        <Field id="email" name="email" type="email" label="Email" autoComplete="email" required error={fieldErrors(send.error).email} />
        <Button type="submit" className="w-full" disabled={send.isPending}>{send.isPending ? 'Sending…' : 'Send reset link'}</Button>
      </form>
      <p className="mt-6 text-sm text-muted"><Link to="/login" className="font-medium text-ink underline underline-offset-4">Back to log in</Link></p>
    </Panel>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const forget = useForgetUser();
  const reset = useMutation({
    mutationFn: (password: string) => api<{ user: User }>('/api/auth/reset-password', { method: 'POST', body: { token, password } }),
    onSuccess: ({ user }) => {
      forget(user);
      navigate('/dashboard', { replace: true });
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset.mutate(String(new FormData(event.currentTarget).get('password') ?? ''));
  }
  if (!token) {
    return (
      <Panel title="Link incomplete" intro="This reset link is missing its code. Open the link from the email again, or request a new one.">
        <ButtonLink to="/forgot-password">Request a new link</ButtonLink>
      </Panel>
    );
  }
  return (
    <Panel title="Choose a new password" intro="You’ll be signed out on every other device.">
      <form onSubmit={submit} className="space-y-5">
        {formError(reset.error) && (
          <Alert>{formError(reset.error)} <Link to="/forgot-password" className="font-medium underline">Request a new link</Link></Alert>
        )}
        <Field id="password" name="password" type="password" label="New password" autoComplete="new-password" required minLength={12} maxLength={128}
          hint="At least 12 characters. A short phrase works well." error={fieldErrors(reset.error).password} />
        <Button type="submit" className="w-full" disabled={reset.isPending}>{reset.isPending ? 'Saving…' : 'Save password and log in'}</Button>
      </form>
    </Panel>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const client = useQueryClient();
  const [state, setState] = useState<{ status: 'pending' | 'done' | 'failed'; message?: string }>({ status: 'pending' });
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single use, so StrictMode's double effect must not send it twice.
    if (started.current) return;
    started.current = true;
    api<{ user: User }>('/api/auth/verify-email', { method: 'POST', body: { token } })
      .then(({ user }) => {
        // Only update the cached user if this browser is signed in as them.
        const current = client.getQueryData<User | null>(keys.me);
        if (current?.id === user.id) client.setQueryData(keys.me, user);
        setState({ status: 'done' });
      })
      .catch((error: Error) => setState({ status: 'failed', message: error.message }));
  }, [token, client]);

  if (state.status === 'pending') return <Panel title="Confirming your email…"><Spinner label="Checking the link" /></Panel>;
  if (state.status === 'failed') {
    return (
      <Panel title="We couldn’t confirm your email" intro={state.message}>
        <p className="text-sm text-muted">Log in and use “Resend link” on the banner at the top of the page to get a fresh one.</p>
        <ButtonLink to="/dashboard" className="mt-6">Go to dashboard</ButtonLink>
      </Panel>
    );
  }
  return (
    <Panel title="Email confirmed" intro="Thanks — your address is verified.">
      <ButtonLink to="/practice">Start practising</ButtonLink>
    </Panel>
  );
}
