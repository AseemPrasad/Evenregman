'use client';

import { useState } from 'react';
import { MasterLayout } from '@/components-premium/layout/master-layout';
import { EventCard } from '@/components-premium/composite/event-card';
import { CapacityVisualizer } from '@/components-premium/visualization/capacity-visualizer';
import { SyncIndicator } from '@/components-premium/visualization/sync-indicator';
import { useEventList } from '@/hooks-premium/use-event';
import { useSystemHealth } from '@/hooks-premium/use-system-health';
import { useCapacity } from '@/hooks-premium/use-capacity';
import { Skeleton } from '@/components-premium/atoms/skeleton';

export default function DashboardPage() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const events = useEventList();
  const health = useSystemHealth();
  const capacity = useCapacity(selectedEventId || '');

  const selectedEvent = selectedEventId
    ? events.data?.find(e => e._id === selectedEventId)
    : null;

  return (
    <MasterLayout
      telemetry={
        health.data && {
          cdcSyncStatus: health.data.cdcSyncStatus,
          circuitBreakerState: health.data.circuitBreakerState,
          cacheHitRate: health.data.cacheHitRate,
          outboxLatencyMs: health.data.outboxLatencyMs,
        }
      }
    >
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Event Command Center
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Manage events and monitor real-time metrics
          </p>
        </div>

        {/* System Health */}
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
            System Health
          </h2>
          {health.isLoading ? (
            <Skeleton count={3} className="h-24" />
          ) : health.data ? (
            <SyncIndicator
              cdcStatus={health.data.cdcSyncStatus}
              circuitState={health.data.circuitBreakerState}
              cacheHitRate={health.data.cacheHitRate}
              outboxLatencyMs={health.data.outboxLatencyMs}
            />
          ) : (
            <div className="text-[var(--text-muted)]">Failed to load health metrics</div>
          )}
        </div>

        {/* Events Grid */}
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
            Your Events
          </h2>
          {events.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          ) : events.data?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {events.data.map(event => (
                <EventCard
                  key={event._id}
                  event={event}
                  onClick={() => setSelectedEventId(event._id)}
                />
              ))}
            </div>
          ) : (
            <div className="text-[var(--text-muted)]">No events yet. Create your first event!</div>
          )}
        </div>

        {/* Selected Event Capacity */}
        {selectedEvent && (
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
              {selectedEvent.name} - Capacity
            </h2>
            {capacity.isLoading ? (
              <Skeleton count={2} className="h-32" />
            ) : capacity.data ? (
              <CapacityVisualizer metrics={capacity.data} />
            ) : (
              <div className="text-[var(--text-muted)]">Failed to load capacity data</div>
            )}
          </div>
        )}
      </div>
    </MasterLayout>
  );
}
