import { createHash } from "node:crypto";
import { getDeviceAction } from "../../lib/device-agent/catalog";
import type {
  DiagnosticRecord,
  JobReport,
  JobPollResponse,
  DevicePlatform,
} from "../../lib/device-agent/protocol";
import { platformCollectors } from "./collectors";
import type { AgentExec as CollectorExec } from "./collectors/index";

export type AgentJob = JobPollResponse["jobs"][number];

function platformName(): DevicePlatform {
  return process.platform === "win32"
    ? "windows"
    : process.platform === "darwin"
      ? "macos"
      : "linux";
}

function execForAgent(): CollectorExec {
  return async (file, args) => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const result = await run(file, args, {
      timeout: 8_000,
      maxBuffer: 1_000_000,
    });
    return result.stdout;
  };
}

export async function runJob(job: AgentJob): Promise<JobReport> {
  const action = getDeviceAction(job.actionId, job.actionVersion);
  if (!action || !action.platforms.includes(platformName())) {
    return { status: "unsupported", output: {}, error: "unknown_action" };
  }
  if (action.sideEffects === "local_write") {
    if (job.mode === "execute")
      return {
        status: "unsupported",
        output: {},
        error: "execution_not_supported",
      };
    const diagnostics = await collectRequired(action.requiresDiagnostics);
    const snapshot = createHash("sha256")
      .update(JSON.stringify(diagnostics))
      .digest("hex");
    return {
      status: "shadowed",
      output: {
        wouldRun: true,
        snapshotSpec: JSON.stringify(job.snapshotSpec),
      },
      snapshot: { hash: snapshot, kinds: job.snapshotSpec },
    };
  }
  const diagnostics = await collectRequired(action.requiresDiagnostics);
  return {
    status: "succeeded",
    output: {
      summary: diagnostics
        .map((record) => record.summary)
        .join("; ")
        .slice(0, 500),
    },
    diagnostics,
  };
}

async function collectRequired(
  kinds: readonly DiagnosticRecord["kind"][]
): Promise<DiagnosticRecord[]> {
  const wanted = new Set(kinds);
  return Promise.all(
    platformCollectors()
      .filter((collector) => wanted.has(collector.kind))
      .map((collector) => collector.run(execForAgent()))
  );
}
