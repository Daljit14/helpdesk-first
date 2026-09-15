"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resumePilot,
  reviewPilotResolution,
} from "@/lib/autonomy/pilot-review";

const reviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["confirmed", "incorrect", "unsafe"]),
  note: z.string().trim().max(2000),
});

export async function reviewPilotResolutionAction(
  input: unknown
): Promise<{ success: true } | { error: string }> {
  const session = await getAdminSession();
  if (!session || session.role !== "org_admin")
    return { error: "Organization admin access required." };
  const value =
    input instanceof FormData
      ? {
          id: input.get("id"),
          status: input.get("status"),
          note: input.get("note") ?? "",
        }
      : input;
  const parsed = reviewSchema.safeParse(value);
  if (!parsed.success) return { error: "Invalid pilot review." };
  const result = await reviewPilotResolution(createAdminClient(), {
    id: parsed.data.id,
    organizationId: session.organizationId,
    status: parsed.data.status,
    note: parsed.data.note || null,
    reviewerId: session.userId,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/resolution/pilot");
  return { success: true };
}

export async function resumePilotAction(): Promise<
  { success: true } | { error: string }
> {
  const session = await getAdminSession();
  if (!session || session.role !== "org_admin")
    return { error: "Organization admin access required." };
  const result = await resumePilot(
    createAdminClient(),
    session.organizationId,
    session.userId
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/resolution/pilot");
  return { success: true };
}
