"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession, recordAudit } from "@/lib/admin/auth";
import { isKnowledgeHealthEnabled } from "@/lib/admin/flags";
import {
  reviewKnowledgeHealthFinding,
  runKnowledgeHealthScan,
} from "@/lib/knowledge/health";

const findingStatus = z.enum(["acknowledged", "dismissed"]);

export async function reviewFindingAction(
  findingId: string,
  status: "acknowledged" | "dismissed"
): Promise<{ success: true } | { error: string }> {
  if (!isKnowledgeHealthEnabled()) return { error: "Not available." };
  const session = await getAdminSession();
  if (!session || session.role !== "org_admin") {
    return { error: "Not authorized." };
  }
  const parsed = z
    .object({ findingId: z.string().uuid(), status: findingStatus })
    .safeParse({ findingId, status });
  if (!parsed.success) return { error: "Invalid finding review." };
  const result = await reviewKnowledgeHealthFinding({
    orgId: session.organizationId,
    findingId: parsed.data.findingId,
    actorId: session.userId,
    status: parsed.data.status,
  });
  if ("success" in result) {
    await recordAudit(
      session,
      `knowledge.health_${parsed.data.status}`,
      parsed.data.findingId
    );
    revalidatePath("/admin/knowledge");
  }
  return result;
}

export async function runKnowledgeHealthNowAction(): Promise<
  { findings: number; linksChecked: number } | { error: string }
> {
  if (!isKnowledgeHealthEnabled()) return { error: "Not available." };
  const session = await getAdminSession();
  if (!session || session.role !== "org_admin") {
    return { error: "Not authorized." };
  }
  const result = await runKnowledgeHealthScan(session.organizationId);
  await recordAudit(session, "knowledge.health_scan", session.organizationId);
  revalidatePath("/admin/knowledge");
  return result;
}
