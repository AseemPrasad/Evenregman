import "server-only";

import { connectToDatabase } from "@/lib/db";
import { OrganizationModel } from "@/models/Organization";
import { MembershipModel } from "@/models/Membership";
import { UserModel } from "@/models/User";
import { env } from "@/lib/env";
import type { Types } from "mongoose";

export async function createPersonalOrganization(
  userId: Types.ObjectId | string,
  userName?: string
): Promise<any> {
  if (env.ENABLE_RBAC_ENGINE !== "true") {
    return null;
  }

  try {
    await connectToDatabase();

    const user = await UserModel.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const slug = `${user.name?.toLowerCase().replace(/\s+/g, "-") || `user-${userId}`}-${Date.now().toString(36)}`;

    const org = await OrganizationModel.create({
      name: `${user.name || "User"}'s Workspace`,
      slug,
      tier: "STARTER",
      ownerId: userId,
      isActive: true
    });

    console.log(`[OrgBootstrap] Created organization ${org._id} for user ${userId}`);

    return org;
  } catch (err) {
    console.error("[OrgBootstrap] Error creating personal org:", err);
    throw err;
  }
}

export async function createMembership(
  userId: Types.ObjectId | string,
  orgId: Types.ObjectId | string,
  role: "OWNER" | "ADMIN" | "EVENT_MANAGER" | "VIEWER" = "OWNER"
): Promise<any> {
  if (env.ENABLE_RBAC_ENGINE !== "true") {
    return null;
  }

  try {
    await connectToDatabase();

    const membership = await MembershipModel.create({
      userId,
      orgId,
      role,
      isActive: true,
      joinedAt: new Date()
    });

    console.log(`[OrgBootstrap] Created membership for user ${userId} in org ${orgId} with role ${role}`);

    return membership;
  } catch (err) {
    console.error("[OrgBootstrap] Error creating membership:", err);
    throw err;
  }
}

export async function ensureUserHasDefaultOrg(userId: Types.ObjectId | string): Promise<any> {
  if (env.ENABLE_RBAC_ENGINE !== "true") {
    return null;
  }

  if (env.RBAC_AUTO_BOOTSTRAP_ORGS !== "true") {
    return null;
  }

  try {
    await connectToDatabase();

    const existingMembership = await MembershipModel.findOne({
      userId,
      isActive: true
    });

    if (existingMembership) {
      return existingMembership;
    }

    console.log(`[OrgBootstrap] Auto-bootstrapping default org for user ${userId}`);

    const org = await createPersonalOrganization(userId);
    const membership = await createMembership(userId, org._id, "OWNER");

    return membership;
  } catch (err) {
    console.error("[OrgBootstrap] Error in ensureUserHasDefaultOrg:", err);
    return null;
  }
}

export async function backfillUserOrganizations(dryRun: boolean = true): Promise<{
  processed: number;
  created: number;
  errors: number;
}> {
  if (env.ENABLE_RBAC_ENGINE !== "true") {
    return { processed: 0, created: 0, errors: 0 };
  }

  try {
    await connectToDatabase();

    const users = await UserModel.find({ role: "HOST" }).lean();
    let created = 0;
    let errors = 0;

    for (const user of users) {
      try {
        const existingMembership = await MembershipModel.findOne({
          userId: user._id,
          isActive: true
        });

        if (!existingMembership) {
          if (!dryRun) {
            const org = await createPersonalOrganization(user._id, user.name);
            await createMembership(user._id, org._id, "OWNER");
          }
          created++;
        }
      } catch (err) {
        console.error(`[OrgBootstrap] Error processing user ${user._id}:`, err);
        errors++;
      }
    }

    console.log(
      `[OrgBootstrap] Backfill complete: processed=${users.length}, created=${created}, errors=${errors}, dryRun=${dryRun}`
    );

    return {
      processed: users.length,
      created,
      errors
    };
  } catch (err) {
    console.error("[OrgBootstrap] Error in backfillUserOrganizations:", err);
    return { processed: 0, created: 0, errors: 1 };
  }
}

export async function backfillEventOrganizations(dryRun: boolean = true): Promise<{
  processed: number;
  updated: number;
  errors: number;
}> {
  if (env.ENABLE_RBAC_ENGINE !== "true") {
    return { processed: 0, updated: 0, errors: 0 };
  }

  try {
    await connectToDatabase();

    const { EventModel } = await import("@/models/Event");

    const events = await EventModel.find({ orgId: { $exists: false } }).lean();
    let updated = 0;
    let errors = 0;

    for (const event of events) {
      try {
        const hostMembership = await MembershipModel.findOne({
          userId: event.hostId,
          isActive: true
        });

        if (hostMembership) {
          if (!dryRun) {
            await EventModel.updateOne(
              { _id: event._id },
              { orgId: hostMembership.orgId }
            );
          }
          updated++;
        }
      } catch (err) {
        console.error(`[OrgBootstrap] Error processing event ${event._id}:`, err);
        errors++;
      }
    }

    console.log(
      `[OrgBootstrap] Event backfill complete: processed=${events.length}, updated=${updated}, errors=${errors}, dryRun=${dryRun}`
    );

    return {
      processed: events.length,
      updated,
      errors
    };
  } catch (err) {
    console.error("[OrgBootstrap] Error in backfillEventOrganizations:", err);
    return { processed: 0, updated: 0, errors: 1 };
  }
}
