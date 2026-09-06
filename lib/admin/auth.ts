import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/supabase/user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminDashboardEnabled } from "./flags";

export type AdminRole = "admin" | "support_agent";
export type AdminSession = {
  userId: string;
  email: string;
  role: AdminRole;
  organizationId: string;
  displayName: string | null;
};

const ADMIN_COOKIE = "hd_admin";
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 8;

function sessionSecret(): string | null {
  return (
    process.env.HELP_DESK_ADMIN_SESSION_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    null
  );
}

function signSession(userId: string, expiresAt: number): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const value = `${userId}:${expiresAt}`;
  const signature = createHmac("sha256", secret).update(value).digest("hex");
  return `${signature}.${expiresAt}`;
}

function validSessionCookie(
  value: string | undefined,
  userId: string
): boolean {
  if (!value) return false;
  const separator = value.lastIndexOf(".");
  if (separator === -1) return false;
  const signature = value.slice(0, separator);
  const expiresAt = Number(value.slice(separator + 1));
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;
  const expected = signSession(userId, expiresAt);
  if (!expected) return false;
  const expectedSignature = expected.slice(0, expected.lastIndexOf("."));
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

async function membershipFor(user: User): Promise<{
  organizationId: string;
  role: AdminRole;
  displayName: string | null;
} | null> {
  const admin = createAdminClient();
  const { data: membership, error } = await admin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (error || !membership) return null;
  const { data: profile } = await admin
    .from("admin_profiles")
    .select("display_name, mfa_enrolled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (
    profile?.mfa_enrolled ||
    process.env.HELP_DESK_ADMIN_REQUIRE_MFA === "true"
  ) {
    const supabase = await createClient();
    const { data: assurance } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!profile?.mfa_enrolled || assurance?.currentLevel !== "aal2")
      return null;
  }
  if (membership.role !== "admin" && membership.role !== "support_agent") {
    return null;
  }
  return {
    organizationId: membership.organization_id,
    role: membership.role,
    displayName: profile?.display_name ?? null,
  };
}

export async function getAdminSession(): Promise<AdminSession | null> {
  if (!isAdminDashboardEnabled()) return null;
  const user = await getCurrentUser();
  if (
    !user?.email ||
    !validSessionCookie((await cookies()).get(ADMIN_COOKIE)?.value, user.id)
  ) {
    return null;
  }
  const membership = await membershipFor(user);
  if (!membership) return null;
  return { userId: user.id, email: user.email, ...membership };
}

export async function requireAdminPage(next: string): Promise<AdminSession> {
  if (!isAdminDashboardEnabled()) notFound();
  const session = await getAdminSession();
  if (!session) redirect(`/admin/login?next=${encodeURIComponent(next)}`);
  return session;
}

export async function requireAdminApi(): Promise<AdminSession | Response> {
  if (!isAdminDashboardEnabled()) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Forbidden." }, { status: 403 });
  return session;
}

export async function setAdminSessionCookie(userId: string): Promise<boolean> {
  const expiresAt = Date.now() + ADMIN_SESSION_MAX_AGE * 1000;
  const value = signSession(userId, expiresAt);
  if (!value) return false;
  (await cookies()).set(ADMIN_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: "/",
  });
  return true;
}

export async function clearAdminSessionCookie(): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}

export async function recordAudit(
  session: AdminSession,
  action: string,
  target?: string
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("operations_audit").insert({
      organization_id: session.organizationId,
      actor_user_id: session.userId,
      actor_role: session.role,
      action,
      target: target ?? null,
    });
  } catch (error) {
    console.error("admin audit insert failed", error);
  }
}

export { membershipFor };

export function canAccessTicket(
  session: AdminSession,
  ticket: {
    organization_id?: string | null;
    assigned_agent_id?: string | null;
    status?: string | null;
  }
): boolean {
  if (ticket.organization_id !== session.organizationId) return false;
  if (session.role === "admin") return true;
  return (
    ticket.assigned_agent_id === session.userId ||
    (!ticket.assigned_agent_id &&
      String(ticket.status).toLowerCase() === "needs human")
  );
}
