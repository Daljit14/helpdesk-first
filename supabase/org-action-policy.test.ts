import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("organization AI action policy migration", () => {
  test("defines constrained organization-scoped policy rules", async () => {
    const source = await readFile(
      join(process.cwd(), "supabase/org-action-policy.sql"),
      "utf8"
    );
    expect(source).toMatch(
      /organization_id uuid not null\s+references public\.organizations\(id\) on delete cascade/i
    );
    expect(source).toMatch(
      /capability_id = '\*' or capability_id ~ '\^\[a-z\]\[a-z0-9_\]\{2,63\}\$'/i
    );
    expect(source).toMatch(
      /scope_groups text\[\] not null default '\{\}'\s+check \(public\.org_action_policy_groups_valid\(scope_groups\)\)/i
    );
    expect(source).toMatch(
      /max_tier text not null default 'consent'[\s\S]*?'shadow', 'consent', 'autorun'/i
    );
    expect(source).toMatch(
      /org_action_policies_org_capability_idx[\s\S]*?organization_id, capability_id/i
    );
  });

  test("allows staff reads, restricts policy writes to the service role, and keeps events append-only", async () => {
    const source = await readFile(
      join(process.cwd(), "supabase/org-action-policy.sql"),
      "utf8"
    );
    expect(source).toMatch(
      /org_action_policies_staff_select[\s\S]*?is_org_staff\(organization_id\)/i
    );
    for (const operation of ["insert", "update", "delete"]) {
      expect(source).toMatch(
        new RegExp(
          `drop policy if exists org_action_policies_admin_${operation}`,
          "i"
        )
      );
    }
    expect(source).not.toMatch(
      /create policy \w+\s+on public\.org_action_policies\s+for (?:all|insert|update|delete)\b[\s\S]*?\bto authenticated\b/i
    );
    expect(source).not.toMatch(
      /grant\b[^;]*\b(?:all|insert|update|delete)\b[^;]*on public\.org_action_policies\s+to authenticated/i
    );
    expect(source).toMatch(
      /revoke insert, update, delete\s+on public\.org_action_policies from anon, authenticated/i
    );
    expect(source).toMatch(
      /grant select on public\.org_action_policies to authenticated/i
    );
    expect(source).toMatch(
      /grant all on public\.org_action_policies to service_role/i
    );
    expect(source).toMatch(
      /comment on table public\.org_action_policies[\s\S]*?saveOrgActionPolicyAction[\s\S]*?deleteOrgActionPolicyAction[\s\S]*?audit-chained/i
    );
    expect(source).toMatch(
      /org_action_policy_events_staff_select[\s\S]*?is_org_staff\(organization_id\)/i
    );
    expect(source).toMatch(
      /before update or delete on public\.org_action_policy_events[\s\S]*?execute function public\.org_action_policy_events_immutable/i
    );
    expect(source).toMatch(
      /revoke insert, update, delete\s+on public\.org_action_policy_events from anon, authenticated/i
    );
    expect(source).toMatch(
      /grant all on public\.org_action_policy_events to service_role/i
    );
  });

  test("keeps deleted policy references in audit events and permits audit chaining", async () => {
    const source = await readFile(
      join(process.cwd(), "supabase/org-action-policy.sql"),
      "utf8"
    );
    expect(source).toMatch(
      /create table if not exists public\.org_action_policy_events\s*\([\s\S]*?policy_id uuid,[\s\S]*?action text not null check \(action in \('created', 'updated', 'deleted'\)\)/i
    );
    expect(source).not.toMatch(
      /create table if not exists public\.org_action_policy_events\s*\([\s\S]*?policy_id uuid references/i
    );
    const chain = await readFile(
      join(process.cwd(), "supabase/audit-chain.sql"),
      "utf8"
    );
    expect(chain).toMatch(
      /alter table public\.audit_chain_anchors\s+drop constraint if exists audit_chain_anchors_table_name_check/i
    );
    expect(chain).toMatch(/'org_action_policy_events'/i);
  });
});
