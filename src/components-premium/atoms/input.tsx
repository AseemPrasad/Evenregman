'use client';

import { InputHTMLAttributes } from 'react';
import { cn } from '@/lib-premium/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col space-y-1">
      {label && (
        <label className="text-sm font-medium text-[var(--text-primary)]">
          {label}
        </label>
      )}
      <input
        className={cn(
          'bg-[var(--bg-surface-l2)] border border-[var(--bg-border)] text-[var(--text-primary)]',
          'rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--signal-action)]',
          'placeholder:text-[var(--text-muted)]',
          error && 'border-[var(--signal-critical)]',
          className
        )}
        {...props}
      />
      {error && (
        <span className="text-xs text-[var(--signal-critical)]">{error}</span>
      )}
    </div>
  );
}
