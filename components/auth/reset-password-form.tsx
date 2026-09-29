"use client";

import { useActionState } from "react";
import { resetPasswordAction, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const initialState: AuthState = null;

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    initialState
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">New password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            className="pr-28"
            aria-invalid={Boolean(state?.fieldErrors?.password)}
            aria-describedby={
              state?.fieldErrors?.password
                ? "reset-password-error"
                : "reset-password-hint"
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
          <p id="reset-password-error" className="text-sm text-destructive">
            {state.fieldErrors.password}
          </p>
        )}
        <p id="reset-password-hint" className="text-xs text-muted-foreground">
          At least 8 characters, with an uppercase letter, a lowercase letter,
          and a number.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <div className="relative">
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            required
            className="pr-28"
            aria-invalid={Boolean(state?.fieldErrors?.confirmPassword)}
            aria-describedby={
              state?.fieldErrors?.confirmPassword
                ? "reset-confirm-error"
                : undefined
            }
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
          <p id="reset-confirm-error" className="text-sm text-destructive">
            {state.fieldErrors.confirmPassword}
          </p>
        )}
      </div>

      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
