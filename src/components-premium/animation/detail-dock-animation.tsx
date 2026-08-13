'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib-premium/cn';

interface DetailDockAnimationProps {
  isOpen: boolean;
  children: ReactNode;
  delay?: number;
}

export function DetailDockAnimation({
  isOpen,
  children,
  delay = 0,
}: DetailDockAnimationProps) {
  return (
    <div
      style={{
        opacity: isOpen ? 1 : 0,
        transform: isOpen ? 'translateY(0)' : 'translateY(10px)',
        transitionProperty: 'opacity, transform',
        transitionDuration: '300ms',
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {children}
    </div>
  );
}
