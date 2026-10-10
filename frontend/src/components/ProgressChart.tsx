import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ProgressPoint } from '../lib/types';
import { formatScore } from '../lib/score';

/** Fixed order: a criterion always keeps its color. Values validated for CVD separation in both themes. */
const SERIES = [
  { key: 'Coherence', label: 'Coherence', color: 'var(--color-series-1)' },
  { key: 'Lexical Resource', label: 'Lexical', color: 'var(--color-series-2)' },
  { key: 'Grammatical Range', label: 'Grammar', color: 'var(--color-series-3)' },
] as const;

const HEIGHT = 240;
const PAD = { top: 16, right: 72, bottom: 28, left: 32 };
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const sessionLabel = (p: ProgressPoint) => (p.kind === 'mock' ? 'Mock test' : `Part ${p.part}`);

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function ProgressChart({ points }: { points: ProgressPoint[] }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <p className="rounded-3xl border border-dashed border-line p-8 text-center text-muted">
        {points.length ? 'Finish one more session to see your trend.' : 'Your progress chart appears after two sessions.'}
      </p>
    );
  }

  const values = points.flatMap(p => SERIES.map(s => p.criteria[s.key])).filter((v): v is number => typeof v === 'number');
  const low = Math.max(0, Math.floor(Math.min(...values)) - 1);
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - low) / (9 - low)) * plotH;
  const ticks = Array.from({ length: 9 - low + 1 }, (_, i) => low + i);

  // End labels: placed at each line's last value, nudged apart so they never overlap.
  const last = points[points.length - 1];
  const ends = SERIES.map(s => ({ ...s, value: last.criteria[s.key] }))
    .filter((s): s is typeof s & { value: number } => typeof s.value === 'number')
    .map(s => ({ ...s, y: y(s.value) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 14);

  function pick(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * width;
    setActive(Math.round(Math.min(1, Math.max(0, (px - PAD.left) / plotW)) * (points.length - 1)));
  }
  function key(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowLeft' ? -1 : 1;
    setActive(i => Math.min(points.length - 1, Math.max(0, (i ?? points.length - 1) + step)));
  }

  const shown = active === null ? null : points[active];
  const tipLeft = active === null ? 0 : Math.min(Math.max(x(active), 90), width - 90);

  return (
    <figure className="rounded-3xl border border-line bg-card p-4 sm:p-6">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="font-medium">Scores by criterion</span>
        <ul className="flex flex-wrap gap-4 text-sm text-muted" aria-label="Legend">
          {SERIES.map(s => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      </figcaption>

      <div ref={ref} className="relative mt-4">
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block h-auto w-full touch-pan-y outline-none"
          role="img"
          tabIndex={0}
          aria-label={`Line chart of ${points.length} sessions. Use the arrow keys to read each session.`}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setActive(null)}
          onKeyDown={key}
          onBlur={() => setActive(null)}
        >
          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">{t}</text>
            </g>
          ))}
          <text x={PAD.left} y={HEIGHT - 8} className="fill-muted text-[11px]">{date(points[0].createdAt)}</text>
          <text x={PAD.left + plotW} y={HEIGHT - 8} textAnchor="end" className="fill-muted text-[11px]">{date(last.createdAt)}</text>

          {SERIES.map(s => {
            const path = points
              .map((p, i) => [i, p.criteria[s.key]] as const)
              .filter((d): d is readonly [number, number] => typeof d[1] === 'number')
              .map(([i, v], n) => `${n ? 'L' : 'M'}${x(i)},${y(v)}`)
              .join('');
            return <path key={s.key} d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
          })}

          {ends.map(s => (
            <text key={s.key} x={PAD.left + plotW + 8} y={s.y} dy="0.32em" className="fill-ink text-[11px]">
              {s.label} <tspan className="fill-muted tabular-nums">{formatScore(s.value)}</tspan>
            </text>
          ))}

          {active !== null && (
            <g pointerEvents="none">
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} className="stroke-muted" strokeWidth={1} strokeDasharray="3 3" />
              {SERIES.map(s => {
                const v = points[active].criteria[s.key];
                return typeof v === 'number' && (
                  <circle key={s.key} cx={x(active)} cy={y(v)} r={4} fill={s.color} className="stroke-card" strokeWidth={2} />
                );
              })}
            </g>
          )}
        </svg>

        {shown && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 w-44 -translate-x-1/2 rounded-xl border border-line bg-card px-3 py-2 text-xs shadow-lg"
            style={{ left: tipLeft }}
          >
            <p className="font-medium text-ink">{date(shown.createdAt)} · {sessionLabel(shown)}</p>
            <dl className="mt-1 space-y-0.5">
              {SERIES.map(s => (
                <div key={s.key} className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 text-muted">
                    <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />{s.label}
                  </dt>
                  <dd className="tabular-nums text-ink">{formatScore(shown.criteria[s.key])}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink">Show as table</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="text-muted">
              <tr>
                <th className="py-1.5 pr-4 font-medium">Date</th>
                <th className="py-1.5 pr-4 font-medium">Session</th>
                {SERIES.map(s => <th key={s.key} className="py-1.5 pr-4 font-medium">{s.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...points].reverse().map(p => (
                <tr key={p.id}>
                  <td className="py-1.5 pr-4">{date(p.createdAt)}</td>
                  <td className="py-1.5 pr-4">{sessionLabel(p)}</td>
                  {SERIES.map(s => <td key={s.key} className="py-1.5 pr-4">{formatScore(p.criteria[s.key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
