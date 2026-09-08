"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  resendSignupCodeAction,
  type AuthState,
  verifySignupCodeAction,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupVerificationForm({
  email,
  next = "/",
}: {
  email: string;
  next?: string;
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    verifySignupCodeAction,
    null
  );
  const [resendState, setResendState] = useState<{
    error?: string;
    ok?: boolean;
  } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resending, startResend] = useTransition();

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function resend() {
    setResendState(null);
    setCooldown(30);
    startResend(async () => {
      const result = await resendSignupCodeAction(email);
      setResendState(result);
    });
  }

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <div className="space-y-2">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
        </div>
        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Verifying…" : "Verify"}
        </Button>
      </form>
      <div className="space-y-2 text-center">
        <Button
          type="button"
          variant="outline"
          onClick={resend}
          disabled={resending || cooldown > 0}
          className="w-full"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </Button>
        {resendState?.ok && (
          <p className="text-sm text-muted-foreground">A new code was sent.</p>
        )}
        {resendState?.error && (
          <p className="text-sm text-destructive">{resendState.error}</p>
        )}
      </div>
    </div>
  );
}
