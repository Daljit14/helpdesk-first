import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatusWidget } from "./status-widget";

describe("StatusWidget", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("labels the refresh control and announces updates", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, checks: {}, timestamp: "" }),
      })
    );
    render(<StatusWidget />);
    expect(
      screen.getByRole("button", { name: "Refresh system status" })
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows capability rows with plain-language status copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          checks: {
            app: { ok: true, ms: null },
            database: { ok: true, ms: 120 },
            auth: { ok: true, ms: 80 },
            storage: { ok: true, ms: 90 },
            ai: { ok: true, ms: null },
            notifications: { ok: true, ms: 70 },
            rateLimiter: { ok: true, ms: null },
          },
          timestamp: new Date().toISOString(),
        }),
      })
    );

    render(<StatusWidget />);

    await waitFor(() =>
      expect(
        screen.getByText("Guides and search are available")
      ).toBeInTheDocument()
    );
    expect(screen.getByText("Sign in & accounts")).toBeInTheDocument();
    expect(
      screen.getByText("Chat with the assistant is available")
    ).toBeInTheDocument();
    expect(
      screen.getByText("You can submit tickets and attach screenshots")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ticket emails are being delivered")
    ).toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*ms/i)).not.toBeInTheDocument();
  });

  it("shows the requested degraded and down capability copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: false,
          degraded: true,
          checks: {
            app: { ok: true, ms: null },
            database: { ok: false, ms: 120 },
            auth: { ok: false, ms: 80 },
            storage: { ok: false, ms: 90 },
            ai: { ok: true, ms: null, degraded: true },
            notifications: { ok: false, ms: 70 },
            rateLimiter: { ok: true, ms: null },
          },
          timestamp: new Date().toISOString(),
        }),
      })
    );

    render(<StatusWidget />);

    await waitFor(() =>
      expect(
        screen.getByText("Sign-in may fail — try again in a few minutes")
      ).toBeInTheDocument()
    );
    expect(screen.getByText("Guides may load slowly")).toBeInTheDocument();
    expect(
      screen.getByText("Assistant gives limited answers right now")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ticket submission unavailable")
    ).toBeInTheDocument();
    expect(screen.getByText("Emails may be delayed")).toBeInTheDocument();
    expect(screen.getByText("Service disruption")).toBeInTheDocument();
  });

  it("describes degraded services and counts only fully working ones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          degraded: true,
          checks: {
            app: { ok: true, ms: null },
            database: { ok: true, ms: 120 },
            auth: { ok: true, ms: 80 },
            storage: { ok: true, ms: 90 },
            ai: { ok: true, degraded: true, ms: null },
            notifications: { ok: true, ms: 70 },
            rateLimiter: { ok: true, ms: null },
          },
          timestamp: new Date().toISOString(),
        }),
      })
    );

    render(<StatusWidget />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Some services degraded" })
      ).toBeInTheDocument()
    );
    expect(
      screen.getByText(
        "Most things are working. Some services are slower or more limited than usual — details below."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Fully working")).toBeInTheDocument();
    expect(screen.getByText("4/5")).toBeInTheDocument();
  });

  it("summarises session uptime and keeps a per-service check history", async () => {
    window.sessionStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          checks: {
            app: { ok: true, ms: null },
            database: { ok: true, ms: 120 },
            auth: { ok: true, ms: 80 },
            storage: { ok: true, ms: 90 },
            ai: { ok: true, ms: null },
            notifications: { ok: true, ms: 70 },
          },
          timestamp: new Date().toISOString(),
        }),
      })
    );

    render(<StatusWidget />);

    await waitFor(() =>
      expect(screen.getByText("All systems operational")).toBeInTheDocument()
    );
    expect(screen.getByText("Uptime this session")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(
      screen.getAllByRole("img", { name: /Last 1 checks: 1 operational/ })
    ).toHaveLength(5);
    expect(
      screen.getByRole("heading", { name: "What to do if something is down" })
    ).toBeInTheDocument();
  });
});
