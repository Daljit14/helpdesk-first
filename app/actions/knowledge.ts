"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession, recordAudit } from "@/lib/admin/auth";
import { isKnowledgeGovernanceEnabled } from "@/lib/admin/flags";
import {
  transitionGuide,
  updateGuideMetadata,
} from "@/lib/knowledge/governance";
import { MemoryRateLimiter } from "@/lib/ai/rate-limit";

const limiter = new MemoryRateLimiter({ windowMs: 60_000, maxRequests: 30 });
const transitionSchema = z.object({
  guideId: z.string().uuid(),
  to: z.enum(["draft", "in_review", "approved", "retired"]),
  reviewer: z.string().trim().max(120).optional(),
  note: z.string().trim().max(1000).optional(),
});
const metadataSchema = z.object({
  guideId: z.string().uuid(),
  sourceUrl: z.string().url().or(z.literal("")).optional(),
  sourceOwner: z.string().trim().max(120).optional(),
  expiresAt: z.string().datetime().or(z.literal("")).optional(),
  riskTier: z.enum(["low", "medium", "high"]).optional(),
  supportedPlatforms: z.array(z.string().max(30)).max(8).optional(),
});

export async function transitionKnowledgeGuide(
  input: unknown
): Promise<{ error: string } | { success: true }> {
  if (!isKnowledgeGovernanceEnabled()) return { error: "Not available." };
  const session = await getAdminSession();
  if (!session || session.role !== "admin") return { error: "Not authorized." };
  if (!(await limiter.check(`knowledge:${session.userId}`)).allowed) {
    return { error: "Too many requests. Please try again later." };
  }
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid guide transition." };
  const result = await transitionGuide({
    ...parsed.data,
    actorId: session.userId,
  });
  if ("success" in result) {
    await recordAudit(session, "knowledge.transition", parsed.data.guideId);
    revalidatePath("/admin/knowledge");
  }
  return result;
}

export async function updateKnowledgeGuideMetadata(
  input: unknown
): Promise<{ error: string } | { success: true }> {
  if (!isKnowledgeGovernanceEnabled()) return { error: "Not available." };
  const session = await getAdminSession();
  if (!session || session.role !== "admin") return { error: "Not authorized." };
  if (!(await limiter.check(`knowledge:${session.userId}`)).allowed) {
    return { error: "Too many requests. Please try again later." };
  }
  const parsed = metadataSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid guide metadata." };
  const result = await updateGuideMetadata(parsed.data);
  if ("success" in result) {
    await recordAudit(
      session,
      "knowledge.metadata_update",
      parsed.data.guideId
    );
    revalidatePath("/admin/knowledge");
  }
  return result;
}
