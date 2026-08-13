'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib-premium/cn';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  action: () => void;
  icon?: string;
}

interface CommandPaletteProps {
  items: CommandItem[];
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ items, isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  const filtered = items.filter(item =>
    item.label.toLowerCase().includes(query.toLowerCase()) ||
    item.description?.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  const execute = () => {
    if (filtered[selected]) {
      filtered[selected].action();
      onClose();
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelected(Math.min(selected + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelected(Math.max(selected - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          execute();
          break;
        case 'Escape':
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, selected, filtered]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-96 bg-[var(--bg-surface-l1)] border border-[var(--bg-border)] rounded-lg shadow-2xl z-50">
        <input
          autoFocus
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          placeholder="Search commands..."
          className="w-full px-4 py-3 bg-[var(--bg-surface-l1)] text-[var(--text-primary)] focus:outline-none border-b border-[var(--bg-border)]"
        />
        <div className="max-h-96 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-[var(--text-muted)]">
              No commands found
            </div>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelected(idx);
                  execute();
                }}
                className={cn(
                  'w-full px-4 py-3 text-left flex items-start space-x-3 transition-colors',
                  idx === selected ? 'bg-[var(--signal-action)]/20' : 'hover:bg-[var(--bg-surface-l2)]'
                )}
              >
                {item.icon && <span className="text-lg">{item.icon}</span>}
                <div>
                  <div className="text-[var(--text-primary)] font-medium">{item.label}</div>
                  {item.description && (
                    <div className="text-xs text-[var(--text-muted)]">{item.description}</div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
