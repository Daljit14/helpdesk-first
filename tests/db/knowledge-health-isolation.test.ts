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

describe.skipIf(!canRun)("knowledge health isolation", () => {
  test("keeps findings private to their organization", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const orgB = randomUUID();
    const email = `knowledge-health-isolation-${randomUUID()}@example.invalid`;
    const password = `${randomUUID()}-Aa1!`;
    let userId: string | null = null;

    try {
      const { error: orgError } = await service
        .from("organizations")
        .insert({ id: orgB, name: "Knowledge health isolation test" });
      expect(orgError).toBeNull();
      const { data: user, error: userError } =
        await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
      expect(userError).toBeNull();
      userId = user.user?.id ?? null;
      expect(userId).toBeTruthy();
      const { error: findingError } = await service
        .from("knowledge_health_findings")
        .insert({
          organization_id: orgB,
          kind: "missing_guide",
          severity: "warning",
          summary: "Isolation test",
          evidence: { normalizedTitle: "isolation test", count: 3 },
        });
      expect(findingError).toBeNull();
      const { error: signInError } = await anon.auth.signInWithPassword({
        email,
        password,
      });
      expect(signInError).toBeNull();
      const findings = await anon
        .from("knowledge_health_findings")
        .select("id");
      expect(findings.error).toBeNull();
      expect(findings.data).toEqual([]);
    } finally {
      await anon.auth.signOut();
      if (userId) await service.auth.admin.deleteUser(userId);
      await service.from("organizations").delete().eq("id", orgB);
    }
  }, 30_000);
});
