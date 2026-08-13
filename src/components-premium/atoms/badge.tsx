'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib-premium/cn';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'active' | 'nominal' | 'warning' | 'critical';
}

export function Badge({ children, variant = 'default' }: BadgeProps) {
  const variants = {
    default: 'bg-[var(--bg-surface-l2)] text-[var(--text-primary)]',
    active: 'bg-[var(--signal-active)]/20 text-[var(--signal-active)]',
    nominal: 'bg-[var(--signal-nominal)]/20 text-[var(--signal-nominal)]',
    warning: 'bg-[var(--signal-warning)]/20 text-[var(--signal-warning)]',
    critical: 'bg-[var(--signal-critical)]/20 text-[var(--signal-critical)]',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        variants[variant]
      )}
    >
      {children}
    </span>
  );
}
