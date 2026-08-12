import "server-only";

interface JobMetrics {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  avgLatencyMs: number;
  avgRowCount: number;
  topErrors: Array<{ error: string; count: number }>;
  timestamp: Date;
}

interface MetricsStore {
  totalQueued: number;
  totalCompleted: number;
  totalFailed: number;
  completionLatencies: number[];
  rowCounts: number[];
  errorCounts: Record<string, number>;
  lastReset: Date;
}

let metricsStore: MetricsStore = {
  totalQueued: 0,
  totalCompleted: 0,
  totalFailed: 0,
  completionLatencies: [],
  rowCounts: [],
  errorCounts: {},
  lastReset: new Date()
};

const MAX_SAMPLES = 1000;

export function recordJobEnqueued(): void {
  metricsStore.totalQueued++;
}

export function recordJobCompleted(latencyMs: number, rowCount: number): void {
  metricsStore.totalCompleted++;

  if (metricsStore.completionLatencies.length >= MAX_SAMPLES) {
    metricsStore.completionLatencies.shift();
  }
  metricsStore.completionLatencies.push(latencyMs);

  if (metricsStore.rowCounts.length >= MAX_SAMPLES) {
    metricsStore.rowCounts.shift();
  }
  metricsStore.rowCounts.push(rowCount);
}

export function recordJobFailed(error: string): void {
  metricsStore.totalFailed++;

  if (!metricsStore.errorCounts[error]) {
    metricsStore.errorCounts[error] = 0;
  }
  metricsStore.errorCounts[error]++;
}

export function getMetrics(): JobMetrics {
  const avgLatencyMs =
    metricsStore.completionLatencies.length > 0
      ? metricsStore.completionLatencies.reduce((a, b) => a + b, 0) /
        metricsStore.completionLatencies.length
      : 0;

  const avgRowCount =
    metricsStore.rowCounts.length > 0
      ? metricsStore.rowCounts.reduce((a, b) => a + b, 0) /
        metricsStore.rowCounts.length
      : 0;

  const topErrors = Object.entries(metricsStore.errorCounts)
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    queued: metricsStore.totalQueued,
    processing: 0,
    completed: metricsStore.totalCompleted,
    failed: metricsStore.totalFailed,
    avgLatencyMs: Math.round(avgLatencyMs * 10) / 10,
    avgRowCount: Math.round(avgRowCount),
    topErrors,
    timestamp: new Date()
  };
}

export function resetMetrics(): void {
  metricsStore = {
    totalQueued: 0,
    totalCompleted: 0,
    totalFailed: 0,
    completionLatencies: [],
    rowCounts: [],
    errorCounts: {},
    lastReset: new Date()
  };
  console.log("[Metrics] Metrics reset");
}

export function getMetricsStore(): MetricsStore {
  return metricsStore;
}

export function setMetricsStore(store: Partial<MetricsStore>): void {
  metricsStore = { ...metricsStore, ...store };
}
