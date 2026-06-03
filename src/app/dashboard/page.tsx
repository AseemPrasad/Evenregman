import { redirect } from "next/navigation";

import { auth } from "@/lib/session";
import { getRoleRedirectPath } from "@/lib/permissions";

export default async function DashboardRedirectPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/signin");
  }

  redirect(getRoleRedirectPath(session.user.role));
}
