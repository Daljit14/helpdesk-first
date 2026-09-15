import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

function sourceFiles(root: string): string[] {
  const entries = readdirSync(root);
  return entries.flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

describe("autonomy import safety", () => {
  test("handler modules have one production import boundary", () => {
    const roots = ["lib/autonomy", "lib/ai", "app/api"];
    const imports = roots
      .flatMap((root) => sourceFiles(join(process.cwd(), root)))
      .filter((path) => !path.endsWith("guardrails/gateway.ts"))
      .flatMap((path) =>
        readFileSync(path, "utf8")
          .split("\n")
          .filter(
            (line) =>
              /^\s*import\b/.test(line) && line.includes("executor/handlers")
          )
      );
    expect(imports).toEqual([]);
  });

  test("unsafe execution primitives are absent", () => {
    const source = ["lib/autonomy", "lib/ai", "app/api"]
      .flatMap((root) => sourceFiles(join(process.cwd(), root)))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(source).not.toMatch(/\bchild_process\b/);
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/\bnew Function\s*\(/);
  });
});
