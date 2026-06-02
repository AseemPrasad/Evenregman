import type { UserRole } from "@/models/User";

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