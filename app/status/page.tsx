import type { Metadata } from "next";
import { StatusWidget } from "@/components/status-widget";

export const metadata: Metadata = { title: "Status" };

export default function StatusPage() {
  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          System status
        </h1>
        <p className="mt-2 text-muted-foreground">
          Live health of HelpDesk First and its database.
        </p>
        <div className="mt-8">
          <StatusWidget />
        </div>
      </div>
    </section>
  );
}
