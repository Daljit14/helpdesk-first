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
  } catch {}
}

loadLocalEnv();

const canRun = Boolean(
  process.env.RUN_EVIDENCE_ISOLATION_TEST === "true" &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

describe.skipIf(!canRun)("evidence tenant isolation", () => {
  test("scopes evidence reads and blocks authenticated updates", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const client = createClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );
    const orgId = randomUUID();
    const foreignOrgId = randomUUID();
    const ownerEmail = `evidence-owner-${randomUUID()}@example.invalid`;
    const foreignEmail = `evidence-foreign-${randomUUID()}@example.invalid`;
    const password = `${randomUUID()}-Aa1!`;
    let ownerId: string | null = null;
    let foreignId: string | null = null;
    let ticketId: string | null = null;

    try {
      expect(
        (
          await service.from("organizations").insert([
            { id: orgId, name: "Evidence isolation test" },
            { id: foreignOrgId, name: "Foreign evidence isolation test" },
          ])
        ).error
      ).toBeNull();
      const owner = await service.auth.admin.createUser({
        email: ownerEmail,
        password,
        email_confirm: true,
      });
      const foreign = await service.auth.admin.createUser({
        email: foreignEmail,
        password,
        email_confirm: true,
      });
      ownerId = owner.data.user?.id ?? null;
      foreignId = foreign.data.user?.id ?? null;
      expect(owner.error).toBeNull();
      expect(foreign.error).toBeNull();
      expect(
        (
          await service.from("organization_members").insert([
            { organization_id: orgId, user_id: ownerId, role: "org_admin" },
            {
              organization_id: foreignOrgId,
              user_id: foreignId,
              role: "support_agent",
            },
          ])
        ).error
      ).toBeNull();
      const ticket = await service
        .from("tickets")
        .insert({
          organization_id: orgId,
          user_id: ownerId,
          issue_id: "no-internet",
          issue_title: "Evidence isolation",
          message: "Isolation test",
          status: "Open",
        })
        .select("id")
        .single();
      expect(ticket.error).toBeNull();
      ticketId = ticket.data?.id ?? null;
      expect(
        (
          await service.from("ticket_investigations").insert({
            ticket_id: ticketId,
            organization_id: orgId,
            user_id: ownerId,
            evidence: { version: 1, description: "redacted" },
          })
        ).error
      ).toBeNull();

      expect(
        (
          await client.auth.signInWithPassword({
            email: foreignEmail,
            password,
          })
        ).error
      ).toBeNull();
      expect(
        (await client.from("ticket_investigations").select("evidence")).data
      ).toEqual([]);
      await client.auth.signOut();

      expect(
        (
          await client.auth.signInWithPassword({
            email: ownerEmail,
            password,
          })
        ).error
      ).toBeNull();
      expect(
        (await client.from("ticket_investigations").select("evidence")).data
      ).toEqual([{ evidence: { version: 1, description: "redacted" } }]);
      await client
        .from("ticket_investigations")
        .update({ evidence: { version: 1, description: "changed" } })
        .eq("ticket_id", ticketId);
      expect(
        (await client.from("ticket_investigations").select("evidence")).data
      ).toEqual([{ evidence: { version: 1, description: "redacted" } }]);
    } finally {
      await client.auth.signOut();
      if (ticketId)
        await service
          .from("ticket_investigations")
          .delete()
          .eq("ticket_id", ticketId);
      if (ticketId) await service.from("tickets").delete().eq("id", ticketId);
      if (ownerId || foreignId) {
        await service
          .from("organization_members")
          .delete()
          .in("user_id", [ownerId, foreignId].filter(Boolean));
      }
      if (ownerId) await service.auth.admin.deleteUser(ownerId);
      if (foreignId) await service.auth.admin.deleteUser(foreignId);
      await service.from("organizations").delete().eq("id", orgId);
      await service.from("organizations").delete().eq("id", foreignOrgId);
    }
  }, 30_000);
});
