import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib-premium/api';

export interface EventDetail {
  _id: string;
  name: string;
  description: string;
  hostId: string;
  totalCapacity: number;
  startDate: string;
  endDate: string;
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export function useEvent(eventId: string) {
  return useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const res = await api.get(`/api/events/${eventId}`);
      if (!res.ok) throw new Error('Failed to fetch event');
      return res.json() as Promise<EventDetail>;
    },
  });
}

export function useEventList(hostId?: string) {
  return useQuery({
    queryKey: ['events', hostId],
    queryFn: async () => {
      const params = hostId ? `?hostId=${hostId}` : '';
      const res = await api.get(`/api/events${params}`);
      if (!res.ok) throw new Error('Failed to fetch events');
      return res.json() as Promise<EventDetail[]>;
    },
  });
}
