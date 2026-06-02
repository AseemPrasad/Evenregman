import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth";

const { auth } = NextAuth(authConfig);

export { auth };
