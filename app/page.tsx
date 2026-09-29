import { HomePage } from "@/components/home-page";
import { normalizePlatform } from "@/lib/platform";
import { HomeStart } from "@/components/v2/home-start";
import { isUiV2Enabled } from "@/lib/ui-v2";
import { getCurrentUser } from "@/lib/supabase/user";
import { getTickets } from "@/lib/guides-data";
import {
  isTicketWorkflowEnabled,
  isUserPortalEnabled,
} from "@/lib/admin/flags";
import { ticketState } from "@/lib/tickets/user-status";

type PageSearchParams = {
  [key: string]: string | string[] | undefined;
};

function parseString(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return first ?? "";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;

  if (isUiV2Enabled()) {
    const user = await getCurrentUser();
    const portalEnabled = isTicketWorkflowEnabled() && isUserPortalEnabled();
    const tickets =
      user && portalEnabled ? await getTickets(user.id, true) : [];
    return (
      <HomeStart
        signedIn={Boolean(user)}
        openTickets={tickets
          .filter(
            (ticket) => ticketState({ status: ticket.status }).group === "open"
          )
          .slice(0, 3)
          .map((ticket) => ({
            id: ticket.id,
            subject: ticket.issue_title,
            status: ticket.status,
            updatedAt: ticket.created_at,
          }))}
      />
    );
  }

  return (
    <HomePage
      initialQuery={parseString(params.q)}
      initialCategory={parseString(params.category) || null}
      initialPlatform={normalizePlatform(params.platform)}
    />
  );
}
