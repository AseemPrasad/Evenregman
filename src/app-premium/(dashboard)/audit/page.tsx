'use client';

import { MasterLayout } from '@/components-premium/layout/master-layout';
import { AuditTrail } from '@/components-premium/composite/audit-trail';
import { useAuditStream } from '@/hooks-premium/use-audit-stream';
import { useSystemHealth } from '@/hooks-premium/use-system-health';

export default function AuditPage() {
  const audit = useAuditStream();
  const health = useSystemHealth();

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
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Audit Log</h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Real-time activity stream of all system actions
          </p>
        </div>

        {/* Status */}
        <div className="flex items-center space-x-2">
          <div
            className={`w-2 h-2 rounded-full ${
              audit.connected ? 'bg-[var(--signal-nominal)]' : 'bg-[var(--signal-critical)]'
            }`}
          />
          <span className="text-sm text-[var(--text-secondary)]">
            {audit.connected ? 'Connected' : 'Disconnected'}
          </span>
          {audit.error && (
            <span className="text-xs text-[var(--signal-critical)]">({audit.error})</span>
          )}
        </div>

        {/* Audit Trail */}
        <div className="bg-[var(--bg-surface-l1)] border border-[var(--bg-border)] rounded-lg p-4">
          <AuditTrail entries={audit.entries} maxEntries={50} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[var(--bg-surface-l2)] border border-[var(--bg-border)] rounded-lg p-3">
            <div className="text-xs text-[var(--text-muted)] uppercase">Visible Entries</div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">
              {audit.entries.length}
            </div>
          </div>
          <div className="bg-[var(--bg-surface-l2)] border border-[var(--bg-border)] rounded-lg p-3">
            <div className="text-xs text-[var(--text-muted)] uppercase">Stream Status</div>
            <div className={`text-sm font-medium ${audit.connected ? 'text-[var(--signal-nominal)]' : 'text-[var(--signal-critical)]'}`}>
              {audit.connected ? 'Active' : 'Inactive'}
            </div>
          </div>
        </div>
      </div>
    </MasterLayout>
  );
}
