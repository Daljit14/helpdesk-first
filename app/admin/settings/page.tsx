import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Globe2, Settings, Timer, UsersRound } from "lucide-react";
import { OrganizationPanel } from "@/components/admin/organization-panel";
import { AdminThemeToggle } from "@/components/admin/admin-theme-toggle";
import { requireAdminPage } from "@/lib/admin/auth";
import { loadOrganizationData } from "@/lib/admin/organization-data";
import {
  AdminHero,
  AdminPage,
  HeroChip,
  Panel,
  heroButton,
} from "@/components/admin/ui/admin-kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const session = await requireAdminPage("/admin/settings");
  if (session.role !== "org_admin") notFound();
  const data = await loadOrganizationData(session.organizationId);
  const verified = data.domains.filter((domain) => domain.verified).length;
  return (
    <AdminPage>
      <AdminHero
        eyebrow={data.organizationName}
        title="Settings"
        description="SLA targets, verification rules, email domains and how the console looks."
        icon={Settings}
        tone="forest"
        actions={
          <Link href="/admin/organization" className={heroButton}>
            <UsersRound className="h-4 w-4" aria-hidden />
            Manage people
          </Link>
        }
      >
        <div className="flex flex-wrap gap-2">
          <HeroChip label="Timezone" value={data.policy.timezone} />
          <HeroChip
            label="Verified domains"
            value={`${verified} / ${data.domains.length}`}
          />
          <HeroChip
            label="Verification exceptions"
            value={data.policy.allowVerificationException ? "Allowed" : "Off"}
          />
        </div>
      </AdminHero>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <OrganizationPanel
          view="settings"
          organizationName={data.organizationName}
          allowVerificationException={data.policy.allowVerificationException}
          slaTargets={data.policy.slaTargets}
          timezone={data.policy.timezone}
          members={data.members}
          domains={data.domains}
          invitations={data.invitations}
        />
        <div className="space-y-5">
          <Panel
            title="Appearance"
            description="Light or dark console."
            icon={Settings}
            delay={0.1}
          >
            <AdminThemeToggle />
          </Panel>
          <Panel title="Where things live" icon={Timer} delay={0.15}>
            <ul className="space-y-2 text-sm font-semibold">
              <li>
                <Link
                  className="text-primary hover:underline"
                  href="/admin/notifications"
                >
                  Notifications and SLA alerts →
                </Link>
              </li>
              <li>
                <Link
                  className="text-primary hover:underline"
                  href="/admin/connectors"
                >
                  Identity connectors →
                </Link>
              </li>
              <li>
                <Link
                  className="text-primary hover:underline"
                  href="/admin/security"
                >
                  Security and audit log →
                </Link>
              </li>
              <li className="flex items-center gap-2 text-muted-foreground">
                <Globe2 className="h-4 w-4" aria-hidden />
                Domains are managed on this page.
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </AdminPage>
  );
}
