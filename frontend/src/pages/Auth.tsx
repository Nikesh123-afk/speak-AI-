import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '../lib/api';
import { useAuthMutation, useMe } from '../lib/queries';
import { Button, Field } from '../components/ui';

/** Only allow same-site relative redirects so `?next=` cannot send users elsewhere. */
export function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/practice';
}

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup';
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const { data: user } = useMe();
  const auth = useAuthMutation(mode);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (user) return <Navigate to={next} replace />;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    const body = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    auth.mutate(body, {
      onSuccess: () => navigate(next, { replace: true }),
      onError: error => {
        if (error instanceof ApiError) setFieldErrors(Object.fromEntries(error.fields.map(f => [f.field, f.message])));
      },
    });
  }

  const formError = auth.error && !(auth.error instanceof ApiError && auth.error.fields.length) ? auth.error.message : null;
  const switchTo = `${signup ? '/login' : '/signup'}${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <div className="container-page grid min-h-[calc(100dvh-4rem)] place-items-center py-10 sm:py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-medium sm:text-4xl">{signup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-2 text-muted">{signup ? 'Three free assessed sessions. No card needed.' : 'Log in to continue practising.'}</p>
        <form onSubmit={submit} className="mt-8 space-y-5" noValidate={false}>
          {formError && (
            <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
              {formError}
            </p>
          )}
          {signup && <Field id="name" name="name" label="Name" autoComplete="name" required maxLength={100} error={fieldErrors.name} />}
          <Field id="email" name="email" type="email" label="Email" autoComplete="email" required error={fieldErrors.email} />
          <Field
            id="password"
            name="password"
            type="password"
            label="Password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            required
            minLength={signup ? 12 : 1}
            maxLength={128}
            hint={signup ? 'At least 12 characters. A short phrase works well.' : undefined}
            error={fieldErrors.password}
          />
          {!signup && (
            <p className="-mt-2 text-right text-sm">
              <Link to="/forgot-password" className="text-muted underline-offset-4 hover:text-ink hover:underline">Forgot password?</Link>
            </p>
          )}
          {signup && (
            <p className="text-sm text-muted">
              By creating an account you agree to the <Link to="/terms" className="underline underline-offset-4">terms</Link> and <Link to="/privacy" className="underline underline-offset-4">privacy policy</Link>.
            </p>
          )}
          <Button type="submit" className="w-full" disabled={auth.isPending}>
            {auth.isPending ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted">
          {signup ? 'Already have an account?' : 'New here?'}{' '}
          <Link to={switchTo} className="font-medium text-ink underline underline-offset-4">
            {signup ? 'Log in' : 'Create an account'}
          </Link>
        </p>
      </div>
    </div>
  );
}
