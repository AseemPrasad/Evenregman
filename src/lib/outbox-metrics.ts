import "server-only";

type MetricsData = {
  events_published: Record<string, number>;
  events_processed: Record<string, number>;
  events_failed: Record<string, number>;
  event_latencies: number[];
  pending_count: number;
  failed_count: number;
};

class OutboxMetricsCollector {
  private data: MetricsData = {
    events_published: {},
    events_processed: {},
    events_failed: {},
    event_latencies: [],
    pending_count: 0,
    failed_count: 0
  };

  recordEventPublished(eventType: string): void {
    this.data.events_published[eventType] = (this.data.events_published[eventType] ?? 0) + 1;
  }

  recordEventProcessed(eventType: string, latencyMs: number): void {
    this.data.events_processed[eventType] = (this.data.events_processed[eventType] ?? 0) + 1;
    this.data.event_latencies.push(latencyMs);
    if (this.data.event_latencies.length > 1000) {
      this.data.event_latencies = this.data.event_latencies.slice(-500);
    }
  }

  recordEventFailed(eventType: string): void {
    this.data.events_failed[eventType] = (this.data.events_failed[eventType] ?? 0) + 1;
  }

  setPendingCount(count: number): void {
    this.data.pending_count = count;
  }

  setFailedCount(count: number): void {
    this.data.failed_count = count;
  }

  getMetrics() {
    const avgLatency = this.data.event_latencies.length > 0
      ? this.data.event_latencies.reduce((a, b) => a + b, 0) / this.data.event_latencies.length
      : 0;

    const publishedTotal = Object.values(this.data.events_published).reduce((a, b) => a + b, 0);
    const processedTotal = Object.values(this.data.events_processed).reduce((a, b) => a + b, 0);
    const failedTotal = Object.values(this.data.events_failed).reduce((a, b) => a + b, 0);

    return {
      published: {
        total: publishedTotal,
        byEventType: this.data.events_published
      },
      processed: {
        total: processedTotal,
        byEventType: this.data.events_processed,
        avgLatencyMs: Math.round(avgLatency * 100) / 100
      },
      failed: {
        total: failedTotal,
        byEventType: this.data.events_failed
      },
      queue: {
        pending: this.data.pending_count,
        failed: this.data.failed_count
      },
      timestamp: new Date()
    };
  }

  reset(): void {
    this.data = {
      events_published: {},
      events_processed: {},
      events_failed: {},
      event_latencies: [],
      pending_count: 0,
      failed_count: 0
    };
  }
}

export const outboxMetrics = new OutboxMetricsCollector();
