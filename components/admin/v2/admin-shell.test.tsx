import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminShell, departmentForPath } from "./admin-shell";
import type { Department } from "./departments";

const navigationState = vi.hoisted(() => ({
  pathname: "/admin/operations",
}));
const push = vi.fn();

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push }),
}));

vi.mock("@/app/actions/admin-auth", () => ({
  adminLogout: vi.fn(),
}));

vi.mock("@/components/admin/admin-theme-toggle", () => ({
  AdminThemeToggle: () => <button type="button">Theme</button>,
}));

const departments: Department[] = [
  {
    id: "operations",
    label: "Operations Dashboard",
    href: "/admin/operations",
    icon: "activity",
    available: true,
    keywords: ["dashboard", "metrics"],
  },
  {
    id: "ticket-queue",
    label: "Ticket Queue",
    href: "/admin/tickets",
    icon: "ticket",
    available: true,
    keywords: ["tickets", "queue"],
  },
  {
    id: "ai-investigations",
    label: "AI Investigations",
    href: "/admin/tickets?queue=ai_working",
    icon: "brain",
    available: true,
    keywords: ["investigation"],
  },
  {
    id: "capability-matching",
    label: "Capability Matching",
    href: "/admin/tickets?queue=needs_human",
    icon: "users",
    available: true,
    keywords: ["assign"],
  },
  {
    id: "knowledge",
    label: "Knowledge Base",
    href: "/admin/knowledge",
    icon: "book",
    available: true,
    keywords: ["guides", "drafts"],
  },
  {
    id: "database",
    label: "Database",
    href: "/admin/database",
    icon: "database",
    available: true,
    keywords: ["data", "live"],
  },
  {
    id: "planned",
    label: "Security and Audit",
    href: "/admin/security",
    icon: "shield",
    available: false,
    keywords: ["audit"],
  },
];

function shell() {
  return (
    <AdminShell
      departments={departments}
      organizationName="Acme"
      roleLabel="Organization admin"
      isPlatformAdmin={false}
      pendingNotifications={2}
    >
      <main>Content</main>
    </AdminShell>
  );
}

function renderShell() {
  return render(shell());
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  push.mockReset();
  navigationState.pathname = "/admin/operations";
});

describe("AdminShell", () => {
  it.each([
    ["/admin/tickets", "", "ticket-queue"],
    ["/admin/tickets/ticket-123", "", "ticket-queue"],
    ["/admin/operations", "ai_working", "ai-investigations"],
    ["/admin/operations", "needs_human", "capability-matching"],
    ["/admin/tickets", "ai_working", "ai-investigations"],
    ["/admin/tickets", "needs_human", "capability-matching"],
    ["/admin/operations", "", "operations"],
  ])("resolves %s with queue=%s to %s", (pathname, queue, expectedId) => {
    expect(
      departmentForPath(
        pathname,
        new URLSearchParams(queue ? { queue } : {}),
        departments
      ).id
    ).toBe(expectedId);
  });

  it("renders departments, active state, planned state, and notification indicator", () => {
    renderShell();
    expect(
      screen.getByRole("link", { name: /Operations Dashboard/ })
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByText("Security and Audit").closest("[aria-disabled]")
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByLabelText("2 pending notifications")
    ).toBeInTheDocument();
  });

  it("filters departments by labels and keywords", () => {
    renderShell();
    fireEvent.change(screen.getByLabelText("Search departments"), {
      target: { value: "drafts" },
    });
    expect(screen.getByText("Knowledge Base")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Operations Dashboard/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 departments")).toBeInTheDocument();
  });

  it("persists desktop collapsed state and submits ticket searches", () => {
    renderShell();
    const collapse = screen.getByRole("button", { name: "Collapse sidebar" });
    fireEvent.click(collapse);
    expect(localStorage.getItem("hf-admin-sidebar")).toBe("collapsed");
    expect(
      screen.getByRole("button", { name: "Expand sidebar" })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search tickets"), {
      target: { value: "TCK-12345678" },
    });
    fireEvent.submit(screen.getByLabelText("Search tickets").closest("form")!);
    expect(push).toHaveBeenCalledWith("/admin/tickets?ref=TCK-12345678");
  });

  it("opens the mobile drawer and closes it with Escape, restoring focus", () => {
    renderShell();
    const open = screen.getByRole("button", { name: "Open navigation" });
    open.focus();
    fireEvent.click(open);
    expect(
      screen.getByRole("dialog", { name: "Admin navigation" })
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Admin navigation" })
    ).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });

  it("shows every department in the mobile drawer after a desktop search", () => {
    renderShell();
    fireEvent.change(screen.getByLabelText("Search departments"), {
      target: { value: "drafts" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    const drawer = screen.getByRole("dialog", { name: "Admin navigation" });
    expect(
      within(drawer).getByRole("link", { name: /Operations Dashboard/ })
    ).toHaveAttribute("aria-current", "page");
    expect(within(drawer).getByText("7 departments")).toBeInTheDocument();
    expect(
      within(drawer).getByRole("link", { name: /Database/ })
    ).toBeInTheDocument();
  });

  it("closes the mobile drawer when the pathname changes", async () => {
    const rendered = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(
      screen.getByRole("dialog", { name: "Admin navigation" })
    ).toBeInTheDocument();

    navigationState.pathname = "/admin/database";
    rendered.rerender(shell());

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Admin navigation" })
      ).not.toBeInTheDocument()
    );
  });

  it("keeps department output serializable", () => {
    const roundTrip = JSON.parse(JSON.stringify(departments)) as Department[];
    expect(roundTrip).toEqual(departments);
    expect(
      roundTrip.every((department) =>
        Object.values(department).every((value) => typeof value !== "function")
      )
    ).toBe(true);
  });
});
