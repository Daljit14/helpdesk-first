import type { CapabilityDefinition } from "@/lib/autonomy/capabilities/types";

export type TaintTrust =
  "org_approved" | "vendor" | "community" | "external_untrusted";

export type ProvenanceItem = {
  evidenceId: string;
  source: string;
  trust: TaintTrust;
  text: string;
};

export type SessionProvenance = {
  userTexts: string[];
  items: ProvenanceItem[];
};

export type TaintedParam = {
  param: string;
  value: string;
  evidenceId: string;
  source: string;
  trust: TaintTrust;
};

const HIDDEN_CHARACTERS =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u{E0000}-\u{E007F}]/gu;
const TRUST_SEVERITY: Record<TaintTrust, number> = {
  org_approved: 0,
  vendor: 1,
  community: 2,
  external_untrusted: 3,
};

export function normalizeForTaint(value: string): string {
  return value
    .normalize("NFKC")
    .replace(HIDDEN_CHARACTERS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (isRecord(value)) return Object.values(value).flatMap(stringLeaves);
  return [];
}

function trustForTool(toolName: string): TaintTrust {
  if (
    ["search_guides", "get_org_environment", "get_account_status"].includes(
      toolName
    )
  )
    return "org_approved";
  if (toolName === "get_service_health") return "vendor";
  return "external_untrusted";
}

export function provenanceFromTool(
  toolName: string,
  evidenceId: string,
  value: unknown
): ProvenanceItem[] {
  const items: ProvenanceItem[] = [];
  const defaultTrust =
    toolName === "search_web" ? "vendor" : trustForTool(toolName);

  const visit = (current: unknown, trust: TaintTrust): void => {
    if (typeof current === "string") {
      items.push({ evidenceId, source: toolName, trust, text: current });
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((child) => visit(child, trust));
      return;
    }
    if (!isRecord(current)) return;
    const nestedTrust =
      toolName === "search_web" &&
      (current.trust === "vendor" || current.trust === "community")
        ? current.trust
        : trust;
    for (const [key, child] of Object.entries(current)) {
      if (toolName === "search_web" && key === "trust") continue;
      visit(child, nestedTrust);
    }
  };

  visit(value, defaultTrust);
  return items;
}

function screenshotText(value: string): string {
  try {
    const first = JSON.parse(value) as unknown;
    const second =
      typeof first === "string" ? (JSON.parse(first) as unknown) : first;
    const leaves = stringLeaves(second);
    return leaves.join("\n");
  } catch {
    try {
      return stringLeaves(JSON.parse(value) as unknown).join("\n");
    } catch {
      return value;
    }
  }
}

export function splitUserTurn(text: string): {
  userText: string;
  untrusted: ProvenanceItem[];
} {
  let screenshotIndex = 0;
  const untrusted: ProvenanceItem[] = [];
  const userText = text
    .replace(
      /<untrusted_data source="screenshot">([\s\S]*?)<\/untrusted_data>/g,
      (_block, content: string) => {
        screenshotIndex += 1;
        untrusted.push({
          evidenceId: `screenshot-${screenshotIndex}`,
          source: "screenshot",
          trust: "external_untrusted",
          text: screenshotText(content),
        });
        return "";
      }
    )
    .trim();
  return { userText, untrusted };
}

function pathSegments(path: string): string[] {
  return Array.from(
    path.matchAll(/([^.[\]]+)|\[(\d+)\]/g),
    (match) => match[1] ?? match[2]
  );
}

function schemaForPath(schema: unknown, path: string): unknown {
  let current = schema;
  for (const segment of pathSegments(path)) {
    if (!isRecord(current)) return undefined;
    if (/^\d+$/.test(segment)) current = current.items;
    else {
      const properties = current.properties;
      current = isRecord(properties) ? properties[segment] : undefined;
    }
  }
  return current;
}

function hasClosedValueSchema(schema: unknown, path: string): boolean {
  const property = schemaForPath(schema, path);
  return (
    isRecord(property) &&
    ("enum" in property ||
      Object.prototype.hasOwnProperty.call(property, "const"))
  );
}

function parameterLeaves(
  value: unknown,
  path: string,
  visit: (path: string, value: string) => void
): void {
  if (typeof value === "string") {
    visit(path, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      parameterLeaves(child, `${path}[${index}]`, visit)
    );
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      parameterLeaves(child, path ? `${path}.${key}` : key, visit);
    }
  }
}

export function findTaintedParams(
  params: Record<string, unknown>,
  schemaJson: unknown,
  provenance: SessionProvenance
): TaintedParam[] {
  const userTexts = provenance.userTexts.map(normalizeForTaint);
  const items = provenance.items
    .map((item) => ({ ...item, normalizedText: normalizeForTaint(item.text) }))
    .filter((item) => item.normalizedText.length > 0);
  const tainted: TaintedParam[] = [];

  parameterLeaves(params, "", (param, value) => {
    if (hasClosedValueSchema(schemaJson, param)) return;
    const normalizedValue = normalizeForTaint(value);
    if (
      normalizedValue.length < 4 ||
      userTexts.some((text) => text.includes(normalizedValue))
    )
      return;
    const matches = items.filter((item) =>
      item.normalizedText.includes(normalizedValue)
    );
    if (matches.length === 0) return;
    const mostSevere = matches.reduce((selected, item) =>
      TRUST_SEVERITY[item.trust] > TRUST_SEVERITY[selected.trust]
        ? item
        : selected
    );
    tainted.push({
      param,
      value,
      evidenceId: mostSevere.evidenceId,
      source: mostSevere.source,
      trust: mostSevere.trust,
    });
  });

  return tainted;
}

export function taintDecision(
  capability: CapabilityDefinition,
  tainted: TaintedParam[]
): "clean" | "reconfirm" | "reject" {
  if (tainted.length === 0) return "clean";
  if (
    capability.riskLevel !== "safe" &&
    tainted.some(
      (item) =>
        item.trust === "community" || item.trust === "external_untrusted"
    )
  )
    return "reject";
  return "reconfirm";
}

export function reconfirmSatisfied(input: {
  policyDecision: string | null;
  lookupFailed: boolean;
  reconfirmTainted: boolean;
}): boolean {
  return (
    (input.policyDecision === "clean" && !input.lookupFailed) ||
    input.reconfirmTainted
  );
}
