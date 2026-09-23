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

  test("restricts the device job leasing RPC to service role", async () => {
    const source = await readFile(
      join(process.cwd(), "supabase/device-jobs.sql"),
      "utf8"
    );
    expect(source).toMatch(
      /revoke execute on function public\.lease_device_jobs\(uuid, integer\)\s+from public, anon, authenticated;/i
    );
    expect(source).toMatch(
      /grant execute on function public\.lease_device_jobs\(uuid, integer\)\s+to service_role;/i
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
      /revoke all on public\.devices_public from public, anon;/i
    );
    expect(deviceAgent).toMatch(
      /grant select on public\.devices_public to authenticated, service_role;/i
    );
  });
});
