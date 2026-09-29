import { requireAdminApi } from "@/lib/admin/auth";
import { loadDbOverview, loadLiveEvents } from "@/lib/admin/database-overview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (session instanceof Response) return session;

  const since = new URL(request.url).searchParams.get("since");
  const scope = {
    organizationId: session.isPlatformAdmin ? null : session.organizationId,
  };

  if (!since) {
    const overview = await loadDbOverview(scope);
    return Response.json(
      { overview },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (Number.isNaN(Date.parse(since))) {
    return Response.json(
      { error: "Invalid since timestamp." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const result = await loadLiveEvents(scope, new Date(since).toISOString());
  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
