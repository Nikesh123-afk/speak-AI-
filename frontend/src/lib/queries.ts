import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { AdminStats, AppConfig, MockTest, Practice, ProgressPoint, Topics, Usage, User } from './types';

export const keys = {
  me: ['me'], config: ['config'], topics: ['topics'], mockTests: ['mock-tests'], practices: ['practices'],
  progress: ['progress'], usage: ['usage'], admin: ['admin'],
} as const;

/** Everything that belongs to the signed-in user, dropped on login, logout and account deletion. */
export const USER_KEYS = [keys.practices, keys.progress, keys.usage, keys.admin];

export const useMe = () =>
  useQuery({ queryKey: keys.me, queryFn: () => api<{ user: User | null }>('/api/auth/me').then(r => r.user), staleTime: 60_000 });

export const useConfig = () =>
  useQuery({ queryKey: keys.config, queryFn: () => api<AppConfig>('/api/config'), staleTime: Infinity });

export const useTopics = () =>
  useQuery({ queryKey: keys.topics, queryFn: () => api<Topics>('/api/topics'), staleTime: Infinity });

export const useMockTests = () =>
  useQuery({ queryKey: keys.mockTests, queryFn: () => api<MockTest[]>('/api/mock-tests'), staleTime: Infinity });

const PAGE = 20;

export const usePractices = () =>
  useInfiniteQuery({
    queryKey: keys.practices,
    queryFn: ({ pageParam }) => api<{ practices: Practice[]; total: number; offset: number }>(`/api/practices?limit=${PAGE}&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: last => (last.offset + last.practices.length < last.total ? last.offset + last.practices.length : undefined),
  });

export const usePractice = (id: string) =>
  useQuery({ queryKey: [...keys.practices, id], queryFn: () => api<{ practice: Practice }>(`/api/practices/${encodeURIComponent(id)}`).then(r => r.practice) });

export const useProgress = () =>
  useQuery({ queryKey: keys.progress, queryFn: () => api<{ points: ProgressPoint[] }>('/api/progress').then(r => r.points) });

export const useUsage = (enabled = true) =>
  useQuery({ queryKey: keys.usage, queryFn: () => api<Usage>('/api/usage'), enabled });

export const useAdminStats = () => useQuery({ queryKey: keys.admin, queryFn: () => api<AdminStats>('/api/admin/stats') });

export function useForgetUser() {
  const client = useQueryClient();
  return (user: User | null) => {
    client.setQueryData(keys.me, user);
    for (const key of USER_KEYS) client.removeQueries({ queryKey: key });
  };
}

export function useAuthMutation(mode: 'login' | 'signup') {
  const forget = useForgetUser();
  return useMutation({
    mutationFn: (body: Record<string, string>) => api<{ user: User }>(`/api/auth/${mode}`, { method: 'POST', body }),
    onSuccess: ({ user }) => forget(user),
  });
}

export function useLogout() {
  const forget = useForgetUser();
  return useMutation({
    mutationFn: () => api('/api/auth/logout', { method: 'POST', body: {} }),
    onSuccess: () => forget(null),
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
