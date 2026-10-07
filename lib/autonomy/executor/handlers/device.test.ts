import { beforeEach, describe, expect, test, vi } from "vitest";
import { DEVICE_ACTIONS } from "@/lib/device-agent/catalog";

const mocks = vi.hoisted(() => ({
  enqueueDeviceJob: vi.fn(),
  findDeviceForTicket: vi.fn(),
}));

vi.mock("@/lib/device-agent/server/jobs", () => ({
  enqueueDeviceJob: mocks.enqueueDeviceJob,
  findDeviceForTicket: mocks.findDeviceForTicket,
}));

import { deviceHandlers } from "./device";

function handlerAdmin(step: { data?: unknown; error?: unknown }) {
  const queries: Array<{ table: string; filters: unknown[][] }> = [];
  const admin = {
    from(table: string) {
      const query = { table, filters: [] as unknown[][] };
      queries.push(query);
      const chain: Record<string, (...args: unknown[]) => unknown> = {};
      for (const name of ["select", "eq", "order", "limit"]) {
        chain[name] = (...args: unknown[]) => {
          if (name === "eq") query.filters.push(args);
          return chain;
        };
      }
      chain.maybeSingle = async () => {
        if (table === "tickets")
          return { data: { platform: "Windows" }, error: null };
        if (table === "resolution_steps")
          return {
            data: step.data ?? null,
            error: step.error ?? null,
          };
        return { data: null, error: null };
      };
      return chain;
    },
    queries,
  };
  return admin;
}

describe("device capability handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findDeviceForTicket.mockResolvedValue({ id: "device-1" });
    mocks.enqueueDeviceJob.mockResolvedValue({
      id: "job-1",
      mode: "shadow",
      status: "queued",
    });
  });

  test("registers every catalog action without a second hard-coded list", () => {
    expect(
      deviceHandlers().map(
        (handler) => `${handler.capabilityId}:${handler.version}`
      )
    ).toEqual(DEVICE_ACTIONS.map((action) => `${action.id}:${action.version}`));
  });

  test("blocks a device binding mismatch before enqueue", async () => {
    const admin = handlerAdmin({
      data: { detail: { deviceBinding: { deviceId: "device-2" } } },
    });
    const handler = deviceHandlers().find(
      (candidate) => candidate.capabilityId === "device_reset_wifi_profile"
    )!;
    const result = await handler.run(
      {
        admin: admin as never,
        organizationId: "org-1",
        ticketId: "ticket-1",
        runId: "run-1",
        stepId: "execute-step-1",
        signal: new AbortController().signal,
        actor: "requester",
        escalate: async () => {},
      },
      { ssid: "Contoso-Corp" }
    );

    expect(result).toEqual({
      ok: false,
      output: {},
      error: "device_binding_mismatch",
    });
    expect(mocks.enqueueDeviceJob).not.toHaveBeenCalled();
    expect(admin.queries[1]).toMatchObject({
      table: "resolution_steps",
      filters: [
        ["id", "execute-step-1"],
        ["organization_id", "org-1"],
        ["run_id", "run-1"],
      ],
    });
  });

  test("fails closed when the binding step cannot be read", async () => {
    const admin = handlerAdmin({ error: new Error("read failed") });
    const handler = deviceHandlers().find(
      (candidate) => candidate.capabilityId === "device_reset_wifi_profile"
    )!;
    const result = await handler.run(
      {
        admin: admin as never,
        organizationId: "org-1",
        ticketId: "ticket-1",
        runId: "run-1",
        stepId: "execute-step-1",
        signal: new AbortController().signal,
        actor: "requester",
        escalate: async () => {},
      },
      { ssid: "Contoso-Corp" }
    );

    expect(result).toMatchObject({
      ok: false,
      error: "device_binding_unreadable",
    });
    expect(mocks.enqueueDeviceJob).not.toHaveBeenCalled();
  });

  test.each([
    ["matching binding", { deviceBinding: { deviceId: "device-1" } }],
    ["no binding", {}],
  ])("%s preserves device job enqueueing", async (_name, detail) => {
    const admin = handlerAdmin({ data: { detail } });
    const handler = deviceHandlers().find(
      (candidate) => candidate.capabilityId === "device_reset_wifi_profile"
    )!;
    const result = await handler.run(
      {
        admin: admin as never,
        organizationId: "org-1",
        ticketId: "ticket-1",
        runId: "run-1",
        stepId: "execute-step-1",
        signal: new AbortController().signal,
        actor: "requester",
        escalate: async () => {},
      },
      { ssid: "Contoso-Corp" }
    );

    expect(result).toMatchObject({ ok: true });
    expect(mocks.enqueueDeviceJob).toHaveBeenCalledTimes(1);
  });
});
