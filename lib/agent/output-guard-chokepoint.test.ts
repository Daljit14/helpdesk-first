import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const agentDirectory = join(process.cwd(), "lib/agent");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (
      !entry.isFile() ||
      !/\.(?:ts|tsx)$/.test(entry.name) ||
      /\.test\.(?:ts|tsx)$/.test(entry.name) ||
      ["untrusted.ts", "output-guard.ts"].includes(entry.name)
    )
      return [];
    return [path];
  });
}

describe("requester output-guard chokepoint", () => {
  test("agent source does not call or import sanitizeForUser directly", () => {
    const violations = sourceFiles(agentDirectory).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const imports =
        source.match(/^\s*import\b[\s\S]*?from\s*["'][^"']+["'];?/gm) ?? [];
      return /\bsanitizeForUser\s*\(/.test(source) ||
        imports.some((statement) => /\bsanitizeForUser\b/.test(statement))
        ? [relative(process.cwd(), path)]
        : [];
    });

    expect(violations).toEqual([]);
  });
});
