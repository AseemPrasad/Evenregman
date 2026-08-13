'use client';

import { EventDetail } from '@/hooks-premium/use-event';
import { Badge } from '../atoms/badge';

interface EventCardProps {
  event: EventDetail;
  onClick?: () => void;
}

export function EventCard({ event, onClick }: EventCardProps) {
  const statusVariants: Record<EventDetail['status'], 'nominal' | 'active' | 'warning'> = {
    published: 'nominal',
    draft: 'warning',
    archived: 'active',
  };

  return (
    <div
      onClick={onClick}
      className="bg-[var(--bg-surface-l2)] border border-[var(--bg-border)] rounded-lg p-4 space-y-3 cursor-pointer hover:border-[var(--signal-action)] transition-colors"
    >
      <div className="flex items-start justify-between">
        <h3 className="font-semibold text-[var(--text-primary)]">{event.name}</h3>
        <Badge variant={statusVariants[event.status]}>{event.status}</Badge>
      </div>

      <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
        {event.description}
      </p>

      <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-muted)]">
        <div>
          <span className="text-[var(--text-muted)]">Capacity: </span>
          <span className="text-[var(--text-primary)]">{event.totalCapacity}</span>
        </div>
        <div>
          <span className="text-[var(--text-muted)]">Start: </span>
          <span className="text-[var(--text-primary)]">
            {new Date(event.startDate).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}
