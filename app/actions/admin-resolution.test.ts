import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  pauseRun: vi.fn(),
  resumeRun: vi.fn(),
  escalateRun: vi.fn(),
  writeRunEvent: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/admin/flags", () => ({
  isResolutionCenterEnabled: () => true,
}));
vi.mock("@/lib/autonomy/orchestrator", () => ({
  pauseRun: mocks.pauseRun,
  resumeRun: mocks.resumeRun,
  escalateRun: mocks.escalateRun,
  writeRunEvent: mocks.writeRunEvent,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  escalateAiRun,
  pauseAiRun,
  resumeAiRun,
  takeOverRun,
} from "./admin-resolution";

const session = {
  userId: "user-1",
  email: "agent@example.com",
  role: "support_agent" as const,
  organizationId: "org-1",
  displayName: "Agent",
  isPlatformAdmin: false,
};
const run = {
  id: "run-1",
  organization_id: "org-1",
  ticket_id: "ticket-1",
  status: "executing",
};

function admin() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: run, error: null })),
    update: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
  };
  return { from: vi.fn(() => query), query };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAdminClient.mockReturnValue(admin());
  mocks.getAdminSession.mockResolvedValue(session);
  mocks.pauseRun.mockResolvedValue(run);
  mocks.resumeRun.mockResolvedValue(run);
  mocks.escalateRun.mockResolvedValue({ ...run, status: "escalated" });
});

describe("admin Resolution Center actions", () => {
  test("rejects unauthenticated requests", async () => {
    mocks.getAdminSession.mockResolvedValue(null);
    await expect(pauseAiRun("run-1")).resolves.toEqual({
      error: "Resolution run not found.",
    });
  });

  test("requires org admin to resume", async () => {
    await expect(resumeAiRun("run-1")).resolves.toEqual({
      error: "Only organization admins can resume runs.",
    });
    expect(mocks.resumeRun).not.toHaveBeenCalled();
  });

  test("rejects terminal runs before pausing", async () => {
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({
          data: { ...run, status: "resolved" },
          error: null,
        })),
      })),
    });
    await expect(pauseAiRun("run-1")).resolves.toEqual({
      error: "Terminal runs cannot be paused.",
    });
    expect(mocks.pauseRun).not.toHaveBeenCalled();
  });

  test("allows organization admins to resume", async () => {
    mocks.getAdminSession.mockResolvedValue({ ...session, role: "org_admin" });
    await expect(resumeAiRun("run-1")).resolves.toEqual({ success: true });
    expect(mocks.resumeRun).toHaveBeenCalled();
  });

  test("takes over by escalating and assigning the ticket", async () => {
    await expect(takeOverRun("run-1")).resolves.toEqual({ success: true });
    expect(mocks.escalateRun).toHaveBeenCalledWith(
      expect.anything(),
      run,
      "staff_takeover"
    );
    expect(mocks.createAdminClient().query.update).toHaveBeenCalledWith(
      expect.objectContaining({
        assigned_agent_id: "user-1",
        status: "In Progress",
      })
    );
    expect(mocks.writeRunEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: "staff.takeover" })
    );
  });

  test("writes the staff escalation event", async () => {
    await expect(escalateAiRun("run-1")).resolves.toEqual({ success: true });
    expect(mocks.writeRunEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: "staff.escalate" })
    );
  });
});
