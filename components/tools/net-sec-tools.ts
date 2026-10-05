import type { ComponentType } from "react";
import {
  Globe,
  KeyRound,
  MailWarning,
  MapPin,
  Router,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { NetDnsTool } from "./net-dns-tool";
import { NetIpTool } from "./net-ip-tool";
import { NetStabilityTool } from "./net-stability-tool";
import { NetWifiTool } from "./net-wifi-tool";
import { SecPasswordTool } from "./sec-password-tool";
import { SecPhishTool } from "./sec-phish-tool";

export type NetSecToolDescriptor = {
  id: string;
  /** Short label for tabs and tiles (same role as ToolMeta.label in tool-registry.ts). */
  title: string;
  blurb: string;
  group: "connection" | "privacy";
  icon: LucideIcon;
  /** Guide category ids (lib/issues.ts) that should show this tool. */
  categories: string[];
  /** Camera/mic/etc. prompt required — none of these need one. */
  needsPermission: boolean;
  Component: ComponentType;
};

export const NET_SEC_TOOLS: NetSecToolDescriptor[] = [
  {
    id: "net-stability-tool",
    title: "Connection stability",
    blurb: "25-second test: latency, jitter and packet loss",
    group: "connection",
    icon: Waves,
    categories: ["network", "collab", "video"],
    needsPermission: false,
    Component: NetStabilityTool,
  },
  {
    id: "net-dns-tool",
    title: "DNS check",
    blurb: "Does a website's name resolve? Two resolvers",
    group: "connection",
    icon: Globe,
    categories: ["network", "email"],
    needsPermission: false,
    Component: NetDnsTool,
  },
  {
    id: "net-ip-tool",
    title: "My connection info",
    blurb: "Public IP (hidden by default), country, protocol",
    group: "connection",
    icon: MapPin,
    categories: ["network", "security"],
    needsPermission: false,
    Component: NetIpTool,
  },
  {
    id: "net-wifi-tool",
    title: "Wi-Fi & router health",
    blurb: "Five questions and a live test rank the cause",
    group: "connection",
    icon: Router,
    categories: ["network", "mobile"],
    needsPermission: false,
    Component: NetWifiTool,
  },
  {
    id: "sec-password-tool",
    title: "Password strength",
    blurb: "Strength meter, generator and private breach check",
    group: "privacy",
    icon: KeyRound,
    categories: ["accounts", "security"],
    needsPermission: false,
    Component: SecPasswordTool,
  },
  {
    id: "sec-phish-tool",
    title: "Suspicious link checker",
    blurb: "Spot phishing signs in a link or email, offline",
    group: "privacy",
    icon: MailWarning,
    categories: ["security", "email", "accounts"],
    needsPermission: false,
    Component: SecPhishTool,
  },
];
