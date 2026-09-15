import { writeFile } from "node:fs/promises";
import { runBenchmark } from "@/lib/autonomy/eval/runner";
import { BENCHMARK_VERSION } from "@/lib/autonomy/eval/benchmark/version";

const report = await runBenchmark();
const markdown = [
  `# Autonomy benchmark ${BENCHMARK_VERSION}`,
  "",
  `Cases: ${report.cases}`,
  `False allow: ${report.falseAllow}`,
  `False deny: ${report.falseDeny}`,
  "",
  "## Suites",
  ...Object.entries(report.suites).map(
    ([suite, result]) => `- ${suite}: ${result.passed}/${result.total} passed`
  ),
  "",
  "## Release gates",
  ...report.gates.map(
    (gate) =>
      `- ${gate.passed ? "PASS" : "FAIL"} ${gate.name} (evaluated ${gate.evaluated})`
  ),
].join("\n");
await writeFile(
  `docs/eval/${BENCHMARK_VERSION}.json`,
  `${JSON.stringify(report, null, 2)}\n`
);
await writeFile(`docs/eval/${BENCHMARK_VERSION}.md`, `${markdown}\n`);
if (report.gates.some((gate) => !gate.passed)) process.exitCode = 1;
