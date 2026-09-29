"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bot, Monitor, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { SAFE_USE_WARNING } from "@/lib/ui-copy";
import { normalizePlatform, platformSlug } from "@/lib/platform";
import { getIssueBySlug } from "@/lib/search";
import { getIssueSteps } from "@/lib/steps";
import { clearAllSessions, getActiveSessions } from "@/lib/session";
import type { TroubleshootingSession } from "@/lib/session";
import type { Device } from "@/lib/issues";
import { ticketState } from "@/lib/tickets/user-status";
import { CategoryGrid } from "@/components/category-grid";
import { ContinueCard } from "@/components/home/continue-card";
import { QUICK_SEARCHES, SEARCH_PROMPTS } from "@/components/home/home-copy";
import { categoryLook } from "@/components/home/category-look";
import {
  HowItWorks,
  QuickTips,
  SystemStatusCard,
} from "@/components/home/dashboard-extras";
import { RecentlyViewed } from "@/components/recently-viewed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const popularIds = [
  "slow-computer",
  "no-internet",
  "wifi-disconnecting",
  "printer-offline",
  "forgot-password",
  "camera-mic-not-working",
];

const popularPlatforms: Array<"All" | Device> = [
  "All",
  "Windows",
  "Mac",
  "iOS",
  "Android",
];

function ticketProgress(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("resolved") || normalized.includes("closed"))
    return 100;
  if (normalized.includes("pending")) return 60;
  return 25;
}

export function HomeStart({
  signedIn = false,
  openTickets = [],
}: {
  signedIn?: boolean;
  openTickets?: Array<{
    id: string;
    subject: string;
    status: string;
    updatedAt: string;
  }>;
}) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [platform, setPlatform] = useState("");
  const [activeSessions, setActiveSessions] = useState<
    TroubleshootingSession[]
  >([]);
  const [promptIndex, setPromptIndex] = useState(0);
  const [popularPlatform, setPopularPlatform] = useState<"All" | Device>("All");
  const problemRef = useRef<HTMLInputElement>(null);
  const canSubmit = description.trim().length >= 3;

  useEffect(() => {
    const id = window.setInterval(
      () => setPromptIndex((value) => (value + 1) % SEARCH_PROMPTS.length),
      2200
    );
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    queueMicrotask(() => setActiveSessions(getActiveSessions()));
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem("hf-v2-start");
    if (!saved) return;
    try {
      const value = JSON.parse(saved) as {
        description?: string;
        platform?: string;
      };
      queueMicrotask(() => {
        setDescription(value.description ?? "");
        setPlatform(value.platform ?? "");
      });
    } catch {
      sessionStorage.removeItem("hf-v2-start");
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(
      "hf-v2-start",
      JSON.stringify({ description, platform })
    );
  }, [description, platform]);

  function assistantHref(intent: "solve" | "human") {
    const params = new URLSearchParams({ q: description.trim(), intent });
    const normalized = normalizePlatform(platform);
    if (normalized) params.set("platform", platformSlug(normalized));
    return `/assistant?${params.toString()}`;
  }

  function handleClearHistory() {
    clearAllSessions();
    setActiveSessions([]);
  }

  function applyQuickSearch(term: string) {
    setDescription(term);
    problemRef.current?.focus();
  }

  const popularIssues = popularIds
    .map((id) => getIssueBySlug(id))
    .filter(
      (issue): issue is NonNullable<ReturnType<typeof getIssueBySlug>> =>
        issue !== undefined &&
        (popularPlatform === "All" || issue.devices.includes(popularPlatform))
    )
    .slice(0, 4);

  return (
    <section className="flex flex-1 flex-col px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="grid items-end gap-6 lg:grid-cols-[1fr_1.15fr]">
          <header className="hf-rise">
            <p className="text-[15px] font-semibold text-muted-foreground">
              {signedIn ? "Welcome back" : "Welcome to HelpDesk First"}
            </p>
            <h1 className="mt-1.5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-[2.9rem]">
              What can we fix today?
            </h1>
          </header>

          <form
            className="hf-rise"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) router.push(assistantHref("solve"));
            }}
          >
            <div className="flex flex-wrap items-end gap-2">
              <Field
                id="start-problem"
                label="What's the problem?"
                className="min-w-[12rem] flex-1"
              >
                <input
                  id="start-problem"
                  ref={problemRef}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={SEARCH_PROMPTS[promptIndex]}
                  className="h-12 w-full rounded-full border border-input bg-surface px-4 outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
              </Field>
              <Field id="start-platform" label="Device">
                <select
                  id="start-platform"
                  value={platform}
                  onChange={(event) => setPlatform(event.target.value)}
                  className="h-12 min-w-28 rounded-full border border-input bg-surface px-4 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                >
                  <option value="">Any</option>
                  <option value="Windows">Windows</option>
                  <option value="Mac">Mac</option>
                  <option value="iOS">iOS</option>
                  <option value="Android">Android</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Button
                type="submit"
                size="lg"
                aria-label="Find a solution"
                disabled={!canSubmit}
              >
                Search
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground">
              <span>Try:</span>
              {QUICK_SEARCHES.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => applyQuickSearch(term)}
                  className="min-h-8 rounded-full border border-border bg-card px-3 transition-colors hover:border-primary/30 hover:bg-secondary hover:text-secondary-foreground"
                >
                  {term}
                </button>
              ))}
              <Link
                href={canSubmit ? assistantHref("human") : "#start-problem"}
                className="ml-auto font-bold text-primary hover:underline"
              >
                Contact support
              </Link>
            </div>
            {!canSubmit && (
              <p className="mt-2 text-xs text-muted-foreground">
                Describe the problem to continue
              </p>
            )}
            <p className="sr-only">{SAFE_USE_WARNING}</p>
          </form>
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          {activeSessions.length > 0 ? (
            <ContinueCard
              session={activeSessions[0]}
              onClear={handleClearHistory}
              className="mt-0"
            />
          ) : (
            <Link
              href="/browse"
              className="hf-rise hf-lift flex min-w-0 items-center justify-between gap-5 rounded-[28px] bg-[#ece8fd] p-6 text-[#2d205b] dark:bg-[#2c2350] dark:text-white"
            >
              <span className="min-w-0">
                <span className="block text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
                  Start here
                </span>
                <span className="mt-1 block text-2xl font-extrabold">
                  Start with a guide
                </span>
                <span className="mt-1 block truncate text-sm opacity-75">
                  Browse approved fixes and find the right next step.
                </span>
                <span className="hf-lift mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background">
                  Browse guides →
                </span>
              </span>
              <svg
                aria-hidden
                viewBox="0 0 120 96"
                className="hidden h-24 w-[120px] shrink-0 overflow-visible sm:block"
              >
                <path
                  d="M20 17C47 17 43 45 68 45s21 30 44 30"
                  fill="none"
                  stroke="currentColor"
                  strokeDasharray="5 5"
                  strokeLinecap="round"
                  strokeWidth="2"
                  className="hf-dash opacity-40"
                />
                <rect
                  x="8"
                  y="8"
                  width="34"
                  height="18"
                  rx="7"
                  fill="white"
                  opacity=".75"
                  className="hf-lift"
                />
                <rect
                  x="51"
                  y="36"
                  width="34"
                  height="18"
                  rx="7"
                  fill="white"
                  opacity=".75"
                  className="hf-lift"
                />
                <rect
                  x="86"
                  y="66"
                  width="26"
                  height="18"
                  rx="7"
                  fill="white"
                  opacity=".75"
                  className="hf-lift"
                />
                <circle
                  cx="99"
                  cy="75"
                  r="7"
                  fill="var(--primary)"
                  className="hf-glow"
                />
                <path
                  d="m95 75 3 3 5-6"
                  fill="none"
                  stroke="var(--primary-foreground)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  className="hf-draw"
                />
              </svg>
            </Link>
          )}
          <section
            aria-labelledby="your-tickets-heading"
            className="hf-rise rounded-[28px] border border-border bg-card p-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="your-tickets-heading" className="text-lg font-extrabold">
                Your tickets
              </h2>
              <Link
                href="/tickets"
                className="text-xs font-bold text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            {signedIn ? (
              openTickets.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {openTickets.slice(0, 3).map((ticket) => {
                    const state = ticketState({ status: ticket.status });
                    return (
                      <li key={ticket.id}>
                        <Link
                          href={`/tickets/${ticket.id}`}
                          className="block rounded-xl border border-border p-3 hover:bg-muted"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="line-clamp-2 text-sm font-bold">
                              {ticket.subject}
                            </span>
                            <Badge
                              variant={state.attention ? "warning" : "neutral"}
                            >
                              {state.label}
                            </Badge>
                          </div>
                          <div className="mt-2 h-1.5 rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{
                                width: `${ticketProgress(ticket.status)}%`,
                              }}
                            />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-6 text-sm text-muted-foreground">
                  No open tickets
                </p>
              )
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">
                Track your tickets —{" "}
                <Link
                  href="/login"
                  className="font-bold text-primary hover:underline"
                >
                  Log in
                </Link>{" "}
                /{" "}
                <Link
                  href="/signup"
                  className="font-bold text-primary hover:underline"
                >
                  Sign up
                </Link>
              </p>
            )}
            <Link
              href="/assistant?intent=human"
              className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-extrabold hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> New ticket
            </Link>
          </section>
        </div>

        <section className="mt-8" aria-labelledby="popular-fixes-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="popular-fixes-heading" className="text-xl font-extrabold">
              Popular fixes
            </h2>
            <div
              className="flex flex-wrap gap-1 rounded-full bg-muted p-1"
              role="tablist"
              aria-label="Popular fixes platform"
            >
              {popularPlatforms.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={popularPlatform === value}
                  onClick={() => setPopularPlatform(value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-extrabold",
                    popularPlatform === value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground"
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {popularIssues.map((issue) => {
              const look = categoryLook(issue.category);
              return (
                <li key={issue.id}>
                  <Link
                    href={`/issues/${issue.id}`}
                    className="hf-lift block h-full rounded-2xl border border-border bg-card p-4 shadow-sm"
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-xl",
                        look.tile
                      )}
                    >
                      {look.icon}
                    </span>
                    <span className="mt-3 block text-sm font-extrabold">
                      {issue.title}
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-muted-foreground">
                      {getIssueSteps(issue).length} steps
                    </span>
                    <span className="mt-2 block truncate text-[11px] font-semibold text-muted-foreground">
                      {issue.devices.join(", ")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="mt-8">
          <RecentlyViewed />
        </div>

        <div className="mt-8">
          <section
            className="rounded-[28px] border border-border bg-card p-5 shadow-sm"
            aria-labelledby="browse-by-category-heading"
          >
            <div className="flex items-center justify-between gap-3">
              <h2
                id="browse-by-category-heading"
                className="text-xl font-extrabold"
              >
                Browse by category
              </h2>
              <Link
                href="/browse"
                className="text-xs font-bold text-primary hover:underline"
              >
                All 100 guides
              </Link>
            </div>
            <div className="mt-4">
              <CategoryGrid
                limit={8}
                selected={null}
                onSelect={(id) =>
                  router.push(id ? `/browse?category=${id}` : "/browse")
                }
              />
            </div>
          </section>
        </div>

        <section
          className="mt-5 rounded-[28px] border border-border bg-card p-5 shadow-sm"
          aria-labelledby="browse-by-device-heading"
        >
          <h2 id="browse-by-device-heading" className="text-xl font-extrabold">
            Browse by device
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["Windows", "Mac", "iOS", "Android", "Other"] as Device[]).map(
              (device) => (
                <Link
                  key={device}
                  href={`/browse?platform=${platformSlug(device)}`}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-bold hover:bg-muted"
                >
                  {device === "Windows" && (
                    <Monitor className="h-4 w-4" aria-hidden />
                  )}
                  {device}
                </Link>
              )
            )}
          </div>
        </section>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <HowItWorks className="hf-rise md:col-span-2" />
          <QuickTips className="hf-rise" />
          <SystemStatusCard className="hf-rise" />
        </div>

        {process.env.NEXT_PUBLIC_AI_ENABLED === "true" && (
          <Link
            href="/assistant"
            className="hf-lift mt-5 flex items-center gap-4 rounded-[24px] bg-[#1c1633] p-4 text-white dark:bg-[#2c2350]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <Bot className="hf-bob h-5 w-5 text-[#c9b8ff]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold">
                Not sure what&apos;s wrong?
              </span>
              <span className="block text-xs text-[#cfc6ea]">
                Describe it in your own words and get guided to the right fix.
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold text-[#1c1633]">
              Ask the assistant
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}
