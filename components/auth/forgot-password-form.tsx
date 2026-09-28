"use client";

import { useActionState } from "react";
import { forgotPasswordAction, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { useEffect, useRef } from "react";

const initialState: AuthState = null;

export function ForgotPasswordForm({
  turnstileSiteKey = null,
}: {
  turnstileSiteKey?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    initialState
  );
  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state?.fieldErrors?.email) emailRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
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
            state?.fieldErrors?.email ? "forgot-email-error" : undefined
          }
        />
        {state?.fieldErrors?.email && (
          <p
            id="forgot-email-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {state.fieldErrors.email}
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
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
