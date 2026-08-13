import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib-premium/api';

export interface BackgroundJob {
  _id: string;
  type: 'export' | 'analytics' | 'cleanup' | 'sync';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export function useBackgroundJobs() {
  return useQuery({
    queryKey: ['background-jobs'],
    queryFn: async () => {
      const res = await api.get('/api/jobs');
      if (!res.ok) throw new Error('Failed to fetch jobs');
      return res.json() as Promise<BackgroundJob[]>;
    },
    refetchInterval: 10000,
  });
}

export function useCancelJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const res = await api.post(`/api/jobs/${jobId}/cancel`, {});
      if (!res.ok) throw new Error('Failed to cancel job');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['background-jobs'] });
    },
  });
}
