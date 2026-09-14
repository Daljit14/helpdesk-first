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
  process.env.RUN_AUTONOMY_ISOLATION_TEST === "true" &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

describe.skipIf(!canRun)("autonomy tenant isolation", () => {
  test("enforces tenant reads, writes, lifecycle guards, and uniqueness", async () => {
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
    const ownerEmail = `autonomy-owner-${randomUUID()}@example.invalid`;
    const foreignEmail = `autonomy-foreign-${randomUUID()}@example.invalid`;
    const password = `${randomUUID()}-Aa1!`;
    let ownerId: string | null = null;
    let foreignId: string | null = null;
    let ticketId: string | null = null;
    let runId: string | null = null;
    let stepId: string | null = null;
    let eventId: string | null = null;

    try {
      expect(
        (
          await service.from("organizations").insert([
            { id: orgId, name: "Autonomy isolation test" },
            { id: foreignOrgId, name: "Foreign autonomy isolation test" },
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
          issue_title: "Autonomy isolation",
          message: "Isolation test",
          status: "Open",
        })
        .select("id")
        .single();
      expect(ticket.error).toBeNull();
      ticketId = ticket.data?.id ?? null;
      const run = await service
        .from("resolution_runs")
        .insert({
          organization_id: orgId,
          ticket_id: ticketId,
          status: "queued",
          deadline_at: new Date(Date.now() + 60_000).toISOString(),
          initiated_by: "test",
        })
        .select("id")
        .single();
      expect(run.error).toBeNull();
      runId = run.data?.id ?? null;
      const step = await service
        .from("resolution_steps")
        .insert({
          organization_id: orgId,
          run_id: runId,
          kind: "execute",
          position: 0,
        })
        .select("id")
        .single();
      expect(step.error).toBeNull();
      stepId = step.data?.id ?? null;
      const auditEvent = await service
        .from("resolution_events")
        .insert({
          organization_id: orgId,
          run_id: runId,
          ticket_id: ticketId,
          kind: "run.created",
          actor: "test",
        })
        .select("id")
        .single();
      expect(auditEvent.error).toBeNull();
      eventId = auditEvent.data?.id ?? null;

      expect(
        (
          await client.auth.signInWithPassword({
            email: foreignEmail,
            password,
          })
        ).error
      ).toBeNull();
      expect(
        (await client.from("resolution_runs").select("*").eq("id", runId)).data
      ).toEqual([]);
      expect(
        (await client.from("resolution_events").select("*").eq("id", eventId))
          .data
      ).toEqual([]);
      expect(
        (
          await client.from("resolution_runs").insert({
            organization_id: orgId,
            ticket_id: ticketId,
            status: "queued",
            deadline_at: new Date(Date.now() + 60_000).toISOString(),
            initiated_by: "client",
          })
        ).error
      ).toBeTruthy();
      await client.auth.signOut();
      expect(
        (
          await client.from("resolution_runs").insert({
            organization_id: orgId,
            ticket_id: ticketId,
            status: "queued",
            deadline_at: new Date(Date.now() + 60_000).toISOString(),
            initiated_by: "anonymous",
          })
        ).error
      ).toBeTruthy();

      expect(
        (
          await service
            .from("resolution_runs")
            .update({ status: "resolved" })
            .eq("id", runId)
        ).error
      ).toBeTruthy();
      expect(
        (
          await service
            .from("resolution_events")
            .update({ actor: "changed" })
            .eq("id", eventId)
        ).error
      ).toBeTruthy();
      expect(
        (await service.from("resolution_events").delete().eq("id", eventId))
          .error
      ).toBeTruthy();
      expect(
        (
          await service.from("resolution_runs").insert({
            organization_id: orgId,
            ticket_id: ticketId,
            status: "queued",
            deadline_at: new Date(Date.now() + 60_000).toISOString(),
            initiated_by: "duplicate",
          })
        ).error
      ).toMatchObject({ code: "23505" });
    } finally {
      await client.auth.signOut();
      if (stepId)
        await service.from("resolution_steps").delete().eq("id", stepId);
      if (runId) await service.from("resolution_runs").delete().eq("id", runId);
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
  });
});
