import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";
import { linuxCollectors } from "./collectors/linux";
import { macosCollectors } from "./collectors/macos";
import { windowsCollectors } from "./collectors/windows";
import type { AgentExec, Collector } from "./collectors/index";

const runFile = promisify(execFile);
const exec: AgentExec = async (file, args) => {
  const result = await runFile(file, args, {
    timeout: 8_000,
    maxBuffer: 1_000_000,
  });
  return result.stdout;
};

export function platformCollectors(): Collector[] {
  if (platform() === "win32") return windowsCollectors;
  if (platform() === "darwin") return macosCollectors;
  return linuxCollectors;
}

export async function collectDiagnostics(): Promise<
  Awaited<ReturnType<Collector["run"]>>[]
> {
  return Promise.all(
    platformCollectors().map((collector) => collector.run(exec))
  );
}
