# Premium Frontend UI/UX - Complete Developer Guide

## Overview

The Premium Frontend is a telemetry-driven command center for the Evenregman event management platform. Built with React 18, Next.js App Router, React Query, and Tailwind CSS, it provides a sophisticated monitoring and management interface for event hosts.

**Architecture**: Completely isolated in `src/*-premium/` directories with zero impact on existing codebase.

---

## Directory Structure

```
src/
├── app-premium/                    # Next.js App Router pages
│   ├── (dashboard)/               # Protected dashboard routes
│   │   ├── page.tsx              # Dashboard home
│   │   ├── registrations/        # Registration table
│   │   ├── audit/                # Real-time audit log
│   │   └── settings/             # Settings page
│   └── api/sse/                  # Server-Sent Events endpoints
├── components-premium/             # React component library
│   ├── atoms/                    # Atomic components (Button, Badge, Input, etc.)
│   ├── composite/                # Composite components (DetailDock, JobCard, etc.)
│   ├── layout/                   # Layout components (Sidebar, TelemetryPanel, MasterLayout)
│   ├── tables/                   # Data table components
│   ├── visualization/            # Charts and visualizations
│   ├── animation/                # Animations and micro-interactions
│   └── error-boundary.tsx        # Error boundary for isolation
├── hooks-premium/                  # Custom React Query hooks
├── lib-premium/                    # Utility libraries
├── providers-premium/              # React context providers
└── styles-premium/                 # Design system and global styles
```

---

## Getting Started

### 1. Environment Setup

Ensure these env vars are set:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 2. Install Dependencies

The premium UI relies on:
- `@tanstack/react-query` - State management and caching
- `@tanstack/react-table` - Headless table library
- `@tanstack/react-virtual` - Virtual scrolling
- `clsx` - Class name composition
- `tailwind-merge` - Merge Tailwind classes

### 3. Start Development

```bash
npm run dev
# Visit http://localhost:3000/premium
```

---

## Design System

### Colors (Slate & Phosphor Palette)

All colors defined in `src/styles-premium/tokens.ts` and available as CSS variables:

**Background**:
- `--bg-base`: `#090A0C` (page background)
- `--bg-surface-l1`: `#121418` (cards)
- `--bg-surface-l2`: `#1A1D24` (input backgrounds)
- `--bg-border`: `rgba(255,255,255,0.07)` (borders)

**Signal Colors** (functional, not decorative):
- `--signal-nominal`: `#10B981` (emerald - confirmed, synced)
- `--signal-active`: `#F59E0B` (amber - pending, locked)
- `--signal-warning`: `#F97316` (orange - half-open, backlog)
- `--signal-critical`: `#EF4444` (crimson - error, cancelled)
- `--signal-action`: `#3B82F6` (azure - primary actions)

**Text**:
- `--text-primary`: `#F8FAFC`
- `--text-secondary`: `rgba(148,163,184,0.8)`
- `--text-muted`: `rgba(100,116,139,0.6)`
- `--text-disabled`: `rgba(148,163,184,0.3)`

### Spacing

- `xs`: 4px, `sm`: 8px, `md`: 12px, `lg`: 16px, `xl`: 24px, `2xl`: 32px, `3xl`: 48px

### Animations

Located in `src/components-premium/animation/pulse.css`:
- `animate-pulse` - Opacity fade
- `animate-pulse-scale` - Scale + opacity
- `animate-shimmer` - Loading skeleton
- `animate-slide-up` / `animate-slide-in-right` / `animate-bounce-in`

---

## Component Library

### Atomic Components

All in `src/components-premium/atoms/`:

**Button**
```tsx
<Button variant="primary" size="md" onClick={handleClick}>
  Click me
</Button>
```
Variants: `primary`, `secondary`, `ghost`
Sizes: `sm`, `md`, `lg`

**Badge**
```tsx
<Badge variant="nominal">Confirmed</Badge>
```
Variants: `default`, `nominal`, `active`, `warning`, `critical`

**Input**
```tsx
<Input label="Email" error="Invalid email" placeholder="..." />
```

**Select**
```tsx
<Select 
  label="Event"
  options={[{value: '1', label: 'Event 1'}]}
  onChange={e => setEvent(e.target.value)}
/>
```

**Toggle**
```tsx
<Toggle enabled={true} onChange={setEnabled} label="Enable" />
```

**Tooltip**
```tsx
<Tooltip content="Helper text" position="top">
  <Button>Hover me</Button>
</Tooltip>
```

**Skeleton**
```tsx
<Skeleton count={3} /> // 3 loading bars
<TableSkeleton /> // Table skeleton
```

### Composite Components

**DetailDock** - Right-side drawer panel
```tsx
<DetailDock 
  title="Details"
  isOpen={open}
  onClose={() => setOpen(false)}
>
  <div>Content</div>
</DetailDock>
```

**TaskDrawer** - Floating task manager
```tsx
<TaskDrawer
  isOpen={open}
  onToggle={() => setOpen(!open)}
  jobs={jobs}
  onCancelJob={cancelJob}
/>
```

**EventCard** - Event preview
```tsx
<EventCard event={event} onClick={handleSelect} />
```

**CommandPalette** - Cmd+K search
```tsx
<CommandPalette
  items={commands}
  isOpen={open}
  onClose={() => setOpen(false)}
/>
```

**ShortcutsHelpModal** - Keyboard shortcuts reference
```tsx
<ShortcutsHelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
```

**SystemMonitor** - Alert toast
```tsx
<SystemMonitor alerts={alerts} onDismiss={dismissAlert} />
```

---

## Data Fetching with React Query

All hooks in `src/hooks-premium/`:

### Registration Data
```tsx
const { data, isLoading, error } = useRegistrations(eventId, page, pageSize);
```

### System Health (polled every 30s)
```tsx
const { data: health } = useSystemHealth();
// { cdcSyncStatus, circuitBreakerState, cacheHitRate, outboxLatencyMs }
```

### Background Jobs (polled every 10s)
```tsx
const { data: jobs } = useBackgroundJobs();
const { mutate: cancelJob } = useCancelJob();
```

### Real-Time Audit Stream (SSE)
```tsx
const { entries, connected, error } = useAuditStream();
// entries are kept to last 100, auto-refresh
```

### Capacity Metrics
```tsx
const { data: capacity } = useCapacity(eventId);
// { totalCapacity, confirmed, waitlisted, available, utilizationPercent }
```

### Events
```tsx
const { data: event } = useEvent(eventId);
const { data: events } = useEventList(hostId);
```

### Error Handling
```tsx
const { handleError, handleApiError } = useErrorHandler();
handleError(error, 'Failed to load data');
handleApiError(500, 'Server error');
```

---

## Keyboard Shortcuts

Defined in `src/lib-premium/shortcuts.ts`:

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open command palette |
| `Shift+E` | Export current view |
| `J` / `K` | Navigate down/up |
| `Enter` | Open detail view |
| `Esc` | Close modal |
| `Cmd+R` | Refresh data |
| `Cmd+T` | Toggle theme |
| `?` | Show this help |

---

## Accessibility (WCAG AAA)

### Focus Management
```tsx
import { focusTrap } from '@/lib-premium/a11y';

useEffect(() => {
  const cleanup = focusTrap(modalElement, () => setOpen(false));
  return cleanup;
}, []);
```

### Screen Reader Announcements
```tsx
import { announceToScreenReader, announceError } from '@/lib-premium/a11y';

announceToScreenReader('Registration saved');
announceError('Failed to save registration');
```

### Keyboard Navigation
- `:focus-visible` applied to all interactive elements
- Supports `prefers-reduced-motion`
- `skip-to-main` link included
- All color signals include text/icons, not just color

---

## Performance

### Code Splitting

Dashboard pages are automatically code-split by Next.js.

### Virtual Scrolling

Use `VirtualRegistrationTable` for tables > 100 rows:
```tsx
<VirtualRegistrationTable data={registrations} />
// Handles 10,000+ rows efficiently
```

### Debouncing/Throttling
```tsx
import { debounce, throttle } from '@/lib-premium/performance';

const debouncedSearch = debounce((q) => searchEvents(q), 300);
const throttledScroll = throttle(() => checkVisibility(), 100);
```

### Error Boundary

Wrap feature sections:
```tsx
<ErrorBoundary fallback={(err) => <div>Failed: {err.message}</div>}>
  <RegistrationTable />
</ErrorBoundary>
```

---

## Pages & Routes

### Dashboard (`/premium`)
- Event cards grid
- System health indicators
- Selected event capacity visualization
- Responsive card layout

### Registrations (`/premium/registrations`)
- Event filter dropdown
- Paginated registration table
- Detail dock for individual registration
- TanStack Table with sorting/filtering

### Audit Log (`/premium/audit`)
- Real-time SSE stream
- Connection status indicator
- Action-colored timeline
- Stream health stats

### Settings (`/premium/settings`)
- Theme switcher (dark/light)
- Notification toggles
- System info display

---

## Styling & Theming

### CSS Variables

All colors are CSS variables defined in `:root`:
```css
--bg-base: #090A0C;
--signal-nominal: #10B981;
/* etc */
```

### Light Theme Override

Add to HTML element:
```html
<html data-theme="light">
```

### Responsive Classes

Using Tailwind's responsive prefixes:
```tsx
<div className="w-full lg:w-96">
  {/* Full width on mobile, 384px on desktop */}
</div>
```

---

## Common Patterns

### Data Loading with Skeleton
```tsx
{isLoading ? (
  <Skeleton count={5} />
) : (
  <RegistrationTable data={data} />
)}
```

### Error Handling
```tsx
{error ? (
  <div className="text-[var(--signal-critical)]">
    Failed to load data: {error.message}
  </div>
) : (
  <Content />
)}
```

### Optimistic Updates
```tsx
const mutation = useMutation({
  mutationFn: updateRegistration,
  onMutate: async (vars) => {
    await queryClient.cancelQueries({queryKey: ['registrations']});
    const previous = queryClient.getQueryData(['registrations']);
    queryClient.setQueryData(['registrations'], old => updateOptimistically(old, vars));
    return { previous };
  },
  onError: (err, vars, context) => {
    queryClient.setQueryData(['registrations'], context.previous);
  }
});
```

---

## Testing

### Unit Tests

Create `.test.tsx` files next to components:
```tsx
import { render, screen } from '@testing-library/react';
import { Button } from '@/components-premium/atoms/button';

test('renders button', () => {
  render(<Button>Click</Button>);
  expect(screen.getByRole('button')).toHaveTextContent('Click');
});
```

### Integration Tests

Test data flow with React Query:
```tsx
const { result } = renderHook(() => useRegistrations('event1'), {
  wrapper: QueryProvider
});
await waitFor(() => expect(result.current.data).toBeDefined());
```

---

## Deployment

### Production Checklist

- [ ] Environment variables set correctly
- [ ] API endpoints verified (NEXT_PUBLIC_API_URL)
- [ ] Error logging configured
- [ ] Performance metrics monitored
- [ ] Accessibility audit passed
- [ ] Bundle size within limits
- [ ] Dark/light mode tested in both themes
- [ ] Mobile responsiveness verified
- [ ] Keyboard navigation tested
- [ ] Screen reader tested

---

## Troubleshooting

### React Query Caching Issues

Check browser DevTools Network tab:
- Verify requests are being made
- Ensure `staleTime` and `gcTime` appropriate for data
- Use `react-query/devtools` for debugging

### Styling Not Applied

1. Verify Tailwind CSS is configured
2. Check if CSS variable is defined
3. Ensure class names aren't purged (check tailwind.config.js)
4. Use DevTools Inspector to debug specificity

### Components Not Rendering

1. Check if wrapped in `<QueryProvider>` and `<ThemeProvider>`
2. Verify required props passed
3. Check console for errors
4. Use `<ErrorBoundary>` to catch render errors

---

## Resources

- [React Query Docs](https://tanstack.com/query/latest)
- [TanStack Table Docs](https://tanstack.com/table/latest)
- [Tailwind CSS Docs](https://tailwindcss.com)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [[PREMIUM_UI_API_REFERENCE.md]] - Component API details

---

## Changelog

### v1.0.0 (Initial Release)
- Complete premium UI implementation
- 20-step development plan executed
- Dashboard, registrations, audit log pages
- Real-time system health monitoring
- Keyboard shortcuts and command palette
- Dark/light theme switching
- WCAG AAA accessibility compliance
- Virtual scrolling for large tables
- Error boundaries and monitoring
