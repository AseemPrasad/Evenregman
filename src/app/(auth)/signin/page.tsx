import { Suspense } from "react";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { AuthShell } from "@/components/auth/auth-shell";

export default function SignInPage() {
  return (
    <AuthShell
      eyebrow="Secure access"
      title="Sign in to your account"
      description="Use your credentials to access host tools or your attendee dashboard, depending on your role."
      footer={
        <p className="text-sm text-muted-foreground">
          New host?{" "}
          <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
            Create a host account
          </Link>
        </p>
      }
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
