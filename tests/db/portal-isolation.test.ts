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
    // Gated until the portal migration is applied.
  }
}

loadLocalEnv();

const canRun = Boolean(
  process.env.RUN_PORTAL_ISOLATION_TEST === "true" &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

describe.skipIf(!canRun)("ticket portal tenant isolation", () => {
  test("keeps requester ticket data and portal RPCs owner-scoped", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const organizationId = randomUUID();
    const password = `${randomUUID()}-Aa1!`;
    const userAEmail = `portal-a-${randomUUID()}@example.invalid`;
    const userBEmail = `portal-b-${randomUUID()}@example.invalid`;
    let userA: string | null = null;
    let userB: string | null = null;
    let ticketA: string | null = null;
    try {
      expect(
        (
          await service
            .from("organizations")
            .insert({ id: organizationId, name: "Portal isolation test" })
        ).error
      ).toBeNull();
      const createdA = await service.auth.admin.createUser({
        email: userAEmail,
        password,
        email_confirm: true,
      });
      const createdB = await service.auth.admin.createUser({
        email: userBEmail,
        password,
        email_confirm: true,
      });
      expect(createdA.error).toBeNull();
      expect(createdB.error).toBeNull();
      userA = createdA.data.user?.id ?? null;
      userB = createdB.data.user?.id ?? null;
      expect(userA).toBeTruthy();
      expect(userB).toBeTruthy();
      const inserted = await service
        .from("tickets")
        .insert({
          organization_id: organizationId,
          user_id: userA,
          issue_id: "no-internet",
          issue_title: "Portal isolation",
          message: "Owner ticket",
          status: "Resolved",
          resolver_type: "unassigned",
          resolved_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      expect(inserted.error).toBeNull();
      ticketA = inserted.data?.id ?? null;
      expect(ticketA).toBeTruthy();
      expect(
        (
          await service.from("ticket_comments").insert({
            ticket_id: ticketA,
            organization_id: organizationId,
            author_id: userA,
            author_type: "employee",
            visibility: "internal",
            message: "Private note",
          })
        ).error
      ).toBeNull();
      expect(
        (
          await service.from("ticket_system_events").insert({
            ticket_id: ticketA,
            organization_id: organizationId,
            actor_type: "system",
            event_type: "ticket.created",
            detail: {},
          })
        ).error
      ).toBeNull();

      const userBClient = createClient(
        url,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      expect(
        (
          await userBClient.auth.signInWithPassword({
            email: userBEmail,
            password,
          })
        ).error
      ).toBeNull();
      expect(
        (await userBClient.from("tickets").select("id").eq("id", ticketA)).data
      ).toEqual([]);
      expect(
        (
          await userBClient
            .from("ticket_comments")
            .select("id")
            .eq("ticket_id", ticketA)
        ).data
      ).toEqual([]);
      expect(
        (
          await userBClient
            .from("ticket_system_events")
            .select("id")
            .eq("ticket_id", ticketA)
        ).data
      ).toEqual([]);
      expect(
        (
          await userBClient.rpc("user_reopen_ticket", {
            ticket: ticketA,
            reason: "No",
          })
        ).error
      ).toBeTruthy();
      expect(
        (
          await userBClient.rpc("user_rate_ticket", {
            ticket: ticketA,
            rating: 5,
            comment: "",
          })
        ).error
      ).toBeTruthy();

      const userAClient = createClient(
        url,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      expect(
        (
          await userAClient.auth.signInWithPassword({
            email: userAEmail,
            password,
          })
        ).error
      ).toBeNull();
      expect(
        (
          await userAClient
            .from("ticket_comments")
            .select("id")
            .eq("ticket_id", ticketA)
        ).data
      ).toEqual([]);
      expect(
        (
          await userAClient
            .from("tickets")
            .update({ satisfaction_rating: 4 })
            .eq("id", ticketA)
        ).error
      ).toBeTruthy();
      expect(
        (
          await service
            .from("tickets")
            .update({
              resolved_at: new Date(
                Date.now() - 15 * 24 * 60 * 60 * 1000
              ).toISOString(),
            })
            .eq("id", ticketA)
        ).error
      ).toBeNull();
      expect(
        (
          await userAClient.rpc("user_reopen_ticket", {
            ticket: ticketA,
            reason: "Still broken",
          })
        ).error
      ).toBeTruthy();
    } finally {
      await anon.auth.signOut();
      if (ticketA) {
        await service
          .from("ticket_system_events")
          .delete()
          .eq("ticket_id", ticketA);
        await service.from("ticket_comments").delete().eq("ticket_id", ticketA);
        await service.from("tickets").delete().eq("id", ticketA);
      }
      if (userA) await service.auth.admin.deleteUser(userA);
      if (userB) await service.auth.admin.deleteUser(userB);
      await service.from("organizations").delete().eq("id", organizationId);
    }
  }, 30_000);
});
