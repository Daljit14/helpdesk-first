"use client";

import { useActionState } from "react";
import { signUpAction, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startSso } from "@/app/actions/auth";
import { TurnstileWidget } from "@/components/turnstile-widget";

const initialState: AuthState = null;

export function SignupForm({
  next = "/",
  googleSsoEnabled = false,
  microsoftSsoEnabled = false,
  turnstileSiteKey = null,
}: {
  next?: string;
  googleSsoEnabled?: boolean;
  microsoftSsoEnabled?: boolean;
  turnstileSiteKey?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    signUpAction,
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
          autoComplete="new-password"
          required
        />
        {state?.fieldErrors?.password && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.password}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          At least 8 characters, with an uppercase letter, a lowercase letter,
          and a number.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
        {state?.fieldErrors?.confirmPassword && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.confirmPassword}
          </p>
        )}
      </div>

      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <TurnstileWidget siteKey={turnstileSiteKey} />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      {(googleSsoEnabled || microsoftSsoEnabled) && (
        <div className="grid gap-2">
          {googleSsoEnabled && (
            <Button
              type="submit"
              formAction={() => startSso({ provider: "google", next: "/" })}
              variant="outline"
              className="w-full"
            >
              Continue with Google
            </Button>
          )}
          {microsoftSsoEnabled && (
            <Button
              type="submit"
              formAction={() => startSso({ provider: "azure", next: "/" })}
              variant="outline"
              className="w-full"
            >
              Continue with Microsoft
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
