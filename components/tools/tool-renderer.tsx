"use client";

import { NetworkCheckWidget } from "@/components/network-check-widget";
import type { ToolId } from "./tool-registry";
import { BatteryTool } from "./battery-tool";
import { CameraTool } from "./camera-tool";
import { ConnectionTool } from "./connection-tool";
import { DeviceInfoTool } from "./device-info-tool";
import { DisplayTool } from "./display-tool";
import { KeyboardTool } from "./keyboard-tool";
import { MicrophoneTool } from "./microphone-tool";
import { PasswordTipsCard } from "./password-tips-card";
import { PermissionsTool } from "./permissions-tool";
import { SpeakerTool } from "./speaker-tool";
import { StorageTool } from "./storage-tool";

export function ToolRenderer({
  id,
  speedTestHref,
  onSpeedTest,
}: {
  id: ToolId;
  speedTestHref?: string;
  onSpeedTest?: () => void;
}) {
  switch (id) {
    case "speed-test":
      return (
        <div className="[&>section]:mt-0">
          <NetworkCheckWidget />
        </div>
      );
    case "connection":
      return (
        <ConnectionTool
          speedTestHref={speedTestHref}
          onSpeedTest={onSpeedTest}
        />
      );
    case "camera":
      return <CameraTool />;
    case "microphone":
      return <MicrophoneTool />;
    case "speakers":
      return <SpeakerTool />;
    case "device":
      return <DeviceInfoTool />;
    case "storage":
      return <StorageTool />;
    case "battery":
      return <BatteryTool />;
    case "keyboard":
      return <KeyboardTool />;
    case "display":
      return <DisplayTool />;
    case "permissions":
      return <PermissionsTool />;
    case "password-tips":
      return <PasswordTipsCard />;
  }
}
