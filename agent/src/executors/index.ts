import type { DeviceAction } from "../../../lib/device-agent/catalog";
import type { DevicePlatform } from "../../../lib/device-agent/protocol";
import type { AgentExec } from "../collectors/index";
import { linuxExecutors } from "./linux";
import { macosExecutors } from "./macos";
import { windowsExecutors } from "./windows";

export type SnapshotData = Record<string, string | number | boolean | null>;

export type Executor = {
  actionId: DeviceAction["id"];
  platform: DevicePlatform;
  snapshot(
    exec: AgentExec,
    params: Record<string, unknown>
  ): Promise<SnapshotData>;
  apply(
    exec: AgentExec,
    params: Record<string, unknown>,
    snapshot: SnapshotData
  ): Promise<void>;
  verify(
    exec: AgentExec,
    params: Record<string, unknown>,
    before: SnapshotData
  ): Promise<{ ok: boolean; summary: string }>;
  rollback?(
    exec: AgentExec,
    params: Record<string, unknown>,
    snapshot: SnapshotData
  ): Promise<void>;
};

const executors: readonly Executor[] = [
  ...windowsExecutors,
  ...macosExecutors,
  ...linuxExecutors,
];

export function getExecutor(
  actionId: string,
  platform: DevicePlatform
): Executor | null {
  return (
    executors.find(
      (executor) =>
        executor.actionId === actionId && executor.platform === platform
    ) ?? null
  );
}
