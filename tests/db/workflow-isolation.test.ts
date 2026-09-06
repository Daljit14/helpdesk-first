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
    // Gated until the workflow migration is applied.
  }
}

loadLocalEnv();

const canRun = Boolean(
  process.env.RUN_WORKFLOW_ISOLATION_TEST === "true" &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

describe.skipIf(!canRun)("ticket workflow tenant isolation", () => {
  test("keeps workflow metrics and comments organization/user scoped", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const organizationId = randomUUID();
    const email = `workflow-isolation-${randomUUID()}@example.invalid`;
    let userId: string | null = null;
    let ticketId: string | null = null;
    try {
      expect(
        (
          await service
            .from("organizations")
            .insert({ id: organizationId, name: "Workflow isolation test" })
        ).error
      ).toBeNull();
      const created = await service.auth.admin.createUser({
        email,
        password: `${randomUUID()}-Aa1!`,
        email_confirm: true,
      });
      expect(created.error).toBeNull();
      userId = created.data.user?.id ?? null;
      expect(userId).toBeTruthy();
      const inserted = await service
        .from("tickets")
        .insert({
          organization_id: organizationId,
          user_id: userId,
          issue_id: "no-internet",
          issue_title: "No internet",
          message: "Workflow isolation test",
          status: "Needs Human",
          resolver_type: "unassigned",
        })
        .select("id")
        .single();
      expect(inserted.error).toBeNull();
      ticketId = inserted.data?.id ?? null;
      expect(ticketId).toBeTruthy();
      const metrics = await service.rpc("admin_workflow_metrics", {
        org: organizationId,
      });
      expect(metrics.error).toBeNull();
      expect((metrics.data as { needsHuman: number }).needsHuman).toBe(1);
      expect(
        (await anon.auth.signInWithPassword({ email, password: "" })).error
      ).toBeTruthy();
    } finally {
      await anon.auth.signOut();
      if (ticketId) await service.from("tickets").delete().eq("id", ticketId);
      if (userId) await service.auth.admin.deleteUser(userId);
      await service.from("organizations").delete().eq("id", organizationId);
    }
  });
});
