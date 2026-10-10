import type { Feedback } from './types';

/** Mean of the scored criteria, rounded to the nearest IELTS half band. Unscored criteria are ignored. */
export function averageScore(feedback: Feedback | null | undefined): number | null {
  const values = Object.values(feedback?.criteria ?? {}).filter((v): v is number => typeof v === 'number');
  if (!values.length) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 2) / 2;
}

export function formatScore(value: number | null | undefined): string {
  return typeof value === 'number' ? value.toFixed(1) : '—';
}
