export type Plan = 'free' | 'standard' | 'premium';

export interface User {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  emailVerifiedAt: string | null;
  isAdmin: boolean;
  createdAt: string;
}

export interface Topic {
  title: string;
  questions: string[];
}

export interface Answer {
  question: string;
  answer: string;
  part?: number;
}

export interface Feedback {
  criteria: Record<string, number | null>;
  strengths: string[];
  improvements: string[];
  summary: string;
}

export interface Practice {
  id: string;
  kind: 'practice' | 'mock';
  topic: string;
  part: number | null;
  answers: Answer[];
  feedback: Feedback | null;
  status: 'pending' | 'complete' | 'failed';
  createdAt: string;
}

export interface CueCard {
  prompt: string;
  points: string[];
  closing: string;
  /** The full card as one string, stored with the answer so feedback sees the whole task. */
  question: string;
}

export interface Topics {
  part1: Record<string, Topic>;
  part2: (CueCard & { id: string })[];
  part3: Record<string, Topic>;
}

export interface MockTest {
  id: string;
  title: string;
  part1: { topic: string; questions: string[] };
  part2: CueCard;
  part3: { topic: string; questions: string[] };
}

export interface AppConfig {
  feedbackAvailable: boolean;
  billingAvailable: boolean;
  freeAssessments: number;
  supportEmail: string | null;
}

export interface Usage {
  limit: number | null;
  used: number | null;
  left: number | null;
}

export interface ProgressPoint {
  id: string;
  createdAt: string;
  kind: 'practice' | 'mock';
  part: number | null;
  criteria: Record<string, number | null>;
}

export interface AdminStats {
  users: { total: number; verified: number; week: number; month: number; plans: Record<Plan, number> };
  practices: { complete: number; failed: number; mock: number; week: number; active_week: number };
  subscribers: { total: number; confirmed: number };
  daily: { day: string; signups: number; sessions: number }[];
}
