import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchAssist } from "./search-assist";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SearchAssist", () => {
  it("renders an AI answer and matched guide", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ok",
        output: {
          decision: "match",
          explanation: "The shared drive may need a permissions check.",
          matchedIssueSlug: "shared-drive-access",
          suggestedIssueSlugs: ["permission-denied-file"],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SearchAssist query="acces website" />);

    expect(
      await screen.findByRole("heading", { name: "Assistant answer" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("The shared drive may need a permissions check.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Open guide: Cannot access shared drive",
      })
    ).toHaveAttribute("href", "/issues/shared-drive-access");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/intake",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "acces website", platform: null }),
      })
    );
  });

  it("keeps suggestions visible when the assistant is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 })
    );

    render(<SearchAssist query="wifi slwo" />);

    await waitFor(() =>
      expect(screen.getByText("Closest matches")).toBeInTheDocument()
    );
    expect(
      screen.queryByRole("heading", { name: "Assistant answer" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Slow internet")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Continue with the assistant" })
    ).toHaveAttribute("href", "/assistant?q=wifi+slwo");
  });

  it("shows the fallback copy for nonsense suggestions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 })
    );

    render(<SearchAssist query="qzxv jklm" />);

    expect(
      await screen.findByText("No matching problems found.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Closest matches")).not.toBeInTheDocument();
  });
});
