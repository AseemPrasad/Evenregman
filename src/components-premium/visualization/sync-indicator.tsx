'use client';

import { cn } from '@/lib-premium/cn';

type SyncStatus = 'synced' | 'syncing' | 'error';
type CircuitState = 'closed' | 'open' | 'half-open';

interface SyncIndicatorProps {
  cdcStatus: SyncStatus;
  circuitState: CircuitState;
  cacheHitRate: number;
  outboxLatencyMs: number;
}

const statusConfig = {
  synced: { color: 'var(--signal-nominal)', label: 'Synced', icon: '✓' },
  syncing: { color: 'var(--signal-active)', label: 'Syncing', icon: '⟳' },
  error: { color: 'var(--signal-critical)', label: 'Error', icon: '✗' },
};

const circuitConfig = {
  closed: { color: 'var(--signal-nominal)', label: 'Closed' },
  'half-open': { color: 'var(--signal-warning)', label: 'Half-Open' },
  'open': { color: 'var(--signal-critical)', label: 'Open' },
};

export function SyncIndicator({
  cdcStatus,
  circuitState,
  cacheHitRate,
  outboxLatencyMs,
}: SyncIndicatorProps) {
  return (
    <div className="space-y-3">
      {/* CDC Status */}
      <div className="bg-[var(--bg-surface-l2)] border border-[var(--bg-border)] rounded-lg p-3">
        <div className="flex items-center space-x-2">
          <div
            className={cn(
              'w-2 h-2 rounded-full',
              cdcStatus === 'syncing' && 'animate-pulse'
            )}
            style={{ backgroundColor: statusConfig[cdcStatus].color }}
          />
          <span className="text-sm font-medium text-[var(--text-primary)]">
            CDC: {statusConfig[cdcStatus].label}
          </span>
        </div>
        <div className="text-xs text-[var(--text-muted)] mt-1">
          Pipeline {cdcStatus === 'syncing' ? 'processing events...' : 'stable'}
        </div>
      </div>

      {/* Circuit Breaker */}
      <div className="bg-[var(--bg-surface-l2)] border border-[var(--bg-border)] rounded-lg p-3">
        <div className="flex items-center space-x-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: circuitConfig[circuitState].color }}
          />
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Circuit: {circuitConfig[circuitState].label}
          </span>
        </div>
        <div className="text-xs text-[var(--text-muted)] mt-1">
          {circuitState === 'open'
            ? 'Requests blocked, waiting for recovery'
            : circuitState === 'half-open'
            ? 'Testing requests, monitoring failures'
            : 'All systems operational'}
        </div>
      </div>

      {/* Cache & Latency */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[var(--bg-surface-l2)] border border-[var(--bg-border)] rounded-lg p-3">
          <div className="text-xs text-[var(--text-muted)] uppercase">Cache Hit</div>
          <div className="text-lg font-bold text-[var(--text-primary)]">
            {(cacheHitRate * 100).toFixed(0)}%
          </div>
        </div>
        <div className="bg-[var(--bg-surface-l2)] border border-[var(--bg-border)] rounded-lg p-3">
          <div className="text-xs text-[var(--text-muted)] uppercase">Latency</div>
          <div className="text-lg font-bold text-[var(--text-primary)]">
            {outboxLatencyMs}ms
          </div>
        </div>
      </div>
    </div>
  );
}
