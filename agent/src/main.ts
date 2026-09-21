import { hostname, platform } from "node:os";
import { DEVICE_ACTIONS } from "../../lib/device-agent/catalog";
import {
  diagnosticsBatchSchema,
  enrollResponseSchema,
  heartbeatResponseSchema,
} from "../../lib/device-agent/protocol";
import { collectDiagnostics } from "./collectors";
import { postSigned } from "./http";
import { generateDeviceKeyPair } from "./signer";
import { configDirectory, loadAgentState, saveAgentState } from "./store";
import { planShadow } from "./shadow";

export function parseArgs(args: string[]): {
  command: string;
  values: Record<string, string>;
} {
  const [command = "version", ...rest] = args;
  const values: Record<string, string> = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (key === "--exec") throw new Error("execution is not supported");
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
      "user-agent": "helpdesk-agent/1.0.0",
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
      agentVersion: "1.0.0",
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
          agentVersion: "1.0.0",
          catalogVersion: (await loadAgentState()).catalogVersion,
          uptimeSec: 0,
        },
        (value) => heartbeatResponseSchema.parse(value)
      );
      if (heartbeat.revoked) return;
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
    return void process.stdout.write("helpdesk-agent 1.0.0\n");
  if (parsed.command === "enroll")
    return enroll(parsed.values.server ?? "", parsed.values.token ?? "");
  if (parsed.command === "collect") return collect();
  if (parsed.command === "run") return runLoop();
  if (parsed.command === "status")
    return void process.stdout.write(`${configDirectory()}\n`);
  if (parsed.command === "claim-code") {
    const state = await loadAgentState();
    const { createHash } = await import("node:crypto");
    return void process.stdout.write(
      `${state.deviceId.slice(0, 8)} ${createHash("sha256")
        .update(state.deviceId + state.publicKey)
        .digest("hex")
        .slice(0, 8)}\n`
    );
  }
  throw new Error("unknown command");
}

if (process.argv[1]?.endsWith("main.ts")) void main();
