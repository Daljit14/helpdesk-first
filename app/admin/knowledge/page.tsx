import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin/auth";
import { isKnowledgeGovernanceEnabled } from "@/lib/admin/flags";
import {
  listGuideRevisions,
  listGuides,
  type GuideRevision,
} from "@/lib/knowledge/governance";
import { KnowledgeTable } from "@/components/admin/knowledge-table";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAiModel,
  getAiProviderKind,
  getDailyCallBudget,
} from "@/lib/ai/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Knowledge",
  robots: { index: false, follow: false },
};

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  if (!isKnowledgeGovernanceEnabled()) notFound();
  const session = await requireAdminPage("/admin/knowledge");
  const params = await searchParams;
  const guides = await listGuides(session.organizationId, {
    status: ["draft", "in_review", "approved", "retired"].includes(
      params.status ?? ""
    )
      ? (params.status as never)
      : undefined,
    q: params.q,
  });
  const { data: calls } = await createAdminClient()
    .from("ai_provider_calls")
    .select("outcome");
  const revisions = Object.fromEntries(
    await Promise.all(
      guides.map(async (guide) => [
        guide.id,
        await listGuideRevisions(guide.id, session.organizationId),
      ])
    )
  ) as Record<string, GuideRevision[]>;
  return (
    <section className="flex flex-1 flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6">
          <p className="text-sm text-muted-foreground">Knowledge governance</p>
          <h1 className="mt-1 text-3xl font-bold">Approved support guides</h1>
        </div>
        <div className="glass mb-6 grid gap-4 p-5 sm:grid-cols-4">
          <p>
            AI enabled:{" "}
            {process.env.HELP_DESK_AI_ENABLED === "true" ? "Yes" : "No"}
          </p>
          <p>Provider: {getAiProviderKind()}</p>
          <p>Model: {getAiModel()}</p>
          <p>
            Today&apos;s budget:{" "}
            {getDailyCallBudget() === 0 ? "Unlimited" : getDailyCallBudget()}
          </p>
          <p className="sm:col-span-4 text-sm text-muted-foreground">
            Last 24 hours:{" "}
            {(calls ?? []).map((call) => call.outcome).join(", ") ||
              "No provider calls"}
          </p>
        </div>
        <KnowledgeTable
          guides={guides}
          canWrite={session.role === "admin"}
          revisions={revisions}
        />
      </div>
    </section>
  );
}
