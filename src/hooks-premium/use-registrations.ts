import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib-premium/api';

export interface Registration {
  _id: string;
  eventId: string;
  hostId: string;
  guestName: string;
  guestEmail: string;
  seatsRequested: number;
  status: 'confirmed' | 'waitlisted' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export function useRegistrations(eventId?: string, page = 1, pageSize = 50) {
  return useQuery({
    queryKey: ['registrations', eventId, page, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (eventId) params.append('eventId', eventId);
      params.append('page', page.toString());
      params.append('pageSize', pageSize.toString());

      const res = await api.get(`/api/registrations?${params}`);
      if (!res.ok) throw new Error('Failed to fetch registrations');
      return res.json();
    },
  });
}
