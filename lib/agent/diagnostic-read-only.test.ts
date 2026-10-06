import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const toolsSource = readFileSync(
  join(process.cwd(), "lib/agent/tools.ts"),
  "utf8"
);

function branchSource(name: string): string {
  const start = toolsSource.indexOf(`else if (name === "${name}")`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = toolsSource.indexOf('else if (name === "', start + 1);
  return toolsSource.slice(start, next === -1 ? undefined : next);
}

describe("diagnostic tools remain read-only", () => {
  test("does not import action or executor modules", () => {
    expect(toolsSource).not.toMatch(
      /from ["'][^"']*(?:\/executor(?:\/|["'])|\/guardrails\/gateway(?:\/|["'])|\/actions(?:\/|["'])|app\/actions\/)[^"']*["']/
    );
  });

  test.each(["get_recent_sign_in_failures", "count_similar_org_issues"])(
    "%s branch cannot write or propose actions",
    (name) => {
      expect(branchSource(name)).not.toMatch(
        /\.(?:insert|update|upsert|delete|rpc)\s*\(|\bproposeAction\b/
      );
    }
  );
});
