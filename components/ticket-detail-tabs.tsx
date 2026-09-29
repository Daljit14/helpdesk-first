"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type TicketDetailTab = {
  id: string;
  label: string;
  badge?: number | string;
  content: ReactNode;
};

export function TicketDetailTabs({
  tabs,
  defaultTab,
}: {
  tabs: TicketDetailTab[];
  defaultTab?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const fallbackTab =
    (defaultTab && tabs.some((tab) => tab.id === defaultTab)
      ? defaultTab
      : tabs[0]?.id) ?? "";
  const [activeTab, setActiveTab] = useState(
    tabFromUrl && tabs.some((tab) => tab.id === tabFromUrl)
      ? tabFromUrl
      : fallbackTab
  );

  useEffect(() => {
    const nextTab =
      tabFromUrl && tabs.some((tab) => tab.id === tabFromUrl)
        ? tabFromUrl
        : fallbackTab;
    const timeout = window.setTimeout(() => setActiveTab(nextTab), 0);
    return () => window.clearTimeout(timeout);
  }, [fallbackTab, tabFromUrl, tabs]);

  function selectTab(id: string) {
    setActiveTab(id);
    router.replace(`${pathname}?tab=${encodeURIComponent(id)}`, {
      scroll: false,
    });
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
            tabs.length;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    selectTab(nextTab.id);
    document.getElementById(`ticket-tab-${nextTab.id}`)?.focus();
  }

  if (tabs.length === 0) return null;

  return (
    <div className="mt-6">
      <div
        role="tablist"
        aria-label="Ticket details"
        className="flex flex-wrap gap-2"
      >
        {tabs.map((tab, index) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`ticket-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`ticket-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={
                selected
                  ? "rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  : "rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              }
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span className="ml-2 text-xs opacity-80">{tab.badge}</span>
              )}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`ticket-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`ticket-tab-${tab.id}`}
          hidden={activeTab !== tab.id}
          className="mt-4"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
