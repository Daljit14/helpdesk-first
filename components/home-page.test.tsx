import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  CategoryGrid: ({
    onSelect,
  }: {
    onSelect: (category: string | null) => void;
  }) => (
    <button type="button" onClick={() => onSelect("computer")}>
      Computer
    </button>
  ),
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

vi.stubGlobal("matchMedia", () => ({ matches: false }));

afterEach(() => {
  cleanup();
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

  it("waits for a filter before showing browse results", () => {
    render(<HomePage basePath="/browse" />);

    expect(
      screen.getByText(
        "Pick a category or platform, or search above, to see matching guides."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/matching problems/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Search results")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Computer" }));
    expect(screen.getByText(/matching problems/)).toBeInTheDocument();
    expect(screen.getByLabelText("Search results")).toBeInTheDocument();
  });
});
