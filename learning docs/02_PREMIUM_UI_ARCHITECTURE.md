# Premium UI Architecture - Learning Guide

## What is the Premium UI?

The Premium UI is a telemetry-driven command center for event hosts. It shows:

- **Real-time system health**: CDC sync status, circuit breaker state, cache performance
- **Live registration data**: Paginated table with virtual scrolling (handles 10,000+ rows)
- **Capacity visualization**: Stacked bar charts showing seat allocation
- **Audit stream**: Real-time activity log via Server-Sent Events (SSE)
- **Background tasks**: Async job monitor with progress tracking

**Goal**: Help event organizers make decisions based on live data, not stale dashboards.

---

## Architecture Pattern: Telemetry-Driven Dashboard

### The Pattern

```
Backend System                Dashboard
   ↓                              ↓
Reservations →                    ← useRegistrations()
Events →                          ← useEvent()
Capacity Changes →                ← useCapacity()
System Health →                   ← useSystemHealth()
Audit Actions →                   ← useAuditStream()
Job Progress →                    ← useBackgroundJobs()
   ↓                              ↓
React Query Caches          Real-time Components
   ↓                              ↓
Optimistic Updates          Instant Feedback
   ↓                              ↓
Refetch on Mutation         Consistent UI
```

### Why This Pattern?

1. **User sees current state immediately** (optimistic update)
2. **Backend stays source of truth** (refetch after mutation)
3. **Network issues don't break UI** (cached data shown while offline)
4. **Multiple tabs stay in sync** (QueryClient invalidation)

---

## Core Concepts

### 1. React Query (TanStack Query)

**What**: Client-side server state management

**Key operations**:

```typescript
// Fetch data
const { data, isLoading, error } = useQuery({
  queryKey: ['registrations', eventId],  // Cache key
  queryFn: async () => {
    const res = await fetch(`/api/registrations?eventId=${eventId}`);
    return res.json();
  },
  staleTime: 60 * 1000,  // 1 min before stale
  gcTime: 5 * 60 * 1000, // 5 min before deleted
});

// Invalidate cache
queryClient.invalidateQueries({
  queryKey: ['registrations']
});
```

**Why**:
- Handles caching automatically
- Dedupes requests (5 components request same data → 1 API call)
- Refetch strategies (on window focus, on interval, manual)
- Optimistic updates (show new data before server responds)

### 2. Real-Time Updates via SSE

**What**: Server-Sent Events (like WebSocket but simpler)

```typescript
// Client
const eventSource = new EventSource('/api/sse/audit');
eventSource.onmessage = (e) => {
  const entry = JSON.parse(e.data);
  setAuditEntries(prev => [entry, ...prev]);
};

// Server
export async function GET() {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    }
  });
}
```

**Why**:
- One-way push (server → client)
- Auto-reconnect on disconnect
- Lower overhead than WebSocket
- Perfect for audit logs, notifications

### 3. Virtual Scrolling

**What**: Render only visible rows (huge performance win)

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: 10000,              // 10k rows
  getScrollElement: () => containerRef.current,
  estimateSize: () => 48,    // Row height
  overscan: 10,              // Render 10 extra for smoothness
});

// Only renders ~20 rows at a time, not 10,000!
```

**Why**:
- 10,000 rows normally = 10k DOM nodes = slow
- Virtual scrolling = ~20 visible nodes = fast
- Users see instant scroll, perfect interaction

### 4. Design System (CSS Variables)

**What**: Single source of truth for colors, spacing

```css
:root {
  --bg-base: #090A0C;
  --signal-nominal: #10B981;      /* Emerald - success */
  --signal-active: #F59E0B;       /* Amber - pending */
  --signal-critical: #EF4444;     /* Crimson - error */
}
```

**Why**:
- Easy theme switching (dark/light)
- Consistent design across app
- Easy to update colors globally
- Enforces design discipline

---

## Component Architecture

### Layer 1: Atomic Components

**Purpose**: Reusable UI primitives

```typescript
// Button.tsx
<Button variant="primary" size="md">
  Register
</Button>

// Badge.tsx
<Badge variant="nominal">Confirmed</Badge>

// Input.tsx
<Input label="Email" error="Invalid" />
```

**Characteristics**:
- Single responsibility (just render one element)
- Styled from design system
- Fully controlled (no internal state)
- Highly reusable

### Layer 2: Composite Components

**Purpose**: Business logic + multiple atoms

```typescript
// DetailDock.tsx
<DetailDock title="Registration" isOpen={open}>
  <div>User info</div>
  <Button>Approve</Button>
</DetailDock>

// JobCard.tsx
<JobCard job={job} onCancel={cancel} />

// EventCard.tsx
<EventCard event={event} onClick={select} />
```

**Characteristics**:
- Combines atoms for specific use case
- May have local state for UI (show/hide detail)
- Uses hooks for data fetching
- Higher coupling to business domain

### Layer 3: Pages

**Purpose**: Assemble components into pages

```typescript
// dashboard/page.tsx
export default function Dashboard() {
  const { data: health } = useSystemHealth();
  const { data: events } = useEventList();

  return (
    <MasterLayout telemetry={health}>
      <SyncIndicator {...health} />
      <EventCard events={events} />
    </MasterLayout>
  );
}
```

**Characteristics**:
- Fetch data for entire page
- Handle page-level state
- Use layout components
- Connect UI to data layer

### Layer 4: Layout

**Purpose**: Structure pages consistently

```typescript
<MasterLayout telemetry={health}>
  {/* Sidebar on left */}
  {/* Main content in middle */}
  {/* Telemetry panel on right */}
  {/* Task drawer at bottom-right */}
</MasterLayout>
```

**Three-part layout**:
```
┌─────────────────────────────────────┐
│ Sidebar  │  Main Content  │ Telemetry │
│  Nav     │  Body          │  Metrics  │
│  Links   │  Data          │  Status   │
├─────────────────────────────────────┤
│ Task Drawer (floating bottom-right) │
└─────────────────────────────────────┘
```

---

## Data Flow: Step by Step

### Scenario: Host Registers for Event

```
┌─ Frontend ─────────────────────────────────┐
│ Host clicks "Register"                     │
│ ↓                                          │
│ Post /api/registrations                    │
│ (useRegistrations hook mutation)           │
│ ↓                                          │
│ Optimistic update: add to local cache      │
│ UI updates immediately (no wait)           │
│ ↓                                          │
│ Show "Saving..." spinner                   │
└────────────────────────────────────────────┘
                    ↓
┌─ Network ──────────────────────────────────┐
│ Request sent to server (HTTP POST)         │
└────────────────────────────────────────────┘
                    ↓
┌─ Backend ──────────────────────────────────┐
│ Handler receives POST /api/registrations   │
│ ↓                                          │
│ Validate input (seats, email, etc)         │
│ ↓                                          │
│ Check authorization (can user register?)   │
│ ↓                                          │
│ Call atomicReservation()                   │
│   - Start transaction                      │
│   - Check capacity                         │
│   - Create registration OR waitlist        │
│   - Update event counter                   │
│   - Commit                                 │
│ ↓                                          │
│ Write to AuditLog                          │
│ ↓                                          │
│ CDC worker picks up change                 │
│ ↓                                          │
│ Project to analytics                       │
│ ↓                                          │
│ Return {status: 'confirmed', id: '123'}    │
└────────────────────────────────────────────┘
                    ↓
┌─ Frontend ─────────────────────────────────┐
│ Response received                          │
│ ↓                                          │
│ Mutation succeeds                          │
│ ↓                                          │
│ Invalidate 'registrations' cache           │
│ ↓                                          │
│ React Query refetches registrations        │
│ ↓                                          │
│ Table re-renders with latest data          │
│ ↓                                          │
│ Show "Registration saved" toast            │
└────────────────────────────────────────────┘
```

### Scenario: System Health Check

```
Dashboard loads
  ↓
useSystemHealth() hook fires (once)
  ↓
First request: GET /api/metrics/health
  ↓
Data cached in React Query
  ↓
UI renders with health data
  ↓
30 seconds pass (refetchInterval: 30000)
  ↓
Automatic refetch: GET /api/metrics/health
  ↓
New data arrives
  ↓
TelemetryPanel re-renders with updated metrics
  ↓
User sees CDC sync status change if needed
```

---

## Handling Edge Cases

### Network Disconnected

```typescript
const { data, isLoading, error } = useQuery({
  ...
  retry: 3,           // Try 3 times before giving up
  retryDelay: attemptIndex => Math.min(1000 * 2^attemptIndex, 30000),
});

// If all retries fail:
if (error) {
  return <div>No connection. Cached data: {cachedData}</div>
}
```

**What happens**:
- First request fails
- Wait 1s, retry
- Wait 2s, retry
- Wait 4s, retry
- Show error
- Keep displaying cached data if available

### Stale Data (Optimistic Update Failed)

```typescript
const { mutate } = useMutation({
  mutationFn: register,
  onMutate: (variables) => {
    // Optimistically update UI
    queryClient.setQueryData(['registrations'], old => [...old, variables]);
  },
  onError: (err, variables, context) => {
    // Mutation failed - revert optimistic update
    queryClient.setQueryData(['registrations'], context.previousData);
    showError('Failed to register. Please try again.');
  }
});
```

### Multiple Tabs (Cross-Tab Sync)

```typescript
// When tab A registers for event:
queryClient.invalidateQueries({queryKey: ['registrations']});

// If tab B is open:
// 1. It sees the invalidation (via broadcast channel)
// 2. Automatically refetches
// 3. Shows updated data
// Both tabs stay in sync!
```

---

## Performance Optimization

### Caching Strategy

```typescript
useRegistrations(eventId) {
  return useQuery({
    queryKey: ['registrations', eventId],
    queryFn: fetchRegistrations,
    staleTime: 60 * 1000,      // 1 min - don't refetch if fresh
    gcTime: 5 * 60 * 1000,     // 5 min - keep in memory
    refetchOnWindowFocus: false, // Don't refetch just because user switched tabs
    refetchOnMount: false,       // If query cached, use it
  });
}
```

**Tradeoff**: Users might see slightly stale data (1 min old) for better performance.

### Request Deduplication

```typescript
// 5 components render RegistrationTable simultaneously
// All call useRegistrations(eventId)
// Result: ONE API call, 5 components share result

// Why?
// React Query sees same queryKey: ['registrations', eventId]
// Automatically dedupes
```

### Virtual Scrolling for Tables

```typescript
// Without virtual scrolling:
// 10,000 rows = 10,000 DOM nodes = slow

// With virtual scrolling:
// Only visible ~20 rows rendered = fast
// Instant scroll, smooth interaction
```

---

## Accessibility (WCAG AAA)

### Keyboard Navigation

```typescript
useKeyboardShortcuts([
  {
    key: 'k',
    ctrlKey: true,
    action: () => setShowSearch(true),
    description: 'Open search'
  }
]);
```

**Shortcuts**:
- `Cmd+K`: Command palette
- `Shift+E`: Export
- `J`/`K`: Navigate
- `Esc`: Close modals
- `?`: Help

### Screen Reader Support

```typescript
<div
  role="region"
  aria-label="System Health Indicators"
  aria-live="polite"
  aria-atomic="true"
>
  CDC Sync: {status}
</div>
```

**When region updates**, screen reader announces: "CDC Sync: synced"

### Focus Management

```typescript
useEffect(() => {
  const cleanup = focusTrap(modalElement, () => setOpen(false));
  return cleanup;
}, [isOpen]);
```

**When modal opens**:
1. Focus moves inside modal
2. Tab cycles within modal
3. Esc closes modal
4. Focus returns to button that opened it

---

## Real-Time Audit Stream (SSE)

### How It Works

```typescript
useAuditStream() {
  useEffect(() => {
    const eventSource = new EventSource('/api/sse/audit');
    
    eventSource.onmessage = (e) => {
      const entry = JSON.parse(e.data);
      setEntries(prev => [entry, ...prev].slice(0, 100));
    };
    
    eventSource.onerror = () => {
      setConnected(false);
      setTimeout(() => reconnect(), 3000);
    };

    return () => eventSource.close();
  }, []);
}
```

### Server Side

```typescript
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      // Send event every 5 seconds (demo)
      const interval = setInterval(() => {
        controller.enqueue(
          `data: ${JSON.stringify(event)}\n\n`
        );
      }, 5000);
    }
  });

  return new Response(stream, {
    headers: {'Content-Type': 'text/event-stream'}
  });
}
```

### What Users See

```
System Activity
├─ 12:34:56 - User registered (guestName)
├─ 12:34:45 - Event capacity updated
├─ 12:34:30 - Admin changed permissions
└─ 12:34:15 - CSV export completed
```

Real-time, no page refresh needed.

---

## Common Patterns

### Pattern 1: Loading State

```typescript
if (isLoading) {
  return <Skeleton count={5} />  // Show skeleton loaders
}

if (error) {
  return <ErrorMessage error={error} />
}

return <RegistrationTable data={data} />
```

### Pattern 2: Optimistic Update

```typescript
const { mutate } = useMutation({
  mutationFn: register,
  onMutate: (newData) => {
    // Show new registration immediately
    queryClient.setQueryData(
      ['registrations'],
      old => [...old, newData]
    );
  },
  onSuccess: () => {
    // Confirmation from server, no action needed (UI already updated)
  },
  onError: (err, newData) => {
    // Revert and show error
    queryClient.invalidateQueries(['registrations']);
  }
});
```

### Pattern 3: Pagination

```typescript
<RegistrationTable data={data} />
<Pagination
  page={page}
  onNextPage={() => setPage(p => p + 1)}
  onPrevPage={() => setPage(p => p - 1)}
  hasMore={data.length === pageSize}
/>
```

---

## Testing Patterns

### Test Caching

```typescript
it('should cache registrations', async () => {
  // First fetch
  const {data: data1} = await useRegistrations(eventId);
  expect(data1.length).toBe(5);

  // Second fetch (should be instant from cache)
  const {data: data2} = await useRegistrations(eventId);
  expect(data2).toEqual(data1);
  // Only 1 API call made
});
```

### Test Real-Time Updates

```typescript
it('should update UI when SSE event arrives', async () => {
  const {getByText} = render(<Dashboard />);

  // Simulate SSE event
  const event = new MessageEvent('message', {
    data: JSON.stringify({action: 'register', userId: '123'})
  });
  eventSource.onmessage(event);

  // Verify UI updated
  await waitFor(() => {
    expect(getByText('user123 registered')).toBeInTheDocument();
  });
});
```

---

## Key Takeaways

1. **React Query handles caching** automatically
2. **SSE provides real-time updates** without overhead
3. **Virtual scrolling scales** to 10k+ rows
4. **Design system ensures consistency** (CSS variables)
5. **Accessibility is built-in** (keyboard, screen readers)
6. **Optimistic updates feel fast** (instant feedback)
7. **Error handling is important** (offline, slow network)
8. **Components are composable** (atoms → composite → pages)

---

## Practice Questions

1. Why do we use React Query instead of useState?
2. What's the difference between staleTime and gcTime?
3. How does virtual scrolling improve performance?
4. Why use SSE instead of polling?
5. What happens if network goes down?
6. How do optimistic updates work?
7. Why are atoms better than large monolithic components?

---

## Related Learning Topics

- Atomic Reservations (the data layer)
- CDC Architecture (analytics pipeline)
- Authorization (who can see what)
- Performance (caching, virtual scrolling)

---

**Next**: Read `docs/PREMIUM_UI_GUIDE.md` for component API details.
