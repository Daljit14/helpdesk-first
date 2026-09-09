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
  process.env.RUN_INVESTIGATION_ISOLATION_TEST === "true" &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

describe.skipIf(!canRun)("investigation tenant isolation", () => {
  test("prevents cross-tenant reads and client inserts", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const orgId = randomUUID();
    const ownerEmail = `investigation-owner-${randomUUID()}@example.invalid`;
    const otherEmail = `investigation-other-${randomUUID()}@example.invalid`;
    const password = `${randomUUID()}-Aa1!`;
    let ownerId: string | null = null;
    let otherId: string | null = null;
    let ticketId: string | null = null;

    try {
      expect(
        (
          await service.from("organizations").insert({
            id: orgId,
            name: "Investigation isolation test",
          })
        ).error
      ).toBeNull();
      const owner = await service.auth.admin.createUser({
        email: ownerEmail,
        password,
        email_confirm: true,
      });
      expect(owner.error).toBeNull();
      ownerId = owner.data.user?.id ?? null;
      const other = await service.auth.admin.createUser({
        email: otherEmail,
        password,
        email_confirm: true,
      });
      expect(other.error).toBeNull();
      otherId = other.data.user?.id ?? null;
      expect(ownerId).toBeTruthy();
      expect(otherId).toBeTruthy();

      const ticket = await service
        .from("tickets")
        .insert({
          organization_id: orgId,
          user_id: otherId,
          issue_id: "slow-computer",
          issue_title: "Slow computer",
          message: "Isolation test",
          status: "In Progress",
        })
        .select("id")
        .single();
      expect(ticket.error).toBeNull();
      ticketId = ticket.data?.id ?? null;
      expect(ticketId).toBeTruthy();
      expect(
        (
          await service.from("ticket_investigations").insert({
            ticket_id: ticketId,
            organization_id: orgId,
            user_id: otherId,
            context: {},
            hypotheses: [],
            excluded_steps: [],
            escalation_package: { version: 1 },
          })
        ).error
      ).toBeNull();

      expect(
        (await anon.auth.signInWithPassword({ email: ownerEmail, password }))
          .error
      ).toBeNull();
      const foreignRead = await anon
        .from("ticket_investigations")
        .select("*")
        .eq("ticket_id", ticketId);
      expect(foreignRead.error).toBeNull();
      expect(foreignRead.data).toEqual([]);
      const foreignPackage = await anon
        .from("ticket_investigations")
        .select("escalation_package")
        .eq("ticket_id", ticketId);
      expect(foreignPackage.error).toBeNull();
      expect(foreignPackage.data).toEqual([]);
      const foreignTurns = await anon
        .from("ticket_investigation_turns")
        .select("*")
        .eq("ticket_id", ticketId);
      expect(foreignTurns.error).toBeNull();
      expect(foreignTurns.data).toEqual([]);

      await anon.auth.signOut();
      const insertAttempt = await anon.from("ticket_investigations").insert({
        ticket_id: ticketId,
        organization_id: orgId,
        user_id: ownerId,
        context: {},
        hypotheses: [],
        excluded_steps: [],
      });
      expect(insertAttempt.error).toBeTruthy();
    } finally {
      await anon.auth.signOut();
      if (ticketId) {
        await service
          .from("ticket_investigations")
          .delete()
          .eq("ticket_id", ticketId);
        await service
          .from("ticket_investigation_turns")
          .delete()
          .eq("ticket_id", ticketId);
        await service.from("tickets").delete().eq("id", ticketId);
      }
      if (ownerId) await service.auth.admin.deleteUser(ownerId);
      if (otherId) await service.auth.admin.deleteUser(otherId);
      await service.from("organizations").delete().eq("id", orgId);
    }
  });
});
