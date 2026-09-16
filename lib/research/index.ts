import type { createAdminClient } from "@/lib/supabase/admin";
import { getResearchConfig } from "@/lib/autonomy/config";
import { isIdentityFamily } from "@/lib/evidence/identity-family";
import { isNetworkFamily } from "@/lib/evidence/network-family";
import { buildResearchQueries } from "./query";
import { createBraveProvider } from "./providers/brave";
import { createTavilyProvider } from "./providers/tavily";
import { trustTierFor } from "./allowlist";
import { guardSource } from "./guard";
import { judgeSources } from "./judge";
import { checkAndConsumeOrgResearchBudget } from "./budget";
import { getCached, putCached } from "./cache";
import type { EvidenceRecord } from "@/lib/evidence/types";
import type { JudgedSource, ResearchOutcome, ResearchProvider } from "./types";

type ResearchAdmin = ReturnType<typeof createAdminClient>;

async function hash(value: string): Promise<string> {
  const data = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(data)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function event(
  admin: ResearchAdmin,
  input: {
    organizationId: string;
    runId: string;
    ticketId: string;
    kind: "research.consulted" | "research.skipped";
    detail: Record<string, unknown>;
  }
): Promise<void> {
  await admin.from("resolution_events").insert({
    organization_id: input.organizationId,
    run_id: input.runId,
    ticket_id: input.ticketId,
    kind: input.kind,
    actor: "research",
    detail: input.detail,
  });
}

function providerFor(provider: string): ResearchProvider {
  return provider === "brave" ? createBraveProvider() : createTavilyProvider();
}

export async function runResearch(
  admin: ResearchAdmin,
  input: {
    organizationId: string;
    runId: string;
    ticketId: string;
    category: string | null;
    platform: string | null;
    evidence: EvidenceRecord;
    signal: AbortSignal;
    provider?: ResearchProvider;
  }
): Promise<ResearchOutcome> {
  const config = getResearchConfig();
  const skip = async (reason: string): Promise<ResearchOutcome> => {
    await event(admin, {
      organizationId: input.organizationId,
      runId: input.runId,
      ticketId: input.ticketId,
      kind: "research.skipped",
      detail: { reason },
    });
    return { status: "skipped", reason, sources: [], queries: [] };
  };
  if (!config.enabled) return skip("disabled");
  const familyAllowed =
    (config.families.includes("identity") &&
      isIdentityFamily(input.category, input.evidence.description)) ||
    (config.families.includes("network") &&
      isNetworkFamily(input.category, input.evidence.description));
  if (!familyAllowed) return skip("family_not_allowlisted");
  const confidence = input.evidence.hypotheses[0]?.confidence;
  if (confidence !== undefined && confidence >= config.minConfidence)
    return skip("confidence_sufficient");
  if (
    !(await checkAndConsumeOrgResearchBudget(
      admin,
      input.organizationId,
      config.orgDailyBudget
    ))
  )
    return skip("budget_exhausted");
  const guideTitles = input.evidence.citations.map(
    (citation) => citation.title
  );
  const queries = buildResearchQueries({
    category: input.category,
    platform: input.platform,
    hypotheses: input.evidence.hypotheses,
    guideTitles,
  }).slice(0, config.maxQueriesPerRun);
  if (queries.length === 0) return skip("no_queries");
  const provider = input.provider ?? providerFor(config.provider);
  const allSources: JudgedSource[] = [];
  let dropped = 0;
  let cachedCount = 0;
  for (const query of queries) {
    const queryHash = await hash(query);
    let sources = await getCached(
      admin,
      input.organizationId,
      provider.id,
      queryHash
    );
    if (sources) {
      cachedCount += 1;
      await admin.from("research_queries").insert({
        organization_id: input.organizationId,
        run_id: input.runId,
        ticket_id: input.ticketId,
        provider: provider.id,
        query,
        cached: true,
      });
    } else {
      const result = await provider.search(query, input.signal);
      if (!result.ok) {
        dropped += 1;
        continue;
      }
      sources = result.value;
      await putCached(
        admin,
        input.organizationId,
        provider.id,
        queryHash,
        sources,
        config.cacheTtlHours
      );
      const queryRow = await admin
        .from("research_queries")
        .insert({
          organization_id: input.organizationId,
          run_id: input.runId,
          ticket_id: input.ticketId,
          provider: provider.id,
          query,
          cached: false,
        })
        .select("id")
        .single();
      if (!queryRow.error && queryRow.data) {
        for (const source of sources) {
          const trusted = trustTierFor(source.url);
          if (!trusted) {
            dropped += 1;
            continue;
          }
          const guarded = await guardSource(
            { ...source, trust: trusted },
            {
              admin,
              run: {
                id: input.runId,
                organization_id: input.organizationId,
                ticket_id: input.ticketId,
              },
            }
          );
          if (!guarded.ok) {
            dropped += 1;
            continue;
          }
          allSources.push({
            ...guarded.source,
            judgement: "unjudged",
            hypothesisId: null,
          });
          await admin.from("research_sources").insert({
            organization_id: input.organizationId,
            run_id: input.runId,
            ticket_id: input.ticketId,
            query_id: queryRow.data.id,
            url: guarded.source.url,
            domain: guarded.source.domain,
            title: guarded.source.title,
            snippet: guarded.source.snippet,
            trust: guarded.source.trust,
            judgement: "unjudged",
            hypothesis_id: null,
            content_hash: guarded.source.contentHash,
          });
        }
      }
    }
  }
  const judged = await judgeSources(
    allSources.slice(0, 15),
    input.evidence.hypotheses,
    input.evidence.confirmedFacts,
    input.signal
  );
  await event(admin, {
    organizationId: input.organizationId,
    runId: input.runId,
    ticketId: input.ticketId,
    kind: judged.length > 0 ? "research.consulted" : "research.skipped",
    detail:
      judged.length > 0
        ? {
            queries: queries.length,
            sources: judged.length,
            vendor: judged.filter((source) => source.trust === "vendor").length,
            community: judged.filter((source) => source.trust === "community")
              .length,
            dropped,
            cached: cachedCount,
          }
        : { reason: "no_valid_sources", dropped },
  });
  return {
    status: judged.length > 0 ? "ran" : "skipped",
    ...(judged.length > 0 ? {} : { reason: "no_valid_sources" }),
    sources: judged,
    queries,
  };
}

export * from "./types";
export * from "./allowlist";
export * from "./query";
