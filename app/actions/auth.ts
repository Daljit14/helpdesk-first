"use server";

import { redirect } from "next/navigation";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
} from "@/lib/validation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSiteUrl } from "@/lib/site-url";
import { ensureRequesterMembership } from "@/lib/org/membership";
import { z } from "zod";
import { isGoogleSsoEnabled, isMicrosoftSsoEnabled } from "@/lib/admin/flags";
import { isSafeNextPath } from "@/lib/auth/paths";
import {
  captchaErrorMessage,
  captchaRequired,
  getCaptchaToken,
} from "@/lib/auth/captcha";

export type AuthState = {
  error?: string;
  fieldErrors?: Record<string, string>;
} | null;

function safeNextPath(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !isSafeNextPath(value)) {
    return "/";
  }
  return value;
}

const ssoInputSchema = z.object({
  provider: z.enum(["google", "azure"]),
  next: z.string().refine(isSafeNextPath),
});

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) out[String(issue.path[0])] = issue.message;
  return out;
}

export async function signUpAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    return { error: "Accounts are not enabled on this deployment." };
  }
  const captchaError = captchaRequired(formData);
  if (captchaError) return { error: captchaError };

  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const supabase = await createClient();
  const captchaToken = getCaptchaToken(formData);
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  });

  if (error) {
    const securityError = captchaErrorMessage(error);
    if (securityError) return { error: securityError };
    return { error: error.message };
  }

  if (data.session && data.user) {
    await ensureRequesterMembership(data.user, supabase);
    redirect(safeNextPath(formData.get("next")));
  }

  redirect(
    `/check-email?email=${encodeURIComponent(parsed.data.email)}&next=${encodeURIComponent(safeNextPath(formData.get("next")))}`
  );
}

export async function loginAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    return { error: "Accounts are not enabled on this deployment." };
  }
  const captchaError = captchaRequired(formData);
  if (captchaError) return { error: captchaError };

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const supabase = await createClient();
  const captchaToken = getCaptchaToken(formData);
  const { data, error } = await supabase.auth.signInWithPassword({
    ...parsed.data,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  });

  if (error) {
    const securityError = captchaErrorMessage(error);
    if (securityError) return { error: securityError };
    if (error.message.toLowerCase().includes("email not confirmed")) {
      redirect(
        `/check-email?email=${encodeURIComponent(parsed.data.email)}&next=${encodeURIComponent(safeNextPath(formData.get("next")))}`
      );
    }
    return { error: "Incorrect email or password." };
  }

  if (data.user) await ensureRequesterMembership(data.user, supabase);
  redirect(safeNextPath(formData.get("next")));
}

export async function startSso(input: {
  provider: "google" | "azure";
  next: string;
}) {
  const parsed = ssoInputSchema.safeParse(input);
  if (!parsed.success || !isSupabaseConfigured()) {
    redirect("/login?error=sso");
  }
  if (
    (parsed.data.provider === "google" && !isGoogleSsoEnabled()) ||
    (parsed.data.provider === "azure" && !isMicrosoftSsoEnabled())
  ) {
    redirect("/login?error=sso");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: parsed.data.provider,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || getSiteUrl()}/auth/callback?next=${encodeURIComponent(parsed.data.next)}`,
      scopes:
        parsed.data.provider === "azure" ? "email openid profile" : undefined,
    },
  });
  if (error || !data.url) redirect("/login?error=sso");
  redirect(data.url);
}

export async function forgotPasswordAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    return { error: "Accounts are not enabled on this deployment." };
  }
  const captchaError = captchaRequired(formData);
  if (captchaError) return { error: captchaError };

  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const supabase = await createClient();
  const captchaToken = getCaptchaToken(formData);
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: `${getSiteUrl()}/auth/callback?next=/reset-password`,
      ...(captchaToken ? { captchaToken } : {}),
    }
  );

  const securityError = captchaErrorMessage(error);
  if (securityError) return { error: securityError };
  if (error?.message.toLowerCase().includes("rate limit")) {
    return {
      error:
        "Too many reset emails were sent recently. Please try again in an hour.",
    };
  }

  redirect("/forgot-password/sent");
}

const signupCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().regex(/^\d{6}$/),
  next: z.string().optional(),
});

export async function verifySignupCodeAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    return { error: "Accounts are not enabled on this deployment." };
  }

  const parsed = signupCodeSchema.safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) {
    return { error: "That code is invalid or expired." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.code,
    type: "signup",
  });
  if (error || !data.user) {
    return { error: "That code is invalid or expired." };
  }

  await ensureRequesterMembership(data.user, supabase);
  redirect(safeNextPath(parsed.data.next ? parsed.data.next : "/"));
}

export async function resendSignupCodeAction(
  email: string,
  captchaToken?: string
) {
  if (!isSupabaseConfigured()) {
    return { error: "Accounts are not enabled on this deployment." };
  }
  const parsed = z.string().trim().toLowerCase().email().safeParse(email);
  if (!parsed.success) {
    return { error: "Please wait before requesting another code." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  });
  if (error) return { error: "Please wait before requesting another code." };
  return { ok: true };
}

export async function resetPasswordAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    return { error: "Accounts are not enabled on this deployment." };
  }

  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "This reset link is invalid or has expired. Request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      error:
        "Could not update your password. Request a new reset link and try again.",
    };
  }

  redirect("/");
}

export async function logoutAction() {
  if (!isSupabaseConfigured()) {
    redirect("/");
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
