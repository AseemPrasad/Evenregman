import "server-only";

import { canUserPerformAction, canUserAccessOrg, type PermissionContext } from "@/lib/permissions";
import { env } from "@/lib/env";
import type { Types } from "mongoose";

export class PermissionDeniedError extends Error {
  public readonly statusCode = 403;

  constructor(message: string, public readonly permission?: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export async function assertUserCanPerformAction(
  userId: Types.ObjectId | string,
  action: string,
  resource: any,
  context?: PermissionContext
): Promise<void> {
  if (env.ENABLE_RBAC_ENGINE !== "true") {
    return;
  }

  const result = await canUserPerformAction(userId, action, resource, context);

  if (!result.allowed) {
    throw new PermissionDeniedError(result.reason || `Permission denied: ${action}`, action);
  }
}

export async function assertUserCanAccessOrg(
  userId: Types.ObjectId | string,
  orgId: Types.ObjectId | string
): Promise<void> {
  if (env.ENABLE_RBAC_ENGINE !== "true") {
    return;
  }

  const canAccess = await canUserAccessOrg(userId, orgId);

  if (!canAccess) {
    throw new PermissionDeniedError(`User cannot access organization`, "org_access");
  }
}

export function validateCrossTenantAccess(
  userId: Types.ObjectId | string,
  userOrgId: Types.ObjectId | string,
  targetOrgId: Types.ObjectId | string
): void {
  if (env.ENABLE_RBAC_ENGINE !== "true") {
    return;
  }

  if (userOrgId.toString() !== targetOrgId.toString()) {
    throw new PermissionDeniedError(`Cross-tenant access denied`, "cross_tenant_access");
  }
}

export function withPermissionCheck<T extends any[], R>(
  action: (...args: T) => Promise<R>,
  permission: string,
  options: {
    resourceExtractor?: (...args: T) => any;
    orgExtractor?: (...args: T) => Types.ObjectId | string;
    getUserId?: (...args: T) => Promise<Types.ObjectId | string>;
  }
) {
  return async (...args: T): Promise<R> => {
    if (env.ENABLE_RBAC_ENGINE === "true" && options.resourceExtractor) {
      const resource = options.resourceExtractor(...args);
      const orgId = options.orgExtractor ? options.orgExtractor(...args) : resource?.orgId;

      if (options.getUserId) {
        const userId = await options.getUserId(...args);
        await assertUserCanPerformAction(userId, permission, resource, {
          orgId
        });
      }
    }

    return action(...args);
  };
}

export async function checkPermissionOrFallback(
  userId: Types.ObjectId | string,
  action: string,
  resource: any,
  fallbackCheck: () => Promise<boolean>,
  context?: PermissionContext
): Promise<boolean> {
  if (env.ENABLE_RBAC_ENGINE === "true") {
    const result = await canUserPerformAction(userId, action, resource, context);
    return result.allowed;
  }

  return fallbackCheck();
}
