import "server-only";

import { canUserPerformAction, getUserMembership, getUserOrganizations } from "@/lib/permissions";
import { logAuditEventAsync } from "@/lib/audit-logger";
import { env } from "@/lib/env";
import { EventModel } from "@/models/Event";
import type { Types } from "mongoose";

export async function assertEventOwnershipRBAC(
  eventId: Types.ObjectId | string,
  userId: Types.ObjectId | string
): Promise<void> {
  const event = await EventModel.findById(eventId);

  if (!event) {
    throw new Error("Event not found");
  }

  if (env.ENABLE_RBAC_ENGINE === "true") {
    const membership = await getUserMembership(userId, event.orgId);

    if (!membership) {
      const eventRecord = await EventModel.findById(eventId);
      const isLegacyOwner = eventRecord?.hostId.toString() === userId.toString();

      if (!isLegacyOwner) {
        await logAuditEventAsync({
          actorId: userId,
          action: "PERMISSION_DENIED",
          targetType: "Event",
          targetId: eventId.toString(),
          targetOrgId: event.orgId,
          context: { reason: "User not member of organization" }
        });

        throw new Error("Forbidden: User is not a member of the organization");
      }
    } else if (!membership.isActive) {
      await logAuditEventAsync({
        actorId: userId,
        action: "PERMISSION_DENIED",
        targetType: "Event",
        targetId: eventId.toString(),
        targetOrgId: event.orgId,
        context: { reason: "Membership is inactive" }
      });

      throw new Error("Forbidden: User membership is inactive");
    }

    const result = await canUserPerformAction(userId, "edit_event", event, {
      orgId: event.orgId
    });

    if (!result.allowed) {
      await logAuditEventAsync({
        actorId: userId,
        action: "PERMISSION_DENIED",
        targetType: "Event",
        targetId: eventId.toString(),
        targetOrgId: event.orgId,
        context: { reason: result.reason }
      });

      throw new Error(`Forbidden: ${result.reason}`);
    }
  } else {
    if (event.hostId.toString() !== userId.toString()) {
      throw new Error("Event does not belong to user");
    }
  }
}

export async function getUserActiveOrg(userId: Types.ObjectId | string) {
  try {
    const orgs = await getUserOrganizations(userId);

    if (orgs.length === 0) {
      return null;
    }

    return orgs[0];
  } catch (err) {
    console.error("[PermissionAdapter] Error getting user active org:", err);
    return null;
  }
}

export async function ensureUserDefaultOrg(userId: Types.ObjectId | string) {
  if (env.ENABLE_RBAC_ENGINE !== "true") {
    return null;
  }

  try {
    const orgs = await getUserOrganizations(userId);

    if (orgs.length > 0) {
      return orgs[0];
    }

    console.log("[PermissionAdapter] No default org found for user, needs bootstrap");
    return null;
  } catch (err) {
    console.error("[PermissionAdapter] Error ensuring default org:", err);
    return null;
  }
}
