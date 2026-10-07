import { createHash } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Answer, PublicAnswerSource } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

type CacheRow = { response: unknown; expires_at: string };

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function getCacheRow(
  admin: Admin,
  table: "answer_source_cache" | "answer_cache",
  filters: Array<[string, string]>
): Promise<unknown | null> {
  try {
    let query = admin.from(table).select("response,expires_at");
    for (const [column, value] of filters) query = query.eq(column, value);
    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    const row = data as CacheRow;
    if (new Date(row.expires_at).getTime() <= Date.now()) return null;
    return row.response;
  } catch {
    return null;
  }
}

export async function getSourceCache(
  admin: Admin,
  provider: string,
  cacheKey: string
): Promise<unknown | null> {
  return getCacheRow(admin, "answer_source_cache", [
    ["provider", provider],
    ["cache_key", cacheKey],
  ]);
}

export async function putSourceCache(
  admin: Admin,
  provider: string,
  cacheKey: string,
  response: unknown,
  ttlHours: number
): Promise<void> {
  try {
    await admin.from("answer_source_cache").upsert(
      {
        provider,
        cache_key: cacheKey,
        response,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + ttlHours * 3_600_000).toISOString(),
      },
      { onConflict: "provider,cache_key" }
    );
  } catch {
    return;
  }
}

export async function getAnswerCache(
  admin: Admin,
  scope: string,
  problemHash: string
): Promise<unknown | null> {
  try {
    const { data, error } = await admin
      .from("answer_cache")
      .select("answer,sources,expires_at")
      .eq("scope", scope)
      .eq("problem_hash", problemHash)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      answer: unknown;
      sources: unknown;
      expires_at: string;
    };
    if (new Date(row.expires_at).getTime() <= Date.now()) return null;
    return { answer: row.answer, sources: row.sources };
  } catch {
    return null;
  }
}

export async function putAnswerCache(
  admin: Admin,
  scope: string,
  organizationId: string | null,
  problemHash: string,
  answer: Answer,
  sources: PublicAnswerSource[],
  ttlHours: number
): Promise<void> {
  try {
    await admin.from("answer_cache").upsert(
      {
        scope,
        organization_id: organizationId,
        problem_hash: problemHash,
        answer,
        sources,
        expires_at: new Date(Date.now() + ttlHours * 3_600_000).toISOString(),
      },
      { onConflict: "scope,problem_hash" }
    );
  } catch {
    return;
  }
}
