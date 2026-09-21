"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDeviceAgentEnabled } from "@/lib/admin/flags";

export async function claimDeviceAction(
  code: string,
  shortId: string
): Promise<{ success: true } | { error: string }> {
  if (!isDeviceAgentEnabled()) return { error: "Not available." };
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in required." };
  const parsed = z
    .object({
      code: z.string().regex(/^[a-f0-9]{8}$/),
      shortId: z.string().regex(/^[a-f0-9]{8}$/),
    })
    .safeParse({ code, shortId });
  if (!parsed.success) return { error: "Invalid claim code." };
  const admin = createAdminClient();
  const membership = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership.data) return { error: "Organization not found." };
  const devices = await admin
    .from("devices")
    .select("id,public_key,user_id")
    .eq("organization_id", membership.data.organization_id)
    .is("user_id", null);
  const device = (devices.data ?? []).find(
    (row) =>
      row.id.startsWith(parsed.data.shortId) &&
      createHash("sha256")
        .update(row.id + row.public_key)
        .digest("hex")
        .startsWith(parsed.data.code)
  );
  if (!device) return { error: "Device claim code not found." };
  const updated = await admin
    .from("devices")
    .update({ user_id: user.id })
    .eq("id", device.id)
    .eq("organization_id", membership.data.organization_id)
    .is("user_id", null)
    .select("id")
    .maybeSingle();
  if (updated.error || !updated.data)
    return { error: "Device is already claimed." };
  await admin.from("operations_audit").insert({
    organization_id: membership.data.organization_id,
    actor_user_id: user.id,
    actor_role: "requester",
    action: "device.claimed",
    target: device.id,
  });
  revalidatePath("/devices/claim");
  return { success: true };
}
