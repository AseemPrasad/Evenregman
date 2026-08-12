import { AnalyticsTimeSeriesModel } from "@/models/AnalyticsTimeSeries";
import { resumeTokenManager } from "./cdc-resume-token";
import { env } from "./env";

export interface CDCMetrics {
  isEnabled: boolean;
  isRunning: boolean;
  eventsProcessed: number;
  eventsPerMinute: number;
  errorCount: number;
  lastProcessedAt?: Date;
  averageLatencyMs: number;
  resumeTokenAge?: string;
  analyticsCollectionSize: number;
  batchSize: number;
  batchIntervalMs: number;
}

export interface CDCHealthReport {
  timestamp: Date;
  enabled: boolean;
  healthy: boolean;
  issues: string[];
  metrics: CDCMetrics;
  analytics: {
    registrationCount: number;
    checkinCount: number;
    saleCount: number;
    totalDocuments: number;
  };
}

class CDCMetricsCollector {
  private startTime: Date = new Date();
  private eventsProcessed = 0;
  private errors = 0;
  private latencies: number[] = [];
  private lastProcessedAt?: Date;

  recordEventProcessed(latencyMs: number): void {
    this.eventsProcessed++;
    this.latencies.push(latencyMs);
    this.lastProcessedAt = new Date();

    if (this.latencies.length > 1000) {
      this.latencies.shift();
    }
  }

  recordError(): void {
    this.errors++;
  }

  async getMetrics(): Promise<CDCMetrics> {
    const uptime = (Date.now() - this.startTime.getTime()) / 1000;
    const eventsPerMinute = (this.eventsProcessed / uptime) * 60;
    const averageLatency = this.latencies.length > 0
      ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
      : 0;

    const analyticsCount = await AnalyticsTimeSeriesModel.countDocuments();

    return {
      isEnabled: env.ENABLE_CDC_PIPELINE === true,
      isRunning: env.CDC_PIPELINE_WORKER_ENABLED === true,
      eventsProcessed: this.eventsProcessed,
      eventsPerMinute: Math.round(eventsPerMinute * 100) / 100,
      errorCount: this.errors,
      lastProcessedAt: this.lastProcessedAt,
      averageLatencyMs: Math.round(averageLatency * 100) / 100,
      resumeTokenAge: resumeTokenManager.getMaxTokenAge(),
      analyticsCollectionSize: analyticsCount,
      batchSize: parseInt(env.CDC_BATCH_SIZE || "100"),
      batchIntervalMs: parseInt(env.CDC_BATCH_INTERVAL_MS || "5000"),
    };
  }

  async getHealthReport(): Promise<CDCHealthReport> {
    const metrics = await this.getMetrics();
    const issues: string[] = [];

    if (!metrics.isEnabled) {
      issues.push("CDC pipeline is disabled");
    }

    if (!metrics.isRunning) {
      issues.push("CDC worker is not running");
    }

    if (metrics.errorCount > 10) {
      issues.push(`High error rate: ${metrics.errorCount} errors`);
    }

    if (metrics.averageLatencyMs > 500) {
      issues.push(`High latency: ${metrics.averageLatencyMs}ms average`);
    }

    if (metrics.eventsPerMinute === 0 && metrics.isRunning && metrics.eventsProcessed === 0) {
      issues.push("No events processed yet");
    }

    // Get analytics stats
    const [registrations, checkins, sales] = await Promise.all([
      AnalyticsTimeSeriesModel.countDocuments({ eventType: "registration" }),
      AnalyticsTimeSeriesModel.countDocuments({ eventType: "checkin" }),
      AnalyticsTimeSeriesModel.countDocuments({ eventType: "sale" }),
    ]);

    return {
      timestamp: new Date(),
      enabled: metrics.isEnabled,
      healthy: issues.length === 0,
      issues,
      metrics,
      analytics: {
        registrationCount: registrations,
        checkinCount: checkins,
        saleCount: sales,
        totalDocuments: metrics.analyticsCollectionSize,
      },
    };
  }

  resetMetrics(): void {
    this.startTime = new Date();
    this.eventsProcessed = 0;
    this.errors = 0;
    this.latencies = [];
    this.lastProcessedAt = undefined;
  }

  async checkHealthAlerts(): Promise<string[]> {
    const alerts: string[] = [];
    const report = await this.getHealthReport();

    // Add all issues as alerts
    alerts.push(...report.issues);

    // Check for warning conditions
    if (report.metrics.isRunning && report.metrics.eventsPerMinute === 0) {
      alerts.push("WARNING: CDC worker running but processing no events");
    }

    if (report.metrics.isRunning && report.metrics.lastProcessedAt) {
      const timeSinceLastEvent =
        (Date.now() - report.metrics.lastProcessedAt.getTime()) / 1000;
      if (timeSinceLastEvent > 300) {
        alerts.push(`WARNING: No events processed in ${Math.round(timeSinceLastEvent)}s`);
      }
    }

    return alerts;
  }
}

export const cdcMetricsCollector = new CDCMetricsCollector();

export async function getCDCMetricsEndpoint(): Promise<CDCHealthReport> {
  return cdcMetricsCollector.getHealthReport();
}

export async function getCDCAlerts(): Promise<string[]> {
  return cdcMetricsCollector.checkHealthAlerts();
}
