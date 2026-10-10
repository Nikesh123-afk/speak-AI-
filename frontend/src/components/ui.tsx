import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

type Variant = 'primary' | 'secondary' | 'ghost';
const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap';
const sizes = { md: 'h-11 px-5 text-[15px]', lg: 'h-13 px-7 text-base' };
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:bg-signal-strong',
  secondary: 'border border-line bg-card text-ink hover:border-ink',
  ghost: 'text-muted hover:text-ink',
};

interface Style {
  variant?: Variant;
  size?: keyof typeof sizes;
}
const cls = ({ variant = 'primary', size = 'md' }: Style, extra = '') => `${base} ${sizes[size]} ${variants[variant]} ${extra}`;

export function Button({ variant, size, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & Style) {
  return <button type="button" className={cls({ variant, size }, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: LinkProps & Style) {
  return <Link className={cls({ variant, size }, className)} {...props} />;
}

export function Field({ label, error, hint, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; id: string }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className="block h-12 w-full rounded-xl border border-line bg-card px-3.5 text-base sm:h-11 sm:text-[15px] placeholder:text-muted/70 focus:border-ink focus:outline-none aria-invalid:border-danger"
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Logo() {
  return (
    <Link to="/" className="group inline-flex items-center gap-2.5" aria-label="IELTS Fluent AI home">
      <span className="grid size-8 place-items-center rounded-lg bg-signal text-white">
        <Bars className="h-4" />
      </span>
      <span className="hidden font-display text-xl font-semibold tracking-tight sm:inline">IELTS Fluent <span className="text-signal">AI</span></span>
    </Link>
  );
}

export function Bars({ className = '', animated = false }: { className?: string; animated?: boolean }) {
  const heights = [0.45, 0.75, 1, 0.6, 0.85, 0.5, 0.7];
  return (
    <span className={`inline-flex items-center gap-[3px] ${className}`} aria-hidden="true">
      {heights.slice(0, animated ? 7 : 4).map((h, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full bg-current ${animated ? 'animate-wave' : ''}`}
          style={{ height: `${h * 100}%`, animationDelay: animated ? `${i * 0.12}s` : undefined }}
        />
      ))}
    </span>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.18em] text-signal-strong">{children}</p>;
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-muted">
      <span className="size-4 animate-spin rounded-full border-2 border-line border-t-signal" aria-hidden="true" />
      {label}
    </span>
  );
}

export function ScoreDial({ value, label, size = 132 }: { value: number | null; label: string; size?: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const filled = value === null ? 0 : (value / 9) * c;
  return (
    <figure className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="8" className="stroke-sunken" />
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="8" strokeLinecap="round" className="stroke-signal transition-[stroke-dasharray] duration-700" strokeDasharray={`${filled} ${c}`} />
      </svg>
      <figcaption className="relative text-center">
        <span className="block font-display text-4xl font-semibold tabular-nums">{value === null ? '—' : value.toFixed(1)}</span>
        <span className="text-xs text-muted">{label}</span>
      </figcaption>
    </figure>
  );
}
