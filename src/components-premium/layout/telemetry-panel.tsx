'use client';

import { cn } from '@/lib-premium/cn';

interface TelemetryPanelProps {
  cdcSyncStatus?: 'synced' | 'syncing' | 'error';
  circuitBreakerState?: 'closed' | 'open' | 'half-open';
  cacheHitRate?: number;
  outboxLatencyMs?: number;
}

const statusColor = {
  synced: 'var(--signal-nominal)',
  syncing: 'var(--signal-active)',
  error: 'var(--signal-critical)',
  closed: 'var(--signal-nominal)',
  'open': 'var(--signal-critical)',
  'half-open': 'var(--signal-warning)',
};

export function TelemetryPanel({
  cdcSyncStatus = 'synced',
  circuitBreakerState = 'closed',
  cacheHitRate = 0,
  outboxLatencyMs = 0,
}: TelemetryPanelProps) {
  return (
    <div className="bg-[var(--bg-surface-l2)] border-l border-[var(--bg-border)] p-4 space-y-4 text-sm">
      <div className="space-y-1">
        <label className="text-[var(--text-muted)] text-xs uppercase">CDC Sync</label>
        <div className="flex items-center space-x-2">
          <div
            className="premium-sync-indicator"
            style={{ backgroundColor: statusColor[cdcSyncStatus] }}
          />
          <span className="text-[var(--text-secondary)] capitalize">{cdcSyncStatus}</span>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[var(--text-muted)] text-xs uppercase">Circuit Breaker</label>
        <div className="flex items-center space-x-2">
          <div
            className="premium-sync-indicator"
            style={{ backgroundColor: statusColor[circuitBreakerState] }}
          />
          <span className="text-[var(--text-secondary)] capitalize">{circuitBreakerState}</span>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[var(--text-muted)] text-xs uppercase">Cache Hit Rate</label>
        <div className="bg-[var(--bg-surface-l1)] rounded px-2 py-1 text-[var(--text-primary)]">
          {(cacheHitRate * 100).toFixed(1)}%
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[var(--text-muted)] text-xs uppercase">Outbox Latency</label>
        <div className="bg-[var(--bg-surface-l1)] rounded px-2 py-1 text-[var(--text-primary)]">
          {outboxLatencyMs}ms
        </div>
      </div>
    </div>
  );
}
