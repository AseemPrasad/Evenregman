import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib-premium/api';

export interface AuditLog {
  _id: string;
  action: string;
  userId: string;
  resourceType: string;
  resourceId: string;
  changes: Record<string, unknown>;
  timestamp: string;
}

export function useAuditLog(page = 1, pageSize = 50, filter?: { resourceType?: string; action?: string }) {
  return useQuery({
    queryKey: ['audit-log', page, pageSize, filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('pageSize', pageSize.toString());
      if (filter?.resourceType) params.append('resourceType', filter.resourceType);
      if (filter?.action) params.append('action', filter.action);

      const res = await api.get(`/api/audit?${params}`);
      if (!res.ok) throw new Error('Failed to fetch audit log');
      return res.json() as Promise<{ items: AuditLog[]; total: number }>;
    },
  });
}
