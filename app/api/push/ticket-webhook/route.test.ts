import { afterEach, describe, expect, test, vi } from "vitest";
import { sendPushToUser } from "@/lib/push/send";
import { POST } from "./route";

vi.mock("@/lib/push/send", () => ({
  sendPushToUser: vi.fn(),
}));

const mockedSendPushToUser = vi.mocked(sendPushToUser);

function webhookRequest(
  payload: Record<string, unknown>,
  secret = "test-secret"
) {
  return new Request("http://localhost/api/push/ticket-webhook", {
    method: "POST",
    headers: { "x-webhook-secret": secret },
    body: JSON.stringify(payload),
  });
}

const changedPayload = {
  type: "UPDATE",
  table: "tickets",
  record: {
    id: "ticket-1",
    user_id: "user-1",
    issue_title: "No internet",
    status: "Resolved",
  },
  old_record: { status: "Open" },
};

afterEach(() => {
  vi.unstubAllEnvs();
  mockedSendPushToUser.mockReset();
});

describe("ticket webhook", () => {
  test("returns 401 when the webhook secret is unset", async () => {
    vi.stubEnv("SUPABASE_WEBHOOK_SECRET", "");

    const response = await POST(webhookRequest(changedPayload));

    expect(response.status).toBe(401);
    expect(mockedSendPushToUser).not.toHaveBeenCalled();
  });

  test("returns 401 for an incorrect webhook secret", async () => {
    vi.stubEnv("SUPABASE_WEBHOOK_SECRET", "expected-secret");

    const response = await POST(webhookRequest(changedPayload, "wrong-secret"));

    expect(response.status).toBe(401);
    expect(mockedSendPushToUser).not.toHaveBeenCalled();
  });

  test("skips notifications when the status is unchanged", async () => {
    vi.stubEnv("SUPABASE_WEBHOOK_SECRET", "test-secret");

    const response = await POST(
      webhookRequest({
        ...changedPayload,
        old_record: { status: "Resolved" },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, skipped: true });
    expect(mockedSendPushToUser).not.toHaveBeenCalled();
  });

  test("sends a notification when the status changes", async () => {
    vi.stubEnv("SUPABASE_WEBHOOK_SECRET", "test-secret");
    mockedSendPushToUser.mockResolvedValue({ sent: 1, failed: 0 });

    const response = await POST(webhookRequest(changedPayload));

    expect(response.status).toBe(200);
    expect(mockedSendPushToUser).toHaveBeenCalledWith("user-1", {
      title: "Ticket update",
      body: '"No internet" is now Resolved.',
      url: "/tickets",
    });
    expect(await response.json()).toEqual({
      ok: true,
      sent: 1,
      failed: 0,
    });
  });
});
