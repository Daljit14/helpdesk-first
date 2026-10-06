import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

function uncomment(source: string): string {
  return source
    .split("\n")
    .map((line) => line.replace(/^\s*--\s?/, ""))
    .join("\n");
}

describe("Supabase RLS coverage", () => {
  test("keeps the admin auth projection service-role-only", async () => {
    const source = await readFile(
      join(process.cwd(), "supabase/admin-database.sql"),
      "utf8"
    );
    expect(source).toMatch(
      /create or replace view public\.admin_auth_users\s+with \(security_invoker = false\)/i
    );
    expect(source).toMatch(
      /revoke all on public\.admin_auth_users from public, anon, authenticated;/i
    );
    expect(source).toMatch(
      /grant select on public\.admin_auth_users to service_role;/i
    );
  });

  test("protects connector secrets and invokes RLS on the public view", async () => {
    const source = await readFile(
      join(process.cwd(), "supabase/autonomy-l1.sql"),
      "utf8"
    );
    expect(source).toMatch(
      /create or replace view public\.organization_connectors_public\s+with \(security_invoker = true\)/i
    );
    expect(source).toMatch(
      /revoke select on public\.organization_connectors from authenticated, anon;/i
    );
    expect(source).toMatch(
      /grant select \((?![^)]*secret_ciphertext)(?![^)]*key_id)[^)]*\)\s+on public\.organization_connectors to authenticated;/i
    );
  });

  test("every declared table enables RLS and has a policy", async () => {
    const directory = join(process.cwd(), "supabase");
    const files = (await readdir(directory)).filter((file) =>
      file.endsWith(".sql")
    );
    const sources = await Promise.all(
      files.map(async (file) =>
        uncomment(await readFile(join(directory, file), "utf8"))
      )
    );
    const combined = sources.join("\n");
    const tables = new Set(
      [
        ...combined.matchAll(
          /create table(?: if not exists)? public\.([a-z0-9_]+)/gi
        ),
      ].map((match) => match[1])
    );
    const rlsTables = new Set(
      [
        ...combined.matchAll(
          /alter table public\.([a-z0-9_]+) enable row level security/gi
        ),
      ].map((match) => match[1])
    );
    const policyTables = new Set(
      [
        ...combined.matchAll(/create policy[\s\S]*? on public\.([a-z0-9_]+)/gi),
      ].map((match) => match[1])
    );
    const missingRls = [...tables].filter((table) => !rlsTables.has(table));
    const missingPolicies = [...tables].filter(
      (table) => !policyTables.has(table)
    );
    expect({ missingRls, missingPolicies }).toEqual({
      missingRls: [],
      missingPolicies: [],
    });
  });

  test("restricts the device job leasing RPC to service role", async () => {
    const source = await readFile(
      join(process.cwd(), "supabase/device-jobs.sql"),
      "utf8"
    );
    expect(source).toMatch(
      /revoke execute on function public\.lease_device_jobs\(uuid, integer, integer\)\s+from public, anon, authenticated;/i
    );
    expect(source).toMatch(
      /grant execute on function public\.lease_device_jobs\(uuid, integer, integer\)\s+to service_role;/i
    );
  });

  test("protects record exclusions and reclaim lifecycle", async () => {
    const exclusions = await readFile(
      join(process.cwd(), "supabase/record-exclusions.sql"),
      "utf8"
    );
    expect(exclusions).toMatch(/enable row level security/i);
    expect(exclusions).toMatch(/record_exclusions_service[\s\S]*for all/i);
    expect(exclusions).toMatch(/before update or delete/i);
    const jobs = await readFile(
      join(process.cwd(), "supabase/device-jobs.sql"),
      "utf8"
    );
    expect(jobs).toMatch(/reclaim_expired_device_jobs/i);
    expect(jobs).toMatch(/p_lease_seconds/i);
    expect(jobs).not.toMatch(
      /reclaim_expired_device_jobs[\s\S]*status\s*=\s*'queued'/i
    );
  });

  test("restricts requester outcome feedback inserts and revokes mutation", async () => {
    const source = await readFile(
      join(process.cwd(), "supabase/agent-outcome-feedback.sql"),
      "utf8"
    );
    expect(source).toMatch(
      /create policy agent_outcome_feedback_requester_insert[\s\S]*?with check \([\s\S]*?user_id\s*=\s*auth\.uid\(\)[\s\S]*?s\.requester_id\s*=\s*auth\.uid\(\)/i
    );
    expect(source).toMatch(
      /revoke update,\s*delete on public\.agent_outcome_feedback from anon,\s*authenticated;/i
    );
  });

  test("limits requester outage subscription updates to status", async () => {
    const source = await readFile(
      join(process.cwd(), "supabase/service-health.sql"),
      "utf8"
    );
    expect(source).toMatch(
      /revoke update on public\.outage_subscriptions from authenticated;/i
    );
    expect(source).toMatch(
      /grant select, insert on public\.outage_subscriptions to authenticated;/i
    );
    expect(source).toMatch(
      /grant update \(status\) on public\.outage_subscriptions to authenticated;/i
    );
    expect(source).not.toMatch(
      /grant select,\s*insert,\s*update on public\.outage_subscriptions to authenticated;/i
    );
  });

  test("keeps organization environment profiles tenant-scoped without deletion", async () => {
    const source = await readFile(
      join(process.cwd(), "supabase/org-environment-profile.sql"),
      "utf8"
    );
    expect(source).toMatch(
      /apply after wave-3-organizations\.sql and investigation\.sql/i
    );
    expect(source).toMatch(
      /alter table public\.org_environment_profile enable row level security/i
    );
    expect(source).toMatch(
      /org_environment_profile_member_select[\s\S]*?is_org_member\(organization_id\)/i
    );
    expect(source).toMatch(
      /org_environment_profile_admin_insert[\s\S]*?is_org_admin\(organization_id\)/i
    );
    expect(source).toMatch(
      /org_environment_profile_admin_update[\s\S]*?is_org_admin\(organization_id\)[\s\S]*?with check \(public\.is_org_admin\(organization_id\)\)/i
    );
    expect(source).not.toMatch(/create policy [^;]*delete/i);
    expect(source).toMatch(
      /grant select, insert, update on public\.org_environment_profile to authenticated;/i
    );
    expect(source).toMatch(
      /grant all on public\.org_environment_profile to service_role;/i
    );
  });

  test("restricts trusted vendor domains to org members and admins", async () => {
    const source = await readFile(
      join(process.cwd(), "supabase/org-research-vendor-domains.sql"),
      "utf8"
    );
    expect(source).toMatch(
      /alter table public\.org_research_vendor_domains enable row level security/i
    );
    expect(source).toMatch(
      /create policy org_research_vendor_domains_member_select[\s\S]*?for select[\s\S]*?using \(public\.is_org_member\(organization_id\)\)/i
    );
    expect(source).toMatch(
      /create policy org_research_vendor_domains_admin_insert[\s\S]*?for insert[\s\S]*?with check \([\s\S]*?public\.is_org_admin\(organization_id\)[\s\S]*?added_by = auth\.uid\(\)/i
    );
    expect(source).toMatch(
      /create policy org_research_vendor_domains_admin_delete[\s\S]*?for delete[\s\S]*?using \(public\.is_org_admin\(organization_id\)\)/i
    );
    const policies = source.match(/create policy[\s\S]*?;/gi)?.join("\n") ?? "";
    expect(policies).not.toMatch(/for update/i);
    expect(source).toMatch(
      /grant select, insert, delete on public\.org_research_vendor_domains to authenticated;/i
    );
    expect(source).toMatch(
      /grant all on public\.org_research_vendor_domains to service_role;/i
    );
  });

  test("restricts organization model-cost RPC execution to service role", async () => {
    const source = await readFile(
      join(process.cwd(), "supabase/model-routing.sql"),
      "utf8"
    );
    expect(source).toMatch(
      /create or replace function public\.agent_org_cost_today\(p_organization_id uuid\)[\s\S]*?security definer[\s\S]*?set search_path = public/i
    );
    expect(source).toMatch(
      /revoke all on function public\.agent_org_cost_today\(uuid\)\s+from public, anon, authenticated;/i
    );
    expect(source).toMatch(
      /grant execute on function public\.agent_org_cost_today\(uuid\) to service_role;/i
    );
    expect(source).not.toMatch(
      /grant [^;]*on public\.agent_sessions[^;]*to authenticated/i
    );
  });

  test("restricts research and public device grants", async () => {
    const research = await readFile(
      join(process.cwd(), "supabase/research.sql"),
      "utf8"
    );
    expect(research).toMatch(
      /revoke all on table public\.research_cache, public\.research_queries, public\.research_sources\s+from public, anon, authenticated;/i
    );
    expect(research).toMatch(
      /grant select on table public\.research_cache, public\.research_queries, public\.research_sources\s+to authenticated;/i
    );
    expect(research).toMatch(
      /grant all on table public\.research_cache, public\.research_queries, public\.research_sources\s+to service_role;/i
    );

    const deviceAgent = await readFile(
      join(process.cwd(), "supabase/device-agent.sql"),
      "utf8"
    );
    expect(deviceAgent).toMatch(
      /create or replace view public\.devices_public\s+with \(security_invoker = true\)/i
    );
    expect(deviceAgent).toMatch(
      /revoke all on public\.devices_public from public, anon, authenticated;/i
    );
    expect(deviceAgent).toMatch(
      /grant select on public\.devices_public to authenticated, service_role;/i
    );
  });
});
