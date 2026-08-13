'use client';

import { cn } from '@/lib-premium/cn';
import { SHORTCUTS } from '@/lib-premium/shortcuts';

interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsHelpModal({ isOpen, onClose }: ShortcutsHelpModalProps) {
  if (!isOpen) return null;

  const shortcutsList = Object.entries(SHORTCUTS).map(([, value]) => ({
    keys: [
      value.ctrlKey && 'Ctrl',
      value.metaKey && '⌘',
      value.shiftKey && 'Shift',
      value.altKey && 'Alt',
      value.key.toUpperCase(),
    ]
      .filter(Boolean)
      .join('+'),
    description: value.description,
  }));

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-[var(--bg-surface-l1)] border border-[var(--bg-border)] rounded-lg shadow-2xl z-50 max-h-96 overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-[var(--bg-border)] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-surface-l2)] rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-2">
          {shortcutsList.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between py-2 px-3 bg-[var(--bg-surface-l2)] rounded-lg"
            >
              <span className="text-sm text-[var(--text-secondary)]">
                {item.description}
              </span>
              <kbd className="px-2 py-1 text-xs bg-[var(--bg-base)] border border-[var(--bg-border)] rounded font-mono text-[var(--text-primary)]">
                {item.keys}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--bg-border)] text-xs text-[var(--text-muted)]">
          Press <kbd className="px-1 py-0.5 bg-[var(--bg-base)] border border-[var(--bg-border)] rounded">?</kbd> to toggle this help
        </div>
      </div>
    </>
  );
}
