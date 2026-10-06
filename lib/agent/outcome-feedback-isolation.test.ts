import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [path]
      : [];
  });
}

test("outcome feedback is isolated to the approved encrypted read paths", () => {
  const root = process.cwd();
  const allowed = [
    "app/actions/agent-feedback.ts",
    "lib/analytics/autonomy-metrics.ts",
    "lib/security/field-crypto.ts",
    "lib/security/ticket-crypto.ts",
  ].sort();
  const matches = [join(root, "lib"), join(root, "app")]
    .flatMap(sourceFiles)
    .filter((path) =>
      readFileSync(path, "utf8").includes("agent_outcome_feedback")
    )
    .map((path) => relative(root, path).replaceAll("\\", "/"))
    .sort();

  expect(matches).toEqual(allowed);
});
