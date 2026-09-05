"use client";

import { useActionState } from "react";
import Link from "next/link";
import { adminLogin, type AdminAuthState } from "@/app/actions/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdminLoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AdminAuthState, FormData>(
    adminLogin,
    null
  );
  return (
    <form action={action} className="space-y-5">
      {state?.error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-800"
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
          <p className="text-sm text-red-700">{state.fieldErrors.email}</p>
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
          <p className="text-sm text-red-700">{state.fieldErrors.password}</p>
        )}
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="w-full bg-foreground text-background hover:bg-foreground/90"
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <Link
        href="/forgot-password"
        className="block text-center text-sm underline underline-offset-4"
      >
        Forgot password?
      </Link>
    </form>
  );
}
