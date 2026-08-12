import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth";
import {
	getProtectedRouteRole,
	getRoleRedirectPath,
	isProtectedRoute,
	isSessionRoleAllowedForRoute
} from "@/lib/permissions";
import { applyRateLimit, createRateLimitHeaders, createRateLimitError } from "@/lib/rate-limit-hook";
import { RATE_LIMIT_POLICIES } from "@/lib/rate-limit-config";
import { extractClientIP, resolveIdentifier } from "@/lib/rate-limit-identifiers";
import { env } from "@/lib/env";

const { auth } = NextAuth(authConfig);

function isAuthRoute(pathname: string): boolean {
	return pathname === "/signin" || pathname === "/signup" || pathname.startsWith("/api/auth");
}

export const middleware = auth(async (request) => {
	const { pathname } = request.nextUrl;

	// Apply rate limiting for public auth routes
	if (isAuthRoute(pathname) && env.ENABLE_RATE_LIMITING === "true") {
		const clientIP = extractClientIP(request);
		const policy = pathname === "/signup" ? RATE_LIMIT_POLICIES.AUTH_SIGNUP : RATE_LIMIT_POLICIES.AUTH_SIGNIN;
		const identifier = resolveIdentifier(policy.identifier_type, clientIP);

		const result = await applyRateLimit(policy, identifier);

		if (!result.allowed && env.RATE_LIMIT_STRICT_MODE === "true") {
			const error = createRateLimitError(result, policy.name, identifier);
			return NextResponse.json(
				{ error: error.message },
				{ status: error.status, headers: error.headers }
			);
		}

		const response = NextResponse.next();
		Object.entries(createRateLimitHeaders(result)).forEach(([key, value]) => {
			response.headers.set(key, value);
		});

		return response;
	}

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
