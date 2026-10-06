import type { createAdminClient } from "@/lib/supabase/admin";
import { getResearchConfig, type ResearchConfig } from "@/lib/autonomy/config";
import type { EvidenceHypothesis } from "@/lib/evidence/types";
import {
  EMAIL,
  INTERNAL_FQDN,
  IP_ADDRESS,
  IPV6_CANDIDATE,
  IPV6_FULL,
  MAC_ADDRESS,
  SECRET_PATTERNS,
  UNC_HOSTNAME,
  URL_PATTERN,
  WINDOWS_HOSTNAME,
  WINDOWS_SID,
} from "@/lib/agent/output-guard";
import { guardSource } from "./guard";
import { trustTierFor } from "./allowlist";
import { loadOrgVendorDomains } from "./vendor-domains";
import { checkAndConsumeOrgResearchBudget } from "./budget";
import { getCached, hashResearchQuery, putCached } from "./cache";
import { judgeSources } from "./judge";
import { researchProviderFor } from "./index";
import { queryWords } from "./query";
import type {
  JudgedSource,
  ResearchProvider,
  ResearchSource,
  TrustTier,
} from "./types";

export const AGENT_WEB_SEARCH_SESSION_CAP = 3;
export const AGENT_WEB_SEARCH_MAX_SOURCES = 5;
export const AGENT_WEB_SNIPPET_MAX = 300;

export type AgentWebSource = {
  sourceId: string;
  title: string;
  domain: string;
  url: string;
  trust: TrustTier;
  snippet: string;
  judgement: JudgedSource["judgement"];
};

export type AgentWebSearchOutcome =
  | { status: "ran"; query: string; sources: AgentWebSource[] }
  | {
      status: "skipped";
      reason:
        | "disabled"
        | "empty_query"
        | "session_cap"
        | "budget_exhausted"
        | "provider_failed"
        | "no_valid_sources";
    };

type Admin = ReturnType<typeof createAdminClient>;

function replaceLiteral(value: string, literal: string): string {
  if (!literal) return value;
  return value.replace(
    new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
    " "
  );
}

export function sanitizeAgentSearchQuery(
  raw: string,
  denyTerms: readonly string[]
): string | null {
  let sanitized = raw;
  for (const pattern of [
    EMAIL,
    URL_PATTERN,
    IP_ADDRESS,
    IPV6_CANDIDATE,
    IPV6_FULL,
    MAC_ADDRESS,
    WINDOWS_SID,
    INTERNAL_FQDN,
    UNC_HOSTNAME,
    WINDOWS_HOSTNAME,
  ]) {
    sanitized = sanitized.replace(pattern, " ");
  }
  sanitized = sanitized.replace(/\b[\w-]*\w\.[\w.-]*\w\b/g, " ");
  sanitized = sanitized.replace(/\d{4,}/g, " ");
  for (const secret of SECRET_PATTERNS)
    sanitized = sanitized.replace(secret.pattern, " ");

  for (const term of denyTerms) {
    sanitized = replaceLiteral(sanitized, term);
    const parts = term.split(/[@._\s\\-]+/).filter((part) => part.length >= 3);
    for (const part of parts) sanitized = replaceLiteral(sanitized, part);
  }
  const words = queryWords(sanitized, 10);
  const query = words.join(" ").trim().slice(0, 120);
  return query.length > 0 ? query : null;
}

function searchHypothesis(query: string): EvidenceHypothesis {
  return {
    id: "query",
    cause: query,
    guideSlug: null,
    rawConfidence: 0,
    confidence: 0,
    explanation: "",
    supporting: [],
    rejecting: [],
  };
}

export async function runAgentWebSearch(
  admin: Admin,
  input: {
    organizationId: string;
    sessionId: string;
    ticketId: string | null;
    runId: string | null;
    query: string;
    denyTerms: readonly string[];
    signal: AbortSignal;
    provider?: ResearchProvider;
    judge?: typeof judgeSources;
    loadVendorDomains?: (organizationId: string) => Promise<readonly string[]>;
    configOverride?: Partial<ResearchConfig>;
  }
): Promise<AgentWebSearchOutcome> {
  const config = { ...getResearchConfig(), ...input.configOverride };
  if (!config.enabled) return { status: "skipped", reason: "disabled" };
  const query = sanitizeAgentSearchQuery(input.query, input.denyTerms);
  if (!query) return { status: "skipped", reason: "empty_query" };

  const sessionQueries = await admin
    .from("research_queries")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", input.organizationId)
    .eq("agent_session_id", input.sessionId);
  if (sessionQueries.error)
    return { status: "skipped", reason: "provider_failed" };
  if ((sessionQueries.count ?? 0) >= AGENT_WEB_SEARCH_SESSION_CAP)
    return { status: "skipped", reason: "session_cap" };

  let orgDomains: readonly string[] = [];
  try {
    orgDomains = await (
      input.loadVendorDomains ??
      ((organizationId) => loadOrgVendorDomains(admin, organizationId))
    )(input.organizationId);
  } catch {
    orgDomains = [];
  }

  const provider = input.provider ?? researchProviderFor(config.provider);
  const queryHash = await hashResearchQuery(query);
  const cachedSources = await getCached(
    admin,
    input.organizationId,
    provider.id,
    queryHash
  );
  let sources: ResearchSource[] | null = cachedSources;
  let providerFailed = false;
  if (cachedSources === null) {
    if (
      !(await checkAndConsumeOrgResearchBudget(
        admin,
        input.organizationId,
        config.orgDailyBudget
      ))
    )
      return { status: "skipped", reason: "budget_exhausted" };
    try {
      const result = await provider.search(query, input.signal);
      if (!result.ok) providerFailed = true;
      else {
        sources = result.value;
        await putCached(
          admin,
          input.organizationId,
          provider.id,
          queryHash,
          sources,
          config.cacheTtlHours
        );
      }
    } catch {
      providerFailed = true;
    }
  }

  const queryRow = await admin
    .from("research_queries")
    .insert({
      organization_id: input.organizationId,
      run_id: input.runId,
      ticket_id: input.ticketId,
      agent_session_id: input.sessionId,
      provider: provider.id,
      query,
      cached: cachedSources !== null,
    })
    .select("id")
    .single();
  if (queryRow.error || !queryRow.data)
    return { status: "skipped", reason: "provider_failed" };
  if (providerFailed || !sources)
    return { status: "skipped", reason: "provider_failed" };

  const guardedSources: ResearchSource[] = [];
  for (const source of sources) {
    const trust = trustTierFor(source.url, orgDomains);
    if (!trust) continue;
    const guarded = await guardSource({ ...source, trust });
    if (guarded.ok) guardedSources.push(guarded.source);
  }
  const orderedSources = guardedSources
    .map((source, index) => ({ source, index }))
    .sort((left, right) =>
      left.source.trust === right.source.trust
        ? left.index - right.index
        : left.source.trust === "vendor"
          ? -1
          : 1
    )
    .slice(0, AGENT_WEB_SEARCH_MAX_SOURCES)
    .map(({ source }) => source);
  if (orderedSources.length === 0)
    return { status: "skipped", reason: "no_valid_sources" };

  const judge = input.judge ?? judgeSources;
  const judged = await judge(
    orderedSources,
    [searchHypothesis(query)],
    [],
    input.signal
  );
  const resultSources: AgentWebSource[] = [];
  for (const source of judged) {
    const inserted = await admin
      .from("research_sources")
      .insert({
        organization_id: input.organizationId,
        run_id: input.runId,
        ticket_id: input.ticketId,
        agent_session_id: input.sessionId,
        query_id: queryRow.data.id,
        url: source.url,
        domain: source.domain,
        title: source.title,
        snippet: source.snippet.slice(0, 1500),
        trust: source.trust,
        judgement: source.judgement,
        hypothesis_id: source.hypothesisId,
        content_hash: source.contentHash,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data?.id) continue;
    resultSources.push({
      sourceId: inserted.data.id,
      title: source.title,
      domain: source.domain,
      url: source.url,
      trust: source.trust,
      snippet: source.snippet.slice(0, AGENT_WEB_SNIPPET_MAX),
      judgement: source.judgement,
    });
  }
  return resultSources.length > 0
    ? { status: "ran", query, sources: resultSources }
    : { status: "skipped", reason: "no_valid_sources" };
}
