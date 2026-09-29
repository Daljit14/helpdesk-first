import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Mail, Settings, ShieldCheck, UserCog, UsersRound } from "lucide-react";
import { OrganizationPanel } from "@/components/admin/organization-panel";
import { requireAdminPage } from "@/lib/admin/auth";
import { loadOrganizationData } from "@/lib/admin/organization-data";
import {
  AdminHero,
  AdminPage,
  HeroChip,
  StatGrid,
  StatTile,
  heroButton,
} from "@/components/admin/ui/admin-kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Users and Employees",
  robots: { index: false, follow: false },
};

export default async function OrganizationPage() {
  const session = await requireAdminPage("/admin/organization");
  if (session.role !== "org_admin") notFound();
  const data = await loadOrganizationData(session.organizationId);
  const count = (role: string) =>
    data.members.filter(
      (member) =>
        member.role === role ||
        (role === "org_admin" && member.role === "admin")
    ).length;
  return (
    <AdminPage>
      <AdminHero
        eyebrow={data.organizationName}
        title="Users and Employees"
        description="Everyone who can sign in to your help desk, what they can do, and who is still invited."
        icon={UsersRound}
        tone="sunset"
        actions={
          <Link href="/admin/settings" className={heroButton}>
            <Settings className="h-4 w-4" aria-hidden />
            Organization settings
          </Link>
        }
      >
        <div className="flex flex-wrap gap-2">
          <HeroChip label="Members" value={data.members.length} />
          <HeroChip label="Pending invites" value={data.invitations.length} />
        </div>
      </AdminHero>
      <StatGrid>
        <StatTile
          label="Members"
          value={data.members.length}
          icon={UsersRound}
          index={0}
        />
        <StatTile
          label="Organization admins"
          value={count("org_admin")}
          icon={ShieldCheck}
          tone="primary"
          index={1}
        />
        <StatTile
          label="Support agents"
          value={count("support_agent")}
          icon={UserCog}
          tone="info"
          index={2}
        />
        <StatTile
          label="Pending invites"
          value={data.invitations.length}
          icon={Mail}
          tone="warn"
          index={3}
        />
      </StatGrid>
      <OrganizationPanel
        view="people"
        organizationName={data.organizationName}
        allowVerificationException={data.policy.allowVerificationException}
        slaTargets={data.policy.slaTargets}
        timezone={data.policy.timezone}
        members={data.members}
        domains={data.domains}
        invitations={data.invitations}
      />
    </AdminPage>
  );
}
