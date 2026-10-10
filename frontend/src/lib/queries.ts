import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { AppConfig, MockTest, Practice, Topic, User } from './types';

export const keys = { me: ['me'], config: ['config'], topics: ['topics'], mockTests: ['mock-tests'], practices: ['practices'] } as const;

export const useMe = () =>
  useQuery({ queryKey: keys.me, queryFn: () => api<{ user: User | null }>('/api/auth/me').then(r => r.user), staleTime: 60_000 });

export const useConfig = () =>
  useQuery({ queryKey: keys.config, queryFn: () => api<AppConfig>('/api/config'), staleTime: Infinity });

export const useTopics = () =>
  useQuery({ queryKey: keys.topics, queryFn: () => api<Record<string, Topic>>('/api/topics'), staleTime: Infinity });

export const useMockTests = () =>
  useQuery({ queryKey: keys.mockTests, queryFn: () => api<MockTest[]>('/api/mock-tests'), staleTime: Infinity });

export const usePractices = (enabled = true) =>
  useQuery({
    queryKey: keys.practices,
    queryFn: () => api<{ practices: Practice[]; total: number }>('/api/practices?limit=50'),
    enabled,
  });

export function useAuthMutation(mode: 'login' | 'signup') {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, string>) => api<{ user: User }>(`/api/auth/${mode}`, { method: 'POST', body }),
    onSuccess: ({ user }) => {
      client.setQueryData(keys.me, user);
      client.removeQueries({ queryKey: keys.practices });
    },
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api('/api/auth/logout', { method: 'POST', body: {} }),
    onSuccess: () => {
      client.setQueryData(keys.me, null);
      client.removeQueries({ queryKey: keys.practices });
    },
  });
}

/** Paid plans are granted only by the Stripe webhook; the browser just gets sent to Stripe. */
export function useBillingRedirect() {
  return useMutation({
    mutationFn: (plan?: 'standard' | 'premium') =>
      api<{ url: string }>(plan ? '/api/billing/checkout' : '/api/billing/portal', { method: 'POST', body: plan ? { plan } : {} }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
}
