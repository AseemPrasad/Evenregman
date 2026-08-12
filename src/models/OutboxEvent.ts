import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export const OUTBOX_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const OUTBOX_AGGREGATE_TYPES = ["EVENT", "REGISTRATION", "USER"] as const;
export type OutboxAggregateType = (typeof OUTBOX_AGGREGATE_TYPES)[number];

export interface OutboxEvent {
  _id: Types.ObjectId;
  aggregateType: OutboxAggregateType;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  retryCount: number;
  scheduledAt: Date;
  processedAt?: Date | null;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OutboxEventModel extends Model<OutboxEvent> {}

const outboxEventSchema = new Schema<OutboxEvent, OutboxEventModel>(
  {
    aggregateType: {
      type: String,
      required: [true, "Aggregate type is required"],
      enum: {
        values: OUTBOX_AGGREGATE_TYPES,
        message: "Aggregate type must be EVENT, REGISTRATION, or USER"
      },
      index: true
    },
    aggregateId: {
      type: String,
      required: [true, "Aggregate ID is required"],
      trim: true,
      index: true
    },
    eventType: {
      type: String,
      required: [true, "Event type is required"],
      trim: true,
      maxlength: [100, "Event type must be at most 100 characters"]
    },
    payload: {
      type: Schema.Types.Mixed,
      required: [true, "Payload is required"],
      default: {}
    },
    status: {
      type: String,
      required: [true, "Status is required"],
      enum: {
        values: OUTBOX_STATUSES,
        message: "Status must be PENDING, PROCESSING, COMPLETED, or FAILED"
      },
      default: "PENDING",
      index: true
    },
    retryCount: {
      type: Number,
      required: [true, "Retry count is required"],
      default: 0,
      min: [0, "Retry count cannot be negative"],
      validate: {
        validator(value: number) {
          return Number.isInteger(value);
        },
        message: "Retry count must be an integer"
      }
    },
    scheduledAt: {
      type: Date,
      required: [true, "Scheduled at is required"],
      default: () => new Date(),
      index: true
    },
    processedAt: {
      type: Date,
      default: null
    },
    error: {
      type: String,
      default: null,
      maxlength: [1000, "Error message must be at most 1000 characters"]
    }
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: false,
    toJSON: {
      virtuals: true,
      transform(_document, returned) {
        const { _id, ...rest } = returned as { _id: Types.ObjectId; [key: string]: unknown };
        return { ...rest, id: _id.toString() };
      }
    },
    toObject: {
      virtuals: true,
      transform(_document, returned) {
        const { _id, ...rest } = returned as { _id: Types.ObjectId; [key: string]: unknown };
        return { ...rest, id: _id.toString() };
      }
    }
  }
);

outboxEventSchema.index({ status: 1, scheduledAt: 1 });
outboxEventSchema.index({ aggregateType: 1, aggregateId: 1 });

outboxEventSchema.pre("validate", function normalizeOutboxFields(next) {
  if (typeof this.eventType === "string") {
    this.eventType = this.eventType.trim();
  }

  if (typeof this.aggregateId === "string") {
    this.aggregateId = this.aggregateId.trim();
  }

  next();
});

export const OutboxEventModel = models.OutboxEvent || model<OutboxEvent, OutboxEventModel>("OutboxEvent", outboxEventSchema);
