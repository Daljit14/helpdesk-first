import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("research reference-tier migration", () => {
  test("replaces the trust constraint idempotently and documents rollback", async () => {
    const source = await readFile(
      join(process.cwd(), "supabase/research-reference-tier.sql"),
      "utf8"
    );
    expect(source).toMatch(
      /alter table public\.research_sources\s+drop constraint if exists research_sources_trust_check/i
    );
    expect(source).toMatch(
      /add constraint research_sources_trust_check\s+check \(trust in \('vendor', 'community', 'reference'\)\)/i
    );
    expect(source).toMatch(
      /-- rollback:[\s\S]*?check \(trust in \('vendor', 'community'\)\)/i
    );
  });
});
