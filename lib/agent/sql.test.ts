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
    const sql = readFileSync(
      join(root, "supabase/requester-agent.sql"),
      "utf8"
    );
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
});
