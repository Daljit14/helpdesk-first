import { afterEach, describe, expect, test, vi } from "vitest";
import { updateTicket } from "./admin-tickets";
import { getAdminSession, recordAudit } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminDashboardEnabled } from "@/lib/admin/flags";
import { revalidatePath } from "next/cache";

vi.mock("@/lib/admin/auth", () => ({
  getAdminSession: vi.fn(),
  recordAudit: vi.fn(),
}));
vi.mock("@/lib/admin/flags", () => ({
  isAdminDashboardEnabled: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const session = {
  userId: "user-1",
  email: "agent@example.com",
  role: "admin" as const,
  organizationId: "org-1",
  displayName: "Agent",
};

function form(overrides: Record<string, string> = {}) {
  const value = new FormData();
  value.set("ticketId", "00000000-0000-4000-8000-000000000001");
  value.set("status", "In Progress");
  value.set("priority", "High");
  value.set("assignedAgent", "Agent One");
  for (const [key, entry] of Object.entries(overrides)) value.set(key, entry);
  return value;
}

function configureUpdate(
  data: unknown = { id: "ticket-1" },
  error: unknown = null
) {
  const eqCalls: [string, string][] = [];
  const builder = {
    update: vi.fn(() => builder),
    eq: vi.fn((column: string, value: string) => {
      eqCalls.push([column, value]);
      return builder;
    }),
    select: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data, error })),
  };
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn(() => builder),
  } as never);
  return { builder, eqCalls };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("updateTicket", () => {
  test("rejects when the dashboard is disabled", async () => {
    vi.mocked(isAdminDashboardEnabled).mockReturnValue(false);
    await expect(updateTicket(null, form())).resolves.toEqual({
      error: "Not available.",
    });
  });

  test("rejects without an admin session", async () => {
    vi.mocked(isAdminDashboardEnabled).mockReturnValue(true);
    vi.mocked(getAdminSession).mockResolvedValue(null);
    await expect(updateTicket(null, form())).resolves.toEqual({
      error: "Not authorized.",
    });
  });

  test("rejects an invalid status", async () => {
    vi.mocked(isAdminDashboardEnabled).mockReturnValue(true);
    vi.mocked(getAdminSession).mockResolvedValue(session);
    await expect(
      updateTicket(null, form({ status: "Escalated" }))
    ).resolves.toEqual({ error: "Invalid ticket update." });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  test("updates with organization scoping and audits the change", async () => {
    vi.mocked(isAdminDashboardEnabled).mockReturnValue(true);
    vi.mocked(getAdminSession).mockResolvedValue(session);
    const { eqCalls } = configureUpdate();
    await expect(updateTicket(null, form())).resolves.toEqual({
      success: "Ticket updated.",
    });
    expect(eqCalls).toContainEqual(["organization_id", "org-1"]);
    expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(
      session,
      "ticket.update",
      "00000000-0000-4000-8000-000000000001"
    );
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith(
      "/admin/tickets/00000000-0000-4000-8000-000000000001"
    );
  });

  test("returns not found when no organization ticket matches", async () => {
    vi.mocked(isAdminDashboardEnabled).mockReturnValue(true);
    vi.mocked(getAdminSession).mockResolvedValue(session);
    configureUpdate(null);
    await expect(updateTicket(null, form())).resolves.toEqual({
      error: "Ticket not found.",
    });
  });

  test("allows support agents to update tickets", async () => {
    vi.mocked(isAdminDashboardEnabled).mockReturnValue(true);
    vi.mocked(getAdminSession).mockResolvedValue({
      ...session,
      role: "support_agent",
    });
    configureUpdate();
    await expect(updateTicket(null, form())).resolves.toEqual({
      success: "Ticket updated.",
    });
  });
});
