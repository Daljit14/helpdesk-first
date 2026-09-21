import type {
  DiagnosticRecord,
  DiagnosticKind,
} from "../../../lib/device-agent/protocol";

export type AgentExec = (file: string, args: string[]) => Promise<string>;
export type Collector = {
  kind: DiagnosticKind;
  run: (exec: AgentExec) => Promise<DiagnosticRecord>;
};

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
  summary: string,
  data: Record<string, string | number | boolean | null> = {}
): DiagnosticRecord {
  return {
    kind,
    collectedAt: new Date().toISOString(),
    ok: true,
    summary,
    data,
  };
}
