import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("agent web-search migration", () => {
  test("adds session ownership, nullable legacy links, and rollback statements", async () => {
    const source = await readFile(
      join(process.cwd(), "supabase/agent-web-search.sql"),
      "utf8"
    );
    for (const table of ["research_queries", "research_sources"]) {
      expect(source).toMatch(
        new RegExp(
          `alter table public\\.${table}[\\s\\S]*?add column if not exists agent_session_id uuid[\\s\\S]*?references public\\.agent_sessions\\(id\\) on delete cascade`,
          "i"
        )
      );
      expect(source).toMatch(
        new RegExp(
          `alter table public\\.${table}[\\s\\S]*?alter column run_id drop not null,[\\s\\S]*?alter column ticket_id drop not null`,
          "i"
        )
      );
      expect(source).toMatch(
        new RegExp(
          `constraint ${table}_owner_check[\\s\\S]*?check \\(\\(run_id is not null and ticket_id is not null\\) or agent_session_id is not null\\)`,
          "i"
        )
      );
      expect(source).toMatch(
        new RegExp(
          `-- alter table public\\.${table} drop column if exists agent_session_id`,
          "i"
        )
      );
    }
    expect(source).toMatch(
      /research_queries_agent_session_created_idx[\s\S]*?on public\.research_queries\(agent_session_id, created_at\)/i
    );
    expect(source).toMatch(
      /research_sources_agent_session_idx[\s\S]*?on public\.research_sources\(agent_session_id\)/i
    );
    expect(source).not.toMatch(/\b(?:create policy|grant|revoke|trigger)\b/i);
  });
});
