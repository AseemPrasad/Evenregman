'use client';

import { useTheme } from '@/providers-premium/theme-provider';
import { cn } from '@/lib-premium/cn';

export function ThemeSwitcher() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex items-center space-x-2">
      <button
        onClick={toggleTheme}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          theme === 'dark' ? 'bg-[var(--signal-action)]' : 'bg-[var(--bg-surface-l2)]'
        )}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
            theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
      <span className="text-xs text-[var(--text-secondary)] min-w-12">
        {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
      </span>
    </div>
  );
}
