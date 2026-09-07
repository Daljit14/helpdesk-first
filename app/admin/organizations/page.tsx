import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformOrganizationsPanel } from "@/components/admin/platform-organizations-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Organizations",
  robots: { index: false, follow: false },
};

export default async function OrganizationsPage() {
  const session = await requireAdminPage("/admin/organizations");
  if (!session.isPlatformAdmin) notFound();
  const { data: organizations } = await createAdminClient()
    .from("organizations")
    .select("id,name,created_at")
    .order("created_at", { ascending: false });
  return (
    <section className="flex flex-1 flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <p className="text-sm text-muted-foreground">Platform administration</p>
        <h1 className="mt-2 text-3xl font-bold">Organizations</h1>
        <div className="mt-6">
          <PlatformOrganizationsPanel organizations={organizations ?? []} />
        </div>
      </div>
    </section>
  );
}
