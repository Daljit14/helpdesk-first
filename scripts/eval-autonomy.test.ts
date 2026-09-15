import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { runBenchmark } from "@/lib/autonomy/eval/runner";
import { BENCHMARK_VERSION } from "@/lib/autonomy/eval/benchmark/version";

describe("committed autonomy benchmark", () => {
  test("writes the versioned report and passes release gates", async () => {
    const report = await runBenchmark();
    await mkdir("docs/eval", { recursive: true });
    await writeFile(
      `docs/eval/${BENCHMARK_VERSION}.json`,
      `${JSON.stringify(report, null, 2)}\n`
    );
    await writeFile(
      `docs/eval/${BENCHMARK_VERSION}.md`,
      [
        `# Autonomy benchmark ${BENCHMARK_VERSION}`,
        "",
        `Cases: ${report.cases}`,
        `False allow: ${report.falseAllow}`,
        `False deny: ${report.falseDeny}`,
        "",
        "## Suites",
        ...Object.entries(report.suites).map(
          ([suite, result]) =>
            `- ${suite}: ${result.passed}/${result.total} passed`
        ),
        "",
        "## Release gates",
        ...report.gates.map(
          (gate) =>
            `- ${gate.passed ? "PASS" : "FAIL"} ${gate.name} (evaluated ${gate.evaluated})`
        ),
      ].join("\n") + "\n"
    );
    expect(report.gates.every((gate) => gate.passed)).toBe(true);
  });
});
