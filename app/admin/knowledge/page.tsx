import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  BookOpen,
  CheckCircle2,
  Gauge,
  Layers,
  Lightbulb,
} from "lucide-react";
import { requireAdminPage } from "@/lib/admin/auth";
import {
  isKnowledgeGovernanceEnabled,
  isKnowledgeHealthEnabled,
  isKnowledgeLearningEnabled,
} from "@/lib/admin/flags";
import {
  listGuideRevisions,
  listGuides,
  type GuideRevision,
} from "@/lib/knowledge/governance";
import { KnowledgeTable } from "@/components/admin/knowledge-table";
import { KnowledgeDrafts } from "@/components/admin/knowledge-drafts";
import { KnowledgeHealth } from "@/components/admin/knowledge-health";
import { listKnowledgeDrafts } from "@/lib/knowledge/learning";
import { listKnowledgeHealthFindings } from "@/lib/knowledge/health";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAiModel,
  getAiProviderKind,
  getDailyCallBudget,
} from "@/lib/ai/config";
import {
  AdminHero,
  AdminPage,
  BarRows,
  HeroChip,
  Panel,
  StatGrid,
  StatTile,
  StatusPill,
} from "@/components/admin/ui/admin-kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Knowledge",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  retired: "Retired",
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
  const drafts = isKnowledgeLearningEnabled()
    ? await listKnowledgeDrafts(session.organizationId)
    : [];
  const healthFindings = isKnowledgeHealthEnabled()
    ? await listKnowledgeHealthFindings(session.organizationId)
    : [];

  const approved = guides.filter((guide) => guide.status === "approved").length;
  const inReview = guides.filter(
    (guide) => guide.status === "in_review"
  ).length;
  const draftsPending = drafts.filter(
    (draft) =>
      draft.status === "draft" || draft.status === "needs_security_review"
  ).length;
  const openFindings = healthFindings.filter(
    (finding) => finding.status === "open"
  ).length;
  const criticalFindings = healthFindings.filter(
    (finding) => finding.severity === "critical" && finding.status === "open"
  ).length;
  const statusRows = (["approved", "in_review", "draft", "retired"] as const)
    .map((status) => ({
      key: STATUS_LABEL[status],
      count: guides.filter((guide) => guide.status === status).length,
    }))
    .filter((row) => row.count > 0);
  const aiEnabled = process.env.HELP_DESK_AI_ENABLED === "true";
  const outcomes = (calls ?? []).map((call) => call.outcome);
  const budget = getDailyCallBudget();

  return (
    <AdminPage>
      <AdminHero
        eyebrow="Knowledge governance"
        title="Knowledge Base"
        description="Governed support guides, AI-learned drafts waiting for review, and health findings from real support outcomes."
        icon={BookOpen}
        tone="forest"
      >
        <div className="flex flex-wrap gap-2">
          <HeroChip label="Guides" value={guides.length} />
          <HeroChip label="Approved" value={approved} />
          {isKnowledgeLearningEnabled() && (
            <HeroChip
              label="Drafts pending"
              value={draftsPending}
              pulse={draftsPending > 0}
            />
          )}
          {isKnowledgeHealthEnabled() && (
            <HeroChip label="Open findings" value={openFindings} />
          )}
        </div>
      </AdminHero>

      <StatGrid>
        <StatTile
          label="Guides"
          value={guides.length}
          icon={BookOpen}
          index={0}
        />
        <StatTile
          label="Approved"
          value={approved}
          icon={CheckCircle2}
          tone="good"
          index={1}
          progress={guides.length ? approved / guides.length : 0}
          hint={`${inReview} in review`}
        />
        <StatTile
          label="Drafts pending"
          value={draftsPending}
          icon={Lightbulb}
          tone="warn"
          index={2}
          hint={`${drafts.length} learning drafts total`}
        />
        <StatTile
          label="Open health findings"
          value={openFindings}
          icon={AlertTriangle}
          tone={criticalFindings > 0 ? "danger" : "info"}
          index={3}
          hint={`${criticalFindings} critical`}
        />
      </StatGrid>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title="Guides by status" icon={Layers} delay={0.1}>
          <BarRows
            items={statusRows}
            tone="good"
            empty="No guides match this view."
          />
        </Panel>
        <Panel title="AI provider" icon={Bot} delay={0.15}>
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="flex items-center justify-between gap-2 rounded-2xl border border-border p-3 text-sm font-bold">
              <span>AI enabled: {aiEnabled ? "Yes" : "No"}</span>
              <StatusPill
                tone={aiEnabled ? "good" : "neutral"}
                pulse={aiEnabled}
              >
                {aiEnabled ? "On" : "Off"}
              </StatusPill>
            </p>
            <p className="rounded-2xl border border-border p-3 text-sm font-bold">
              Provider: {getAiProviderKind()}
            </p>
            <p className="truncate rounded-2xl border border-border p-3 text-sm font-bold">
              Model: {getAiModel()}
            </p>
            <p className="flex items-center gap-2 rounded-2xl border border-border p-3 text-sm font-bold">
              <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden />
              Today&apos;s budget: {budget === 0 ? "Unlimited" : budget}
            </p>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Last 24 hours: {outcomes.join(", ") || "No provider calls"}
          </p>
        </Panel>
      </div>

      <KnowledgeTable
        guides={guides}
        canWrite={session.role === "org_admin"}
        revisions={revisions}
      />
      {isKnowledgeLearningEnabled() && (
        <KnowledgeDrafts
          drafts={drafts}
          canWrite={session.role === "org_admin"}
        />
      )}
      {isKnowledgeHealthEnabled() && (
        <KnowledgeHealth
          findings={healthFindings}
          canWrite={session.role === "org_admin"}
        />
      )}
    </AdminPage>
  );
}
