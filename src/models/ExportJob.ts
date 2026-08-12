import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export const EXPORT_JOB_STATUSES = ["pending", "processing", "completed", "failed"] as const;
export type ExportJobStatus = (typeof EXPORT_JOB_STATUSES)[number];

export interface ExportJob {
  _id: Types.ObjectId;
  jobId: string;
  eventId: Types.ObjectId;
  hostId: Types.ObjectId;
  status: ExportJobStatus;
  s3Key?: string;
  downloadUrl?: string;
  errorMessage?: string;
  rowCount?: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
}

export interface ExportJobModel extends Model<ExportJob> {}

const exportJobSchema = new Schema<ExportJob, ExportJobModel>(
  {
    jobId: {
      type: String,
      required: [true, "Job ID is required"],
      unique: true,
      index: true
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: [true, "Event is required"],
      index: true
    },
    hostId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Host is required"],
      index: true
    },
    status: {
      type: String,
      enum: {
        values: EXPORT_JOB_STATUSES,
        message: "Status must be one of: pending, processing, completed, failed"
      },
      default: "pending",
      index: true
    },
    s3Key: {
      type: String,
      sparse: true
    },
    downloadUrl: {
      type: String,
      sparse: true
    },
    errorMessage: {
      type: String,
      sparse: true
    },
    rowCount: {
      type: Number,
      default: 0
    },
    startedAt: {
      type: Date,
      sparse: true
    },
    completedAt: {
      type: Date,
      sparse: true
    },
    expiresAt: {
      type: Date,
      sparse: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false
  }
);

exportJobSchema.index({ eventId: 1, createdAt: -1 });
exportJobSchema.index({ hostId: 1, createdAt: -1 });
exportJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ExportJobModel: ExportJobModel = models.ExportJob || model<ExportJob, ExportJobModel>("ExportJob", exportJobSchema);
