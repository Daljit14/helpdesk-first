import type { Metadata } from "next";
import { StatusWidget } from "@/components/status-widget";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Status" };

export default function StatusPage() {
  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader
          title="System status"
          description="Live health of HelpDesk First and its database."
        />
        <StatusWidget />
      </div>
    </section>
  );
}
