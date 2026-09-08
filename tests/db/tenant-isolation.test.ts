import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
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
    // Gated until the Wave 3 migration is applied.
  }
}

loadLocalEnv();

const canRun = Boolean(
  process.env.RUN_TENANT_ISOLATION_TEST === "true" &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

describe.skipIf(!canRun)("Wave 3 tenant isolation", () => {
  test("enforces org staff reads, requester ownership, invitations, and domains", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const org1 = randomUUID();
    const org2 = randomUUID();
    const password = `${randomUUID()}-Aa1!`;
    const emailA = `tenant-a-${randomUUID()}@example.invalid`;
    const emailB = `tenant-b-${randomUUID()}@example.invalid`;
    const emailC = `tenant-c-${randomUUID()}@example.invalid`;
    const token = randomBytes(32).toString("hex");
    const tokenHash = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(token))
      .then((value) =>
        Array.from(new Uint8Array(value))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("")
      );
    let users: string[] = [];
    let tickets: string[] = [];
    try {
      expect(
        (
          await service.from("organizations").insert([
            { id: org1, name: "Tenant one" },
            { id: org2, name: "Tenant two" },
          ])
        ).error
      ).toBeNull();
      const [createdA, createdB, createdC] = await Promise.all(
        [emailA, emailB, emailC].map((email) =>
          service.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          })
        )
      );
      expect(createdA.error).toBeNull();
      expect(createdB.error).toBeNull();
      expect(createdC.error).toBeNull();
      users = [
        createdA.data.user!.id,
        createdB.data.user!.id,
        createdC.data.user!.id,
      ];
      expect(
        (
          await service.from("organization_members").insert([
            { organization_id: org1, user_id: users[0], role: "requester" },
            { organization_id: org2, user_id: users[1], role: "support_agent" },
          ])
        ).error
      ).toBeNull();
      const inserted = await service
        .from("tickets")
        .insert([
          {
            organization_id: org1,
            user_id: users[0],
            issue_id: "tenant-one",
            issue_title: "Tenant one ticket",
            message: "Requester ticket",
            status: "Needs Human",
          },
          {
            organization_id: org2,
            user_id: users[1],
            issue_id: "tenant-two",
            issue_title: "Tenant two ticket",
            message: "Staff ticket",
            status: "Needs Human",
          },
        ])
        .select("id,organization_id");
      expect(inserted.error).toBeNull();
      tickets = (inserted.data ?? []).map((ticket) => ticket.id);
      expect(
        (await anon.auth.signInWithPassword({ email: emailA, password })).error
      ).toBeNull();
      const requesterRows = await anon
        .from("tickets")
        .select("id,organization_id");
      expect(
        requesterRows.data?.every((row) => row.organization_id === org1)
      ).toBe(true);
      await anon.auth.signOut();
      expect(
        (await anon.auth.signInWithPassword({ email: emailB, password })).error
      ).toBeNull();
      const staffRows = await anon.from("tickets").select("id,organization_id");
      expect(staffRows.data?.every((row) => row.organization_id === org2)).toBe(
        true
      );
      await anon.auth.signOut();

      expect(
        (
          await service.from("organization_invitations").insert({
            organization_id: org1,
            email: emailC,
            role: "requester",
            token_hash: tokenHash,
            invited_by: users[0],
          })
        ).error
      ).toBeNull();
      expect(
        (await anon.auth.signInWithPassword({ email: emailC, password })).error
      ).toBeNull();
      expect(
        (await anon.rpc("accept_invitation", { raw_token: token })).error
      ).toBeNull();
      await anon.auth.signOut();
      expect(
        (await anon.auth.signInWithPassword({ email: emailB, password })).error
      ).toBeNull();
      expect(
        (await anon.rpc("accept_invitation", { raw_token: token })).error
      ).not.toBeNull();
    } finally {
      await anon.auth.signOut();
      if (tickets.length)
        await service.from("tickets").delete().in("id", tickets);
      if (users.length) {
        await service
          .from("organization_members")
          .delete()
          .in("user_id", users);
        for (const user of users) await service.auth.admin.deleteUser(user);
      }
      await service
        .from("organization_invitations")
        .delete()
        .eq("organization_id", org1);
      await service.from("organizations").delete().in("id", [org1, org2]);
    }
  });
});
