import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib-premium/api';

export interface CapacityMetrics {
  eventId: string;
  totalCapacity: number;
  confirmed: number;
  waitlisted: number;
  available: number;
  utilizationPercent: number;
}

export function useCapacity(eventId: string) {
  return useQuery({
    queryKey: ['capacity', eventId],
    queryFn: async () => {
      const res = await api.get(`/api/events/${eventId}/capacity`);
      if (!res.ok) throw new Error('Failed to fetch capacity');
      return res.json() as Promise<CapacityMetrics>;
    },
    refetchInterval: 30000,
  });
}
