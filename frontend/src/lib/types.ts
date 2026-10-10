export type Plan = 'free' | 'standard' | 'premium';

export interface User {
  id: string;
  name: string;
  email: string;
  plan: Plan;
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

export interface MockTest {
  id: string;
  title: string;
  part1: { topic: string; questions: string[] };
  part2: { prompt: string; points: string[]; closing: string; question: string };
  part3: { topic: string; questions: string[] };
}

export interface AppConfig {
  feedbackAvailable: boolean;
  billingAvailable: boolean;
}
