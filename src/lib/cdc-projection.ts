import { AnalyticsTimeSeriesModel, AnalyticsTimeSeriesDoc } from "@/models/AnalyticsTimeSeries";
import { env } from "./env";

export interface ProjectionConfig {
  eventType: string;
  dimensions?: string[];
  metricFields?: string[];
}

export interface CDCChangeEvent {
  operationType: "insert" | "update" | "replace" | "delete";
  fullDocument?: Record<string, any>;
  documentKey?: Record<string, any>;
  updateDescription?: {
    updatedFields: Record<string, any>;
    removedFields: string[];
  };
  resumeToken?: any;
}

class CDCProjectionEngine {
  private configs: Map<string, ProjectionConfig> = new Map();

  registerProjection(config: ProjectionConfig): void {
    this.configs.set(config.eventType, config);
    console.log(`[Projection] Registered projection for eventType: ${config.eventType}`);
  }

  async projectEvent(event: CDCChangeEvent, collectionName: string): Promise<void> {
    const config = this.getConfigForCollection(collectionName);

    if (!config) {
      console.warn(`[Projection] No projection config for ${collectionName}, skipping`);
      return;
    }

    try {
      switch (event.operationType) {
        case "insert":
        case "replace":
          await this.projectInsertOrReplace(event, config);
          break;

        case "update":
          await this.projectUpdate(event, config);
          break;

        case "delete":
          await this.projectDelete(event, config);
          break;

        default:
          console.warn(`[Projection] Unknown operation type: ${event.operationType}`);
      }
    } catch (err) {
      console.error(`[Projection] Error projecting event:`, err);
      throw err;
    }
  }

  private async projectInsertOrReplace(
    event: CDCChangeEvent,
    config: ProjectionConfig,
  ): Promise<void> {
    if (!event.fullDocument) {
      return;
    }

    const doc = event.fullDocument;
    const now = new Date();
    const hourBucket = this.getHourBucket(now);

    const analyticsDoc = {
      eventType: config.eventType,
      timestamp: now,
      hourBucket,
      metrics: this.extractMetrics(doc, config.metricFields),
      dimensions: this.extractDimensions(doc, config.dimensions),
      value: this.extractValue(doc),
      processed: false,
      sourceChangeStreamToken: event.resumeToken,
      createdAt: now,
      updatedAt: now,
    };

    await AnalyticsTimeSeriesModel.updateOne(
      { hourBucket, eventType: config.eventType, "dimensions._id": doc._id },
      { $set: analyticsDoc },
      { upsert: true },
    );
  }

  private async projectUpdate(event: CDCChangeEvent, config: ProjectionConfig): Promise<void> {
    if (!event.fullDocument) {
      return;
    }

    const doc = event.fullDocument;
    const now = new Date();
    const hourBucket = this.getHourBucket(now);

    const update = {
      $set: {
        metrics: this.extractMetrics(doc, config.metricFields),
        dimensions: this.extractDimensions(doc, config.dimensions),
        value: this.extractValue(doc),
        updatedAt: now,
      },
    };

    await AnalyticsTimeSeriesModel.updateOne(
      { hourBucket, eventType: config.eventType, "dimensions._id": doc._id },
      update,
      { upsert: true },
    );
  }

  private async projectDelete(event: CDCChangeEvent, config: ProjectionConfig): Promise<void> {
    if (!event.documentKey) {
      return;
    }

    const now = new Date();
    const hourBucket = this.getHourBucket(now);

    await AnalyticsTimeSeriesModel.deleteOne({
      hourBucket,
      eventType: config.eventType,
      "dimensions._id": event.documentKey._id,
    });
  }

  private extractMetrics(doc: Record<string, any>, fields?: string[]): Record<string, any> {
    if (!fields) {
      return { count: 1 };
    }

    const metrics: Record<string, any> = { count: 1 };

    for (const field of fields) {
      const value = this.getNestedValue(doc, field);
      if (value !== undefined && value !== null) {
        metrics[field] = value;
      }
    }

    return metrics;
  }

  private extractDimensions(doc: Record<string, any>, fields?: string[]): Record<string, any> {
    const dimensions: Record<string, any> = { _id: doc._id };

    const defaultDimensions = ["eventId", "hostId", "region", "category", "source", "status"];
    const fieldsToExtract = fields || defaultDimensions;

    for (const field of fieldsToExtract) {
      const value = this.getNestedValue(doc, field);
      if (value !== undefined && value !== null) {
        dimensions[field] = value;
      }
    }

    return dimensions;
  }

  private extractValue(doc: Record<string, any>): number {
    return doc.value || 1;
  }

  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split(".").reduce((current, prop) => current?.[prop], obj);
  }

  private getHourBucket(date: Date): string {
    const copy = new Date(date);
    copy.setMinutes(0, 0, 0);
    return copy.toISOString();
  }

  private getConfigForCollection(collectionName: string): ProjectionConfig | undefined {
    for (const [, config] of this.configs) {
      if (collectionName.includes(config.eventType.toLowerCase())) {
        return config;
      }
    }
    return undefined;
  }

  getProjectionConfigs(): ProjectionConfig[] {
    return Array.from(this.configs.values());
  }
}

export const cdcProjectionEngine = new CDCProjectionEngine();

// Register default projections
export function registerDefaultProjections(): void {
  cdcProjectionEngine.registerProjection({
    eventType: "registration",
    dimensions: ["eventId", "hostId", "region", "category", "source"],
    metricFields: ["registrationFee", "processingTime"],
  });

  cdcProjectionEngine.registerProjection({
    eventType: "checkin",
    dimensions: ["eventId", "hostId", "region", "status"],
    metricFields: ["checkInTime"],
  });

  cdcProjectionEngine.registerProjection({
    eventType: "sale",
    dimensions: ["eventId", "hostId", "category"],
    metricFields: ["amount", "quantity"],
  });
}
