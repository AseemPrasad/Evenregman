'use client';

import { AuditEntry } from '@/hooks-premium/use-audit-stream';
import { cn } from '@/lib-premium/cn';

interface AuditTrailProps {
  entries: AuditEntry[];
  maxEntries?: number;
}

const actionColors: Record<string, string> = {
  create: 'var(--signal-nominal)',
  update: 'var(--signal-active)',
  delete: 'var(--signal-critical)',
  cancel: 'var(--signal-warning)',
};

export function AuditTrail({ entries, maxEntries = 20 }: AuditTrailProps) {
  const displayed = entries.slice(0, maxEntries);

  return (
    <div className="space-y-2">
      {displayed.length === 0 ? (
        <div className="text-sm text-[var(--text-muted)] py-4 text-center">
          No audit entries yet
        </div>
      ) : (
        displayed.map(entry => (
          <div
            key={entry._id}
            className="bg-[var(--bg-surface-l2)] border border-[var(--bg-border)] rounded-lg p-3 space-y-1 text-sm"
          >
            <div className="flex items-center space-x-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: actionColors[entry.action] || 'var(--text-muted)' }}
              />
              <span className="font-medium text-[var(--text-primary)]">
                {entry.action}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="text-xs text-[var(--text-muted)] ml-3">
              {entry.resourceType} {entry.resourceId}
            </div>
            <div className="text-xs text-[var(--text-muted)] ml-3">
              by {entry.userId}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
