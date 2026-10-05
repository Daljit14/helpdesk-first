import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { DEV_TOOLS } from "./dev-tools";
import { NET_SEC_TOOLS } from "./net-sec-tools";
import { TOOL_GROUPS, TOOLS, toolsForCategory } from "./tool-registry";

/**
 * One merged catalog of every Toolkit tool: the original built-ins from
 * tool-registry.ts plus the networking/security tools (net-sec-tools.ts) and
 * the device/support tools (dev-tools.ts). The Toolkit page and the guide-page
 * tabs read from here.
 */
export type CatalogEntry = {
  id: string;
  label: string;
  blurb: string;
  icon: LucideIcon;
  interactive: boolean;
  /** Present for tools that are not built into ToolRenderer's switch. */
  Component?: ComponentType;
};

export type CatalogGroup = {
  id: string;
  title: string;
  description: string;
  tools: string[];
};

const extras = [...NET_SEC_TOOLS, ...DEV_TOOLS];

export const CATALOG: Record<string, CatalogEntry> = {};
for (const meta of Object.values(TOOLS)) {
  CATALOG[meta.id] = {
    id: meta.id,
    label: meta.label,
    blurb: meta.blurb,
    icon: meta.icon,
    interactive: meta.interactive,
  };
}
for (const tool of extras) {
  CATALOG[tool.id] = {
    id: tool.id,
    label: tool.title,
    blurb: tool.blurb,
    icon: tool.icon,
    interactive: tool.needsPermission,
    Component: tool.Component,
  };
}

export const CATALOG_GROUPS: CatalogGroup[] = [
  ...TOOL_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    description: group.description,
    tools: [
      ...group.tools,
      ...extras.filter((t) => t.group === group.id).map((t) => t.id),
    ] as string[],
  })),
  {
    id: "support",
    title: "Support",
    description: "Bundle your results and hand them to IT.",
    tools: extras.filter((t) => t.group === "support").map((t) => t.id),
  },
];

export function isCatalogId(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(CATALOG, value);
}

const MAX_TABS = 8;
const REPORT_ID = "support-report";

/** Tools for a guide category: the curated built-ins first, then relevant extras. */
export function catalogToolsForCategory(category: string): string[] {
  const base: string[] = [...toolsForCategory(category)];
  const more = extras
    .filter((t) => t.id !== REPORT_ID && t.categories.includes(category))
    .map((t) => t.id)
    .filter((id) => !base.includes(id));
  const ids = [...base, ...more].slice(0, MAX_TABS - 1);
  const hasReport = extras.some((t) => t.id === REPORT_ID);
  return hasReport ? [...ids, REPORT_ID] : ids;
}
