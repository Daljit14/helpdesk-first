import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    }
  } catch {
    // The database test is skipped when local credentials are unavailable.
  }
}

loadLocalEnv();

const canRun = Boolean(
  process.env.RUN_KNOWLEDGE_ISOLATION_TEST === "true" &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

describe.skipIf(!canRun)("knowledge governance isolation", () => {
  test("keeps knowledge data private and revisions immutable", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const orgA = "00000000-0000-0000-0000-000000000001";
    const orgB = randomUUID();
    const email = `knowledge-isolation-${randomUUID()}@example.invalid`;
    const password = `${randomUUID()}-Aa1!`;
    let userId: string | null = null;
    let guideId: string | null = null;
    let revisionId: string | null = null;

    try {
      const { error: orgError } = await service
        .from("organizations")
        .insert({ id: orgB, name: "Knowledge isolation test" });
      expect(orgError).toBeNull();

      const { data: guide, error: guideError } = await service
        .from("knowledge_guides")
        .insert({
          organization_id: orgB,
          slug: `knowledge-isolation-${randomUUID()}`,
          title: "Knowledge isolation test",
          status: "approved",
          source_title: "Test",
          supported_platforms: ["Windows"],
          risk_tier: "low",
        })
        .select("id")
        .single();
      expect(guideError).toBeNull();
      guideId = guide?.id ?? null;
      expect(guideId).toBeTruthy();

      const { data: createdUser, error: userError } =
        await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
      expect(userError).toBeNull();
      userId = createdUser.user?.id ?? null;
      expect(userId).toBeTruthy();
      const { error: signInError } = await anon.auth.signInWithPassword({
        email,
        password,
      });
      expect(signInError).toBeNull();

      const guides = await anon.from("knowledge_guides").select("id");
      expect(guides.data).toEqual([]);
      expect(guides.error).toBeNull();
      const calls = await anon.from("ai_provider_calls").select("id");
      expect(calls.data).toEqual([]);
      expect(calls.error).toBeNull();

      const { listGuides } = await import("@/lib/knowledge/governance");
      const orgAGuides = await listGuides(orgA);
      expect(orgAGuides.some((item) => item.id === guideId)).toBe(false);

      const { data: revision, error: revisionError } = await service
        .from("knowledge_guide_revisions")
        .insert({
          guide_id: guideId,
          organization_id: orgB,
          version: 1,
          from_status: "draft",
          to_status: "approved",
          note: "Isolation test",
          prior_snapshot: { reviewer: "Test" },
        })
        .select("id")
        .single();
      expect(revisionError).toBeNull();
      revisionId = revision?.id ?? null;
      expect(revisionId).toBeTruthy();

      const revisionUpdate = await service
        .from("knowledge_guide_revisions")
        .update({ note: "tampered" })
        .eq("id", revisionId);
      expect(revisionUpdate.error?.message).toMatch(/immutable/i);
      const revisionDelete = await service
        .from("knowledge_guide_revisions")
        .delete()
        .eq("id", revisionId);
      expect(revisionDelete.error?.message).toMatch(/immutable/i);
    } finally {
      await anon.auth.signOut();
      if (userId) await service.auth.admin.deleteUser(userId);
      // Revisions are intentionally retained: the database trigger rejects
      // deletes, which is the immutability guarantee under test.
    }
  }, 30_000);
});
