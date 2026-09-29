export type Department = {
  id: string;
  label: string;
  href: string;
  icon: string;
  available: boolean;
  keywords: string[];
  description?: string;
  /** Sidebar group heading, e.g. "Support". */
  group?: string;
};

export type DepartmentSession = {
  role: "org_admin" | "support_agent";
  isPlatformAdmin: boolean;
};

export type DepartmentFlags = {
  knowledgeGovernanceEnabled: boolean;
  secureAttachmentsEnabled: boolean;
  resolutionCenterEnabled: boolean;
  deviceAgentEnabled?: boolean;
};

export const DEPARTMENT_GROUPS = [
  "Overview",
  "Support",
  "People",
  "Data & security",
  "Configure",
] as const;

export function buildDepartments(
  session: DepartmentSession,
  flags: DepartmentFlags
): Department[] {
  const orgAdmin = session.role === "org_admin";
  const departments: (Department | false)[] = [
    {
      id: "operations",
      label: "Operations Dashboard",
      href: "/admin/operations",
      icon: "activity",
      available: true,
      group: "Overview",
      keywords: ["dashboard", "overview", "metrics"],
    },
    {
      id: "analytics",
      label: "Analytics and Trust Center",
      href: "/admin/analytics",
      icon: "chart",
      available: true,
      group: "Overview",
      keywords: ["analytics", "trust", "reports", "resolution"],
    },
    {
      id: "status",
      label: "System Status",
      href: "/admin/status",
      icon: "pulse",
      available: true,
      group: "Overview",
      keywords: ["status", "health", "uptime", "outage"],
    },
    {
      id: "ticket-queue",
      label: "Ticket Queue",
      href: "/admin/tickets",
      icon: "ticket",
      available: true,
      group: "Support",
      keywords: ["tickets", "queue", "inbox"],
    },
    {
      id: "ai-investigations",
      label: "AI Investigations",
      href: "/admin/tickets?queue=ai_working",
      icon: "brain",
      available: true,
      group: "Support",
      keywords: ["investigation", "hypotheses", "diagnosis"],
    },
    flags.resolutionCenterEnabled && {
      id: "resolution-center",
      label: "AI Resolution Center",
      href: "/admin/resolution",
      icon: "sparkles",
      available: true,
      group: "Support",
      keywords: [
        "ai",
        "autonomy",
        "resolution",
        "runs",
        "rollback",
        "verification",
      ],
    },
    {
      id: "capability-matching",
      label: "Capability Matching",
      href: "/admin/tickets?queue=needs_human",
      icon: "match",
      available: true,
      group: "Support",
      keywords: ["needs human", "assign", "skills"],
    },
    flags.knowledgeGovernanceEnabled && {
      id: "knowledge",
      label: "Knowledge Base",
      href: "/admin/knowledge",
      icon: "book",
      available: true,
      group: "Support",
      keywords: ["guides", "learning", "drafts"],
    },
    orgAdmin && {
      id: "organization",
      label: "Users and Employees",
      href: "/admin/organization",
      icon: "users",
      available: true,
      group: "People",
      keywords: ["members", "employees", "invitations", "people"],
    },
    session.isPlatformAdmin && {
      id: "organizations",
      label: "Organizations",
      href: "/admin/organizations",
      icon: "building",
      available: true,
      group: "People",
      keywords: ["tenants", "companies"],
    },
    {
      id: "database",
      label: "Database",
      href: "/admin/database",
      icon: "database",
      available: true,
      group: "Data & security",
      keywords: ["database", "tables", "records", "live", "logins"],
    },
    flags.secureAttachmentsEnabled && {
      id: "attachments",
      label: "Attachments",
      href: "/admin/attachments",
      icon: "paperclip",
      available: true,
      group: "Data & security",
      keywords: ["uploads", "files", "security"],
    },
    orgAdmin && {
      id: "security",
      label: "Security and Audit",
      href: "/admin/security",
      icon: "shield",
      available: true,
      group: "Data & security",
      keywords: ["security", "audit", "compliance", "log"],
    },
    {
      id: "notifications",
      label: "Notifications and SLA",
      href: "/admin/notifications",
      icon: "bell",
      available: true,
      group: "Data & security",
      keywords: ["notifications", "email", "sla", "outbox"],
    },
    orgAdmin && {
      id: "integrations",
      label: "Integrations",
      href: "/admin/connectors",
      icon: "plug",
      available: true,
      group: "Configure",
      keywords: ["integrations", "connections", "connectors", "identity"],
    },
    orgAdmin &&
      Boolean(flags.deviceAgentEnabled) && {
        id: "devices",
        label: "Devices",
        href: "/admin/devices",
        icon: "laptop",
        available: true,
        group: "Configure",
        keywords: ["devices", "agent", "diagnostics"],
      },
    orgAdmin && {
      id: "settings",
      label: "Settings",
      href: "/admin/settings",
      icon: "settings",
      available: true,
      group: "Configure",
      keywords: ["settings", "preferences", "sla", "domains", "policy"],
    },
  ];

  return departments.filter((department): department is Department =>
    Boolean(department)
  );
}
