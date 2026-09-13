import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminShell, departmentForPath } from "./admin-shell";
import type { Department } from "./departments";

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
  usePathname: () => "/admin/operations",
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
    href: "/admin/operations#tickets",
    icon: "ticket",
    available: true,
    keywords: ["tickets", "queue"],
  },
  {
    id: "ai-investigations",
    label: "AI Investigations",
    href: "/admin/operations?queue=ai_working",
    icon: "brain",
    available: true,
    keywords: ["investigation"],
  },
  {
    id: "capability-matching",
    label: "Capability Matching",
    href: "/admin/operations?queue=needs_human",
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
    id: "planned",
    label: "Security and Audit",
    href: "/admin/organization#security",
    icon: "shield",
    available: false,
    keywords: ["audit"],
  },
];

function renderShell() {
  return render(
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

afterEach(() => {
  cleanup();
  localStorage.clear();
  push.mockReset();
});

describe("AdminShell", () => {
  it.each([
    ["/admin/tickets", "", "ticket-queue"],
    ["/admin/tickets/ticket-123", "", "ticket-queue"],
    ["/admin/operations", "ai_working", "ai-investigations"],
    ["/admin/operations", "needs_human", "capability-matching"],
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
    expect(push).toHaveBeenCalledWith("/admin/operations?ref=TCK-12345678");
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
