import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = join(process.cwd());

describe("requester agent SQL contracts", () => {
  test("declared writeStep kinds are present in the SQL check constraint", () => {
    const source = readdirSync(join(root, "lib/agent"))
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => readFileSync(join(root, "lib/agent", file), "utf8"))
      .join("\n");
    const writtenKinds = [
      ...source.matchAll(
        /writeStep\(\s*[\s\S]{0,100}?\{\s*\n\s*kind:\s*"([^"]+)"/g
      ),
    ].map((match) => match[1]);
    const sql = [
      "requester-agent.sql",
      "service-health.sql",
      "model-routing.sql",
    ]
      .map((file) => readFileSync(join(root, "supabase", file), "utf8"))
      .join("\n");
    const allowedKinds = [
      ...sql.matchAll(/agent_steps_kind_check[^;]*kind in \(([^)]*)\)/g),
    ].flatMap((match) =>
      [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1])
    );
    expect(writtenKinds.length).toBeGreaterThan(0);
    expect([...new Set(allowedKinds)]).toEqual(
      expect.arrayContaining([...new Set(writtenKinds)])
    );
  });

  test("keeps the organization cost RPC service-role-only", () => {
    const sql = readFileSync(join(root, "supabase/model-routing.sql"), "utf8");
    expect(sql).toMatch(
      /create or replace function public\.agent_org_cost_today\(p_organization_id uuid\)[\s\S]*?security definer[\s\S]*?set search_path = public/i
    );
    expect(sql).toMatch(
      /revoke all on function public\.agent_org_cost_today\(uuid\)\s+from public, anon, authenticated;/i
    );
    expect(sql).toMatch(
      /grant execute on function public\.agent_org_cost_today\(uuid\) to service_role;/i
    );
    expect(sql).not.toMatch(/grant [^;]*agent_sessions[^;]*authenticated/i);
  });

  test("adds idempotent organization-scoped indexes for similar issue counts", () => {
    const sql = readFileSync(
      join(root, "supabase", "diagnostic-sources.sql"),
      "utf8"
    );
    expect(sql).toMatch(
      /create index if not exists tickets_org_issue_created_idx\s+on public\.tickets \(organization_id, issue_id, created_at desc\);/i
    );
    expect(sql).toMatch(
      /create index if not exists tickets_org_ai_issue_created_idx\s+on public\.tickets \(organization_id, ai_recommended_issue_id, created_at desc\);/i
    );
    const ticketSchema = readFileSync(
      join(root, "supabase", "resolution-tracking.sql"),
      "utf8"
    );
    expect(ticketSchema).toContain("ai_recommended_issue_id");
  });
});
