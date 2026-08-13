'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { Registration } from '@/hooks-premium/use-registrations';
import { Badge } from '../atoms/badge';
import { cn } from '@/lib-premium/cn';

interface VirtualRegistrationTableProps {
  data: Registration[];
}

export function VirtualRegistrationTable({ data }: VirtualRegistrationTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const statusVariants: Record<Registration['status'], 'nominal' | 'active' | 'critical'> = {
    confirmed: 'nominal',
    waitlisted: 'active',
    cancelled: 'critical',
  };

  return (
    <div ref={parentRef} className="h-96 overflow-auto bg-[var(--bg-surface-l1)] border border-[var(--bg-border)] rounded-lg">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[var(--bg-surface-l1)] border-b border-[var(--bg-border)]">
          <tr>
            <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Guest</th>
            <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Email</th>
            <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Seats</th>
            <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Status</th>
            <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Created</th>
          </tr>
        </thead>
        <tbody
          style={{
            height: `${totalSize}px`,
            position: 'relative',
          }}
        >
          {virtualItems.map(virtualItem => {
            const reg = data[virtualItem.index];
            return (
              <tr
                key={reg._id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className="border-b border-[var(--bg-border)] hover:bg-[var(--bg-surface-l2)] transition-colors"
              >
                <td className="px-4 py-3 text-[var(--text-primary)]">{reg.guestName}</td>
                <td className="px-4 py-3 text-[var(--text-primary)]">{reg.guestEmail}</td>
                <td className="px-4 py-3 text-[var(--text-primary)]">{reg.seatsRequested}</td>
                <td className="px-4 py-3">
                  <Badge variant={statusVariants[reg.status]}>{reg.status}</Badge>
                </td>
                <td className="px-4 py-3 text-[var(--text-muted)]">
                  {new Date(reg.createdAt).toLocaleDateString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
