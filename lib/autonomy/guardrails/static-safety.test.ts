import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";

function sourceFiles(root: string): string[] {
  const entries = readdirSync(root);
  return entries.flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

function productionFiles(root: string): string[] {
  return sourceFiles(root).filter((path) => !path.includes(".test."));
}

function resolvesToHandlerIndex(file: string, specifier: string): boolean {
  const base = specifier.startsWith("@/")
    ? join(process.cwd(), specifier.slice(2))
    : join(dirname(file), specifier);
  const normalized = base.endsWith(".ts") ? base : `${base}.ts`;
  return (
    normalized.endsWith("/lib/autonomy/executor/handlers.ts") ||
    normalized.endsWith("/lib/autonomy/executor/handlers/index.ts") ||
    normalized.endsWith("/lib/autonomy/executor/handlers")
  );
}

describe("autonomy import safety", () => {
  test("handler modules have one production import boundary", () => {
    const roots = ["lib", "app"];
    const imports = roots
      .flatMap((root) => productionFiles(join(process.cwd(), root)))
      .filter(
        (path) =>
          !path.endsWith("guardrails/gateway.ts") &&
          !path.endsWith("executor/handlers/index.ts")
      )
      .flatMap((path) =>
        [
          ...readFileSync(path, "utf8").matchAll(
            /\bimport\s+(?:type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["']/g
          ),
        ]
          .filter((match) => resolvesToHandlerIndex(path, match[1]))
          .map((match) => `${path}: ${match[1]}`)
      );
    expect(imports).toEqual([]);
    const getHandlerCalls = roots
      .flatMap((root) => productionFiles(join(process.cwd(), root)))
      .filter(
        (path) =>
          !path.endsWith("guardrails/gateway.ts") &&
          !path.endsWith("executor/handlers/index.ts")
      )
      .flatMap((path) =>
        /\bgetHandler\s*\(/.test(readFileSync(path, "utf8")) ? [path] : []
      );
    expect(getHandlerCalls).toEqual([]);
  });

  test("unsafe execution primitives are absent", () => {
    const source = ["lib", "app"]
      .flatMap((root) => productionFiles(join(process.cwd(), root)))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(source).not.toMatch(/\bchild_process\b/);
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/\b(?:new\s+)?Function\s*\(/);
    expect(source).not.toMatch(/\bexecSync\s*\(/);
    expect(source).not.toMatch(/\bspawn\s*\(/);
  });
});
