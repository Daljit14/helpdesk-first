import { STYLE_RULES_VERSION } from "@/lib/agent/style";
import type { EvaluationCaseResult } from "./gates";

export function replyQualityMarkdown(results: EvaluationCaseResult[]): string {
  const scores = results.flatMap((result) =>
    result.replyQuality ? [result.replyQuality] : []
  );
  const v1Checks = scores.reduce(
    (total, score) => total + score.v1.checksPassed,
    0
  );
  const v2Checks = scores.reduce(
    (total, score) => total + score.v2.checksPassed,
    0
  );
  const totalChecks = scores.length * 7;
  const mean = (version: "v1" | "v2") =>
    scores.length > 0
      ? (
          scores.reduce((total, score) => total + score[version].grade, 0) /
          scores.length
        ).toFixed(2)
      : "0.00";

  return [
    "## Reply quality",
    "",
    `Style rules version: ${STYLE_RULES_VERSION}`,
    "",
    "| fixture | v1 grade | v2 grade | v1 checks | v2 checks |",
    "|---|---:|---:|---:|---:|",
    ...scores.map(
      (score) =>
        `| ${score.fixtureId} | ${score.v1.grade.toFixed(2)} | ${score.v2.grade.toFixed(2)} | ${score.v1.checksPassed}/7 | ${score.v2.checksPassed}/7 |`
    ),
    `| Mean / total | ${mean("v1")} | ${mean("v2")} | ${v1Checks}/${totalChecks} | ${v2Checks}/${totalChecks} |`,
  ].join("\n");
}
