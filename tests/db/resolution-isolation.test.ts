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
  process.env.RUN_RESOLUTION_ISOLATION_TEST === "true" &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

describe.skipIf(!canRun)("resolution tracking tenant isolation", () => {
  test("keeps resolution metrics and RPCs organization/user scoped", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const orgA = "00000000-0000-0000-0000-000000000001";
    const orgB = randomUUID();
    const email = `resolution-test-${randomUUID()}@example.invalid`;
    const ownerEmail = `resolution-owner-${randomUUID()}@example.invalid`;
    const password = `${randomUUID()}-Aa1!`;
    let userId: string | null = null;
    let ownerId: string | null = null;
    let ticketB: string | null = null;
    let userTicket: string | null = null;

    try {
      const { error: orgError } = await service
        .from("organizations")
        .insert({ id: orgB, name: "Resolution isolation test" });
      expect(orgError).toBeNull();

      const { data: createdUser, error: userError } =
        await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
      expect(userError).toBeNull();
      userId = createdUser.user?.id ?? null;
      expect(userId).toBeTruthy();
      const { data: ownerUser, error: ownerError } =
        await service.auth.admin.createUser({
          email: ownerEmail,
          password: `${randomUUID()}-Bb2!`,
          email_confirm: true,
        });
      expect(ownerError).toBeNull();
      ownerId = ownerUser.user?.id ?? null;
      expect(ownerId).toBeTruthy();

      const baselineA = await service.rpc("admin_resolution_metrics", {
        org: orgA,
      });
      expect(baselineA.error).toBeNull();

      const { data: inserted, error: ticketError } = await service
        .from("tickets")
        .insert({
          organization_id: orgB,
          user_id: ownerId,
          issue_id: "no-internet",
          issue_title: "No internet",
          message: "Isolation test",
          status: "Resolved",
          resolution_source: "agent",
        })
        .select("id")
        .single();
      expect(ticketError).toBeNull();
      ticketB = inserted?.id ?? null;
      expect(ticketB).toBeTruthy();

      const metricsB = await service.rpc("admin_resolution_metrics", {
        org: orgB,
      });
      expect(metricsB.error).toBeNull();
      expect((metricsB.data as { agentSolved: number }).agentSolved).toBe(1);
      const afterA = await service.rpc("admin_resolution_metrics", {
        org: orgA,
      });
      expect(afterA.error).toBeNull();
      for (const key of [
        "totalTickets",
        "openTickets",
        "aiAttempted",
        "aiSolved",
        "agentSolved",
        "selfServiceSolved",
        "escalated",
      ]) {
        expect((afterA.data as Record<string, number>)[key]).toBe(
          (baselineA.data as Record<string, number>)[key]
        );
      }

      const { error: signInError } = await anon.auth.signInWithPassword({
        email,
        password,
      });
      expect(signInError).toBeNull();

      const { error: foreignConfirmError } = await anon.rpc(
        "confirm_ticket_resolved",
        { ticket: ticketB }
      );
      expect(foreignConfirmError).toBeTruthy();

      const { data: ownTicket, error: ownTicketError } = await service
        .from("tickets")
        .insert({
          organization_id: orgB,
          user_id: userId,
          issue_id: "no-internet",
          issue_title: "No internet",
          message: "Guard test",
          status: "In Progress",
        })
        .select("id")
        .single();
      expect(ownTicketError).toBeNull();
      userTicket = ownTicket?.id ?? null;
      expect(userTicket).toBeTruthy();

      const { error: directUpdateError } = await anon
        .from("tickets")
        .update({ resolution_source: "ai" })
        .eq("id", userTicket);
      expect(directUpdateError).toBeTruthy();
    } finally {
      await anon.auth.signOut();
      if (ticketB || userTicket) {
        await service
          .from("tickets")
          .delete()
          .in("id", [ticketB, userTicket].filter(Boolean));
      }
      if (userId) await service.auth.admin.deleteUser(userId);
      if (ownerId) await service.auth.admin.deleteUser(ownerId);
      await service.from("organizations").delete().eq("id", orgB);
    }
  });
});
