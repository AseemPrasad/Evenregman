'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib-premium/cn';
import { Button } from '../atoms/button';

interface DetailDockProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function DetailDock({ title, isOpen, onClose, children, footer }: DetailDockProps) {
  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
      )}

      {/* Dock Panel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-screen w-96 bg-[var(--bg-surface-l1)] border-l border-[var(--bg-border)]',
          'shadow-lg z-50 flex flex-col transition-transform duration-300',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-[var(--bg-border)] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-surface-l2)] rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-4 border-t border-[var(--bg-border)]">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
