import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export const MEMBERSHIP_ROLES = ["OWNER", "ADMIN", "EVENT_MANAGER", "VIEWER"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export interface Membership {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  orgId: Types.ObjectId;
  role: MembershipRole;
  permissions?: Record<string, boolean>;
  isActive: boolean;
  joinedAt: Date;
  invitedBy?: Types.ObjectId;
  invitedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MembershipModel extends Model<Membership> {
  findUserMembership(userId: Types.ObjectId, orgId: Types.ObjectId): Promise<Membership | null>;
  findUserOrgs(userId: Types.ObjectId, activeOnly?: boolean): Promise<Membership[]>;
}

const membershipSchema = new Schema<Membership, MembershipModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true
    },
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization is required"],
      index: true
    },
    role: {
      type: String,
      enum: {
        values: MEMBERSHIP_ROLES,
        message: "Role must be OWNER, ADMIN, EVENT_MANAGER, or VIEWER"
      },
      default: "VIEWER",
      index: true
    },
    permissions: {
      type: Schema.Types.Mixed,
      default: {}
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    joinedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      sparse: true
    },
    invitedAt: {
      type: Date,
      sparse: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

membershipSchema.index({ userId: 1, orgId: 1 }, { unique: true });
membershipSchema.index({ userId: 1, isActive: 1 });
membershipSchema.index({ orgId: 1, role: 1 });

membershipSchema.static("findUserMembership", async function (userId: Types.ObjectId, orgId: Types.ObjectId) {
  return this.findOne({ userId, orgId, isActive: true });
});

membershipSchema.static("findUserOrgs", async function (userId: Types.ObjectId, activeOnly: boolean = true) {
  const query: any = { userId };
  if (activeOnly) {
    query.isActive = true;
  }
  return this.find(query).sort({ joinedAt: -1 });
});

export const MembershipModel: MembershipModel =
  models.Membership || model<Membership, MembershipModel>("Membership", membershipSchema);
