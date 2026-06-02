import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { env } from "@/lib/env";

export const authConfig = {
  secret: env.AUTH_SECRET,
  pages: {
    signIn: "/signin"
  },
  session: {
    strategy: "jwt"
  },
  trustHost: true,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const email = credentials?.email?.toString().trim().toLowerCase();
        const password = credentials?.password?.toString();

        if (!email || !password) {
          return null;
        }

        const { connectToDatabase } = await import("@/lib/db");
  const { UserModel } = await import("@/models/User");
        const bcrypt = await import("bcryptjs");

        await connectToDatabase();

        const user = await UserModel.findOne({ email }).lean();

        if (!user) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id;
      }

      if (session.user && token.role) {
        session.user.role = token.role;
      }

      return session;
    }
  }
} satisfies NextAuthConfig;
