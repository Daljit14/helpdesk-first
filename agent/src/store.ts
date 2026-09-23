import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";

export type AgentState = {
  deviceId: string;
  organizationId: string;
  serverUrl: string;
  publicKey: string;
  catalogVersion: string;
  executionOptIn?: boolean;
};

export function configDirectory(): string {
  if (platform() === "win32")
    return join(process.env.PROGRAMDATA ?? homedir(), "HelpDeskFirst");
  if (platform() === "darwin")
    return "/Library/Application Support/HelpDeskFirst";
  if (platform() === "linux") return "/var/lib/helpdesk-first";
  return join(homedir(), ".helpdesk-first");
}

export async function saveAgentState(
  state: AgentState,
  privateKeyPem: string
): Promise<void> {
  const directory = configDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, "state.json"), `${JSON.stringify(state)}\n`, {
    mode: 0o600,
  });
  await writeFile(join(directory, "device.key"), privateKeyPem, {
    mode: 0o600,
  });
  await chmod(join(directory, "device.key"), 0o600);
}

export async function loadAgentState(): Promise<AgentState> {
  return JSON.parse(
    await readFile(join(configDirectory(), "state.json"), "utf8")
  ) as AgentState;
}

export async function updateAgentState(
  patch: Partial<AgentState>
): Promise<AgentState> {
  const state = { ...(await loadAgentState()), ...patch };
  const path = join(configDirectory(), "state.json");
  await writeFile(path, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  return state;
}

export async function loadPrivateKey(): Promise<string> {
  return readFile(join(configDirectory(), "device.key"), "utf8");
}
