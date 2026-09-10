export type Department = {
  id: string;
  label: string;
  href: string;
  icon: string;
  available: boolean;
  keywords: string[];
};

export type DepartmentSession = {
  role: "org_admin" | "support_agent";
  isPlatformAdmin: boolean;
};

export type DepartmentFlags = {
  knowledgeGovernanceEnabled: boolean;
  secureAttachmentsEnabled: boolean;
};

export function buildDepartments(
  session: DepartmentSession,
  flags: DepartmentFlags
): Department[] {
  const departments: Department[] = [
    {
      id: "operations",
      label: "Operations Dashboard",
      href: "/admin/operations",
      icon: "activity",
      available: true,
      keywords: ["dashboard", "overview", "metrics"],
    },
    {
      id: "ticket-queue",
      label: "Ticket Queue",
      href: "/admin/operations#tickets",
      icon: "ticket",
      available: true,
      keywords: ["tickets", "queue", "inbox"],
    },
    {
      id: "ai-investigations",
      label: "AI Investigations",
      href: "/admin/operations?queue=ai_working",
      icon: "brain",
      available: true,
      keywords: ["investigation", "hypotheses", "diagnosis"],
    },
    {
      id: "capability-matching",
      label: "Capability Matching",
      href: "/admin/operations?queue=needs_human",
      icon: "users",
      available: true,
      keywords: ["needs human", "assign", "skills"],
    },
    ...(flags.knowledgeGovernanceEnabled
      ? [
          {
            id: "knowledge",
            label: "Knowledge Base",
            href: "/admin/knowledge",
            icon: "book",
            available: true,
            keywords: ["guides", "learning", "drafts"],
          },
        ]
      : []),
    ...(session.isPlatformAdmin
      ? [
          {
            id: "organizations",
            label: "Organizations",
            href: "/admin/organizations",
            icon: "building",
            available: true,
            keywords: ["tenants", "companies"],
          },
        ]
      : []),
    ...(session.role === "org_admin"
      ? [
          {
            id: "organization",
            label: "Users and Employees",
            href: "/admin/organization",
            icon: "users",
            available: true,
            keywords: ["members", "employees", "organization"],
          },
        ]
      : []),
    ...(flags.secureAttachmentsEnabled
      ? [
          {
            id: "attachments",
            label: "Attachments",
            href: "/admin/attachments",
            icon: "paperclip",
            available: true,
            keywords: ["uploads", "files", "security"],
          },
        ]
      : []),
    {
      id: "notifications",
      label: "Notifications and SLA",
      href: "/admin/notifications",
      icon: "bell",
      available: true,
      keywords: ["notifications", "email", "sla", "outbox"],
    },
    {
      id: "analytics",
      label: "Analytics and Trust Center",
      href: "/admin/operations#analytics",
      icon: "chart",
      available: true,
      keywords: ["analytics", "trust", "reports"],
    },
    ...(session.role === "org_admin"
      ? [
          {
            id: "security",
            label: "Security and Audit",
            href: "/admin/organization#security",
            icon: "shield",
            available: false,
            keywords: ["security", "audit", "compliance"],
          },
          {
            id: "integrations",
            label: "Integrations",
            href: "/admin/organization#integrations",
            icon: "plug",
            available: false,
            keywords: ["integrations", "connections"],
          },
          {
            id: "settings",
            label: "Settings",
            href: "/admin/organization",
            icon: "settings",
            available: true,
            keywords: ["settings", "preferences"],
          },
        ]
      : []),
  ];

  return departments;
}
