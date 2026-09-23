import { hostname, platform } from "node:os";
import { createHash } from "node:crypto";
import { DEVICE_ACTIONS } from "../../lib/device-agent/catalog";
import {
  diagnosticsBatchSchema,
  enrollResponseSchema,
  heartbeatResponseSchema,
} from "../../lib/device-agent/protocol";
import { collectDiagnostics } from "./collectors";
import { postSigned } from "./http";
import { generateDeviceKeyPair } from "./signer";
import {
  configDirectory,
  loadAgentState,
  saveAgentState,
  updateAgentState,
} from "./store";
import { planShadow } from "./shadow";
import { AGENT_VERSION } from "./version";
import { jobPollResponseSchema } from "../../lib/device-agent/protocol";
import { runJob } from "./jobs";

export { AGENT_VERSION };

export function parseArgs(args: string[]): {
  command: string;
  values: Record<string, string>;
} {
  const [command = "version", ...rest] = args;
  const values: Record<string, string> = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (key?.startsWith("--") && value) values[key.slice(2)] = value;
  }
  return { command, values };
}

async function enroll(server: string, token: string): Promise<void> {
  const keys = generateDeviceKeyPair();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const result = await fetch(new URL("/api/agent/enroll", server), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": `helpdesk-agent/${AGENT_VERSION}`,
    },
    body: JSON.stringify({
      token,
      platform:
        platform() === "win32"
          ? "windows"
          : platform() === "darwin"
            ? "macos"
            : "linux",
      hostname: hostname(),
      agentVersion: AGENT_VERSION,
      publicKey: keys.publicKey,
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!result.ok) throw new Error("enrollment_failed");
  const response = enrollResponseSchema.parse(await result.json());
  await saveAgentState(
    {
      deviceId: response.deviceId,
      organizationId: response.organizationId,
      serverUrl: server,
      publicKey: keys.publicKey,
      catalogVersion: response.catalogVersion,
    },
    keys.privateKeyPem
  );
  process.stdout.write(`enrolled ${response.deviceId}\n`);
}

async function collect(): Promise<void> {
  process.stdout.write(`${JSON.stringify(await collectDiagnostics())}\n`);
}

async function runLoop(): Promise<void> {
  let delay = 60_000;
  while (true) {
    try {
      const heartbeat = await postSigned(
        "/api/agent/heartbeat",
        {
          agentVersion: AGENT_VERSION,
          catalogVersion: (await loadAgentState()).catalogVersion,
          uptimeSec: Math.floor(process.uptime()),
        },
        (value) => heartbeatResponseSchema.parse(value)
      );
      if (heartbeat.revoked) return;
      if (!heartbeat.killSwitch) {
        const polled = await postSigned("/api/agent/jobs/poll", {}, (value) =>
          jobPollResponseSchema.parse(value)
        );
        for (const job of polled.jobs) {
          const report = await runJob(job, {
            executionEnabled: heartbeat.executionEnabled,
            now: new Date(),
          });
          await postSigned(
            `/api/agent/jobs/${job.id}/report`,
            report,
            (value) => value
          );
        }
      }
      const records = await collectDiagnostics();
      await postSigned(
        "/api/agent/diagnostics",
        diagnosticsBatchSchema.parse({ records }),
        () => ({ ok: true })
      );
      const shadow = planShadow(
        DEVICE_ACTIONS,
        records,
        platform() === "win32"
          ? "windows"
          : platform() === "darwin"
            ? "macos"
            : "linux"
      );
      if (shadow.length)
        await postSigned("/api/agent/shadow", { actions: shadow }, () => ({
          ok: true,
        }));
      delay = heartbeat.pollIntervalSec * 1000;
    } catch {
      delay = Math.min(delay * 2, 15 * 60 * 1000);
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(args);
  if (parsed.command === "version")
    return void process.stdout.write(`helpdesk-agent ${AGENT_VERSION}\n`);
  if (parsed.command === "enroll")
    return enroll(parsed.values.server ?? "", parsed.values.token ?? "");
  if (parsed.command === "collect") return collect();
  if (parsed.command === "run") return runLoop();
  if (parsed.command === "enable-execution") {
    await updateAgentState({ executionOptIn: true });
    return void process.stdout.write("execution enabled\n");
  }
  if (parsed.command === "disable-execution") {
    await updateAgentState({ executionOptIn: false });
    return void process.stdout.write("execution disabled\n");
  }
  if (parsed.command === "status")
    return void process.stdout.write(`${configDirectory()}\n`);
  if (parsed.command === "claim-code") {
    const state = await loadAgentState();
    return void process.stdout.write(
      `${state.deviceId.slice(0, 8)} ${createHash("sha256")
        .update(state.deviceId + state.publicKey)
        .digest("hex")
        .slice(0, 8)}\n`
    );
  }
  throw new Error("unknown command");
}
