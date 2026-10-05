"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SsoButtons } from "@/components/auth/sso-buttons";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { useEffect, useRef } from "react";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const initialState: AuthState = null;

export function LoginForm({
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
    loginAction,
    initialState
  );
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    if (state?.fieldErrors?.email) emailRef.current?.focus();
    else if (state?.fieldErrors?.password) passwordRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <SsoButtons
        google={googleSsoEnabled}
        microsoft={microsoftSsoEnabled}
        next={next}
        verb="Continue"
      />
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
            state?.fieldErrors?.email ? "login-email-error" : undefined
          }
        />
        {state?.fieldErrors?.email && (
          <p
            id="login-email-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {state.fieldErrors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <Input
            ref={passwordRef}
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="pr-28"
            aria-invalid={Boolean(state?.fieldErrors?.password)}
            aria-describedby={
              state?.fieldErrors?.password ? "login-password-error" : undefined
            }
          />
          <button
            type="button"
            aria-pressed={showPassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
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
            id="login-password-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {state.fieldErrors.password}
          </p>
        )}
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <TurnstileWidget siteKey={turnstileSiteKey} resetKey={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
