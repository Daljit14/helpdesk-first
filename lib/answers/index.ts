import { z } from "zod";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  getAnswerEngineConfig,
  getResearchConfig,
  type AnswerEngineConfig,
} from "@/lib/autonomy/config";
import { loadOrgVendorDomains } from "@/lib/research/vendor-domains";
import type { ResearchProvider, ResearchSource } from "@/lib/research/types";
import { wrapUntrusted } from "@/lib/agent/untrusted";
import { NO_REQUESTER, toUserText } from "@/lib/agent/output-guard";
import { answerTierFor, isRedditHost } from "./tiers";
import { planQueries } from "./query-plan";
import { fetchPage, type FetchPageResult } from "./fetch-page";
import { screenSourceText } from "./screen";
import {
  answerDraftSchema,
  ANSWER_PROMPT_VERSION,
  createDefaultSynthesizer,
  type Synthesizer,
} from "./synthesize";
import { enforceCitations } from "./cite";
import {
  getAnswerCache,
  getSourceCache,
  putAnswerCache,
  putSourceCache,
  sha256,
} from "./cache";
import { consumeAnswerEngineBudget } from "./budget";
import { answerSourceFromResearch, createWebProviders } from "./providers/web";
import { createWikipediaProvider } from "./providers/wikipedia";
import { createStackExchangeProvider } from "./providers/stackexchange";
import { TIER_RANK } from "./types";
import type {
  Answer,
  AnswerEngineResult,
  AnswerEngineStatus,
  AnswerProvider,
  AnswerProviderId,
  AnswerSource,
  AnswerSourceDraft,
  PublicAnswerSource,
  SourceTier,
} from "./types";

type Admin = ReturnType<typeof createAdminClient>;

const draftCacheSchema = z.array(
  z.object({
    provider: z.enum(["brave", "tavily", "wikipedia", "stackexchange"]),
    url: z.string().url(),
    domain: z.string(),
    title: z.string(),
    text: z.string(),
    attribution: z.string().nullable(),
  })
);

const cachedAnswerSchema = z.object({
  answer: z.object({
    likelyCause: z
      .object({ text: z.string(), sourceIds: z.array(z.string()) })
      .nullable(),
    explanations: z.array(
      z.object({ text: z.string(), sourceIds: z.array(z.string()) })
    ),
    steps: z.array(
      z.object({
        text: z.string(),
        sourceIds: z.array(z.string()),
        kind: z.enum(["official", "community"]),
        tiers: z.array(
          z.enum([
            "org_approved",
            "vendor",
            "reference",
            "qa_community",
            "community",
          ])
        ),
        independentDomains: z.number().int().nonnegative(),
        confidence: z.number().min(0).max(1),
      })
    ),
    confidence: z.number().min(0).max(1),
    topTier: z
      .enum([
        "org_approved",
        "vendor",
        "reference",
        "qa_community",
        "community",
      ])
      .nullable(),
  }),
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      domain: z.string(),
      url: z.string().url(),
      tier: z.enum([
        "org_approved",
        "vendor",
        "reference",
        "qa_community",
        "community",
      ]),
      attribution: z.string().nullable(),
    })
  ),
});

const cachedPageSchema = z.object({
  text: z.string(),
  withheld: z.number().int().nonnegative(),
});

function emptyResult(
  status: AnswerEngineStatus,
  overrides: Partial<AnswerEngineResult> = {}
): AnswerEngineResult {
  return {
    status,
    runId: null,
    answer: null,
    sources: [],
    cached: false,
    droppedClaims: 0,
    ...overrides,
  };
}

function deadlineSignal(signal: AbortSignal, deadlineMs: number): AbortSignal {
  if (typeof AbortSignal.timeout !== "function") return signal;
  const deadline = AbortSignal.timeout(deadlineMs);
  return typeof AbortSignal.any === "function"
    ? AbortSignal.any([signal, deadline])
    : deadline;
}

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

function classifySource(
  source: AnswerSourceDraft,
  orgDomains: readonly string[]
): AnswerSource | null {
  const url = normalizeUrl(source.url);
  if (!url) return null;
  const classifiedTier = answerTierFor(
    url,
    source.provider === "brave" || source.provider === "tavily"
      ? orgDomains
      : []
  );
  if (!classifiedTier) return null;
  let tier: SourceTier | null;
  if (source.provider === "wikipedia")
    tier = classifiedTier === "reference" ? "reference" : null;
  else if (source.provider === "stackexchange")
    tier = classifiedTier === "qa_community" ? "qa_community" : null;
  else tier = classifiedTier;
  if (!tier) return null;
  let domain: string;
  try {
    domain = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
  return {
    ...source,
    url,
    domain,
    title: source.title.slice(0, 300),
    id: "",
    tier,
    fetched: false,
  };
}

function publicSource(source: AnswerSource): PublicAnswerSource {
  return {
    id: source.id,
    title: toUserText(source.title, NO_REQUESTER).slice(0, 300),
    domain: source.domain,
    url: source.url,
    tier: source.tier,
    attribution: source.attribution
      ? toUserText(source.attribution, NO_REQUESTER).slice(0, 200)
      : null,
  };
}

function citedSources(
  answer: Answer,
  sources: AnswerSource[]
): PublicAnswerSource[] {
  const ids = new Set<string>();
  if (answer.likelyCause)
    answer.likelyCause.sourceIds.forEach((id) => ids.add(id));
  answer.explanations.forEach((item) =>
    item.sourceIds.forEach((id) => ids.add(id))
  );
  answer.steps.forEach((item) => item.sourceIds.forEach((id) => ids.add(id)));
  return sources.filter((source) => ids.has(source.id)).map(publicSource);
}

function toResearchDrafts(
  provider: ResearchProvider,
  sources: ResearchSource[]
): AnswerSourceDraft[] {
  return sources.map((source) => answerSourceFromResearch(provider.id, source));
}

async function cachedDrafts(
  admin: Admin,
  provider: AnswerProviderId,
  cacheKey: string
): Promise<AnswerSourceDraft[] | null> {
  const cached = await getSourceCache(admin, provider, cacheKey);
  if (cached === null) return null;
  const parsed = draftCacheSchema.safeParse(cached);
  return parsed.success ? parsed.data : null;
}

async function putDrafts(
  admin: Admin,
  provider: AnswerProviderId,
  cacheKey: string,
  drafts: AnswerSourceDraft[],
  ttlHours: number
): Promise<void> {
  await putSourceCache(admin, provider, cacheKey, drafts, ttlHours);
}

async function writeRun(
  admin: Admin,
  input: {
    organizationId: string | null;
    agentSessionId: string | null;
    ticketId: string | null;
    scope: string;
    problemLabel: string;
    platform: string;
    status: AnswerEngineStatus;
    answer: Answer | null;
    queries: number;
    sources: number;
    citedSources: number;
    droppedClaims: number;
    withheld: number;
    cacheHit: boolean;
    latencyMs: number;
    costUnits: number;
    providers: string[];
  }
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("answer_engine_runs")
      .insert({
        organization_id: input.organizationId,
        agent_session_id: input.agentSessionId,
        ticket_id: input.ticketId,
        scope: input.scope,
        problem_label: input.problemLabel.slice(0, 120),
        platform: input.platform.slice(0, 40),
        status: input.status,
        confidence: input.answer?.confidence ?? 0,
        top_tier: input.answer?.topTier ?? null,
        providers: input.providers,
        queries: input.queries,
        sources: input.sources,
        cited_sources: input.citedSources,
        dropped_claims: input.droppedClaims,
        withheld_paragraphs: input.withheld,
        cache_hit: input.cacheHit,
        latency_ms: Math.max(0, Math.trunc(input.latencyMs)),
        cost_units: input.costUnits,
        prompt_version: ANSWER_PROMPT_VERSION,
      })
      .select("id")
      .maybeSingle();
    return error || !data ? null : (data as { id: string }).id;
  } catch {
    return null;
  }
}

export async function runAnswerEngine(
  admin: Admin,
  input: {
    organizationId: string | null;
    agentSessionId: string | null;
    ticketId: string | null;
    problem: string;
    platform: string | null;
    product?: string | null;
    version?: string | null;
    denyTerms: readonly string[];
    signal: AbortSignal;
    deps?: {
      webProviders?: ResearchProvider[];
      wikipedia?: AnswerProvider;
      stackexchange?: AnswerProvider;
      fetchPage?: typeof fetchPage;
      fetchImpl?: typeof fetch;
      synthesize?: Synthesizer | null;
      loadVendorDomains?: (
        organizationId: string
      ) => Promise<readonly string[]>;
      now?: () => Date;
    };
    configOverride?: Partial<AnswerEngineConfig>;
  }
): Promise<AnswerEngineResult> {
  const startedAt = (input.deps?.now ?? (() => new Date()))().getTime();
  const config = { ...getAnswerEngineConfig(), ...input.configOverride };
  if (
    !config.enabled ||
    (input.organizationId === null && !config.publicEnabled)
  )
    return emptyResult("disabled");

  const scope = input.organizationId ? `org:${input.organizationId}` : "public";
  const plainQuery = planQueries({
    problem: input.problem,
    platform: input.platform,
    product: input.product,
    version: input.version,
    denyTerms: input.denyTerms,
  })[0];
  let wrappedProblem: string;
  try {
    wrappedProblem = wrapUntrusted("problem", input.problem.slice(0, 500));
  } catch {
    const label = plainQuery ?? "blocked input";
    const runId = await writeRun(admin, {
      organizationId: input.organizationId,
      agentSessionId: input.agentSessionId,
      ticketId: input.ticketId,
      scope,
      problemLabel: label,
      platform: input.platform ?? "",
      status: "input_blocked",
      answer: null,
      queries: 0,
      sources: 0,
      citedSources: 0,
      droppedClaims: 0,
      withheld: 0,
      cacheHit: false,
      latencyMs:
        (input.deps?.now ?? (() => new Date()))().getTime() - startedAt,
      costUnits: 0,
      providers: [],
    });
    return emptyResult("input_blocked", { runId });
  }

  const queries = planQueries({
    problem: input.problem,
    platform: input.platform,
    product: input.product,
    version: input.version,
    denyTerms: input.denyTerms,
  });
  if (queries.length === 0) {
    const runId = await writeRun(admin, {
      organizationId: input.organizationId,
      agentSessionId: input.agentSessionId,
      ticketId: input.ticketId,
      scope,
      problemLabel: "",
      platform: input.platform ?? "",
      status: "no_sources",
      answer: null,
      queries: 0,
      sources: 0,
      citedSources: 0,
      droppedClaims: 0,
      withheld: 0,
      cacheHit: false,
      latencyMs:
        (input.deps?.now ?? (() => new Date()))().getTime() - startedAt,
      costUnits: 0,
      providers: [],
    });
    return emptyResult("no_sources", { runId });
  }
  const problemHash = sha256(`${plainQuery ?? ""}|${input.platform ?? ""}`);
  const cachedAnswer = await getAnswerCache(admin, scope, problemHash);
  if (cachedAnswer !== null) {
    const parsed = cachedAnswerSchema.safeParse(cachedAnswer);
    if (parsed.success) {
      const answer = parsed.data.answer as Answer;
      const sources = parsed.data.sources as PublicAnswerSource[];
      const runId = await writeRun(admin, {
        organizationId: input.organizationId,
        agentSessionId: input.agentSessionId,
        ticketId: input.ticketId,
        scope,
        problemLabel: plainQuery ?? "",
        platform: input.platform ?? "",
        status: "answered",
        answer,
        queries: queries.length,
        sources: sources.length,
        citedSources: sources.length,
        droppedClaims: 0,
        withheld: 0,
        cacheHit: true,
        latencyMs:
          (input.deps?.now ?? (() => new Date()))().getTime() - startedAt,
        costUnits: 0,
        providers: [],
      });
      return {
        status: "answered",
        runId,
        answer,
        sources,
        cached: true,
        droppedClaims: 0,
      };
    }
  }

  const signal = deadlineSignal(input.signal, config.deadlineMs);
  let orgDomains: readonly string[] = [];
  if (input.organizationId) {
    try {
      orgDomains = await (
        input.deps?.loadVendorDomains ??
        ((organizationId) => loadOrgVendorDomains(admin, organizationId))
      )(input.organizationId);
    } catch {
      orgDomains = [];
    }
  }

  const webProviders =
    input.deps?.webProviders ??
    createWebProviders(config.webProviders, {
      timeoutMs: config.providerTimeoutMs,
    });
  const wikipedia =
    input.deps?.wikipedia ??
    createWikipediaProvider({
      contact: config.contact,
      timeoutMs: config.providerTimeoutMs,
    });
  const stackexchange =
    input.deps?.stackexchange ??
    createStackExchangeProvider({
      apiKey: config.stackexchangeKey,
      sites: config.stackexchangeSites,
      timeoutMs: config.providerTimeoutMs,
    });
  const synthesize =
    input.deps?.synthesize === undefined
      ? createDefaultSynthesizer()
      : input.deps.synthesize;
  const providersUsed = new Set<string>();
  let costUnits = 0;

  const queryTasks = queries.map(async (query, queryIndex) => {
    const drafts: AnswerSourceDraft[] = [];
    for (const provider of webProviders) {
      const providerId = provider.id;
      const cacheKey = sha256(query);
      const cached = await cachedDrafts(admin, providerId, cacheKey);
      if (cached !== null) {
        providersUsed.add(providerId);
        drafts.push(...cached);
        break;
      }
      const budget = await consumeAnswerEngineBudget(admin, {
        organizationId: input.organizationId,
        units: 1,
        organizationLimit: getResearchConfig().orgDailyBudget,
        globalLimit: config.globalDailyCap,
      });
      if (!budget) break;
      costUnits += 1;
      providersUsed.add(providerId);
      let result;
      try {
        result = await provider.search(query, signal);
      } catch {
        continue;
      }
      if (!result.ok) continue;
      const providerDrafts = toResearchDrafts(provider, result.value);
      await putDrafts(
        admin,
        providerId,
        cacheKey,
        providerDrafts,
        config.cacheTtlHours
      );
      drafts.push(...providerDrafts);
      break;
    }

    if (config.wikipediaEnabled) {
      const providerId = "wikipedia";
      const cacheKey = sha256(query);
      const cached = await cachedDrafts(admin, providerId, cacheKey);
      if (cached !== null) {
        providersUsed.add(providerId);
        drafts.push(...cached);
      } else {
        providersUsed.add(providerId);
        try {
          const result = await wikipedia.search(query, signal);
          await putDrafts(
            admin,
            providerId,
            cacheKey,
            result,
            config.cacheTtlHours
          );
          drafts.push(...result);
        } catch {
          return drafts;
        }
      }
    }

    if (
      queryIndex === 0 &&
      config.stackexchangeEnabled &&
      config.stackexchangeKey
    ) {
      const providerId = "stackexchange";
      const cacheKey = sha256(query);
      const cached = await cachedDrafts(admin, providerId, cacheKey);
      if (cached !== null) {
        providersUsed.add(providerId);
        drafts.push(...cached);
      } else {
        providersUsed.add(providerId);
        try {
          const result = await stackexchange.search(query, signal);
          await putDrafts(
            admin,
            providerId,
            cacheKey,
            result,
            config.cacheTtlHours
          );
          drafts.push(...result);
        } catch {
          return drafts;
        }
      }
    }
    return drafts;
  });

  const settled = await Promise.allSettled(queryTasks);
  const collectedDrafts = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );
  const deduped = new Map<string, AnswerSource>();
  for (const draft of collectedDrafts) {
    const source = classifySource(draft, orgDomains);
    if (!source) continue;
    const key = normalizeUrl(source.url);
    if (key && !deduped.has(key)) deduped.set(key, source);
  }
  const providerOrder = [...config.webProviders, "wikipedia", "stackexchange"];
  let sources = [...deduped.values()].sort(
    (left, right) =>
      TIER_RANK[left.tier] - TIER_RANK[right.tier] ||
      providerOrder.indexOf(left.provider) -
        providerOrder.indexOf(right.provider) ||
      left.url.localeCompare(right.url)
  );

  let withheld = 0;
  if (config.pageFetchEnabled) {
    const pageCandidates = sources
      .filter(
        (source) =>
          (source.provider === "brave" || source.provider === "tavily") &&
          (source.tier === "org_approved" ||
            source.tier === "vendor" ||
            source.tier === "reference") &&
          !isRedditHost(source.domain)
      )
      .slice(0, 4);
    const pageFetcher = input.deps?.fetchPage ?? fetchPage;
    await Promise.all(
      pageCandidates.map(async (source) => {
        const cacheKey = sha256(source.url);
        const cached = await getSourceCache(admin, "page", cacheKey);
        if (cached !== null) {
          const parsed = cachedPageSchema.safeParse(cached);
          if (parsed.success) {
            source.text = parsed.data.text;
            source.fetched = true;
            withheld += parsed.data.withheld;
            return;
          }
        }
        let fetched: FetchPageResult;
        try {
          fetched = await pageFetcher(source.url, {
            tier: source.tier,
            signal,
            fetchImpl: input.deps?.fetchImpl,
            orgDomains,
          });
        } catch {
          return;
        }
        if (!fetched.ok) return;
        source.text = fetched.text;
        source.fetched = true;
        withheld += fetched.withheld;
        await putSourceCache(
          admin,
          "page",
          cacheKey,
          { text: fetched.text, withheld: fetched.withheld },
          config.cacheTtlHours
        );
      })
    );
  }

  let droppedSources = 0;
  sources = sources.flatMap((source) => {
    const screened = screenSourceText(source.text.slice(0, 6000));
    const screenedTitle = screenSourceText(source.title.slice(0, 300));
    withheld += screened.withheld;
    withheld += screenedTitle.withheld;
    try {
      wrapUntrusted(`source:${source.id || "candidate"}`, screened.text);
      wrapUntrusted(
        `source-title:${source.id || "candidate"}`,
        screenedTitle.text
      );
    } catch {
      droppedSources += 1;
      return [];
    }
    return [{ ...source, title: screenedTitle.text, text: screened.text }];
  });
  sources = sources.slice(0, 10).map((source, index) => ({
    ...source,
    id: `s${index + 1}`,
  }));

  if (sources.length === 0) {
    const runId = await writeRun(admin, {
      organizationId: input.organizationId,
      agentSessionId: input.agentSessionId,
      ticketId: input.ticketId,
      scope,
      problemLabel: plainQuery ?? "",
      platform: input.platform ?? "",
      status: "no_sources",
      answer: null,
      queries: queries.length,
      sources: 0,
      citedSources: 0,
      droppedClaims: droppedSources,
      withheld,
      cacheHit: false,
      latencyMs:
        (input.deps?.now ?? (() => new Date()))().getTime() - startedAt,
      costUnits,
      providers: [...providersUsed],
    });
    return emptyResult("no_sources", {
      runId,
      droppedClaims: droppedSources,
    });
  }

  if (!synthesize) {
    const runId = await writeRun(admin, {
      organizationId: input.organizationId,
      agentSessionId: input.agentSessionId,
      ticketId: input.ticketId,
      scope,
      problemLabel: plainQuery ?? "",
      platform: input.platform ?? "",
      status: "unavailable",
      answer: null,
      queries: queries.length,
      sources: sources.length,
      citedSources: 0,
      droppedClaims: droppedSources,
      withheld,
      cacheHit: false,
      latencyMs:
        (input.deps?.now ?? (() => new Date()))().getTime() - startedAt,
      costUnits,
      providers: [...providersUsed],
    });
    return emptyResult("unavailable", {
      runId,
      droppedClaims: droppedSources,
    });
  }

  const promptSources: Array<{
    id: string;
    tier: SourceTier;
    domain: string;
    title: string;
    text: string;
  }> = [];
  for (const source of sources) {
    try {
      promptSources.push({
        id: source.id,
        tier: source.tier,
        domain: source.domain,
        title: wrapUntrusted(`source-title:${source.id}`, source.title),
        text: wrapUntrusted(`source:${source.id}`, source.text),
      });
    } catch {
      droppedSources += 1;
    }
  }
  if (promptSources.length === 0) {
    const runId = await writeRun(admin, {
      organizationId: input.organizationId,
      agentSessionId: input.agentSessionId,
      ticketId: input.ticketId,
      scope,
      problemLabel: plainQuery ?? "",
      platform: input.platform ?? "",
      status: "no_sources",
      answer: null,
      queries: queries.length,
      sources: 0,
      citedSources: 0,
      droppedClaims: droppedSources,
      withheld,
      cacheHit: false,
      latencyMs:
        (input.deps?.now ?? (() => new Date()))().getTime() - startedAt,
      costUnits,
      providers: [...providersUsed],
    });
    return emptyResult("no_sources", {
      runId,
      droppedClaims: droppedSources,
    });
  }

  let draft;
  try {
    draft = answerDraftSchema.parse(
      await synthesize(
        JSON.stringify({
          problem: wrappedProblem,
          platform: input.platform,
          sources: promptSources,
        }),
        signal
      )
    );
  } catch {
    const runId = await writeRun(admin, {
      organizationId: input.organizationId,
      agentSessionId: input.agentSessionId,
      ticketId: input.ticketId,
      scope,
      problemLabel: plainQuery ?? "",
      platform: input.platform ?? "",
      status: "unavailable",
      answer: null,
      queries: queries.length,
      sources: sources.length,
      citedSources: 0,
      droppedClaims: droppedSources,
      withheld,
      cacheHit: false,
      latencyMs:
        (input.deps?.now ?? (() => new Date()))().getTime() - startedAt,
      costUnits,
      providers: [...providersUsed],
    });
    return emptyResult("unavailable", {
      runId,
      droppedClaims: droppedSources,
    });
  }

  const enforced = enforceCitations(draft, sources);
  const answer = enforced.answer;
  const droppedClaims = enforced.droppedClaims + droppedSources;
  const publicSources = citedSources(answer, sources);
  const status: AnswerEngineStatus =
    answer.steps.length > 0 && answer.confidence >= config.minConfidence
      ? "answered"
      : "low_confidence";
  const runId = await writeRun(admin, {
    organizationId: input.organizationId,
    agentSessionId: input.agentSessionId,
    ticketId: input.ticketId,
    scope,
    problemLabel: plainQuery ?? "",
    platform: input.platform ?? "",
    status,
    answer,
    queries: queries.length,
    sources: sources.length,
    citedSources: publicSources.length,
    droppedClaims,
    withheld,
    cacheHit: false,
    latencyMs: (input.deps?.now ?? (() => new Date()))().getTime() - startedAt,
    costUnits,
    providers: [...providersUsed],
  });
  if (status === "answered") {
    await putAnswerCache(
      admin,
      scope,
      input.organizationId,
      problemHash,
      answer,
      publicSources,
      config.cacheTtlHours
    );
  }
  return {
    status,
    runId,
    answer,
    sources: publicSources,
    cached: false,
    droppedClaims,
  };
}

export { ANSWER_PROMPT_VERSION } from "./synthesize";
