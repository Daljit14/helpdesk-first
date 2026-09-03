"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { SearchBox } from "@/components/search-box";
import { CategoryGrid } from "@/components/category-grid";
import { PlatformButtons } from "@/components/platform-buttons";
import { RecentlyViewed } from "@/components/recently-viewed";
import { IssueList } from "@/components/issue-list";
import { ResultsNav } from "@/components/results-nav";
import { filterIssues } from "@/lib/search";
import { platforms, type Platform } from "@/lib/helpdesk-data";
import {
  clearAllSessions,
  getActiveSessions,
  getAllSessions,
  type TroubleshootingSession,
} from "@/lib/session";

type HomePageProps = {
  initialQuery?: string;
  initialCategory?: string | null;
  initialPlatform?: Platform | null;
};

function platformFromParam(value: string | null): Platform | null {
  if (!value) return null;
  return platforms.includes(value as Platform) ? (value as Platform) : null;
}

function paramToString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  if (typeof value === "string") return value;
  return "";
}

export function HomePage({
  initialQuery = "",
  initialCategory = null,
  initialPlatform = null,
}: HomePageProps) {
  const router = useRouter();
  const isFirstRender = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const resultsEndRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState(paramToString(initialQuery ?? "").trim());
  const [categoryId, setCategoryId] = useState<string | null>(
    initialCategory ?? null
  );
  const [platform, setPlatform] = useState<Platform | null>(
    platformFromParam(paramToString(initialPlatform ?? ""))
  );
  const [activeSessions, setActiveSessions] = useState<
    TroubleshootingSession[]
  >([]);
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    queueMicrotask(() => {
      setActiveSessions(getActiveSessions());
      setSessionCount(getAllSessions().length);
    });
  }, []);

  const matchingCount = useMemo(
    () => filterIssues({ query, categoryId, platform }).length,
    [query, categoryId, platform]
  );

  const backParams = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (categoryId) params.set("category", categoryId);
    if (platform) params.set("platform", platform);
    return params.toString();
  }, [query, categoryId, platform]);

  const hasActiveFilters = Boolean(query || categoryId || platform);

  const replaceUrl = useCallback(
    (
      nextQuery: string,
      nextCategory: string | null,
      nextPlatform: Platform | null
    ) => {
      const params = new URLSearchParams();
      if (nextQuery) params.set("q", nextQuery);
      if (nextCategory) params.set("category", nextCategory);
      if (nextPlatform) params.set("platform", nextPlatform);
      const search = params.toString();
      const href = search ? `/?${search}` : "/";
      router.replace(href, { scroll: false });
    },
    [router]
  );

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      replaceUrl(query, categoryId, platform);
      debounceRef.current = null;
    }, 250);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, categoryId, platform, replaceUrl]);

  function scrollToResults() {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? "auto"
      : "smooth";
    resultsRef.current?.scrollIntoView({ behavior, block: "start" });
    resultsRef.current?.focus({ preventScroll: true });
  }

  function handleSearchSubmit() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    replaceUrl(query, categoryId, platform);
    scrollToResults();
  }

  function handleClearHistory() {
    clearAllSessions();
    setActiveSessions([]);
    setSessionCount(0);
  }

  function clearFilters() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setQuery("");
    setCategoryId(null);
    setPlatform(null);
    router.replace("/", { scroll: false });
  }

  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            What can we help you with?
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Search issues, pick a category, or choose a platform to find Level-1
            support guidance.
          </p>
        </div>

        {activeSessions.length > 0 && (
          <div
            className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4"
            aria-live="polite"
          >
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="font-medium">
                  You have an unfinished troubleshooting session
                </p>
                <p className="text-sm text-muted-foreground">
                  {activeSessions[0].issueTitle} on {activeSessions[0].platform}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href={`/issues/${activeSessions[0].issueSlug}/guide?platform=${activeSessions[0].platform}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" })
                  )}
                >
                  <History className="mr-2 h-4 w-4" />
                  Resume
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearHistory}
                >
                  Clear history
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-center">
          <div className="w-full max-w-3xl">
            <SearchBox
              value={query}
              onChange={setQuery}
              onSubmit={handleSearchSubmit}
              placeholder="What problem are you having?"
            />
          </div>
        </div>

        {activeSessions.length === 0 && sessionCount > 0 && (
          <div className="mt-2 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearHistory}
            >
              Clear my troubleshooting history ({sessionCount})
            </Button>
          </div>
        )}

        <div className="mt-8">
          <RecentlyViewed />
        </div>

        <div className="mt-8">
          <PlatformButtons
            selected={platform}
            onSelect={(nextPlatform) => {
              setPlatform(nextPlatform);
              if (nextPlatform) scrollToResults();
            }}
          />
        </div>

        <div className="mt-8">
          <CategoryGrid
            selected={categoryId}
            onSelect={(nextCategory) => {
              setCategoryId(nextCategory);
              if (nextCategory) scrollToResults();
            }}
          />
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            <span className="font-semibold text-foreground">
              {matchingCount}
            </span>{" "}
            matching {matchingCount === 1 ? "problem" : "problems"}
          </p>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFilters}
            >
              <X className="mr-2 h-4 w-4" />
              Clear all filters
            </Button>
          )}
        </div>

        <div
          ref={resultsRef}
          tabIndex={-1}
          aria-label="Search results"
          className="mt-6 outline-none"
        >
          <IssueList
            query={query}
            categoryId={categoryId}
            platform={platform}
            backParams={backParams}
          />
          <div ref={resultsEndRef} aria-hidden="true" />
        </div>
        {matchingCount > 0 && (
          <ResultsNav topRef={resultsRef} bottomRef={resultsEndRef} />
        )}
      </div>
    </section>
  );
}
