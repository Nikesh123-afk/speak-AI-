import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { api, ApiError } from '../lib/api';
import { useMe } from '../lib/queries';
import { ButtonLink, Logo } from './ui';
import { useToast } from './Toast';

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  const { data: user } = useMe();
  const { pathname, hash } = useLocation();
  // The menu remembers the URL it was opened on, so any navigation closes it.
  const here = pathname + hash;
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === here;
  const setOpen = (value: boolean) => setOpenAt(value ? here : null);
  const link = ({ isActive }: { isActive: boolean }) => `text-[15px] transition-colors ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`;
  const mobileLink = ({ isActive }: { isActive: boolean }) => `block rounded-xl px-3 py-3 text-base ${isActive ? 'bg-sunken text-ink' : 'text-muted hover:bg-sunken hover:text-ink'}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenAt(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const account = user ? (
    <ButtonLink to="/dashboard" variant="secondary" className="h-9! px-3! sm:px-4!" aria-label="Dashboard">
      <span className="grid size-5 place-items-center rounded-full bg-signal text-[11px] font-semibold text-white" aria-hidden="true">{user.name[0]?.toUpperCase()}</span>
      <span className="hidden sm:inline">Dashboard</span>
    </ButtonLink>
  ) : (
    <ButtonLink to="/signup" className="h-9! px-4!">Start free</ButtonLink>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <nav className="container-page flex h-16 items-center justify-between gap-4" aria-label="Main">
        <Logo />
        <div className="hidden items-center gap-7 md:flex">
          <NavLink to="/practice" className={link}>Practice</NavLink>
          <NavLink to="/mock-test" className={link}>Mock test</NavLink>
          <a href="/#pricing" className="text-[15px] text-muted transition-colors hover:text-ink">Pricing</a>
          {!user && <NavLink to="/login" className={link}>Log in</NavLink>}
          {account}
        </div>
        <div className="flex items-center gap-2 md:hidden">
          {account}
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full text-ink hover:bg-sunken"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen(!open)}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </nav>
      {open && (
        <div id="mobile-menu" className="border-t border-line bg-paper md:hidden">
          <div className="container-page space-y-1 py-3">
            <NavLink to="/practice" className={mobileLink}>Practice</NavLink>
            <NavLink to="/mock-test" className={mobileLink}>Mock test</NavLink>
            <a href="/#pricing" className="block rounded-xl px-3 py-3 text-base text-muted hover:bg-sunken hover:text-ink">Pricing</a>
            {user ? <NavLink to="/dashboard" className={mobileLink}>Dashboard</NavLink> : <NavLink to="/login" className={mobileLink}>Log in</NavLink>}
          </div>
        </div>
      )}
    </header>
  );
}

function Footer() {
  const toast = useToast();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError(undefined);
    try {
      const { message } = await api<{ message: string }>('/api/subscribe', { method: 'POST', body: { email: new FormData(form).get('email') } });
      toast(message);
      form.reset();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not subscribe.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <footer className="mt-24 border-t border-line">
      <div className="container-page grid grid-cols-1 gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.4fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted">Speaking practice that tells you exactly what to work on next.</p>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <Link to="/practice" className="text-muted hover:text-ink">Practice</Link>
          <a href="/#pricing" className="text-muted hover:text-ink">Pricing</a>
          <a href="/#faq" className="text-muted hover:text-ink">FAQ</a>
        </div>
        <form onSubmit={subscribe} className="min-w-0 space-y-2 sm:col-span-2 lg:col-span-1" noValidate>
          <label htmlFor="subscribe-email" className="text-sm font-medium">Monthly speaking tips</label>
          <div className="flex gap-2">
            <input id="subscribe-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com"
              className="h-11 w-full min-w-0 flex-1 rounded-full border border-line bg-card px-4 text-base sm:h-10 sm:text-sm focus:border-ink focus:outline-none" />
            <button disabled={busy} className="h-11 shrink-0 rounded-full sm:h-10 bg-ink px-4 text-sm font-medium text-paper hover:bg-signal-strong disabled:opacity-50">Subscribe</button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
      </div>
      <div className="container-page flex flex-col gap-2 border-t border-line py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-xs text-muted lg:flex-row lg:justify-between">
        <span>© {new Date().getFullYear()} IELTS Fluent AI. Not affiliated with IELTS, the British Council, IDP or Cambridge.</span>
        <span>Scores are practice guidance, not official results.</span>
      </div>
    </footer>
  );
}
