export const SHORTCUTS = {
  SEARCH: { key: 'k', ctrlKey: true, metaKey: true, description: 'Open command palette' },
  EXPORT: { key: 'e', shiftKey: true, description: 'Export current view' },
  NAVIGATE_UP: { key: 'k', description: 'Navigate up' },
  NAVIGATE_DOWN: { key: 'j', description: 'Navigate down' },
  DETAIL_VIEW: { key: 'enter', description: 'Open detail view' },
  CLOSE_MODAL: { key: 'escape', description: 'Close modal/drawer' },
  REFRESH: { key: 'r', ctrlKey: true, metaKey: true, description: 'Refresh data' },
  TOGGLE_THEME: { key: 't', ctrlKey: true, metaKey: true, description: 'Toggle theme' },
  HELP: { key: '?', description: 'Show keyboard shortcuts' },
} as const;

export interface ShortcutConfig {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  description: string;
}

export function matchesShortcut(e: KeyboardEvent, shortcut: ShortcutConfig): boolean {
  const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
  const ctrlMatch = shortcut.ctrlKey ? e.ctrlKey : !e.ctrlKey;
  const metaMatch = shortcut.metaKey ? e.metaKey : !e.metaKey;
  const shiftMatch = shortcut.shiftKey ? e.shiftKey : !e.shiftKey;
  const altMatch = shortcut.altKey ? e.altKey : !e.altKey;

  return keyMatch && ctrlMatch && metaMatch && shiftMatch && altMatch;
}
