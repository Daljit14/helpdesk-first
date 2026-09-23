import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";
import { getDeviceAction } from "../../lib/device-agent/catalog";
import type {
  DiagnosticRecord,
  JobPollResponse,
  JobReport,
  DevicePlatform,
} from "../../lib/device-agent/protocol";
import { platformCollectors } from "./collectors";
import type { AgentExec } from "./collectors/index";
import { getExecutor, type Executor, type SnapshotData } from "./executors";
import { loadSnapshot, saveSnapshot, snapshotHash } from "./snapshots";
import { loadAgentState } from "./store";

export type AgentJob = JobPollResponse["jobs"][number];

export type RunJobContext = {
  executionEnabled: boolean;
  now?: Date;
};

type JobRuntime = {
  exec: AgentExec;
  platform: () => DevicePlatform;
  executionOptIn: () => Promise<boolean>;
  loadSnapshot: (jobId: string) => Promise<SnapshotData | null>;
  saveSnapshot: (jobId: string, data: SnapshotData) => Promise<void>;
  snapshotHash: (data: SnapshotData) => string;
  getExecutor?: (actionId: string, platform: DevicePlatform) => Executor | null;
};

function platformName(): DevicePlatform {
  return platform() === "win32"
    ? "windows"
    : platform() === "darwin"
      ? "macos"
      : "linux";
}

const runFile = promisify(execFile);
const execForAgent: AgentExec = async (file, args, options) => {
  const result = await runFile(file, args, {
    timeout: options?.timeoutMs ?? 8_000,
    maxBuffer: 1_000_000,
  });
  return result.stdout;
};

const productionRuntime: JobRuntime = {
  exec: execForAgent,
  platform: platformName,
  executionOptIn: async () => (await loadAgentState()).executionOptIn === true,
  loadSnapshot,
  saveSnapshot,
  snapshotHash,
};

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : "executor_failed";
}

async function collectRequired(
  kinds: readonly DiagnosticRecord["kind"][],
  exec: AgentExec
): Promise<DiagnosticRecord[]> {
  const wanted = new Set(kinds);
  return Promise.all(
    platformCollectors()
      .filter((collector) => wanted.has(collector.kind))
      .map((collector) => collector.run(exec))
  );
}

async function rollbackAfterFailure(
  runtime: JobRuntime,
  actionId: string,
  currentPlatform: DevicePlatform,
  params: Record<string, unknown>,
  snapshot: SnapshotData
): Promise<boolean> {
  const executor =
    runtime.getExecutor?.(actionId, currentPlatform) ??
    getExecutor(actionId, currentPlatform);
  if (!executor?.rollback) return false;
  try {
    await executor.rollback(runtime.exec, params, snapshot);
    return true;
  } catch {
    return false;
  }
}

export function createJobRunner(runtime: JobRuntime) {
  return async function runAgentJob(
    job: AgentJob,
    ctx: RunJobContext
  ): Promise<JobReport> {
    const now = ctx.now ?? new Date();
    const currentPlatform = runtime.platform();
    const action = getDeviceAction(job.actionId, job.actionVersion);
    if (!action || !action.platforms.includes(currentPlatform))
      return { status: "unsupported", output: {}, error: "unknown_action" };

    if (new Date(job.expiresAt).getTime() < now.getTime())
      return { status: "failed", output: {}, error: "expired" };

    if (action.sideEffects === "local_write" && job.mode === "shadow") {
      const diagnostics = await collectRequired(
        action.requiresDiagnostics,
        runtime.exec
      );
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

    const parsedParameters = action.inputSchema.safeParse(job.parameters);
    if (!parsedParameters.success)
      return { status: "failed", output: {}, error: "invalid_parameters" };
    const parameters = parsedParameters.data as Record<string, unknown>;

    if (action.sideEffects === "read_only") {
      const diagnostics = await collectRequired(
        action.requiresDiagnostics,
        runtime.exec
      );
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

    if (!ctx.executionEnabled)
      return {
        status: "unsupported",
        output: {},
        error: "execution_disabled_by_server",
      };
    if (!(await runtime.executionOptIn()))
      return {
        status: "unsupported",
        output: {},
        error: "execution_disabled_locally",
      };

    const executor =
      runtime.getExecutor?.(action.id, currentPlatform) ??
      getExecutor(action.id, currentPlatform);
    if (!executor)
      return { status: "unsupported", output: {}, error: "unknown_action" };

    if (job.kind === "rollback") {
      if (action.irreversible || !executor.rollback)
        return { status: "unsupported", output: {}, error: "irreversible" };
      if (!job.rollbackOf)
        return { status: "failed", output: {}, error: "snapshot_missing" };
      const snapshot = await runtime.loadSnapshot(job.rollbackOf);
      if (!snapshot)
        return { status: "failed", output: {}, error: "snapshot_missing" };
      const hash = runtime.snapshotHash(snapshot);
      try {
        await executor.rollback(runtime.exec, parameters, snapshot);
        return {
          status: "succeeded",
          output: {
            verified: true,
            verifySummary: "Snapshot restored.",
          },
          snapshot: { hash, kinds: job.snapshotSpec },
        };
      } catch {
        return {
          status: "failed",
          output: {
            verified: false,
            verifySummary: "Snapshot restore failed.",
          },
          snapshot: { hash, kinds: job.snapshotSpec },
          error: "rollback_failed",
        };
      }
    }

    let snapshot: SnapshotData;
    try {
      snapshot = await executor.snapshot(runtime.exec, parameters);
    } catch (error) {
      const code = errorCode(error);
      return {
        status: code === "unsupported_on_platform" ? "unsupported" : "failed",
        output: {},
        error: code,
      };
    }
    await runtime.saveSnapshot(job.id, snapshot);
    const hash = runtime.snapshotHash(snapshot);
    try {
      await executor.apply(runtime.exec, parameters, snapshot);
    } catch {
      if (action.irreversible || !executor.rollback)
        return {
          status: "failed",
          output: {
            verified: false,
            verifySummary: "Apply failed.",
          },
          snapshot: { hash, kinds: job.snapshotSpec },
          error: "apply_failed",
        };
      const rolledBack = await rollbackAfterFailure(
        runtime,
        action.id,
        currentPlatform,
        parameters,
        snapshot
      );
      return {
        status: "failed",
        output: {
          verified: false,
          verifySummary: "Apply failed.",
          rolledBack,
        },
        snapshot: { hash, kinds: job.snapshotSpec },
        error: rolledBack
          ? "apply_failed_rolled_back"
          : "apply_failed_rollback_failed",
      };
    }

    const verification = await executor.verify(
      runtime.exec,
      parameters,
      snapshot
    );
    const diagnostics = await collectRequired(
      action.requiresDiagnostics,
      runtime.exec
    );
    if (!verification.ok) {
      if (action.irreversible || !executor.rollback)
        return {
          status: "failed",
          output: {
            verified: false,
            verifySummary: verification.summary.slice(0, 500),
          },
          snapshot: { hash, kinds: job.snapshotSpec },
          diagnostics,
          error: "verification_failed",
        };
      const rolledBack = await rollbackAfterFailure(
        runtime,
        action.id,
        currentPlatform,
        parameters,
        snapshot
      );
      return {
        status: "failed",
        output: {
          verified: false,
          verifySummary: verification.summary.slice(0, 500),
          rolledBack,
        },
        snapshot: { hash, kinds: job.snapshotSpec },
        diagnostics,
        error: rolledBack
          ? "verification_failed_rolled_back"
          : "verification_failed_rollback_failed",
      };
    }

    return {
      status: "succeeded",
      output: {
        verified: true,
        verifySummary: verification.summary.slice(0, 500),
      },
      snapshot: { hash, kinds: job.snapshotSpec },
      diagnostics,
    };
  };
}

export const runJob = createJobRunner(productionRuntime);
