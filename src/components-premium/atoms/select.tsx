'use client';

import { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib-premium/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string; label: string }>;
}

export function Select({ label, options, className, ...props }: SelectProps) {
  return (
    <div className="flex flex-col space-y-1">
      {label && (
        <label className="text-sm font-medium text-[var(--text-primary)]">
          {label}
        </label>
      )}
      <select
        className={cn(
          'bg-[var(--bg-surface-l2)] border border-[var(--bg-border)] text-[var(--text-primary)]',
          'rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--signal-action)]',
          className
        )}
        {...props}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
