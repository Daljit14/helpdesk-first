import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { OrgActionPolicyPanel } from "@/components/admin/org-action-policy-panel";
import {
  AdminHero,
  AdminPage,
  HeroChip,
  Panel,
} from "@/components/admin/ui/admin-kit";
import { requireAdminPage } from "@/lib/admin/auth";
import { isOrgActionPolicyEnabled } from "@/lib/admin/flags";
import {
  getCapability,
  listCapabilities,
} from "@/lib/autonomy/capabilities/registry";
import { isDenylisted } from "@/lib/agent/denylist";
import {
  describeOrgPolicy,
  orgActionPolicyRuleSchema,
  type OrgActionPolicyRule,
} from "@/lib/autonomy/policy/org-policy";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "AI action policy",
  robots: { index: false, follow: false },
};

type PolicyRow = OrgActionPolicyRule & {
  note: string;
  createdAt: string;
};

function missingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export default async function OrgActionPolicyPage() {
  const session = await requireAdminPage("/admin/resolution/policy");
  if (!isOrgActionPolicyEnabled() || session.role !== "org_admin") notFound();

  const admin = createAdminClient();
  const result = await admin
    .from("org_action_policies")
    .select(
      "id,capability_id,effect,scope_groups,max_tier,autorun_windows,require_staff_approval,note,created_at"
    )
    .eq("organization_id", session.organizationId)
    .order("created_at")
    .limit(100);
  const rules: PolicyRow[] = [];
  for (const row of (result.data ?? []) as Array<Record<string, unknown>>) {
    const parsed = orgActionPolicyRuleSchema.safeParse({
      id: row.id,
      capabilityId: row.capability_id,
      effect: row.effect,
      scopeGroups: row.scope_groups,
      maxTier: row.max_tier,
      autorunWindows: row.autorun_windows,
      requireStaffApproval: row.require_staff_approval,
    });
    if (!parsed.success) continue;
    rules.push({
      ...parsed.data,
      note: typeof row.note === "string" ? row.note : "",
      createdAt: typeof row.created_at === "string" ? row.created_at : "",
    });
  }
  const capabilities = listCapabilities()
    .filter((capability) => !isDenylisted(capability.id, capability))
    .map((capability) => ({
      id: capability.id,
      label: capability.description,
    }));
  const summaries = describeOrgPolicy(rules, (id) => {
    const capability = getCapability(id, 1);
    return capability?.description ?? id;
  });

  return (
    <AdminPage>
      <AdminHero
        eyebrow="Organization settings"
        title="AI action policy"
        description="Set organization-wide allow and deny rules for AI-assisted fixes. Deny rules always take precedence."
        icon={ShieldCheck}
        tone="aurora"
      >
        <HeroChip label="Policy rules" value={rules.length} />
      </AdminHero>

      {result.error && (
        <p
          role="status"
          className="rounded-2xl border border-status-warning/40 bg-status-warning/10 p-3 text-sm font-bold text-status-warning"
        >
          {missingTable(result.error)
            ? "AI action policy table not applied"
            : "AI action policies could not be loaded. Try again later."}
        </p>
      )}

      {!result.error && (
        <>
          <Panel
            title="What the assistant will do"
            description="Plain-language summary of the active organization rules."
            icon={ShieldCheck}
          >
            {summaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No rules yet — the AI follows each fix&apos;s normal settings.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {summaries.map((summary, index) => (
                  <li
                    key={`${index}-${summary}`}
                    className="rounded-xl border border-border bg-muted/30 p-3"
                  >
                    {summary}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Manage rules"
            description="Rules affect only this organization. Group scope uses directory group IDs."
            icon={ShieldCheck}
          >
            <OrgActionPolicyPanel rules={rules} capabilities={capabilities} />
          </Panel>
        </>
      )}
    </AdminPage>
  );
}
