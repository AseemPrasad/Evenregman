import "server-only";

import { assertEventOwnershipRBAC } from "@/lib/permission-adapter";
import { assertEventOwnership as legacyAssertEventOwnership } from "@/lib/ownership";
import { env } from "@/lib/env";
import type { Types } from "mongoose";

export async function assertUserCanEditEvent(
  eventId: Types.ObjectId | string,
  userId: Types.ObjectId | string
): Promise<void> {
  if (env.ENABLE_RBAC_ENGINE === "true") {
    await assertEventOwnershipRBAC(eventId, userId);
  } else {
    await legacyAssertEventOwnership(eventId, userId);
  }
}

export async function assertUserCanDeleteEvent(
  eventId: Types.ObjectId | string,
  userId: Types.ObjectId | string
): Promise<void> {
  if (env.ENABLE_RBAC_ENGINE === "true") {
    const { EventModel } = await import("@/models/Event");
    const event = await EventModel.findById(eventId);

    if (!event) {
      throw new Error("Event not found");
    }

    if (event.status === "ARCHIVED") {
      throw new Error("Cannot delete archived event");
    }

    await assertEventOwnershipRBAC(eventId, userId);
  } else {
    await legacyAssertEventOwnership(eventId, userId);
  }
}

export async function assertUserCanViewEvent(
  eventId: Types.ObjectId | string,
  userId: Types.ObjectId | string
): Promise<void> {
  if (env.ENABLE_RBAC_ENGINE === "true") {
    await assertEventOwnershipRBAC(eventId, userId);
  } else {
    await legacyAssertEventOwnership(eventId, userId);
  }
}

export async function assertUserCanInviteMember(
  orgId: Types.ObjectId | string,
  userId: Types.ObjectId | string
): Promise<void> {
  if (env.ENABLE_RBAC_ENGINE === "true") {
    const { getUserMembership } = await import("@/lib/permissions");
    const membership = await getUserMembership(userId, orgId);

    if (!membership) {
      throw new Error("User is not a member of the organization");
    }

    const { PERMISSION_MATRIX } = await import("@/lib/permissions");
    const canInvite = PERMISSION_MATRIX[membership.role]?.invite_member;

    if (!canInvite) {
      throw new Error("User does not have permission to invite members");
    }
  }
}

export async function assertUserCanViewAuditLog(
  orgId: Types.ObjectId | string,
  userId: Types.ObjectId | string
): Promise<void> {
  if (env.ENABLE_RBAC_ENGINE === "true") {
    const { getUserMembership } = await import("@/lib/permissions");
    const membership = await getUserMembership(userId, orgId);

    if (!membership) {
      throw new Error("User is not a member of the organization");
    }

    const { PERMISSION_MATRIX } = await import("@/lib/permissions");
    const canView = PERMISSION_MATRIX[membership.role]?.view_audit_log;

    if (!canView) {
      throw new Error("User does not have permission to view audit logs");
    }
  }
}

export async function assertUserCanManageOrganization(
  orgId: Types.ObjectId | string,
  userId: Types.ObjectId | string
): Promise<void> {
  if (env.ENABLE_RBAC_ENGINE === "true") {
    const { getUserMembership } = await import("@/lib/permissions");
    const membership = await getUserMembership(userId, orgId);

    if (!membership) {
      throw new Error("User is not a member of the organization");
    }

    if (membership.role !== "OWNER") {
      throw new Error("Only organization owners can manage organization settings");
    }
  }
}
