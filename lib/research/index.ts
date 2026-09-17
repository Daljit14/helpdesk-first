import type { createAdminClient } from "@/lib/supabase/admin";
import { getResearchConfig, type ResearchConfig } from "@/lib/autonomy/config";
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
import type { EvidenceHypothesis, Fact } from "@/lib/evidence/types";
import type {
  JudgedSource,
  ResearchOutcome,
  ResearchProvider,
  ResearchSource,
} from "./types";

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

function providerFor(provider: string): ResearchProvider {
  return provider === "brave" ? createBraveProvider() : createTavilyProvider();
}

type ResearchJudge = (
  sources: ResearchSource[],
  hypotheses: EvidenceHypothesis[],
  evidenceFacts: Fact[],
  signal: AbortSignal
) => Promise<JudgedSource[]>;

type CollectedSource = {
  source: ResearchSource;
  queryId: string;
};

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
    judge?: ResearchJudge;
    configOverride?: Partial<ResearchConfig>;
    writeEvent: (
      kind: "research.consulted" | "research.skipped",
      detail: Record<string, unknown>
    ) => Promise<void>;
  }
): Promise<ResearchOutcome> {
  const config = { ...getResearchConfig(), ...input.configOverride };
  const skip = async (reason: string): Promise<ResearchOutcome> => {
    await input.writeEvent("research.skipped", { reason });
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
  const collectedSources: CollectedSource[] = [];
  let dropped = 0;
  let cachedCount = 0;
  for (const query of queries) {
    const queryHash = await hash(query);
    const cachedSources = await getCached(
      admin,
      input.organizationId,
      provider.id,
      queryHash
    );
    let sources: ResearchSource[] | null = cachedSources;
    let providerFailed = false;
    if (cachedSources) {
      cachedCount += 1;
    } else {
      const result = await provider.search(query, input.signal);
      if (!result.ok) {
        providerFailed = true;
        dropped += 1;
      } else {
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
    }
    const queryRow = await admin
      .from("research_queries")
      .insert({
        organization_id: input.organizationId,
        run_id: input.runId,
        ticket_id: input.ticketId,
        provider: provider.id,
        query,
        cached: Boolean(cachedSources),
      })
      .select("id")
      .single();
    if (providerFailed || queryRow.error || !queryRow.data || !sources) {
      dropped += sources?.length ?? 0;
      continue;
    }
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
      collectedSources.push({
        source: guarded.source,
        queryId: queryRow.data.id,
      });
    }
  }
  const judge = input.judge ?? judgeSources;
  const judged = await judge(
    collectedSources.slice(0, 15).map(({ source }) => source),
    input.evidence.hypotheses,
    input.evidence.confirmedFacts,
    input.signal
  );
  for (const [index, source] of judged.entries()) {
    const collected = collectedSources[index];
    if (!collected) continue;
    await admin.from("research_sources").insert({
      organization_id: input.organizationId,
      run_id: input.runId,
      ticket_id: input.ticketId,
      query_id: collected.queryId,
      url: source.url,
      domain: source.domain,
      title: source.title,
      snippet: source.snippet,
      trust: source.trust,
      judgement: source.judgement,
      hypothesis_id: source.hypothesisId,
      content_hash: source.contentHash,
    });
  }
  await input.writeEvent(
    judged.length > 0 ? "research.consulted" : "research.skipped",
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
      : { reason: "no_valid_sources", dropped }
  );
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
