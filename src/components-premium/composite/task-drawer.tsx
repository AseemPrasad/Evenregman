'use client';

import { cn } from '@/lib-premium/cn';
import { JobCard } from './job-card';
import { BackgroundJob } from '@/hooks-premium/use-background-jobs';

interface TaskDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  jobs: BackgroundJob[];
  isLoading?: boolean;
  onCancelJob?: (jobId: string) => void;
}

export function TaskDrawer({ isOpen, onToggle, jobs, isLoading, onCancelJob }: TaskDrawerProps) {
  const activeJobs = jobs.filter(j => j.status === 'running' || j.status === 'pending');
  const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed');

  return (
    <>
      {/* Minimized Button */}
      <button
        onClick={onToggle}
        className={cn(
          'fixed bottom-4 right-4 w-14 h-14 rounded-full flex items-center justify-center transition-all z-40',
          isOpen ? 'bg-[var(--bg-surface-l2)]' : 'bg-[var(--signal-action)]',
          'border border-[var(--bg-border)] shadow-lg hover:shadow-xl'
        )}
      >
        <span className="text-2xl">{isOpen ? '↓' : '📋'}</span>
        {activeJobs.length > 0 && (
          <span className="absolute top-1 right-1 w-5 h-5 bg-[var(--signal-critical)] text-white text-xs rounded-full flex items-center justify-center">
            {activeJobs.length}
          </span>
        )}
      </button>

      {/* Drawer */}
      <div
        className={cn(
          'fixed bottom-0 right-0 w-96 bg-[var(--bg-surface-l1)] border-t border-l border-[var(--bg-border)] rounded-t-2xl',
          'shadow-2xl transition-transform duration-300 z-40 max-h-96 flex flex-col',
          isOpen ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-[var(--bg-border)] flex items-center justify-between">
          <h3 className="font-semibold text-[var(--text-primary)]">Background Tasks</h3>
          <button
            onClick={onToggle}
            className="p-1 hover:bg-[var(--bg-surface-l2)] rounded transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="text-sm text-[var(--text-muted)]">Loading tasks...</div>
          ) : jobs.length === 0 ? (
            <div className="text-sm text-[var(--text-muted)] text-center py-4">
              No background tasks
            </div>
          ) : (
            <>
              {/* Active Jobs */}
              {activeJobs.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2">
                    Active ({activeJobs.length})
                  </h4>
                  <div className="space-y-2">
                    {activeJobs.map(job => (
                      <JobCard
                        key={job._id}
                        job={job}
                        onCancel={onCancelJob}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Completed Jobs */}
              {completedJobs.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2">
                    Completed ({completedJobs.length})
                  </h4>
                  <div className="space-y-2">
                    {completedJobs.slice(0, 3).map(job => (
                      <JobCard key={job._id} job={job} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
