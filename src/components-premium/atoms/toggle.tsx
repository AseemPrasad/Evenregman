'use client';

import { useState } from 'react';
import { cn } from '@/lib-premium/cn';

interface ToggleProps {
  enabled?: boolean;
  onChange?: (enabled: boolean) => void;
  label?: string;
}

export function Toggle({ enabled = false, onChange, label }: ToggleProps) {
  const [isEnabled, setIsEnabled] = useState(enabled);

  const handleChange = () => {
    const newState = !isEnabled;
    setIsEnabled(newState);
    onChange?.(newState);
  };

  return (
    <div className="flex items-center space-x-3">
      <button
        onClick={handleChange}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          isEnabled ? 'bg-[var(--signal-action)]' : 'bg-[var(--bg-surface-l2)]'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
            isEnabled ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
      {label && (
        <span className="text-sm text-[var(--text-primary)]">{label}</span>
      )}
    </div>
  );
}
