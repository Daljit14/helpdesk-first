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
  process.env.RUN_CAPABILITY_ISOLATION_TEST === "true" &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

describe.skipIf(!canRun)("capability tenant isolation", () => {
  test("enforces capability reads, enablement writes, and version immutability", async () => {
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
    const ownerEmail = `capability-owner-${randomUUID()}@example.invalid`;
    const foreignEmail = `capability-foreign-${randomUUID()}@example.invalid`;
    const password = `${randomUUID()}-Aa1!`;
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const capabilityId = `testcap_a_${suffix}`;
    const foreignCapabilityId = `testcap_b_${suffix}`;
    let ownerId: string | null = null;
    let foreignId: string | null = null;

    try {
      expect(
        (
          await service.from("organizations").insert([
            { id: orgId, name: "Capability isolation test" },
            { id: foreignOrgId, name: "Foreign capability isolation test" },
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
            { organization_id: orgId, user_id: ownerId, role: "support_agent" },
            {
              organization_id: foreignOrgId,
              user_id: foreignId,
              role: "support_agent",
            },
          ])
        ).error
      ).toBeNull();
      expect(
        (
          await service.from("capabilities").insert([
            {
              id: capabilityId,
              department: "Ticket Queue",
              description: "Isolation test capability A",
              side_effects: "read_only",
              owner: "test",
              review_date: "2099-01-01",
            },
            {
              id: foreignCapabilityId,
              department: "Ticket Queue",
              description: "Isolation test capability B",
              side_effects: "read_only",
              owner: "test",
              review_date: "2099-01-01",
            },
          ])
        ).error
      ).toBeNull();
      expect(
        (
          await service.from("capability_versions").insert([
            {
              capability_id: capabilityId,
              version: 1,
              input_schema: { type: "object" },
              checksum: "test-a",
              risk_level: "safe",
              consent: "none",
              max_runtime_ms: 5000,
              expected_result: "read",
              verification: "read",
              rollback: "none",
            },
            {
              capability_id: foreignCapabilityId,
              version: 1,
              input_schema: { type: "object" },
              checksum: "test-b",
              risk_level: "safe",
              consent: "none",
              max_runtime_ms: 5000,
              expected_result: "read",
              verification: "read",
              rollback: "none",
            },
          ])
        ).error
      ).toBeNull();
      expect(
        (
          await service.from("organization_capabilities").insert([
            {
              organization_id: orgId,
              capability_id: capabilityId,
              enabled: true,
            },
            {
              organization_id: foreignOrgId,
              capability_id: foreignCapabilityId,
              enabled: true,
            },
          ])
        ).error
      ).toBeNull();

      expect(
        (
          await client.auth.signInWithPassword({
            email: ownerEmail,
            password,
          })
        ).error
      ).toBeNull();
      expect(
        (
          await client
            .from("capabilities")
            .select("id")
            .in("id", [capabilityId, foreignCapabilityId])
        ).data
      ).toHaveLength(2);
      expect(
        (
          await client
            .from("capability_versions")
            .select("capability_id")
            .in("capability_id", [capabilityId, foreignCapabilityId])
        ).data
      ).toHaveLength(2);
      expect(
        (
          await client
            .from("organization_capabilities")
            .select("organization_id,capability_id")
        ).data
      ).toEqual([{ organization_id: orgId, capability_id: capabilityId }]);

      const deniedInsert = await client
        .from("organization_capabilities")
        .insert({
          organization_id: orgId,
          capability_id: foreignCapabilityId,
          enabled: true,
        });
      expect(deniedInsert.error || deniedInsert.data === null).toBeTruthy();
      expect(
        (
          await client
            .from("organization_capabilities")
            .select("capability_id")
            .eq("organization_id", orgId)
            .eq("capability_id", foreignCapabilityId)
        ).data
      ).toEqual([]);

      await client
        .from("capability_versions")
        .update({ status: "revoked" })
        .eq("capability_id", capabilityId)
        .eq("version", 1);
      expect(
        (
          await service
            .from("capability_versions")
            .select("status")
            .eq("capability_id", capabilityId)
            .eq("version", 1)
            .single()
        ).data
      ).toEqual({ status: "active" });
    } finally {
      await client.auth.signOut();
      await service
        .from("organization_capabilities")
        .delete()
        .in("organization_id", [orgId, foreignOrgId]);
      await service
        .from("capability_versions")
        .delete()
        .in("capability_id", [capabilityId, foreignCapabilityId]);
      await service
        .from("capabilities")
        .delete()
        .in("id", [capabilityId, foreignCapabilityId]);
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
