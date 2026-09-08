import { afterEach, describe, expect, test, vi } from "vitest";
import { dispatchPending, replayDead } from "./dispatch";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/admin/auth";
import { sendEmail } from "./email";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({
  getAdminSession: vi.fn(),
  recordAudit: vi.fn(),
}));
vi.mock("@/lib/push/send", () => ({ sendPushToUser: vi.fn() }));
vi.mock("./email", () => ({ sendEmail: vi.fn() }));

afterEach(() => vi.clearAllMocks());

function makeAdminClient(row: Record<string, unknown> | null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    lte: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() =>
      Promise.resolve({ data: row ? [row] : [], error: null })
    ),
    update: vi.fn(() => query),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: row ? { id: row.id } : null, error: null })
    ),
  };
  return {
    from: vi.fn(() => query),
    auth: {
      admin: {
        getUserById: vi.fn(() =>
          Promise.resolve({
            data: { user: { email: "to@example.com" } },
            error: null,
          })
        ),
      },
    },
  };
}

describe("dispatchPending", () => {
  test("dispatches a pending email and marks sent", async () => {
    const row = {
      id: "n1",
      organization_id: null,
      ticket_id: "t1",
      channel: "email",
      recipient_user_id: "u1",
      subject: "Ticket received",
      body: "Your ticket has been received.",
      url: "http://example.com/tickets/t1",
      attempts: 0,
    };
    const admin = makeAdminClient(row);
    vi.mocked(sendEmail).mockResolvedValue({ ok: true });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await dispatchPending();
    expect(result.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "to@example.com" })
    );
  });

  test("marks a permanent email failure as dead", async () => {
    const row = {
      id: "n1",
      organization_id: null,
      ticket_id: "t1",
      channel: "email",
      recipient_user_id: "u1",
      subject: "Ticket received",
      body: "Your ticket has been received.",
      url: "http://example.com/tickets/t1",
      attempts: 0,
    };
    const admin = makeAdminClient(row);
    vi.mocked(sendEmail).mockResolvedValue({
      ok: false,
      error: "permanent:bad",
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await dispatchPending();
    expect(result.dead).toBe(1);
  });

  test("marks a retryable 429 failure as failed with backoff", async () => {
    const row = {
      id: "n1",
      organization_id: null,
      ticket_id: "t1",
      channel: "email",
      recipient_user_id: "u1",
      subject: "Ticket received",
      body: "Your ticket has been received.",
      url: null,
      attempts: 0,
    };
    const admin = makeAdminClient(row);
    vi.mocked(sendEmail).mockResolvedValue({
      ok: false,
      error: "retryable:resend 429",
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await dispatchPending();
    expect(result.failed).toBe(1);
    expect(result.dead).toBe(0);
  });

  test("claims and sends a failed row whose retry time has passed", async () => {
    const row = {
      id: "n1",
      organization_id: null,
      ticket_id: "t1",
      channel: "email",
      recipient_user_id: "u1",
      subject: "Ticket received",
      body: "Your ticket has been received.",
      url: null,
      status: "failed",
      attempts: 1,
      next_attempt_at: new Date(Date.now() - 60_000).toISOString(),
    };
    const admin = makeAdminClient(row);
    vi.mocked(sendEmail).mockResolvedValue({ ok: true });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await dispatchPending();
    expect(result.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "to@example.com" })
    );
  });

  test("falls back to push on a retryable email failure", async () => {
    const row = {
      id: "n1",
      organization_id: null,
      ticket_id: "t1",
      channel: "email",
      recipient_user_id: "u1",
      subject: "Ticket received",
      body: "Body",
      url: null,
      attempts: 4,
    };
    const admin = makeAdminClient(row);
    vi.mocked(sendEmail).mockResolvedValue({
      ok: false,
      error: "retryable:timeout",
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await dispatchPending();
    expect(result.dead).toBe(1);
    expect(admin.from).toHaveBeenCalledWith("notification_outbox");
  });
});

describe("replayDead", () => {
  test("rejects non-org-admin sessions", async () => {
    vi.mocked(getAdminSession).mockResolvedValue({
      role: "support_agent",
    } as never);
    const result = await replayDead(["n1"]);
    expect(result.replayed).toBe(0);
  });

  test("replays dead rows for org admin", async () => {
    vi.mocked(getAdminSession).mockResolvedValue({
      role: "org_admin",
      organizationId: "org-1",
    } as never);
    const builder = {
      update: vi.fn(() => builder),
      in: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      select: vi.fn(() =>
        Promise.resolve({ data: [{ id: "n1" }], error: null })
      ),
    };
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => builder),
    } as never);
    const result = await replayDead(["n1"]);
    expect(result.replayed).toBe(1);
  });
});
