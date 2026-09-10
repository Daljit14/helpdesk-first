import { isKnowledgeHealthEnabled } from "@/lib/admin/flags";
import { listGuides } from "@/lib/knowledge/governance";
import { createAdminClient } from "@/lib/supabase/admin";

export type GuideStats = {
  slug: string;
  ticketsRecommended: number;
  ticketsResolvedByAi: number;
  ticketsEscalatedAfterGuide: number;
  worked: number;
  failed: number;
  couldNotPerform: number;
};

export type GuideMeta = {
  slug: string;
  status: string;
  expiresAt: string | null;
  retrievedAt: string | null;
  sourceUrl: string | null;
  organizationId?: string | null;
};

export type EscalationCluster = {
  normalizedTitle: string;
  count: number;
};

export type FindingInput = {
  kind: string;
  severity: string;
  guideSlug: string | null;
  summary: string;
  evidence: Record<string, number | string | null>;
};

export type KnowledgeHealthFinding = {
  id: string;
  organizationId: string;
  guideSlug: string | null;
  kind: string;
  severity: string;
  summary: string;
  evidence: Record<string, number | string | null>;
  status: "open" | "acknowledged" | "dismissed";
  reviewedBy: string | null;
  reviewedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};
export type Finding = KnowledgeHealthFinding;

const DAY_MS = 24 * 60 * 60 * 1000;

function guideSummary(guide: GuideMeta): string {
  return `Guide "${guide.slug}"`;
}

export function normalizeEscalationTitle(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function detectOutdated(guides: GuideMeta[], now: Date): FindingInput[] {
  return guides.flatMap((guide) => {
    const expiresAt = guide.expiresAt ? new Date(guide.expiresAt) : null;
    if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt < now) {
      return [
        {
          kind: "outdated",
          severity: "critical",
          guideSlug: guide.slug,
          summary: `${guideSummary(guide)} has expired.`,
          evidence: {
            expiresAt: guide.expiresAt,
            retrievedAt: guide.retrievedAt,
          },
        },
      ];
    }
    const retrievedAt = guide.retrievedAt ? new Date(guide.retrievedAt) : null;
    if (
      !guide.expiresAt &&
      retrievedAt &&
      !Number.isNaN(retrievedAt.getTime()) &&
      now.getTime() - retrievedAt.getTime() > 365 * DAY_MS
    ) {
      return [
        {
          kind: "outdated",
          severity: "warning",
          guideSlug: guide.slug,
          summary: `${guideSummary(guide)} has not been refreshed recently.`,
          evidence: {
            expiresAt: null,
            retrievedAt: guide.retrievedAt,
          },
        },
      ];
    }
    return [];
  });
}

export function detectLowSuccess(
  stats: GuideStats[],
  minSample = 5
): FindingInput[] {
  return stats.flatMap((stat) => {
    const sample = stat.worked + stat.failed + stat.couldNotPerform;
    if (sample < minSample) return [];
    const unsuccessful = stat.failed + stat.couldNotPerform;
    const rate = unsuccessful / sample;
    if (rate < 0.5) return [];
    return [
      {
        kind: "low_success",
        severity: rate >= 0.75 ? "critical" : "warning",
        guideSlug: stat.slug,
        summary: `Guide "${stat.slug}" has a low troubleshooting success rate.`,
        evidence: {
          worked: stat.worked,
          failed: stat.failed,
          couldNotPerform: stat.couldNotPerform,
          sample,
          rate,
        },
      },
    ];
  });
}

export function detectHighEscalation(
  stats: GuideStats[],
  minSample = 5
): FindingInput[] {
  return stats.flatMap((stat) => {
    if (stat.ticketsRecommended < minSample) return [];
    const rate = stat.ticketsEscalatedAfterGuide / stat.ticketsRecommended;
    if (rate < 0.6) return [];
    return [
      {
        kind: "high_escalation",
        severity: "warning",
        guideSlug: stat.slug,
        summary: `Guide "${stat.slug}" is frequently followed by escalation.`,
        evidence: {
          ticketsRecommended: stat.ticketsRecommended,
          ticketsEscalatedAfterGuide: stat.ticketsEscalatedAfterGuide,
          rate,
        },
      },
    ];
  });
}

export function detectMissingGuides(
  clusters: EscalationCluster[],
  minCount = 3
): FindingInput[] {
  return clusters.flatMap((cluster) => {
    const normalizedTitle = normalizeEscalationTitle(cluster.normalizedTitle);
    if (!normalizedTitle || cluster.count < minCount) return [];
    return [
      {
        kind: "missing_guide",
        severity: "warning",
        guideSlug: null,
        summary: `Repeated escalation topic: ${normalizedTitle}`,
        evidence: { normalizedTitle, count: cluster.count },
      },
    ];
  });
}

export function detectConflicting(
  guides: Array<GuideMeta & { title: string }>
): FindingInput[] {
  const groups = new Map<string, Array<GuideMeta & { title: string }>>();
  for (const guide of guides) {
    if (guide.status !== "approved") continue;
    const title = normalizeEscalationTitle(guide.title);
    if (!title) continue;
    const group = groups.get(title) ?? [];
    group.push(guide);
    groups.set(title, group);
  }
  const findings: FindingInput[] = [];
  for (const [normalizedTitle, group] of groups) {
    const hasGlobal = group.some((guide) => guide.organizationId == null);
    const hasOrganization = group.some((guide) => guide.organizationId != null);
    if (!hasGlobal || !hasOrganization) continue;
    for (const guide of group) {
      if (
        group.some(
          (other) =>
            other.slug !== guide.slug &&
            other.organizationId !== guide.organizationId
        )
      ) {
        findings.push({
          kind: "conflicting",
          severity: "info",
          guideSlug: guide.slug,
          summary: `Approved guides share the title "${normalizedTitle}".`,
          evidence: { normalizedTitle },
        });
      }
    }
  }
  return findings;
}

export function classifyLink(
  status: number | "unreachable"
): FindingInput | null {
  if (status === "unreachable" || status === 404 || status === 410) {
    return {
      kind: "broken_link",
      severity: status === 404 || status === 410 ? "critical" : "warning",
      guideSlug: null,
      summary:
        status === "unreachable"
          ? "A guide source link was unreachable."
          : `A guide source link returned HTTP ${status}.`,
      evidence: { status },
    };
  }
  if (typeof status === "number" && status >= 500 && status <= 599) {
    return {
      kind: "broken_link",
      severity: "warning",
      guideSlug: null,
      summary: `A guide source link returned HTTP ${status}.`,
      evidence: { status },
    };
  }
  return null;
}

type HealthRow = {
  id: string;
  organization_id: string;
  guide_slug: string | null;
  kind: string;
  severity: string;
  summary: string;
  evidence: Record<string, number | string | null>;
  status: "open" | "acknowledged" | "dismissed";
  reviewed_by: string | null;
  reviewed_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

function mapFinding(row: HealthRow): KnowledgeHealthFinding {
  return {
    id: row.id,
    organizationId: row.organization_id,
    guideSlug: row.guide_slug,
    kind: row.kind,
    severity: row.severity,
    summary: row.summary,
    evidence: row.evidence,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}

function addStats(stats: Map<string, GuideStats>, slug: string): GuideStats {
  const existing = stats.get(slug);
  if (existing) return existing;
  const created: GuideStats = {
    slug,
    ticketsRecommended: 0,
    ticketsResolvedByAi: 0,
    ticketsEscalatedAfterGuide: 0,
    worked: 0,
    failed: 0,
    couldNotPerform: 0,
  };
  stats.set(slug, created);
  return created;
}

async function checkLink(
  fetchImpl: typeof fetch,
  url: string
): Promise<number | "unreachable"> {
  const request = async (method: "HEAD" | "GET") => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetchImpl(url, {
        method,
        signal: controller.signal,
      });
      return response.status;
    } finally {
      clearTimeout(timeout);
    }
  };
  try {
    return await request("HEAD");
  } catch {
    try {
      return await request("GET");
    } catch {
      return "unreachable";
    }
  }
}

function dedupeFindings(findings: FindingInput[]): FindingInput[] {
  const byKey = new Map<string, FindingInput>();
  const severityRank = { info: 0, warning: 1, critical: 2 };
  for (const finding of findings) {
    const key = `${finding.kind}:${finding.guideSlug ?? ""}`;
    const existing = byKey.get(key);
    if (
      !existing ||
      (severityRank[finding.severity as keyof typeof severityRank] ?? 0) >
        (severityRank[existing.severity as keyof typeof severityRank] ?? 0)
    ) {
      byKey.set(key, finding);
    }
  }
  return [...byKey.values()];
}

export async function runKnowledgeHealthScan(
  orgId: string,
  deps: { fetchImpl?: typeof fetch; now?: Date } = {}
): Promise<{ findings: number; linksChecked: number }> {
  if (!isKnowledgeHealthEnabled()) return { findings: 0, linksChecked: 0 };
  const admin = createAdminClient();
  const now = deps.now ?? new Date();
  const since = new Date(now.getTime() - 90 * DAY_MS).toISOString();
  const [ticketResult, outcomeResult, clusterResult, guides] =
    await Promise.all([
      admin
        .from("tickets")
        .select("ai_recommended_issue_id,status,resolver_type,escalated")
        .eq("organization_id", orgId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
      admin
        .from("ticket_step_outcomes")
        .select("guide_slug,outcome")
        .eq("organization_id", orgId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
      admin
        .from("tickets")
        .select("issue_title")
        .eq("organization_id", orgId)
        .eq("escalated", true)
        .is("ai_recommended_issue_id", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
      listGuides(orgId),
    ]);
  if (ticketResult.error) throw ticketResult.error;
  if (outcomeResult.error) throw outcomeResult.error;
  if (clusterResult.error) throw clusterResult.error;

  const stats = new Map<string, GuideStats>();
  for (const row of ticketResult.data ?? []) {
    if (typeof row.ai_recommended_issue_id !== "string") continue;
    const stat = addStats(stats, row.ai_recommended_issue_id);
    stat.ticketsRecommended += 1;
    if (
      ["resolved", "closed"].includes(String(row.status).toLowerCase()) &&
      row.resolver_type === "ai"
    ) {
      stat.ticketsResolvedByAi += 1;
    }
    if (row.escalated) stat.ticketsEscalatedAfterGuide += 1;
  }
  for (const row of outcomeResult.data ?? []) {
    if (typeof row.guide_slug !== "string") continue;
    const stat = addStats(stats, row.guide_slug);
    if (row.outcome === "worked") stat.worked += 1;
    if (row.outcome === "failed") stat.failed += 1;
    if (row.outcome === "could_not_perform") stat.couldNotPerform += 1;
  }

  const clusters = new Map<string, number>();
  for (const row of clusterResult.data ?? []) {
    if (typeof row.issue_title !== "string") continue;
    const normalizedTitle = normalizeEscalationTitle(row.issue_title);
    if (normalizedTitle) {
      clusters.set(normalizedTitle, (clusters.get(normalizedTitle) ?? 0) + 1);
    }
  }
  const guideMeta = guides.map((guide) => ({
    slug: guide.slug,
    status: guide.status,
    expiresAt: guide.expiresAt,
    retrievedAt: guide.retrievedAt,
    sourceUrl: guide.sourceUrl,
    organizationId: guide.organizationId,
    title: guide.title,
  }));
  const findings: FindingInput[] = [
    ...detectOutdated(guideMeta, now),
    ...detectLowSuccess([...stats.values()]),
    ...detectHighEscalation([...stats.values()]),
    ...detectMissingGuides(
      [...clusters].map(([normalizedTitle, count]) => ({
        normalizedTitle,
        count,
      }))
    ),
    ...detectConflicting(guideMeta),
  ];

  const checkedUrls = new Map<string, string>();
  const fetchImpl = deps.fetchImpl ?? fetch;
  for (const guide of guides.filter(
    (item) => item.status === "approved" && item.sourceUrl
  )) {
    if (checkedUrls.size >= 20 || checkedUrls.has(guide.sourceUrl!)) continue;
    const status = await checkLink(fetchImpl, guide.sourceUrl!);
    checkedUrls.set(guide.sourceUrl!, guide.slug);
    const linkFinding = classifyLink(status);
    if (linkFinding) {
      findings.push({
        ...linkFinding,
        guideSlug: guide.slug,
      });
    }
  }

  const processed = dedupeFindings(findings);
  const existingResult = await admin
    .from("knowledge_health_findings")
    .select(
      "id,organization_id,guide_slug,kind,severity,summary,evidence,status,reviewed_by,reviewed_at,first_seen_at,last_seen_at"
    )
    .eq("organization_id", orgId);
  if (existingResult.error) throw existingResult.error;
  const existing = new Map(
    ((existingResult.data ?? []) as HealthRow[]).map((row) => [
      `${row.kind}:${row.guide_slug ?? ""}`,
      row,
    ])
  );
  const lastSeenAt = now.toISOString();
  for (const finding of processed) {
    const key = `${finding.kind}:${finding.guideSlug ?? ""}`;
    const prior = existing.get(key);
    if (prior?.status === "open") {
      const updated = await admin
        .from("knowledge_health_findings")
        .update({
          severity: finding.severity,
          summary: finding.summary,
          evidence: finding.evidence,
          last_seen_at: lastSeenAt,
        })
        .eq("id", prior.id)
        .eq("organization_id", orgId)
        .eq("status", "open");
      if (updated.error) throw updated.error;
    } else if (!prior) {
      const inserted = await admin.from("knowledge_health_findings").insert({
        organization_id: orgId,
        guide_slug: finding.guideSlug,
        kind: finding.kind,
        severity: finding.severity,
        summary: finding.summary,
        evidence: finding.evidence,
        status: "open",
        last_seen_at: lastSeenAt,
      });
      if (inserted.error) throw inserted.error;
    }
  }
  return { findings: processed.length, linksChecked: checkedUrls.size };
}

export async function listKnowledgeHealthFindings(
  orgId: string
): Promise<KnowledgeHealthFinding[]> {
  if (!isKnowledgeHealthEnabled()) return [];
  const { data, error } = await createAdminClient()
    .from("knowledge_health_findings")
    .select(
      "id,organization_id,guide_slug,kind,severity,summary,evidence,status,reviewed_by,reviewed_at,first_seen_at,last_seen_at"
    )
    .eq("organization_id", orgId)
    .in("status", ["open", "acknowledged"])
    .order("last_seen_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as HealthRow[]).map(mapFinding);
}

export async function reviewKnowledgeHealthFinding(input: {
  orgId: string;
  findingId: string;
  actorId: string;
  status: "acknowledged" | "dismissed";
}): Promise<{ success: true } | { error: string }> {
  if (!isKnowledgeHealthEnabled()) return { error: "Not available." };
  const { data, error } = await createAdminClient()
    .from("knowledge_health_findings")
    .update({
      status: input.status,
      reviewed_by: input.actorId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.findingId)
    .eq("organization_id", input.orgId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Finding not found." };
  return { success: true };
}
