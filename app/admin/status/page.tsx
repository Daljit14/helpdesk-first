import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ExternalLink } from "lucide-react";
import { requireAdminPage } from "@/lib/admin/auth";
import { SystemStatusPanel } from "@/components/admin/system-status-panel";
import {
  AdminHero,
  AdminPage,
  heroButton,
} from "@/components/admin/ui/admin-kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "System Status",
  robots: { index: false, follow: false },
};

export default async function AdminStatusPage() {
  await requireAdminPage("/admin/status");
  return (
    <AdminPage>
      <AdminHero
        eyebrow="Overview"
        title="System Status"
        description="Live health of every service behind HelpDesk First — database, sign-in, storage, AI and email."
        icon={Activity}
        tone="ocean"
        actions={
          <Link href="/status" className={heroButton} target="_blank">
            <ExternalLink className="h-4 w-4" aria-hidden />
            Public status page
          </Link>
        }
      />
      <SystemStatusPanel />
    </AdminPage>
  );
}
