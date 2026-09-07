"use client";

import { useActionState } from "react";
import Link from "next/link";
import { adminLogin, type AdminAuthState } from "@/app/actions/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startSso } from "@/app/actions/auth";

export function AdminLoginForm({
  next,
  googleSsoEnabled = false,
  microsoftSsoEnabled = false,
}: {
  next: string;
  googleSsoEnabled?: boolean;
  microsoftSsoEnabled?: boolean;
}) {
  const [state, action, pending] = useActionState<AdminAuthState, FormData>(
    adminLogin,
    null
  );
  return (
    <form action={action} className="space-y-5">
      {state?.error && (
        <p
          role="alert"
          className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive"
        >
          {state.error}
        </p>
      )}
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="admin-email">Email</Label>
        <Input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        {state?.fieldErrors?.email && (
          <p className="text-sm text-destructive">{state.fieldErrors.email}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="admin-password">Password</Label>
        <Input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {state?.fieldErrors?.password && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.password}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      {(googleSsoEnabled || microsoftSsoEnabled) && (
        <div className="grid gap-2">
          {googleSsoEnabled && (
            <Button
              type="submit"
              formAction={() =>
                startSso({
                  provider: "google",
                  next: "/admin/sso?provider=google",
                })
              }
              variant="outline"
              className="w-full"
            >
              Continue with Google
            </Button>
          )}
          {microsoftSsoEnabled && (
            <Button
              type="submit"
              formAction={() =>
                startSso({
                  provider: "azure",
                  next: "/admin/sso?provider=azure",
                })
              }
              variant="outline"
              className="w-full"
            >
              Continue with Microsoft
            </Button>
          )}
        </div>
      )}
      <Link
        href="/forgot-password"
        className="block text-center text-sm underline underline-offset-4"
      >
        Forgot password?
      </Link>
    </form>
  );
}
