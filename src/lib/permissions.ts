import "server-only";

import type { UserRole } from "@/models/User";
import { MembershipModel, type MembershipRole } from "@/models/Membership";
import { env } from "@/lib/env";
import type { Types } from "mongoose";

export const PROTECTED_ROUTE_PREFIXES = ["/dashboard", "/host", "/attendee"] as const;

export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function getProtectedRouteRole(pathname: string): UserRole | null {
  if (pathname === "/dashboard" || pathname.startsWith("/host")) {
    return "HOST";
  }

  if (pathname.startsWith("/attendee")) {
    return "ATTENDEE";
  }

  return null;
}

export function isRoleAllowedForRoute(role: UserRole | undefined, pathname: string): boolean {
  const requiredRole = getProtectedRouteRole(pathname);

  if (!requiredRole || !role) {
    return false;
  }

  return role === requiredRole;
}

export function isSessionRoleAllowedForRoute(role: UserRole | undefined, pathname: string): boolean {
  return isRoleAllowedForRoute(role, pathname);
}

export function getRoleRedirectPath(role: UserRole | undefined): string {
  if (role === "HOST") {
    return "/host/dashboard";
  }

  if (role === "ATTENDEE") {
    return "/attendee/dashboard";
  }

  return "/signin";
}

export function canAccessHostRoute(role: UserRole | undefined): boolean {
  return role === "HOST";
}

export function canAccessAttendeeRoute(role: UserRole | undefined): boolean {
  return role === "ATTENDEE";
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  permission?: string;
}

export interface PermissionContext {
  orgId?: Types.ObjectId | string;
  resourceOrgId?: Types.ObjectId | string;
  resourceStatus?: string;
  resourceArchived?: boolean;
  userRole?: MembershipRole;
  [key: string]: any;
}

type ABAC_Rule = (user: any, resource: any, org: any, context?: PermissionContext) => boolean;

export const PERMISSION_MATRIX: Record<MembershipRole, Record<string, boolean>> = {
  OWNER: {
    create_event: true,
    edit_event: true,
    delete_event: true,
    invite_member: true,
    edit_member_role: true,
    view_audit_log: true,
    export_data: true,
    manage_org: true
  },
  ADMIN: {
    create_event: true,
    edit_event: true,
    delete_event: true,
    invite_member: true,
    edit_member_role: true,
    view_audit_log: true,
    export_data: true,
    manage_org: false
  },
  EVENT_MANAGER: {
    create_event: true,
    edit_event: true,
    delete_event: false,
    invite_member: false,
    edit_member_role: false,
    view_audit_log: false,
    export_data: false,
    manage_org: false
  },
  VIEWER: {
    create_event: false,
    edit_event: false,
    delete_event: false,
    invite_member: false,
    edit_member_role: false,
    view_audit_log: false,
    export_data: false,
    manage_org: false
  }
};

export const ABAC_RULES: Record<MembershipRole, Record<string, ABAC_Rule>> = {
  OWNER: {
    "*": () => true
  },
  ADMIN: {
    edit_event: (user, resource, org) => resource.orgId.toString() === org._id.toString(),
    delete_event: (user, resource, org) => {
      return resource.orgId.toString() === org._id.toString() && resource.status !== "ARCHIVED";
    },
    view_audit_log: () => true
  },
  EVENT_MANAGER: {
    edit_event: (user, resource, org) => {
      return resource.orgId.toString() === org._id.toString() && resource.status !== "ARCHIVED";
    },
    delete_event: () => false,
    create_event: () => true
  },
  VIEWER: {
    view_events: () => true
  }
};

export async function getUserMembership(userId: Types.ObjectId | string, orgId: Types.ObjectId | string) {
  try {
    const membership = await MembershipModel.findOne({
      userId,
      orgId,
      isActive: true
    });
    return membership;
  } catch (err) {
    console.error("[Permissions] Error fetching membership:", err);
    return null;
  }
}

export function hasPermissionInMatrix(role: MembershipRole, permission: string): boolean {
  const rolePermissions = PERMISSION_MATRIX[role];
  if (!rolePermissions) return false;

  if (rolePermissions["*"] === true) return true;

  return rolePermissions[permission] === true;
}

export function evaluateABACRule(
  role: MembershipRole,
  permission: string,
  user: any,
  resource: any,
  org: any,
  context?: PermissionContext
): boolean {
  const roleRules = ABAC_RULES[role];
  if (!roleRules) return false;

  if (roleRules["*"]) {
    return roleRules["*"](user, resource, org, context);
  }

  const rule = roleRules[permission];
  if (!rule) return false;

  try {
    return rule(user, resource, org, context);
  } catch (err) {
    console.error("[Permissions] Error evaluating ABAC rule:", err);
    return false;
  }
}

export async function canUserPerformAction(
  userId: Types.ObjectId | string,
  action: string,
  resource: any,
  context?: PermissionContext
): Promise<PermissionCheckResult> {
  if (env.ENABLE_RBAC_ENGINE !== "true") {
    return { allowed: true, reason: "RBAC disabled" };
  }

  try {
    const orgId = context?.orgId || resource.orgId;
    if (!orgId) {
      return { allowed: false, reason: "No organization context" };
    }

    const membership = await getUserMembership(userId, orgId);
    if (!membership) {
      return { allowed: false, reason: "User not member of organization" };
    }

    if (!membership.isActive) {
      return { allowed: false, reason: "Membership is inactive" };
    }

    const role = membership.role;
    const hasMatrixPermission = hasPermissionInMatrix(role, action);

    if (!hasMatrixPermission) {
      return {
        allowed: false,
        reason: `Role ${role} does not have permission: ${action}`,
        permission: action
      };
    }

    const abacRules = ABAC_RULES[role];
    if (abacRules && abacRules[action]) {
      const org = { _id: orgId };
      const abacAllowed = evaluateABACRule(role, action, { _id: userId }, resource, org, context);

      if (!abacAllowed) {
        return {
          allowed: false,
          reason: `ABAC rule denied permission: ${action}`,
          permission: action
        };
      }
    }

    return { allowed: true };
  } catch (err) {
    console.error("[Permissions] Error in canUserPerformAction:", err);
    return { allowed: false, reason: "Error evaluating permissions" };
  }
}

export async function canUserAccessOrg(userId: Types.ObjectId | string, orgId: Types.ObjectId | string): Promise<boolean> {
  if (env.ENABLE_RBAC_ENGINE !== "true") {
    return true;
  }

  try {
    const membership = await getUserMembership(userId, orgId);
    return membership != null && membership.isActive;
  } catch (err) {
    console.error("[Permissions] Error checking org access:", err);
    return false;
  }
}

export async function getUserOrganizations(userId: Types.ObjectId | string) {
  try {
    const memberships = await MembershipModel.findUserOrgs(userId, true);
    return memberships;
  } catch (err) {
    console.error("[Permissions] Error fetching user orgs:", err);
    return [];
  }
}

export function requirePermission(permission: string) {
  return async (userId: Types.ObjectId | string, resource: any, context?: PermissionContext) => {
    const result = await canUserPerformAction(userId, permission, resource, context);

    if (!result.allowed) {
      const error = new Error(result.reason || "Permission denied");
      (error as any).statusCode = 403;
      throw error;
    }

    return result;
  };
}