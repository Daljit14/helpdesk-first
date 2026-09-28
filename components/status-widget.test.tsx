import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusWidget } from "./status-widget";

describe("StatusWidget", () => {
  it("labels the refresh control and announces updates", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: true, checks: {}, timestamp: "" }),
      })
    );
    render(<StatusWidget />);
    expect(
      screen.getByRole("button", { name: "Refresh system status" })
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
