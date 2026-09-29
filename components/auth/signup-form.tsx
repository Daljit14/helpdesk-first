"use client";

import { useActionState } from "react";
import { signUpAction, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startSso } from "@/app/actions/auth";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { useEffect, useRef } from "react";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

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
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  useEffect(() => {
    const first = state?.fieldErrors
      ? ["email", "password", "confirmPassword"].find(
          (field) => state.fieldErrors?.[field]
        )
      : undefined;
    if (first === "email") emailRef.current?.focus();
    if (first === "password") passwordRef.current?.focus();
    if (first === "confirmPassword") confirmRef.current?.focus();
  }, [state]);
  const errorCount = state?.fieldErrors
    ? Object.keys(state.fieldErrors).length
    : 0;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state?.fieldErrors?.email)}
          aria-describedby={
            state?.fieldErrors?.email ? "signup-email-error" : undefined
          }
        />
        {state?.fieldErrors?.email && (
          <p
            id="signup-email-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {state.fieldErrors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            ref={passwordRef}
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            aria-invalid={Boolean(state?.fieldErrors?.password)}
            className="pr-28"
            aria-describedby={
              [
                "signup-password-hint",
                state?.fieldErrors?.password ? "signup-password-error" : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
          />
          <button
            type="button"
            aria-pressed={showPassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded px-2 py-1 text-xs"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {state?.fieldErrors?.password && (
          <p
            id="signup-password-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {state.fieldErrors.password}
          </p>
        )}
        <p id="signup-password-hint" className="text-xs text-muted-foreground">
          At least 8 characters, with an uppercase letter, a lowercase letter,
          and a number.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <div className="relative">
          <Input
            ref={confirmRef}
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            required
            aria-invalid={Boolean(state?.fieldErrors?.confirmPassword)}
            aria-describedby={
              state?.fieldErrors?.confirmPassword
                ? "signup-confirmPassword-error"
                : undefined
            }
            className="pr-28"
          />
          <button
            type="button"
            aria-pressed={showConfirm}
            aria-label={showConfirm ? "Hide password" : "Show password"}
            onClick={() => setShowConfirm((visible) => !visible)}
            className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded px-2 py-1 text-xs"
          >
            {showConfirm ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {showConfirm ? "Hide" : "Show"}
          </button>
        </div>
        {state?.fieldErrors?.confirmPassword && (
          <p
            id="signup-confirmPassword-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {state.fieldErrors.confirmPassword}
          </p>
        )}
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {errorCount > 0 && (
        <p role="alert" className="sr-only">
          Please fix {errorCount} field{errorCount === 1 ? "" : "s"}.
        </p>
      )}

      <TurnstileWidget siteKey={turnstileSiteKey} resetKey={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Signing up…" : "Sign up"}
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
