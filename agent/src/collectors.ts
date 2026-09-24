import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";
import { linuxCollectors } from "./collectors/linux";
import { macosCollectors } from "./collectors/macos";
import { windowsCollectors } from "./collectors/windows";
import { browserExtensionsCollector, dnsCollector } from "./collectors/shared";
import type { AgentExec, Collector } from "./collectors/index";

const runFile = promisify(execFile);
const exec: AgentExec = async (file, args, options) => {
  const result = await runFile(file, args, {
    timeout: Math.min(options?.timeoutMs ?? 8_000, 120_000),
    maxBuffer: 1_000_000,
  });
  return result.stdout;
};

export function platformCollectors(serverHost?: string): Collector[] {
  const collectors =
    platform() === "win32"
      ? windowsCollectors
      : platform() === "darwin"
        ? macosCollectors
        : linuxCollectors;
  return [
    ...collectors.filter(
      (collector) => collector.kind !== "browser_extensions"
    ),
    browserExtensionsCollector(),
    dnsCollector(serverHost),
  ];
}

export async function collectDiagnostics(): Promise<
  Awaited<ReturnType<Collector["run"]>>[]
> {
  const state = await import("./store").then(({ loadAgentState }) =>
    loadAgentState().catch(() => null)
  );
  let serverHost: string | undefined;
  try {
    serverHost = state ? new URL(state.serverUrl).hostname : undefined;
  } catch {
    serverHost = undefined;
  }
  return Promise.all(
    platformCollectors(serverHost).map((collector) => collector.run(exec))
  );
}
