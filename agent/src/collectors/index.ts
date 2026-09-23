import type {
  DiagnosticRecord,
  DiagnosticKind,
} from "../../../lib/device-agent/protocol";

export type AgentExecOptions = {
  timeoutMs?: number;
};

export type AgentExec = (
  file: string,
  args: string[],
  options?: AgentExecOptions
) => Promise<string>;
export type Collector = {
  kind: DiagnosticKind;
  run: (exec: AgentExec) => Promise<DiagnosticRecord>;
};

export type DiagnosticData = Record<string, string | number | boolean | null>;

export function summaryFromData(data: DiagnosticData): string {
  return Object.entries(data)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ")
    .slice(0, 512);
}

export function boundedError(
  kind: DiagnosticKind,
  error: unknown
): DiagnosticRecord {
  return {
    kind,
    collectedAt: new Date().toISOString(),
    ok: false,
    summary: "Diagnostic unavailable.",
    data: {},
    error:
      error instanceof Error ? error.message.slice(0, 500) : "command failed",
  };
}

export function record(
  kind: DiagnosticKind,
  data: DiagnosticData,
  ok = true
): DiagnosticRecord {
  return {
    kind,
    collectedAt: new Date().toISOString(),
    ok,
    summary: summaryFromData(data),
    data,
  };
}
