import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth";
import {
	getProtectedRouteRole,
	getRoleRedirectPath,
	isProtectedRoute,
	isSessionRoleAllowedForRoute
} from "@/lib/permissions";

const { auth } = NextAuth(authConfig);

export const middleware = auth((request) => {
	const { pathname } = request.nextUrl;
	const requiredRole = getProtectedRouteRole(pathname);

	if (!isProtectedRoute(pathname) || !requiredRole) {
		return NextResponse.next();
	}

	if (!request.auth?.user) {
		return NextResponse.redirect(new URL("/signin", request.url));
	}

	if (!isSessionRoleAllowedForRoute(request.auth.user.role, pathname)) {
		const redirectTarget = getRoleRedirectPath(request.auth.user.role);
		return NextResponse.redirect(new URL(redirectTarget, request.url));
	}

	return NextResponse.next();
});

export const config = {
	matcher: ["/dashboard/:path*", "/host/:path*", "/attendee/:path*"]
};
