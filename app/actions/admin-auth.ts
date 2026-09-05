"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loginSchema } from "@/lib/validation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  clearAdminSessionCookie,
  membershipFor,
  recordAudit,
  setAdminSessionCookie,
} from "@/lib/admin/auth";
import { isAdminDashboardEnabled } from "@/lib/admin/flags";
import { MemoryRateLimiter } from "@/lib/ai/rate-limit";

export type AdminAuthState = {
  error?: string;
  fieldErrors?: Record<string, string>;
} | null;

const loginLimiter = new MemoryRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
});
const GENERIC_ERROR = "Invalid credentials or not authorized.";

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) out[String(issue.path[0])] = issue.message;
  return out;
}

function safeNext(value: FormDataEntryValue | null): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/admin/operations";
  }
  return value;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function adminLogin(
  _prevState: AdminAuthState,
  formData: FormData
): Promise<AdminAuthState> {
  if (!isAdminDashboardEnabled() || !isSupabaseConfigured()) {
    return { error: GENERIC_ERROR };
  }
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for") ?? "unknown";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  const [emailCheck, ipCheck] = await Promise.all([
    loginLimiter.check(hash(parsed.data.email)),
    loginLimiter.check(hash(ip)),
  ]);
  if (!emailCheck.allowed || !ipCheck.allowed) {
    return { error: "Too many login attempts. Please try again later." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: GENERIC_ERROR };

  const membership = await membershipFor(data.user);
  if (!membership) {
    await supabase.auth.signOut();
    return { error: GENERIC_ERROR };
  }

  const admin = await import("@/lib/supabase/admin").then((module) =>
    module.createAdminClient()
  );
  await admin.from("admin_profiles").upsert({
    user_id: data.user.id,
    last_login_at: new Date().toISOString(),
  });
  if (!(await setAdminSessionCookie(data.user.id))) {
    await supabase.auth.signOut();
    return { error: GENERIC_ERROR };
  }
  await recordAudit(
    {
      userId: data.user.id,
      email: data.user.email ?? parsed.data.email,
      ...membership,
    },
    "auth.login"
  );
  redirect(safeNext(formData.get("next")));
}

export async function adminLogout() {
  await clearAdminSessionCookie();
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/admin/login");
}
