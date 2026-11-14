import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export const USAGE_METRIC_TYPES = [
  "LEASE_MINUTES",
  "SLOT_HOURS",
  "COMPUTE_DOLLARS",
  "API_CALLS"
] as const;

export type UsageMetricType = (typeof USAGE_METRIC_TYPES)[number];

export interface UsageRecord {
  _id: Types.ObjectId;
  orgId?: Types.ObjectId;
  userId?: Types.ObjectId;
  resourceId?: Types.ObjectId;
  metric: UsageMetricType;
  quantity: number;
  metadata?: Record<string, unknown>;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageRecordModel extends Model<UsageRecord> {}

const usageRecordSchema = new Schema<UsageRecord, UsageRecordModel>(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      index: true
    },
    metric: {
      type: String,
      required: true,
      enum: USAGE_METRIC_TYPES,
      index: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: () => ({})
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

usageRecordSchema.index({ orgId: 1, metric: 1, timestamp: -1 });

export const UsageRecordModel: UsageRecordModel =
  (models.UsageRecord as UsageRecordModel) ||
  model<UsageRecord, UsageRecordModel>("UsageRecord", usageRecordSchema);

