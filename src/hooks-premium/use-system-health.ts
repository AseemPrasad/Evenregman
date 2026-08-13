import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib-premium/api';

export interface SystemHealth {
  cdcSyncStatus: 'synced' | 'syncing' | 'error';
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  cacheHitRate: number;
  outboxLatencyMs: number;
  uptime: number;
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      const res = await api.get('/api/metrics/health');
      if (!res.ok) throw new Error('Failed to fetch system health');
      return res.json() as Promise<SystemHealth>;
    },
    refetchInterval: 30000, // Poll every 30 seconds
  });
}
