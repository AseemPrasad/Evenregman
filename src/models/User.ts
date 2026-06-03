import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export const USER_ROLES = ["HOST", "ATTENDEE"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface User {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserModel extends Model<User> {}

const bcryptHashPattern = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const userSchema = new Schema<User, UserModel>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name must be at most 100 characters"]
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
      maxlength: [254, "Email must be at most 254 characters"],
      validate: {
        validator(value: string) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        },
        message: "Email must be a valid email address"
      }
    },
    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
      minlength: [60, "Password hash must be a bcrypt hash"],
      maxlength: [60, "Password hash must be a bcrypt hash"],
      validate: {
        validator(value: string) {
          return bcryptHashPattern.test(value);
        },
        message: "Password hash must be a valid bcryptjs hash"
      }
    },
    role: {
      type: String,
      required: [true, "Role is required"],
      enum: {
        values: USER_ROLES,
        message: "Role must be HOST or ATTENDEE"
      }
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

userSchema.pre("validate", function normalizeUserFields(next) {
  if (typeof this.email === "string") {
    this.email = this.email.trim().toLowerCase();
  }

  if (typeof this.name === "string") {
    this.name = this.name.trim();
  }

  next();
});

export const UserModel = models.User || model<User, UserModel>("User", userSchema);
