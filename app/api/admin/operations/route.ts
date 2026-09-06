import { z } from "zod";
import { requireAdminApi, recordAudit } from "@/lib/admin/auth";
import {
  defaultAdminFilters,
  getOperationsData,
  type AdminFilters,
} from "@/lib/admin/operations-data";
import { createRateLimiter } from "@/lib/ai/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z
  .object({
    status: z
      .enum([
        "New",
        "In Progress",
        "Waiting",
        "Resolved",
        "Closed",
        "open",
        "completed",
      ])
      .optional(),
    priority: z.enum(["Low", "Normal", "High", "Urgent"]).optional(),
    category: z.string().trim().min(1).max(40).optional(),
    platform: z
      .enum(["Windows", "macOS", "Linux", "Android", "iOS", "Other"])
      .optional(),
    agent: z.string().trim().min(1).max(60).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    sla: z.enum(["on_track", "due_soon", "breached", "closed"]).optional(),
    resolutionSource: z
      .enum(["ai", "agent", "self_service", "unresolved"])
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(10).max(100).default(25),
  })
  .strict();

const rateLimiter = createRateLimiter(
  {
    windowMs: 60_000,
    maxRequests: 60,
  },
  "admin-ops"
);

function parseFilters(request: Request): AdminFilters {
  const defaults = defaultAdminFilters();
  const params = new URL(request.url).searchParams;
  const raw = Object.fromEntries(params.entries());
  const parsed = querySchema.parse(raw);
  let from = parsed.from ?? defaults.from;
  const to = parsed.to;
  if (parsed.from) {
    const rangeEnd = new Date(to ?? new Date().toISOString());
    const fromDate = new Date(from);
    if (to && fromDate > rangeEnd) {
      throw new z.ZodError([
        { code: "custom", path: ["from"], message: "from must be before to" },
      ]);
    }
    const maxRange = 90 * 24 * 60 * 60 * 1000;
    if (rangeEnd.getTime() - fromDate.getTime() > maxRange) {
      from = new Date(rangeEnd.getTime() - maxRange).toISOString();
    }
  }
  return {
    status: parsed.status,
    priority: parsed.priority,
    category: parsed.category,
    platform: parsed.platform,
    agent: parsed.agent,
    from,
    to,
    sla: parsed.sla,
    resolutionSource: parsed.resolutionSource,
    page: parsed.page,
    pageSize: parsed.pageSize,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (auth instanceof Response) return auth;

  const rate = await rateLimiter.check(auth.userId);
  if (!rate.allowed) {
    return Response.json(
      { error: "Too many requests." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfter ?? 60) },
      }
    );
  }

  let filters: AdminFilters;
  try {
    filters = parseFilters(request);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid filters.", issues: error.issues },
        { status: 400 }
      );
    }
    return Response.json({ error: "Invalid filters." }, { status: 400 });
  }

  const data = await getOperationsData(auth, filters);
  await recordAudit(auth, "operations.view");
  return Response.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
