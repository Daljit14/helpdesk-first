import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { getOperationsSnapshot } from "@/lib/operations/snapshot";
import { isOperationsAdmin } from "@/lib/operations/admin";
import { getCurrentUser } from "@/lib/supabase/user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Operations",
  robots: { index: false, follow: false },
};

export default async function OperationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/operations");
  if (!isOperationsAdmin(user.email)) notFound();

  const snapshot = await getOperationsSnapshot();
  const openTickets = snapshot.liveTickets.filter((ticket) =>
    ["New", "In Progress", "Waiting"].includes(ticket.status)
  );
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const resolvedToday = snapshot.liveTickets.filter(
    (ticket) =>
      ["Resolved", "Closed"].includes(ticket.status) &&
      ticket.resolvedAt &&
      new Date(ticket.resolvedAt).getTime() >= startOfToday.getTime()
  ).length;
  const metrics = [
    ["Active users 5m", snapshot.trafficTimeline.activeUsers5m],
    ["Unique visitors today", snapshot.trafficTimeline.uniqueVisitorsToday],
    ["Open tickets", openTickets.length],
    [
      "Urgent open",
      openTickets.filter((ticket) => ticket.priority === "Urgent").length,
    ],
    ["New", openTickets.filter((ticket) => ticket.status === "New").length],
    [
      "In progress",
      openTickets.filter((ticket) => ticket.status === "In Progress").length,
    ],
    [
      "Waiting",
      openTickets.filter((ticket) => ticket.status === "Waiting").length,
    ],
    ["Resolved today", resolvedToday],
  ];

  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Operations</h1>
            <p className="mt-2 text-muted-foreground">
              Pseudonymous live support operations.
            </p>
          </div>
          <AutoRefresh />
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-border bg-card p-4"
            >
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Traffic</h2>
          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <span>
              Page views/min: {snapshot.trafficTimeline.pageViewsPerMin}
            </span>
            <span>
              Guide views/min: {snapshot.trafficTimeline.guideViewsPerMin}
            </span>
            <span>
              Assistant starts/min:{" "}
              {snapshot.trafficTimeline.assistantStartsPerMin}
            </span>
            <span>
              Tickets/min: {snapshot.trafficTimeline.ticketsCreatedPerMin}
            </span>
            <span>
              Sessions today: {snapshot.trafficTimeline.sessionsToday}
            </span>
            <span>
              Generated: {new Date(snapshot.generatedAt).toLocaleTimeString()}
            </span>
          </div>
        </div>

        <div className="mt-8 overflow-x-auto rounded-xl border border-border">
          <h2 className="border-b border-border bg-card px-5 py-4 font-semibold">
            Agent queue
          </h2>
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                {[
                  "Agent",
                  "Open",
                  "Urgent",
                  "SLA breached",
                  "Waiting",
                  "Resolved today",
                  "Avg age",
                  "Workload",
                ].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.agentQueue.map((row) => (
                <tr key={row.agent} className="border-t border-border">
                  <td className="px-4 py-3">{row.agent}</td>
                  <td className="px-4 py-3">{row.assignedOpen}</td>
                  <td className="px-4 py-3">{row.urgentOpen}</td>
                  <td className="px-4 py-3">{row.slaBreached}</td>
                  <td className="px-4 py-3">{row.waiting}</td>
                  <td className="px-4 py-3">{row.resolvedToday}</td>
                  <td className="px-4 py-3">
                    {row.averageOpenAgeMinutes ?? "—"}
                  </td>
                  <td className="px-4 py-3">{row.workload}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 overflow-x-auto rounded-xl border border-border">
          <h2 className="border-b border-border bg-card px-5 py-4 font-semibold">
            Live tickets
          </h2>
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                {[
                  "Ticket ID",
                  "Created",
                  "Status",
                  "Priority",
                  "Category",
                  "Issue",
                  "User key",
                  "Agent",
                  "SLA due",
                  "Platform",
                  "Attachment",
                ].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.liveTickets.map((ticket) => (
                <tr key={ticket.ticketId} className="border-t border-border">
                  <td className="whitespace-nowrap px-4 py-3 font-mono">
                    {ticket.ticketId}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {new Date(ticket.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{ticket.status}</td>
                  <td className="px-4 py-3">{ticket.priority}</td>
                  <td className="px-4 py-3">{ticket.category}</td>
                  <td className="px-4 py-3">{ticket.issueTitle}</td>
                  <td className="px-4 py-3 font-mono">{ticket.userKey}</td>
                  <td className="px-4 py-3">{ticket.assignedAgent || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {new Date(ticket.slaDue).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{ticket.platform}</td>
                  <td className="px-4 py-3">
                    {ticket.hasAttachment ? "Yes" : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Pseudonymous data only — no emails, messages, or attachments.
        </p>
      </div>
    </section>
  );
}
