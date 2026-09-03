"use client";

import { useActionState } from "react";
import { loginAction, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthState = null;

export function LoginForm({ next = "/" }: { next?: string }) {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        {state?.fieldErrors?.email && (
          <p className="text-sm text-destructive">{state.fieldErrors.email}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
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

      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
