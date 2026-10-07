import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("answer-engine migration", () => {
  test("keeps caches scoped, append-only records protected, and budget RPC service-only", async () => {
    const source = await readFile(
      join(process.cwd(), "supabase/answer-engine.sql"),
      "utf8"
    );
    for (const table of [
      "answer_source_cache",
      "answer_cache",
      "answer_engine_runs",
      "answer_engine_feedback",
      "answer_engine_usage",
    ]) {
      expect(source).toMatch(
        new RegExp(
          `alter table public\\.${table} enable row level security`,
          "i"
        )
      );
      expect(source).toMatch(
        new RegExp(`create table if not exists public\\.${table}`, "i")
      );
    }
    expect(source).toMatch(/public\.is_org_staff\(organization_id\)/i);
    expect(source).toMatch(
      /revoke all on table public\.answer_source_cache[\s\S]*?from public, anon, authenticated/i
    );
    expect(source).toMatch(
      /grant all on table public\.answer_source_cache[\s\S]*?to service_role/i
    );
    expect(source).toMatch(/unique \(run_id\)/i);
    expect(source).toMatch(
      /before update or delete on public\.answer_engine_runs/i
    );
    expect(source).toMatch(
      /before update or delete on public\.answer_engine_feedback/i
    );
    expect(source).toMatch(/answer_engine_runs[\s\S]*?on delete restrict/i);
    expect(source).toMatch(/answer_engine_feedback[\s\S]*?on delete restrict/i);
    expect(source).toMatch(/set search_path = public/i);
    expect(source).toMatch(/for update/i);
    expect(source).toMatch(/research_queries[\s\S]*?cached = false/i);
    expect(source).toMatch(
      /organization_id = p_organization_id[\s\S]*?cached = false/i
    );
    expect(source).toMatch(
      /revoke all on function public\.answer_engine_consume_budget/i
    );
    expect(source).toMatch(
      /grant execute on function public\.answer_engine_consume_budget[\s\S]*?to service_role/i
    );
    expect(source).toMatch(/-- Rollback:/);
  });
});
