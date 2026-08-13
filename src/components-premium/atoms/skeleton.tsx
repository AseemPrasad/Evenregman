'use client';

import { cn } from '@/lib-premium/cn';

interface SkeletonProps {
  className?: string;
  count?: number;
}

export function Skeleton({ className, count = 1 }: SkeletonProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'bg-[var(--bg-surface-l2)] rounded-lg animate-pulse',
            'h-4 w-full',
            className
          )}
        />
      ))}
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="bg-[var(--bg-surface-l2)] rounded-lg h-10 w-full animate-pulse"
        />
      ))}
    </div>
  );
}
