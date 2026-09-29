import type { Metadata } from "next";
import {
  OperationsView,
  type OperationsSearchParams,
} from "@/components/admin/operations-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Analytics and Trust Center",
  robots: { index: false, follow: false },
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<OperationsSearchParams>;
}) {
  return (
    <OperationsView
      path="/admin/analytics"
      initialTab="analytics"
      params={await searchParams}
    />
  );
}
