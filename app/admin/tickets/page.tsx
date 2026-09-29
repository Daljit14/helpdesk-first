import type { Metadata } from "next";
import {
  OperationsView,
  type OperationsSearchParams,
} from "@/components/admin/operations-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ticket queue",
  robots: { index: false, follow: false },
};

export default async function TicketQueuePage({
  searchParams,
}: {
  searchParams: Promise<OperationsSearchParams>;
}) {
  return (
    <OperationsView
      path="/admin/tickets"
      initialTab="tickets"
      params={await searchParams}
    />
  );
}
