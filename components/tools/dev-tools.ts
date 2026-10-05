import type { ComponentType } from "react";
import {
  ClipboardCheck,
  Clock,
  Cpu,
  Database,
  FileText,
  Hand,
  MousePointer2,
  Printer,
  Video,
  type LucideIcon,
} from "lucide-react";
import { DevClipboardTool } from "./dev-clipboard-tool";
import { DevCleanupTool } from "./dev-cleanup-tool";
import { DevClockTool } from "./dev-clock-tool";
import { DevGpuTool } from "./dev-gpu-tool";
import { DevMeetingTool } from "./dev-meeting-tool";
import { DevPointerTool } from "./dev-pointer-tool";
import { DevTouchTool } from "./dev-touch-tool";
import { PrintTestTool } from "./print-test-tool";
import { SupportReportTool } from "./support-report-tool";

/** Mirrors the structure of tool-registry.ts groups, plus a new "support" group. */
export type DevToolGroup =
  "audio-video" | "device" | "input-display" | "privacy" | "support";

export type DevToolDescriptor = {
  id: string;
  title: string;
  blurb: string;
  group: DevToolGroup;
  icon: LucideIcon;
  /** Guide category ids from lib/issues.ts that should show this tool. */
  categories: string[];
  /** Needs a camera/mic/clipboard/screen prompt or other user interaction. */
  needsPermission: boolean;
  Component: ComponentType;
};

const ALL_CATEGORIES = [
  "computer",
  "network",
  "printer",
  "email",
  "software",
  "audio",
  "accounts",
  "files",
  "video",
  "mobile",
  "peripherals",
  "collab",
  "security",
];

export const DEV_TOOLS: DevToolDescriptor[] = [
  {
    id: "dev-pointer",
    title: "Mouse & trackpad",
    blurb: "Buttons, double-clicks, wheel and drift",
    group: "input-display",
    icon: MousePointer2,
    categories: ["peripherals", "computer"],
    needsPermission: false,
    Component: DevPointerTool,
  },
  {
    id: "dev-touch",
    title: "Touch screen",
    blurb: "Multi-touch and dead-zone grid",
    group: "input-display",
    icon: Hand,
    categories: ["peripherals", "mobile", "computer"],
    needsPermission: false,
    Component: DevTouchTool,
  },
  {
    id: "print-test",
    title: "Printer test page",
    blurb: "Alignment, colour, tone and nozzle check",
    group: "device",
    icon: Printer,
    categories: ["printer", "peripherals"],
    needsPermission: false,
    Component: PrintTestTool,
  },
  {
    id: "dev-clock",
    title: "Clock & time sync",
    blurb: "Fix sign-in and MFA code errors",
    group: "device",
    icon: Clock,
    categories: ["accounts", "security", "email", "software", "network"],
    needsPermission: false,
    Component: DevClockTool,
  },
  {
    id: "dev-meeting",
    title: "Meeting readiness",
    blurb: "Camera, mic, speakers, screen share",
    group: "audio-video",
    icon: Video,
    categories: ["collab", "video", "audio"],
    needsPermission: true,
    Component: DevMeetingTool,
  },
  {
    id: "dev-gpu",
    title: "Graphics & browser",
    blurb: "GPU, WebGL and feature support",
    group: "device",
    icon: Cpu,
    categories: ["computer", "video", "collab", "software"],
    needsPermission: false,
    Component: DevGpuTool,
  },
  {
    id: "dev-clipboard",
    title: "Clipboard & paste",
    blurb: "Copy/paste permissions and clean paste",
    group: "privacy",
    icon: ClipboardCheck,
    categories: ["software", "files", "security"],
    needsPermission: true,
    Component: DevClipboardTool,
  },
  {
    id: "dev-cleanup",
    title: "Browser clean-up",
    blurb: "Clear this site's cache safely",
    group: "privacy",
    icon: Database,
    categories: ["software", "accounts", "computer", "email"],
    needsPermission: false,
    Component: DevCleanupTool,
  },
  {
    id: "support-report",
    title: "Support report",
    blurb: "Bundle results into a ticket",
    group: "support",
    icon: FileText,
    categories: ALL_CATEGORIES,
    needsPermission: false,
    Component: SupportReportTool,
  },
];
