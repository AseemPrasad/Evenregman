import "server-only";

type MetricsData = {
  violations: Record<string, number>;
  violation_identifiers: Map<string, number>;
  latencies: number[];
};

class RateLimitMetricsCollector {
  private data: MetricsData = {
    violations: {},
    violation_identifiers: new Map(),
    latencies: []
  };

  recordViolation(policyName: string, identifier: string, latencyMs: number): void {
    this.data.violations[policyName] = (this.data.violations[policyName] ?? 0) + 1;

    const key = `${policyName}:${identifier}`;
    this.data.violation_identifiers.set(key, (this.data.violation_identifiers.get(key) ?? 0) + 1);

    this.data.latencies.push(latencyMs);
    if (this.data.latencies.length > 1000) {
      this.data.latencies = this.data.latencies.slice(-500);
    }
  }

  recordCheck(latencyMs: number): void {
    this.data.latencies.push(latencyMs);
    if (this.data.latencies.length > 1000) {
      this.data.latencies = this.data.latencies.slice(-500);
    }
  }

  getMetrics() {
    const totalViolations = Object.values(this.data.violations).reduce((a, b) => a + b, 0);
    const avgLatency = this.data.latencies.length > 0
      ? this.data.latencies.reduce((a, b) => a + b, 0) / this.data.latencies.length
      : 0;

    const topViolators = Array.from(this.data.violation_identifiers.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([identifier, count]) => ({ identifier, count }));

    return {
      violations: {
        total: totalViolations,
        by_policy: this.data.violations
      },
      performance: {
        avg_latency_ms: Math.round(avgLatency * 100) / 100,
        latency_samples: this.data.latencies.length
      },
      top_violators: topViolators,
      timestamp: new Date()
    };
  }

  reset(): void {
    this.data = {
      violations: {},
      violation_identifiers: new Map(),
      latencies: []
    };
  }
}

export const rateLimitMetrics = new RateLimitMetricsCollector();
