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
});
