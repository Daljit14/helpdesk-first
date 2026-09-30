import {
  Battery,
  Camera,
  Gauge,
  HardDrive,
  Keyboard,
  KeyRound,
  Laptop,
  Mic,
  Monitor,
  Shield,
  Volume2,
  Wifi,
  type LucideIcon,
} from "lucide-react";

export type ToolId =
  | "speed-test"
  | "connection"
  | "camera"
  | "microphone"
  | "speakers"
  | "device"
  | "storage"
  | "battery"
  | "keyboard"
  | "display"
  | "permissions"
  | "password-tips";

export type ToolMeta = {
  id: ToolId;
  /** Short label for tabs and tiles. */
  label: string;
  blurb: string;
  icon: LucideIcon;
  /** Needs a camera/mic/fullscreen prompt or user interaction — skipped by the full check-up. */
  interactive: boolean;
};

export const TOOLS: Record<ToolId, ToolMeta> = {
  "speed-test": {
    id: "speed-test",
    label: "Speed test",
    blurb: "Latency, jitter and download speed",
    icon: Gauge,
    interactive: false,
  },
  connection: {
    id: "connection",
    label: "Connection info",
    blurb: "Online status and network type",
    icon: Wifi,
    interactive: false,
  },
  camera: {
    id: "camera",
    label: "Camera",
    blurb: "Private live preview",
    icon: Camera,
    interactive: true,
  },
  microphone: {
    id: "microphone",
    label: "Microphone",
    blurb: "Live input level meter",
    icon: Mic,
    interactive: true,
  },
  speakers: {
    id: "speakers",
    label: "Speakers",
    blurb: "Left / right test chimes",
    icon: Volume2,
    interactive: true,
  },
  device: {
    id: "device",
    label: "Device info",
    blurb: "System, browser and screen",
    icon: Laptop,
    interactive: false,
  },
  storage: {
    id: "storage",
    label: "Storage",
    blurb: "Space available to the browser",
    icon: HardDrive,
    interactive: false,
  },
  battery: {
    id: "battery",
    label: "Battery",
    blurb: "Charge level and power",
    icon: Battery,
    interactive: false,
  },
  keyboard: {
    id: "keyboard",
    label: "Keyboard",
    blurb: "Light up every key you press",
    icon: Keyboard,
    interactive: true,
  },
  display: {
    id: "display",
    label: "Display",
    blurb: "Dead pixels and refresh rate",
    icon: Monitor,
    interactive: true,
  },
  permissions: {
    id: "permissions",
    label: "Permissions",
    blurb: "Camera, mic, location, alerts",
    icon: Shield,
    interactive: false,
  },
  "password-tips": {
    id: "password-tips",
    label: "Password safety",
    blurb: "Four habits that protect accounts",
    icon: KeyRound,
    interactive: false,
  },
};

export const TOOL_GROUPS: Array<{
  id: string;
  title: string;
  description: string;
  tools: ToolId[];
}> = [
  {
    id: "connection",
    title: "Connection",
    description: "Is it your network or the site?",
    tools: ["speed-test", "connection"],
  },
  {
    id: "audio-video",
    title: "Audio & video",
    description: "Get ready for calls and meetings.",
    tools: ["camera", "microphone", "speakers"],
  },
  {
    id: "device",
    title: "Device",
    description: "The basics support will ask about.",
    tools: ["device", "storage", "battery"],
  },
  {
    id: "input-display",
    title: "Input & display",
    description: "Check keys and screen hardware.",
    tools: ["keyboard", "display"],
  },
  {
    id: "privacy",
    title: "Privacy",
    description: "What sites can use, and staying safe.",
    tools: ["permissions", "password-tips"],
  },
];

/** Which tools to show on a guide, by guide category id (see lib/issues.ts). */
export const CATEGORY_TOOLS: Record<string, ToolId[]> = {
  network: ["speed-test", "connection"],
  computer: ["device", "storage", "battery"],
  printer: ["device", "connection"],
  email: ["connection", "device"],
  software: ["device", "storage"],
  audio: ["speakers", "microphone", "camera"],
  video: ["camera", "microphone", "speakers"],
  accounts: ["device", "password-tips"],
  files: ["storage", "device"],
  mobile: ["device", "battery"],
  peripherals: ["keyboard", "display", "device"],
  collab: ["connection", "camera", "microphone"],
  security: ["device", "permissions", "password-tips"],
};

export function toolsForCategory(category: string): ToolId[] {
  return CATEGORY_TOOLS[category] ?? ["device"];
}

export function isToolId(value: string): value is ToolId {
  return Object.prototype.hasOwnProperty.call(TOOLS, value);
}
