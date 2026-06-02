import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth";

const { auth } = NextAuth(authConfig);

export const middleware = auth((request) => {
  const { pathname } = request.nextUrl;
  const role = request.auth?.user?.role;

  if (pathname.startsWith("/host") || pathname.startsWith("/dashboard")) {
    if (!request.auth) {
      return NextResponse.redirect(new URL("/signin", request.url));
    }

    if (role !== "HOST") {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }
  }

  if (pathname.startsWith("/attendee")) {
    if (!request.auth) {
      return NextResponse.redirect(new URL("/signin", request.url));
    }

    if (role !== "ATTENDEE") {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/host/:path*", "/attendee/:path*"]
};
