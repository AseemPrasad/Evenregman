'use client';

import { ReactNode, useState } from 'react';
import { cn } from '@/lib-premium/cn';

interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function Tooltip({ content, children, position = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  const positions = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2',
  };

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
      >
        {children}
      </div>
      {visible && (
        <div
          className={cn(
            'absolute bg-[var(--bg-surface-l1)] border border-[var(--bg-border)]',
            'text-xs text-[var(--text-secondary)] rounded px-2 py-1 whitespace-nowrap',
            'z-50 pointer-events-none',
            positions[position]
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
