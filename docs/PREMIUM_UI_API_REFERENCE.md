# Premium UI - Component API Reference

## Atoms

### Button
```tsx
<Button 
  variant="primary" | "secondary" | "ghost"
  size="sm" | "md" | "lg"
  onClick?: () => void
  disabled?: boolean
  className?: string
>
  Label
</Button>
```

### Badge
```tsx
<Badge variant="default" | "active" | "nominal" | "warning" | "critical">
  Label
</Badge>
```

### Input
```tsx
<Input
  label?: string
  error?: string
  placeholder?: string
  type?: string
  value?: string
  onChange?: (e) => void
  disabled?: boolean
  className?: string
/>
```

### Select
```tsx
<Select
  label?: string
  options: Array<{value: string, label: string}>
  value?: string
  onChange?: (e) => void
  disabled?: boolean
  className?: string
/>
```

### Toggle
```tsx
<Toggle
  enabled?: boolean
  onChange?: (enabled: boolean) => void
  label?: string
/>
```

### Tooltip
```tsx
<Tooltip
  content: string
  position="top" | "bottom" | "left" | "right"
>
  <ReactNode />
</Tooltip>
```

### Skeleton
```tsx
<Skeleton
  count?: number // default 1
  className?: string
/>

<TableSkeleton />
```

---

## Layout

### MasterLayout
```tsx
<MasterLayout
  telemetry?: {
    cdcSyncStatus: 'synced' | 'syncing' | 'error'
    circuitBreakerState: 'closed' | 'open' | 'half-open'
    cacheHitRate: number
    outboxLatencyMs: number
  }
>
  <ReactNode />
</MasterLayout>
```

### Sidebar
Auto-renders in MasterLayout. No props needed.

### TelemetryPanel
Renders in MasterLayout right panel. Pass props via MasterLayout.telemetry.

---

## Composite Components

### DetailDock
```tsx
<DetailDock
  title: string
  isOpen: boolean
  onClose: () => void
  footer?: ReactNode
>
  <ReactNode />
</DetailDock>
```

### TaskDrawer
```tsx
<TaskDrawer
  isOpen: boolean
  onToggle: () => void
  jobs: BackgroundJob[]
  isLoading?: boolean
  onCancelJob?: (jobId: string) => void
/>
```

### JobCard
```tsx
<JobCard
  job: BackgroundJob
  onCancel?: (jobId: string) => void
/>
```

### EventCard
```tsx
<EventCard
  event: EventDetail
  onClick?: () => void
/>
```

### CommandPalette
```tsx
<CommandPalette
  items: Array<{
    id: string
    label: string
    description?: string
    icon?: string
    action: () => void
  }>
  isOpen: boolean
  onClose: () => void
/>
```

### ShortcutsHelpModal
```tsx
<ShortcutsHelpModal
  isOpen: boolean
  onClose: () => void
/>
```

### ThemeSwitcher
```tsx
<ThemeSwitcher />
```

### SystemMonitor
```tsx
<SystemMonitor
  alerts: Array<{
    id: string
    level: 'info' | 'warning' | 'error'
    message: string
    timestamp: Date
  }>
  onDismiss?: (id: string) => void
/>
```

---

## Visualization

### CapacityVisualizer
```tsx
<CapacityVisualizer
  metrics: {
    eventId: string
    totalCapacity: number
    confirmed: number
    waitlisted: number
    available: number
    utilizationPercent: number
  }
  showLegend?: boolean
/>
```

### SyncIndicator
```tsx
<SyncIndicator
  cdcStatus: 'synced' | 'syncing' | 'error'
  circuitState: 'closed' | 'open' | 'half-open'
  cacheHitRate: number // 0-1
  outboxLatencyMs: number
/>
```

---

## Tables

### RegistrationTable
```tsx
<RegistrationTable
  data: Registration[]
  isLoading?: boolean
/>
```

### VirtualRegistrationTable
```tsx
<VirtualRegistrationTable
  data: Registration[]
/>
```

---

## Animation

### AtomicReservationAnimation
```tsx
<AtomicReservationAnimation
  seatId: string
  status: 'locked' | 'available' | 'reserved'
  ttlMs?: number // 5000 default
  onExpire?: () => void
/>
```

### DetailDockAnimation
```tsx
<DetailDockAnimation
  isOpen: boolean
  delay?: number // ms
>
  <ReactNode />
</DetailDockAnimation>
```

---

## Error Handling

### ErrorBoundary
```tsx
<ErrorBoundary fallback={(error) => <div>{error.message}</div>}>
  <Component />
</ErrorBoundary>
```

---

## Hooks

### useRegistrations
```tsx
const { data, isLoading, error } = useRegistrations(
  eventId?: string,
  page?: number,
  pageSize?: number
);
// Returns: { registrations: Registration[], total: number }
```

### useSystemHealth
```tsx
const { data, isLoading } = useSystemHealth();
// Returns: SystemHealth
// Refetches every 30 seconds
```

### useBackgroundJobs
```tsx
const { data, isLoading } = useBackgroundJobs();
// Returns: BackgroundJob[]
// Refetches every 10 seconds

const { mutate: cancelJob } = useCancelJob();
```

### useAuditStream
```tsx
const { entries, connected, error } = useAuditStream();
// entries: AuditEntry[] (last 100)
// connected: boolean
// error: string | null
```

### useCapacity
```tsx
const { data, isLoading } = useCapacity(eventId: string);
// Returns: CapacityMetrics
```

### useEvent
```tsx
const { data } = useEvent(eventId: string);
// Returns: EventDetail
```

### useEventList
```tsx
const { data } = useEventList(hostId?: string);
// Returns: EventDetail[]
```

### useKeyboardShortcuts
```tsx
useKeyboardShortcuts([
  {
    key: 'k',
    ctrlKey: true,
    metaKey: true,
    action: () => setOpen(true),
    description: 'Open search'
  }
]);
```

### useAuditLog
```tsx
const { data } = useAuditLog(
  page?: number,
  pageSize?: number,
  filter?: { resourceType?: string, action?: string }
);
// Returns: { items: AuditLog[], total: number }
```

### useToast (from ToastProvider)
```tsx
const { toasts, addToast, removeToast } = useToast();
addToast('Saved!', 'success', 3000);
```

### useTheme (from ThemeProvider)
```tsx
const { theme, setTheme, toggleTheme } = useTheme();
// theme: 'dark' | 'light' | 'system'
```

### useErrorHandler
```tsx
const { handleError, handleApiError } = useErrorHandler();
handleError(error, 'Failed to load');
handleApiError(500, 'Server error');
```

### useSystemAlerts
```tsx
const { alerts, addAlert, dismissAlert } = useSystemAlerts();
addAlert('Data synced', 'info');
dismissAlert(alertId);
```

---

## Providers

### QueryProvider
Wrap entire app or subtree. Required for React Query.
```tsx
<QueryProvider>
  <App />
</QueryProvider>
```

### ThemeProvider
Wrap entire app. Required for theme switching.
```tsx
<ThemeProvider>
  <App />
</ThemeProvider>
```

### ToastProvider
Wrap entire app. Required for toasts.
```tsx
<ToastProvider>
  <App />
</ToastProvider>
```

---

## Utilities

### cn (class name composition)
```tsx
import { cn } from '@/lib-premium/cn';

cn('px-4 py-2', condition && 'bg-red-500')
// Returns: merged Tailwind classes
```

### API Client
```tsx
import { api } from '@/lib-premium/api';

api.get('/endpoint').then(r => r.json())
api.post('/endpoint', {data}).then(r => r.json())
api.put('/endpoint', {data}).then(r => r.json())
api.delete('/endpoint').then(r => r.json())
```

### Shortcuts
```tsx
import { SHORTCUTS, matchesShortcut } from '@/lib-premium/shortcuts';

const isSearch = matchesShortcut(event, SHORTCUTS.SEARCH);
```

### Accessibility
```tsx
import { 
  focusTrap,
  announceToScreenReader,
  announceError,
  SR_ONLY_CLASS
} from '@/lib-premium/a11y';

focusTrap(modalElement, onEscape);
announceToScreenReader('Item deleted');
announceError('Failed to save');
```

### Performance
```tsx
import { 
  debounce, 
  throttle, 
  captureWebVitals,
  prefetchRoute
} from '@/lib-premium/performance';

const debouncedSearch = debounce(search, 300);
const throttledScroll = throttle(handleScroll, 100);
captureWebVitals();
prefetchRoute('/premium/events');
```

---

## Types

```tsx
// Registration
interface Registration {
  _id: string
  eventId: string
  hostId: string
  guestName: string
  guestEmail: string
  seatsRequested: number
  status: 'confirmed' | 'waitlisted' | 'cancelled'
  createdAt: string
  updatedAt: string
}

// System Health
interface SystemHealth {
  cdcSyncStatus: 'synced' | 'syncing' | 'error'
  circuitBreakerState: 'closed' | 'open' | 'half-open'
  cacheHitRate: number
  outboxLatencyMs: number
  uptime: number
}

// Background Job
interface BackgroundJob {
  _id: string
  type: 'export' | 'analytics' | 'cleanup' | 'sync'
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  startedAt: string
  completedAt?: string
  error?: string
}

// Audit Entry (SSE)
interface AuditEntry {
  _id: string
  action: string
  userId: string
  resourceType: string
  resourceId: string
  changes: Record<string, unknown>
  timestamp: string
}

// Audit Log Entry
interface AuditLog extends AuditEntry {}

// Event Detail
interface EventDetail {
  _id: string
  name: string
  description: string
  hostId: string
  totalCapacity: number
  startDate: string
  endDate: string
  status: 'draft' | 'published' | 'archived'
  createdAt: string
  updatedAt: string
}

// Capacity Metrics
interface CapacityMetrics {
  eventId: string
  totalCapacity: number
  confirmed: number
  waitlisted: number
  available: number
  utilizationPercent: number
}
```

---

## CSS Classes

**Animations**:
- `.animate-pulse` - Opacity fade
- `.animate-pulse-scale` - Scale + opacity
- `.animate-shimmer` - Loading skeleton
- `.animate-slide-up` - Entrance from below
- `.animate-slide-in-right` - Entrance from right
- `.animate-bounce-in` - Scale bounce entrance

**Utilities**:
- `.sr-only` - Screen reader only (visually hidden)
- `.skip-to-main` - Keyboard navigation skip link
- `.premium-card` - Card styling
- `.premium-button-primary` - Primary button
- `.premium-button-secondary` - Secondary button
- `.premium-input` - Input styling
- `.premium-nav-link` - Navigation link

---

## Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

---

## Next Steps

1. Review [PREMIUM_UI_GUIDE.md](./PREMIUM_UI_GUIDE.md) for detailed guides
2. Check individual component files for JSDoc comments
3. Use TypeScript for full autocomplete and type safety
4. Test with React DevTools and React Query DevTools
5. Monitor performance with Lighthouse
