import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export const REGISTRATION_STATUSES = ["ACTIVE", "CANCELLED"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export interface Registration {
  _id: Types.ObjectId;
  attendeeId: Types.ObjectId;
  eventId: Types.ObjectId;
  status: RegistrationStatus;
  registeredAt: Date;
  cancelledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegistrationModel extends Model<Registration> {}

const registrationSchema = new Schema<Registration, RegistrationModel>(
  {
    attendeeId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Attendee is required"],
      index: true
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: [true, "Event is required"],
      index: true
    },
    status: {
      type: String,
      required: [true, "Status is required"],
      enum: {
        values: REGISTRATION_STATUSES,
        message: "Status must be ACTIVE or CANCELLED"
      },
      default: "ACTIVE"
    },
    registeredAt: {
      type: Date,
      required: [true, "Registered at is required"],
      default: Date.now
    },
    cancelledAt: {
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

registrationSchema.index({ eventId: 1, attendeeId: 1 }, { unique: true });

registrationSchema.pre("validate", function normalizeRegistrationFields(next) {
  if (this.status === "ACTIVE" && this.cancelledAt) {
    next(new Error("ACTIVE registrations cannot have cancelledAt set"));
    return;
  }

  if (this.status === "CANCELLED" && !this.cancelledAt) {
    next(new Error("CANCELLED registrations must have cancelledAt set"));
    return;
  }

  next();
});

export const RegistrationModel =
  models.Registration || model<Registration, RegistrationModel>("Registration", registrationSchema);
