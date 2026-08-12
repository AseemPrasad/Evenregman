import mongoose, { Schema, Document } from 'mongoose';

export interface AnalyticsMetric {
  count: number;
  sum?: number;
  avg?: number;
  min?: number;
  max?: number;
  p50?: number;
  p95?: number;
  p99?: number;
}

export interface AnalyticsDimensions {
  eventId?: string;
  hostId?: string;
  region?: string;
  category?: string;
  source?: string;
  status?: string;
  [key: string]: any;
}

export interface AnalyticsTimeSeriesDoc extends Document {
  _id: mongoose.Types.ObjectId;
  eventType: 'registration' | 'checkin' | 'sale' | 'refund' | string;
  timestamp: Date;
  hourBucket: string;
  metrics: AnalyticsMetric;
  dimensions: AnalyticsDimensions;
  value: number;
  processed: boolean;
  sourceChangeStreamToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const analyticsTimeSeriesSchema = new Schema<AnalyticsTimeSeriesDoc>(
  {
    eventType: {
      type: String,
      required: true,
      index: true,
      enum: ['registration', 'checkin', 'sale', 'refund'],
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    hourBucket: {
      type: String,
      required: true,
      index: true,
      description: 'ISO 8601 hour bucket (e.g., 2024-01-15T14:00:00Z)',
    },
    metrics: {
      type: Schema.Types.Mixed,
      default: {},
      description: 'Aggregated metrics: count, sum, avg, min, max, percentiles',
    },
    dimensions: {
      type: Schema.Types.Mixed,
      default: {},
      description: 'Dimensional breakdown: eventId, hostId, region, category, etc.',
    },
    value: {
      type: Number,
      default: 0,
    },
    processed: {
      type: Boolean,
      default: false,
      index: true,
      description: 'Flag for batch processing identification',
    },
    sourceChangeStreamToken: {
      type: String,
      description: 'MongoDB change stream token for idempotent processing',
    },
  },
  {
    timestamps: true,
    collection: 'analytics_timeseries',
  },
);

// Compound index for efficient range queries
analyticsTimeSeriesSchema.index(
  { eventType: 1, timestamp: 1, 'dimensions.eventId': 1 },
  { sparse: true },
);

// Index for dashboard aggregations
analyticsTimeSeriesSchema.index(
  { eventType: 1, hourBucket: 1, 'dimensions.hostId': 1 },
  { sparse: true },
);

// TTL index: auto-delete after 90 days
analyticsTimeSeriesSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

// Sparse indexes on optional dimensions
analyticsTimeSeriesSchema.index({ 'dimensions.region': 1 }, { sparse: true });
analyticsTimeSeriesSchema.index({ 'dimensions.hostId': 1 }, { sparse: true });
analyticsTimeSeriesSchema.index({ 'dimensions.category': 1 }, { sparse: true });

export const AnalyticsTimeSeriesModel =
  mongoose.models.AnalyticsTimeSeries ||
  mongoose.model<AnalyticsTimeSeriesDoc>('AnalyticsTimeSeries', analyticsTimeSeriesSchema);

export async function ensureAnalyticsIndexes(): Promise<void> {
  try {
    await AnalyticsTimeSeriesModel.collection.createIndexes();
    console.log('[Analytics] Indexes created successfully');
  } catch (err) {
    console.error('[Analytics] Error creating indexes:', err);
  }
}
