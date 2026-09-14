import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "./home-page";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/components/search-box", () => ({
  SearchBox: ({
    value,
    onChange,
    onSubmit,
  }: {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
  }) => (
    <div>
      <input
        aria-label="Search solutions"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" onClick={onSubmit}>
        Search
      </button>
    </div>
  ),
}));

vi.mock("@/components/category-grid", () => ({
  CategoryGrid: () => null,
}));
vi.mock("@/components/platform-buttons", () => ({
  PlatformButtons: () => null,
}));
vi.mock("@/components/recently-viewed", () => ({
  RecentlyViewed: () => null,
}));
vi.mock("@/components/issue-list", () => ({
  IssueList: () => null,
}));
vi.mock("@/components/results-nav", () => ({
  ResultsNav: () => null,
}));

afterEach(() => {
  mocks.replace.mockReset();
});

describe("HomePage", () => {
  it("keeps browse searches on the browse route", async () => {
    render(<HomePage basePath="/browse" />);

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search solutions" }),
      {
        target: { value: "wifi keeps dropping" },
      }
    );

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/browse?q=wifi+keeps+dropping",
        { scroll: false }
      )
    );
  });
});
