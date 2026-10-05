"use client";

import { useActionState } from "react";
import { signUpAction, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SsoButtons } from "@/components/auth/sso-buttons";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { useEffect } from "react";
import { useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import {
  SIGNUP_DEVICES,
  TERMS_ERROR,
  fullNameError,
  jobTitleError,
  passwordStrength,
  primaryDeviceError,
} from "@/lib/auth/signup-fields";

const initialState: AuthState = null;

const FIELD_ORDER = [
  "fullName",
  "email",
  "jobTitle",
  "primaryDevice",
  "password",
  "confirmPassword",
  "acceptTerms",
] as const;

const METER_COLORS = [
  "bg-muted",
  "bg-status-danger",
  "bg-status-warning",
  "bg-status-info",
  "bg-status-success",
] as const;

const METER_TEXT = [
  "text-muted-foreground",
  "text-status-danger",
  "text-status-warning",
  "text-status-info",
  "text-status-success",
] as const;

/** Field ids match their names, so focus the first invalid one by id. */
function focusFirstInvalid(errors: Record<string, string>) {
  const field = FIELD_ORDER.find((name) => errors[name]);
  if (field) document.getElementById(field)?.focus();
}

function validateClient(form: FormData): Record<string, string> {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const errors: Record<string, string> = {};
  const name = fullNameError(text("fullName"));
  if (name) errors.fullName = name;
  const email = text("email").trim();
  if (!email) errors.email = "Enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = "Enter a valid email address.";
  const job = jobTitleError(text("jobTitle"));
  if (job) errors.jobTitle = job;
  const device = primaryDeviceError(text("primaryDevice"));
  if (device) errors.primaryDevice = device;
  const password = text("password");
  const strength = passwordStrength(password);
  if (!password) errors.password = "Enter a password.";
  else if (strength.missing.length > 0)
    errors.password = `Password needs ${strength.missing.join(", ")}.`;
  const confirm = text("confirmPassword");
  if (!confirm) errors.confirmPassword = "Confirm your password.";
  else if (password && confirm !== password)
    errors.confirmPassword = "Passwords do not match.";
  if (form.get("acceptTerms") !== "on") errors.acceptTerms = TERMS_ERROR;
  return errors;
}

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [clientErrors, setClientErrors] = useState<Record<
    string,
    string
  > | null>(null);
  const fieldErrors: Record<string, string> =
    clientErrors ?? state?.fieldErrors ?? {};

  useEffect(() => {
    const errors = state?.fieldErrors;
    if (errors) focusFirstInvalid(errors);
  }, [state]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent | undefined)?.submitter;
    // SSO buttons submit the form too; they don't need the profile fields.
    if (submitter?.hasAttribute("data-sso")) return;
    const form = event.currentTarget as unknown as HTMLFormElement;
    const errors = validateClient(new FormData(form));
    if (Object.keys(errors).length > 0) {
      event.preventDefault();
      setClientErrors(errors);
      focusFirstInvalid(errors);
      return;
    }
    setClientErrors(null);
  }

  const errorCount = Object.keys(fieldErrors).length;
  const strength = passwordStrength(password);
  const confirmMatches = confirm.length > 0 && confirm === password;

  function describedBy(...ids: (string | false | undefined)[]) {
    return ids.filter(Boolean).join(" ") || undefined;
  }

  function fieldError(field: string) {
    const message = fieldErrors[field];
    if (!message) return null;
    return (
      <p
        id={`signup-${field}-error`}
        role="alert"
        className="text-sm text-destructive"
      >
        {message}
      </p>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      noValidate
    >
      <input type="hidden" name="next" value={next} />
      <SsoButtons
        google={googleSsoEnabled}
        microsoft={microsoftSsoEnabled}
        next={"/"}
        verb="Continue"
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          maxLength={80}
          required
          aria-invalid={Boolean(fieldErrors.fullName)}
          aria-describedby={
            fieldErrors.fullName ? "signup-fullName-error" : undefined
          }
        />
        {fieldError("fullName")}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={
            fieldErrors.email ? "signup-email-error" : undefined
          }
        />
        {fieldError("email")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="jobTitle">
            Job title / department{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <Input
            id="jobTitle"
            name="jobTitle"
            type="text"
            autoComplete="organization-title"
            maxLength={100}
            placeholder="e.g. Finance"
            aria-invalid={Boolean(fieldErrors.jobTitle)}
            aria-describedby={
              fieldErrors.jobTitle ? "signup-jobTitle-error" : undefined
            }
          />
          {fieldError("jobTitle")}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="primaryDevice">
            Primary device{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <select
            id="primaryDevice"
            name="primaryDevice"
            defaultValue=""
            aria-invalid={Boolean(fieldErrors.primaryDevice)}
            aria-describedby={
              fieldErrors.primaryDevice
                ? "signup-primaryDevice-error"
                : undefined
            }
            className="hf-auth-select flex h-12 w-full rounded-2xl border border-input bg-card px-4 pr-10 text-[15px] transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
          >
            <option value="">Choose a device</option>
            {SIGNUP_DEVICES.map((device) => (
              <option key={device} value={device}>
                {device}
              </option>
            ))}
          </select>
          {fieldError("primaryDevice")}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            value={password}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setPassword(event.target.value)
            }
            aria-invalid={Boolean(fieldErrors.password)}
            className="pr-28"
            aria-describedby={describedBy(
              "signup-password-hint",
              "signup-password-strength",
              Boolean(fieldErrors.password) && "signup-password-error"
            )}
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
        <div className="flex items-center gap-3" aria-hidden="true">
          <div className="flex flex-1 gap-1.5">
            {[1, 2, 3, 4].map((level) => (
              <span
                key={level}
                data-on={strength.score >= level}
                className={`hf-auth-meter-bar ${
                  strength.score >= level
                    ? METER_COLORS[strength.score]
                    : "bg-muted"
                }`}
              />
            ))}
          </div>
          <span
            className={`w-16 text-right text-xs font-bold ${METER_TEXT[strength.score]}`}
          >
            {strength.label}
          </span>
        </div>
        <p id="signup-password-strength" aria-live="polite" className="sr-only">
          {strength.label ? `Password strength: ${strength.label}.` : ""}
        </p>
        {fieldError("password")}
        <p id="signup-password-hint" className="text-xs text-muted-foreground">
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
            value={confirm}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setConfirm(event.target.value)
            }
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
            aria-describedby={
              fieldErrors.confirmPassword
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
            className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {showConfirm ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {showConfirm ? "Hide" : "Show"}
          </button>
        </div>
        {confirmMatches && !fieldErrors.confirmPassword && (
          <p className="hf-swap inline-flex items-center gap-1 text-xs font-semibold text-status-success">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Passwords match
          </p>
        )}
        {fieldError("confirmPassword")}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-3">
          <input
            id="acceptTerms"
            name="acceptTerms"
            type="checkbox"
            required
            aria-invalid={Boolean(fieldErrors.acceptTerms)}
            aria-describedby={describedBy(
              "signup-terms-note",
              Boolean(fieldErrors.acceptTerms) && "signup-acceptTerms-error"
            )}
            className="hf-auth-check mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded"
          />
          <div className="text-sm">
            <label
              htmlFor="acceptTerms"
              className="cursor-pointer font-semibold"
            >
              I agree to the acceptable-use and privacy terms
            </label>
            <p
              id="signup-terms-note"
              className="mt-0.5 text-xs text-muted-foreground"
            >
              Use work devices and data responsibly. We only use your details to
              help with your IT requests.
            </p>
          </div>
        </div>
        {fieldError("acceptTerms")}
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
    </form>
  );
}
