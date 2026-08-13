// Slate & Phosphor Color Palette - Premium UI Design System

export const colors = {
  // Neutral base (dark theme default)
  background: {
    base: '#090A0C',
    surfaceL1: '#121418',
    surfaceL2: '#1A1D24',
    border: 'rgba(255, 255, 255, 0.07)',
  },

  // Accent signals (functional, not decorative)
  signal: {
    active: '#F59E0B',     // Amber - atomic reservations, pending
    nominal: '#10B981',    // Emerald - synced, nominal
    warning: '#F97316',    // Orange - backlog, half-open
    critical: '#EF4444',   // Crimson - circuit open, capacity breach
    action: '#3B82F6',     // Azure - primary actions
  },

  // Text hierarchy
  text: {
    primary: '#F8FAFC',
    secondary: 'rgba(148, 163, 184, 0.8)',
    muted: 'rgba(100, 116, 139, 0.6)',
    disabled: 'rgba(148, 163, 184, 0.3)',
  },
};

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '48px',
};

export const radius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
};

export const transitions = {
  fast: '150ms ease-out',
  base: '250ms ease-out',
  slow: '300ms ease-out',
};

export const zIndex = {
  base: 1,
  drawer: 40,
  modal: 50,
  tooltip: 60,
};
