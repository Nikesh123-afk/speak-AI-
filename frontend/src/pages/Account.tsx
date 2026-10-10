import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { keys, useForgetUser } from '../lib/queries';
import type { User } from '../lib/types';
import { Button, Eyebrow, Field } from '../components/ui';
import { useToast } from '../components/Toast';
import { PLAN_LABEL } from './Dashboard';

type Values = Record<string, string>;
const values = (event: FormEvent<HTMLFormElement>) => Object.fromEntries(new FormData(event.currentTarget)) as Values;
const errorsOf = (error: unknown) => (error instanceof ApiError ? Object.fromEntries(error.fields.map(f => [f.field, f.message])) : {});
const generalError = (error: unknown) => (error && !(error instanceof ApiError && error.fields.length) ? (error as Error).message : null);

function Section({ title, description, children, tone }: { title: string; description: ReactNode; children: ReactNode; tone?: 'danger' }) {
  return (
    <section className={`grid gap-6 border-t py-10 md:grid-cols-[1fr_1.4fr] ${tone === 'danger' ? 'border-danger/40' : 'border-line'}`}>
      <div>
        <h2 className={`text-xl font-medium ${tone === 'danger' ? 'text-danger' : ''}`}>{title}</h2>
        <div className="mt-1 text-sm text-muted">{description}</div>
      </div>
      <div className="max-w-md">{children}</div>
    </section>
  );
}

function FormError({ error }: { error: unknown }) {
  const message = generalError(error);
  return message ? <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">{message}</p> : null;
}

export function AccountPage({ user }: { user: User }) {
  const client = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const forget = useForgetUser();
  const setUser = (next: User) => client.setQueryData(keys.me, next);
  const sessions = useQuery({ queryKey: ['account-sessions'], queryFn: () => api<{ active: number }>('/api/account/sessions') });

  const profile = useMutation({
    mutationFn: (body: Values) => api<{ user: User }>('/api/account', { method: 'PATCH', body }),
    onSuccess: ({ user }) => { setUser(user); toast('Name updated.'); },
  });
  const email = useMutation({
    mutationFn: (body: Values) => api<{ user: User }>('/api/account/email', { method: 'POST', body }),
    onSuccess: ({ user }) => { setUser(user); toast(`Check ${user.email} for a confirmation link.`); },
  });
  const password = useMutation({
    mutationFn: (body: Values) => api('/api/account/password', { method: 'POST', body }),
    onSuccess: () => { toast('Password changed. Other devices were signed out.'); sessions.refetch(); },
  });
  const others = useMutation({
    mutationFn: () => api('/api/account/logout-others', { method: 'POST', body: {} }),
    onSuccess: () => { toast('Signed out on other devices.'); sessions.refetch(); },
  });
  const remove = useMutation({
    mutationFn: (body: Values) => api('/api/account/delete', { method: 'POST', body }),
    onSuccess: () => { forget(null); navigate('/', { replace: true }); toast('Your account and data have been deleted.'); },
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="container-page py-12 sm:py-16">
      <Eyebrow>Account</Eyebrow>
      <h1 className="mt-3 text-3xl font-medium sm:text-5xl">Account settings</h1>
      <p className="mt-2 text-muted">{PLAN_LABEL[user.plan]} plan · member since {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>

      <div className="mt-10">
        <Section title="Profile" description="The name the dashboard greets you with.">
          <form key={user.name} onSubmit={e => { e.preventDefault(); profile.mutate(values(e)); }} className="space-y-4">
            <FormError error={profile.error} />
            <Field id="name" name="name" label="Name" defaultValue={user.name} required maxLength={100} autoComplete="name" error={errorsOf(profile.error).name} />
            <Button type="submit" disabled={profile.isPending}>Save name</Button>
          </form>
        </Section>

        <Section
          title="Email"
          description={user.emailVerifiedAt ? 'Confirmed.' : <span className="text-warn">Not confirmed yet — check your inbox for the link.</span>}
        >
          <form key={user.email} onSubmit={e => { e.preventDefault(); email.mutate(values(e)); }} className="space-y-4">
            <FormError error={email.error} />
            <Field id="new-email" name="email" type="email" label="Email" defaultValue={user.email} required autoComplete="email" error={errorsOf(email.error).email} />
            <Field id="email-password" name="password" type="password" label="Current password" required autoComplete="current-password" error={errorsOf(email.error).password} />
            <Button type="submit" disabled={email.isPending}>Change email</Button>
          </form>
        </Section>

        <Section title="Password" description="Changing it signs you out everywhere except this device.">
          <form onSubmit={e => { e.preventDefault(); password.mutate(values(e), { onSuccess: () => (e.target as HTMLFormElement).reset() }); }} className="space-y-4">
            <FormError error={password.error} />
            <Field id="current_password" name="current_password" type="password" label="Current password" required autoComplete="current-password" error={errorsOf(password.error).current_password} />
            <Field id="new_password" name="new_password" type="password" label="New password" required minLength={12} maxLength={128} autoComplete="new-password"
              hint="At least 12 characters." error={errorsOf(password.error).new_password} />
            <Button type="submit" disabled={password.isPending}>Change password</Button>
          </form>
        </Section>

        <Section title="Devices" description={sessions.data ? `Signed in on ${sessions.data.active} ${sessions.data.active === 1 ? 'device' : 'devices'}, including this one.` : 'Where you’re signed in.'}>
          <Button variant="secondary" disabled={others.isPending || sessions.data?.active === 1} onClick={() => others.mutate()}>Sign out other devices</Button>
        </Section>

        <Section title="Your data" description="Download your profile, every session, your answers and feedback as a JSON file.">
          {/* A plain link: the browser downloads it with the session cookie, no script needed. */}
          <a href="/api/account/export" download className="inline-flex h-11 items-center rounded-full border border-line bg-card px-5 text-[15px] font-medium hover:border-ink">
            Download my data
          </a>
        </Section>

        <Section tone="danger" title="Delete account" description="Permanently deletes your account, sessions, answers and feedback. Any subscription is cancelled first. This can’t be undone.">
          {!confirmDelete ? (
            <Button variant="secondary" className="border-danger/50! text-danger!" onClick={() => setConfirmDelete(true)}>Delete my account…</Button>
          ) : (
            <form onSubmit={e => { e.preventDefault(); remove.mutate(values(e)); }} className="space-y-4">
              <FormError error={remove.error} />
              <Field id="delete-password" name="password" type="password" label="Enter your password to confirm" required autoComplete="current-password" error={errorsOf(remove.error).password} />
              <div className="flex flex-wrap gap-3">
                <Button type="submit" className="bg-danger! text-white!" disabled={remove.isPending}>{remove.isPending ? 'Deleting…' : 'Delete everything'}</Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            </form>
          )}
        </Section>
      </div>
    </div>
  );
}
