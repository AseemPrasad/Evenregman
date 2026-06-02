import type { DefaultSession } from "next-auth";
import type { JWT as DefaultJWT } from "next-auth/jwt";

import type { UserRole } from "@/models/User";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    role?: UserRole;
  }
}
