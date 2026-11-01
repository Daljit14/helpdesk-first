"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession, recordAudit } from "@/lib/admin/auth";
import { isKnowledgeFreshnessEnabled } from "@/lib/admin/flags";
import { verifyGuide } from "@/lib/knowledge/freshness";

const verifyInput = z
  .object({
    guideSlug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9][a-z0-9-]*$/i),
    note: z.string().trim().max(500).nullable(),
  })
  .strict();

export async function verifyGuideAction(
  guideSlug: string,
  note: string | null = null
): Promise<{ success: true } | { error: string }> {
  if (!isKnowledgeFreshnessEnabled()) return { error: "Not available." };
  const session = await getAdminSession();
  if (!session || session.role !== "org_admin") {
    return { error: "Not authorized." };
  }
  const parsed = verifyInput.safeParse({ guideSlug, note });
  if (!parsed.success) return { error: "Invalid guide review." };
  const result = await verifyGuide({
    orgId: session.organizationId,
    guideSlug: parsed.data.guideSlug,
    actorId: session.userId,
    note: parsed.data.note,
  });
  if ("success" in result) {
    await recordAudit(
      session,
      "knowledge.guide_verified",
      parsed.data.guideSlug
    );
    revalidatePath("/admin/knowledge");
  }
  return result;
}
