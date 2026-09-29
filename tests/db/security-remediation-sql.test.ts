import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/security-remediation-b1-b5.sql",
  "utf8"
);

describe("security remediation migration", () => {
  test("removes requester ticket writes and protects ticket rows", () => {
    expect(migration).toContain(
      'drop policy if exists "Users manage their own tickets" on public.tickets;'
    );
    expect(migration).toContain(
      'create policy "Users read their own tickets" on public.tickets'
    );
    expect(migration).toMatch(
      /create policy "Users read their own tickets"[\s\S]*for select to authenticated/
    );

    const ticketPolicies = migration.match(
      /create policy[\s\S]*?on public\.tickets[\s\S]*?;/gi
    );
    expect(ticketPolicies).toHaveLength(1);
    expect(ticketPolicies?.[0]).not.toMatch(
      /\bfor\s+(?:all|update|delete|insert)\b/i
    );

    for (const column of [
      "status",
      "organization_id",
      "priority",
      "verification_exception",
      "message",
      "category",
      "issue_id",
      "human_response_due_at",
      "resolution_due_at",
      "overdue_notified_at",
      "resolution_overdue_notified_at",
      "sla_risk_notified_at",
    ]) {
      expect(migration).toContain(
        `new.${column} is distinct from old.${column}`
      );
    }

    expect(migration).toContain(
      "create or replace function public.tickets_guard_delete()"
    );
    expect(migration).toMatch(
      /create trigger tickets_guard_delete_trigger\s+before delete on public\.tickets/
    );
  });

  test("tightens the legacy attachment bucket", () => {
    expect(migration).toContain("file_size_limit = 20971520");
    expect(migration).toContain("'image/png'");
    expect(migration).toContain("'image/jpeg'");
    expect(migration).toContain("'image/webp'");
    expect(migration).toContain("'application/pdf'");
    expect(migration).toContain("public = false");
  });
});
