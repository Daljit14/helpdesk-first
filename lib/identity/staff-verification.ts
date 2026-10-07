import type { createAdminClient } from "@/lib/supabase/admin";
import type { AssuranceFacts } from "./assurance";

type Admin = ReturnType<typeof createAdminClient>;

export const STAFF_VERIFICATION_TTL_MS = 15 * 60_000;

export type StaffCallerVerificationRow = {
  ticket_id: string;
  subject_user_id: string;
  method: string;
  created_at: string;
};

export function staffVerificationAssurance(
  rows: StaffCallerVerificationRow[],
  input: {
    ticketId: string;
    subjectUserId: string;
    privileged: boolean;
    now: Date;
  }
): AssuranceFacts | null {
  const nowMs = input.now.getTime();
  const recent = rows.filter((row) => {
    const createdAt = Date.parse(row.created_at);
    return (
      row.ticket_id === input.ticketId &&
      row.subject_user_id === input.subjectUserId &&
      Number.isFinite(createdAt) &&
      createdAt <= nowMs &&
      createdAt >= nowMs - STAFF_VERIFICATION_TTL_MS
    );
  });
  const requiredMethods = input.privileged
    ? ["directory_callback", "manager_confirmed"]
    : ["directory_callback"];
  const requiredRows = requiredMethods.map(
    (method) =>
      recent
        .filter((row) => row.method === method)
        .sort(
          (left, right) =>
            Date.parse(right.created_at) - Date.parse(left.created_at)
        )[0]
  );
  if (requiredRows.some((row) => !row)) return null;
  const times = requiredRows.map((row) => Date.parse(row!.created_at));
  return {
    level: "A3",
    method: "staff_callback",
    authAt: new Date(Math.max(...times)).toISOString(),
    expiresAt: new Date(
      Math.min(...times) + STAFF_VERIFICATION_TTL_MS
    ).toISOString(),
  };
}

export async function loadStaffVerification(
  admin: Admin,
  input: {
    organizationId: string;
    ticketId: string;
    subjectUserId: string;
    privileged: boolean;
    now: Date;
  }
): Promise<AssuranceFacts | null> {
  try {
    const result = await admin
      .from("staff_caller_verifications")
      .select("ticket_id,subject_user_id,method,created_at")
      .eq("organization_id", input.organizationId)
      .eq("ticket_id", input.ticketId)
      .eq("subject_user_id", input.subjectUserId)
      .gte(
        "created_at",
        new Date(input.now.getTime() - STAFF_VERIFICATION_TTL_MS).toISOString()
      );
    if (result.error) return null;
    return staffVerificationAssurance(
      (result.data ?? []) as StaffCallerVerificationRow[],
      input
    );
  } catch {
    return null;
  }
}
