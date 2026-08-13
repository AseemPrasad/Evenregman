'use client';

import { BackgroundJob } from '@/hooks-premium/use-background-jobs';
import { Badge } from '../atoms/badge';
import { cn } from '@/lib-premium/cn';

interface JobCardProps {
  job: BackgroundJob;
  onCancel?: (jobId: string) => void;
}

export function JobCard({ job, onCancel }: JobCardProps) {
  const statusVariants: Record<BackgroundJob['status'], 'nominal' | 'active' | 'warning' | 'critical'> = {
    completed: 'nominal',
    running: 'active',
    pending: 'warning',
    failed: 'critical',
  };

  const isRunning = job.status === 'running' || job.status === 'pending';

  return (
    <div className="bg-[var(--bg-surface-l2)] border border-[var(--bg-border)] rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1">
          <h3 className="font-medium text-[var(--text-primary)] capitalize">{job.type} Job</h3>
          <Badge variant={statusVariants[job.status]}>{job.status}</Badge>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="text-xs text-[var(--text-muted)]">{job.progress}%</div>
        <div className="h-2 bg-[var(--bg-surface-l1)] rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all',
              job.status === 'completed' ? 'bg-[var(--signal-nominal)]' :
              job.status === 'failed' ? 'bg-[var(--signal-critical)]' :
              'bg-[var(--signal-active)]'
            )}
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>

      {/* Meta */}
      <div className="text-xs text-[var(--text-muted)] space-y-1">
        <div>Started: {new Date(job.startedAt).toLocaleString()}</div>
        {job.completedAt && <div>Completed: {new Date(job.completedAt).toLocaleString()}</div>}
        {job.error && <div className="text-[var(--signal-critical)]">Error: {job.error}</div>}
      </div>

      {/* Actions */}
      {isRunning && onCancel && (
        <button
          onClick={() => onCancel(job._id)}
          className="w-full px-3 py-2 text-sm bg-[var(--signal-critical)]/20 text-[var(--signal-critical)] rounded-lg hover:bg-[var(--signal-critical)]/30 transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
