import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export const EVENT_STATUSES = ["OPEN", "FULL", "CLOSED", "DELETED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface Event {
  _id: Types.ObjectId;
  hostId: Types.ObjectId;
  title: string;
  slug: string;
  description: string;
  date: Date;
  time: string;
  location: string;
  capacity: number;
  attendeeCount: number;
  registrationCutoff: Date;
  status: EventStatus;
  closedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventModel extends Model<Event> {}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const eventSchema = new Schema<Event, EventModel>(
  {
    hostId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Host is required"],
      index: true
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [200, "Title must be at most 200 characters"]
    },
    slug: {
      type: String,
      required: [true, "Slug is required"],
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
      maxlength: [240, "Slug must be at most 240 characters"],
      validate: {
        validator(value: string) {
          return slugPattern.test(value);
        },
        message: "Slug must contain only lowercase letters, numbers, and hyphens"
      }
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [5000, "Description must be at most 5000 characters"]
    },
    date: {
      type: Date,
      required: [true, "Date is required"]
    },
    time: {
      type: String,
      required: [true, "Time is required"],
      trim: true,
      validate: {
        validator(value: string) {
          return timePattern.test(value);
        },
        message: "Time must use 24-hour HH:mm format"
      }
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
      maxlength: [300, "Location must be at most 300 characters"]
    },
    capacity: {
      type: Number,
      required: [true, "Capacity is required"],
      min: [1, "Capacity must be at least 1"],
      validate: {
        validator(value: number) {
          return Number.isInteger(value);
        },
        message: "Capacity must be an integer"
      }
    },
    attendeeCount: {
      type: Number,
      required: [true, "Attendee count is required"],
      default: 0,
      min: [0, "Attendee count cannot be negative"],
      validate: {
        validator(this: Event, value: number) {
          return Number.isInteger(value) && value <= this.capacity;
        },
        message: "Attendee count cannot exceed capacity"
      }
    },
    registrationCutoff: {
      type: Date,
      required: [true, "Registration cutoff is required"]
    },
    status: {
      type: String,
      required: [true, "Status is required"],
      enum: {
        values: EVENT_STATUSES,
        message: "Status must be OPEN, FULL, CLOSED, or DELETED"
      },
      default: "OPEN"
    },
    closedAt: {
      type: Date,
      default: null
    },
    deletedAt: {
      type: Date,
      default: null
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

eventSchema.index({ slug: 1 }, { unique: true });
eventSchema.index({ hostId: 1 });
eventSchema.index({ status: 1 });
eventSchema.index({ date: 1 });

eventSchema.pre("validate", function normalizeEventFields(next) {
  if (typeof this.slug === "string") {
    this.slug = this.slug.trim().toLowerCase();
  }

  if (typeof this.title === "string") {
    this.title = this.title.trim();
  }

  if (typeof this.description === "string") {
    this.description = this.description.trim();
  }

  if (typeof this.location === "string") {
    this.location = this.location.trim();
  }

  if (this.status === "FULL" && this.attendeeCount !== this.capacity) {
    next(new Error("FULL events must have attendeeCount equal to capacity"));
    return;
  }

  if (this.status === "CLOSED" && !this.closedAt) {
    next(new Error("CLOSED events must have closedAt set"));
    return;
  }

  if (this.status === "DELETED" && !this.deletedAt) {
    next(new Error("DELETED events must have deletedAt set"));
    return;
  }

  if (this.status === "OPEN" && (this.closedAt || this.deletedAt)) {
    next(new Error("OPEN events cannot have closedAt or deletedAt set"));
    return;
  }

  if (this.status === "CLOSED" && this.deletedAt) {
    next(new Error("CLOSED events cannot have deletedAt set"));
    return;
  }

  next();
});

export const EventModel = models.Event || model<Event, EventModel>("Event", eventSchema);
