import { describe, expect, test, vi } from "vitest";
import { createEvalResearchStore } from "@/lib/agent/eval-research-store";
import type { EvidenceRecord } from "@/lib/evidence/types";
import type { ResearchProvider, ResearchSource } from "./types";
import { runResearch } from "./index";

const organizationId = "00000000-0000-4000-8000-000000000001";

const source: ResearchSource = {
  url: "https://support.contoso-vpn.com/kb/network",
  domain: "support.contoso-vpn.com",
  title: "Network support",
  snippet: "Approved network troubleshooting information.",
  trust: "community",
  contentHash: "network-source",
  fetchedAt: "2026-10-06T00:00:00.000Z",
};

const provider: ResearchProvider = {
  id: "tavily",
  async search() {
    return { ok: true, value: [source] };
  },
};

const evidence = {
  description: "Wi-Fi disconnects during calls.",
  hypotheses: [
    {
      id: "ev-1",
      cause: "Wi-Fi network connection drops",
      guideSlug: null,
      rawConfidence: 0.3,
      confidence: 0.3,
      explanation: "",
      supporting: [],
      rejecting: [],
    },
  ],
  citations: [],
  confirmedFacts: [],
} as unknown as EvidenceRecord;

describe("runResearch", () => {
  test("loads vendor domains for the organization and applies trust after retrieval", async () => {
    const { admin } = createEvalResearchStore();
    const loadVendorDomains = vi
      .fn()
      .mockResolvedValue(["support.contoso-vpn.com"]);
    const result = await runResearch(admin as never, {
      organizationId,
      runId: "run-1",
      ticketId: "ticket-1",
      category: "network",
      platform: "Windows",
      evidence,
      signal: new AbortController().signal,
      provider,
      judge: async (sources) =>
        sources.map((source) => ({
          ...source,
          judgement: "supports" as const,
          hypothesisId: "ev-1",
        })),
      loadVendorDomains,
      configOverride: {
        enabled: true,
        families: ["network"],
        orgDailyBudget: 50,
        maxQueriesPerRun: 1,
        minConfidence: 0.6,
        cacheTtlHours: 24,
      },
      writeEvent: vi.fn(async () => {}),
    });

    expect(loadVendorDomains).toHaveBeenCalledOnce();
    expect(loadVendorDomains).toHaveBeenCalledWith(organizationId);
    expect(result.status).toBe("ran");
    expect(result.sources[0]?.trust).toBe("vendor");
  });
});
