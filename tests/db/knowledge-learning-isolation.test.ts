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
  process.env.RUN_KNOWLEDGE_LEARNING_ISOLATION_TEST === "true" &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

describe.skipIf(!canRun)("knowledge learning tenant isolation", () => {
  test("prevents cross-tenant reads and client inserts", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const orgId = randomUUID();
    const otherOrgId = randomUUID();
    const ownerEmail = `learning-owner-${randomUUID()}@example.invalid`;
    const otherEmail = `learning-other-${randomUUID()}@example.invalid`;
    const foreignEmail = `learning-foreign-${randomUUID()}@example.invalid`;
    const password = `${randomUUID()}-Aa1!`;
    let ownerId: string | null = null;
    let otherId: string | null = null;
    let foreignId: string | null = null;
    let ticketId: string | null = null;
    let draftId: string | null = null;
    let eventId: string | null = null;
    try {
      expect(
        (
          await service
            .from("organizations")
            .insert({ id: orgId, name: "Learning isolation test" })
        ).error
      ).toBeNull();
      expect(
        (
          await service
            .from("organizations")
            .insert({ id: otherOrgId, name: "Foreign learning isolation test" })
        ).error
      ).toBeNull();
      const owner = await service.auth.admin.createUser({
        email: ownerEmail,
        password,
        email_confirm: true,
      });
      const other = await service.auth.admin.createUser({
        email: otherEmail,
        password,
        email_confirm: true,
      });
      const foreign = await service.auth.admin.createUser({
        email: foreignEmail,
        password,
        email_confirm: true,
      });
      ownerId = owner.data.user?.id ?? null;
      otherId = other.data.user?.id ?? null;
      foreignId = foreign.data.user?.id ?? null;
      expect(owner.error).toBeNull();
      expect(other.error).toBeNull();
      expect(foreign.error).toBeNull();
      expect(
        (
          await service.from("organization_members").insert([
            { organization_id: orgId, user_id: ownerId, role: "org_admin" },
            { organization_id: orgId, user_id: otherId, role: "support_agent" },
          ])
        ).error
      ).toBeNull();
      expect(
        (
          await service.from("organization_members").insert({
            organization_id: otherOrgId,
            user_id: foreignId,
            role: "support_agent",
          })
        ).error
      ).toBeNull();
      const ticket = await service
        .from("tickets")
        .insert({
          organization_id: orgId,
          user_id: otherId,
          issue_id: "no-internet",
          issue_title: "No internet connection",
          message: "Isolation test",
          status: "Resolved",
        })
        .select("id")
        .single();
      expect(ticket.error).toBeNull();
      ticketId = ticket.data?.id ?? null;
      const draft = await service
        .from("knowledge_drafts")
        .insert({
          organization_id: orgId,
          ticket_id: ticketId,
          kind: "new_guide",
          title: "Isolation draft",
          content: {},
          confirmation: "user_confirmed",
        })
        .select("id")
        .single();
      expect(draft.error).toBeNull();
      draftId = draft.data?.id ?? null;
      const event = await service
        .from("knowledge_learning_events")
        .insert({
          organization_id: orgId,
          ticket_id: ticketId,
          status: "pending",
        })
        .select("id")
        .single();
      expect(event.error).toBeNull();
      eventId = event.data?.id ?? null;
      expect(
        (await anon.auth.signInWithPassword({ email: foreignEmail, password }))
          .error
      ).toBeNull();
      expect(
        (await anon.from("knowledge_drafts").select("*").eq("id", draftId)).data
      ).toEqual([]);
      expect(
        (
          await anon
            .from("knowledge_learning_events")
            .select("*")
            .eq("id", eventId)
        ).data
      ).toEqual([]);
      await anon.auth.signOut();
      expect(
        (
          await anon.from("knowledge_drafts").insert({
            organization_id: orgId,
            ticket_id: ticketId,
            kind: "new_guide",
            title: "Unauthorized",
            content: {},
            confirmation: "user_confirmed",
          })
        ).error
      ).toBeTruthy();
      expect(
        (
          await anon.from("knowledge_learning_events").insert({
            organization_id: orgId,
            ticket_id: ticketId,
            status: "pending",
          })
        ).error
      ).toBeTruthy();
    } finally {
      await anon.auth.signOut();
      if (draftId)
        await service.from("knowledge_drafts").delete().eq("id", draftId);
      if (eventId)
        await service
          .from("knowledge_learning_events")
          .delete()
          .eq("id", eventId);
      if (ticketId) await service.from("tickets").delete().eq("id", ticketId);
      if (ownerId && otherId) {
        await service
          .from("organization_members")
          .delete()
          .in("user_id", [ownerId, otherId]);
      }
      if (foreignId) {
        await service
          .from("organization_members")
          .delete()
          .eq("user_id", foreignId);
      }
      if (ownerId) await service.auth.admin.deleteUser(ownerId);
      if (otherId) await service.auth.admin.deleteUser(otherId);
      if (foreignId) await service.auth.admin.deleteUser(foreignId);
      await service.from("organizations").delete().eq("id", orgId);
      await service.from("organizations").delete().eq("id", otherOrgId);
    }
  });
});
