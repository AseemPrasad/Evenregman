import { useEffect } from 'react';

export interface KeyboardAction {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(actions: KeyboardAction[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      actions.forEach(action => {
        const matchKey = e.key.toLowerCase() === action.key.toLowerCase();
        const matchCtrl = action.ctrlKey ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
        const matchShift = action.shiftKey ? e.shiftKey : !e.shiftKey;
        const matchAlt = action.altKey ? e.altKey : !e.altKey;

        if (matchKey && matchCtrl && matchShift && matchAlt) {
          e.preventDefault();
          action.action();
        }
      });
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [actions]);
}
