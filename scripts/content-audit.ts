import { mkdirSync, writeFileSync } from "node:fs";
import { ISSUES } from "../lib/issues";
import { getIssueStepSource, getIssueSteps } from "../lib/steps";

const lines = [
  "# Content audit",
  "",
  `Generated: ${new Date().toISOString().slice(0, 10)}`,
  "",
  `- Issues: ${ISSUES.length}`,
  `- Issues with at least four steps: ${ISSUES.filter((issue) => getIssueSteps(issue).length >= 4).length}`,
  `- Issue-specific step sources: ${ISSUES.filter((issue) => getIssueStepSource(issue) === "issue").length}`,
  "",
  "| Issue | Category | Step source | Steps |",
  "| --- | --- | --- | ---: |",
  ...ISSUES.map(
    (issue) =>
      `| ${issue.title.replaceAll("|", "\\|")} | ${issue.category} | ${getIssueStepSource(issue)} | ${getIssueSteps(issue).length} |`
  ),
  "",
];

mkdirSync("docs", { recursive: true });
writeFileSync("docs/CONTENT-AUDIT.md", lines.join("\n"));
