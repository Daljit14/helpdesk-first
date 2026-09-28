"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bot, ChevronRight, History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Sheet } from "@/components/ui/sheet";
import { SearchBox } from "@/components/search-box";
import { CategoryGrid } from "@/components/category-grid";
import { PlatformButtons } from "@/components/platform-buttons";
import { RecentlyViewed } from "@/components/recently-viewed";
import { IssueList } from "@/components/issue-list";
import { IssueCard } from "@/components/issue-card";
import { ResultsNav } from "@/components/results-nav";
import { filterIssues } from "@/lib/search";
import { categories, type Platform } from "@/lib/helpdesk-data";
import { normalizePlatform, platformSlug } from "@/lib/platform";
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
  initialPlatformInvalid?: boolean;
  basePath?: string;
};

function paramToString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  if (typeof value === "string") return value;
  return "";
}

export function HomePage({
  initialQuery = "",
  initialCategory = null,
  initialPlatform = null,
  initialPlatformInvalid = false,
  basePath = "/",
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
    normalizePlatform(paramToString(initialPlatform ?? ""))
  );
  const [activeSessions, setActiveSessions] = useState<
    TroubleshootingSession[]
  >([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setActiveSessions(getActiveSessions());
      setSessionCount(getAllSessions().length);
    });
  }, []);

  const matchingCount = useMemo(
    () =>
      initialPlatformInvalid
        ? 0
        : filterIssues({ query, categoryId, platform }).length,
    [query, categoryId, platform, initialPlatformInvalid]
  );

  const backParams = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (categoryId) params.set("category", categoryId);
    if (platform) params.set("platform", platformSlug(platform));
    return params.toString();
  }, [query, categoryId, platform]);

  const hasActiveFilters = Boolean(
    query || categoryId || platform || initialPlatformInvalid
  );
  const browseNeedsFilter = basePath === "/browse" && !hasActiveFilters;
  const categoryCounts = useMemo(
    () =>
      Object.fromEntries(
        categories.map((category) => [
          category.id,
          filterIssues({ categoryId: category.id }).length,
        ])
      ),
    []
  );
  const popularIssues = useMemo(() => filterIssues({}).slice(0, 6), []);

  const replaceUrl = useCallback(
    (
      nextQuery: string,
      nextCategory: string | null,
      nextPlatform: Platform | null
    ) => {
      const params = new URLSearchParams();
      if (nextQuery) params.set("q", nextQuery);
      if (nextCategory) params.set("category", nextCategory);
      if (nextPlatform) params.set("platform", platformSlug(nextPlatform));
      const search = params.toString();
      const href = search ? `${basePath}?${search}` : basePath;
      router.replace(href, { scroll: false });
    },
    [basePath, router]
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
    router.replace(basePath, { scroll: false });
  }

  return (
    <section className="flex flex-1 flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <PageHeader
          title="Browse solutions"
          description="Search issues, filter by category, or choose a platform to find Level-1 support guidance."
        />

        {activeSessions.length > 0 && (
          <div className="glass mt-6 p-4" aria-live="polite">
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
                  href={`/issues/${activeSessions[0].issueSlug}/guide?platform=${platformSlug(normalizePlatform(activeSessions[0].platform) ?? "Other")}`}
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

        <div className="mt-8 lg:grid lg:grid-cols-[280px_1fr] lg:gap-8">
          <div className="mb-4 lg:hidden">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFiltersOpen(true)}
            >
              Filters
            </Button>
          </div>
          <aside aria-label="Filters" className="mb-6 hidden lg:mb-0 lg:block">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-semibold">Filters</h2>
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">Platform</p>
                <PlatformButtons
                  selected={platform}
                  variant="list"
                  onSelect={(nextPlatform) => {
                    setPlatform(nextPlatform);
                    if (nextPlatform) scrollToResults();
                  }}
                />
              </div>
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium">Category</p>
                <CategoryGrid
                  selected={categoryId}
                  variant="list"
                  onSelect={(nextCategory) => {
                    setCategoryId(nextCategory);
                    if (nextCategory) scrollToResults();
                  }}
                />
              </div>
            </div>
          </aside>
          <div className="min-w-0">
            <SearchBox
              value={query}
              onChange={setQuery}
              onSubmit={handleSearchSubmit}
              placeholder="Describe your problem…"
              onClear={clearFilters}
            />
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

            {process.env.NEXT_PUBLIC_AI_ENABLED === "true" && (
              <Link
                href="/assistant"
                className="glass glass-interactive group mt-4 flex items-center gap-3 p-4 text-left"
              >
                <Bot className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    Not sure where to start? Ask the Support Assistant
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Describe the problem in plain words and get routed to the
                    right guide.
                  </span>
                </span>
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            )}

            <div className="mt-8">
              <RecentlyViewed />
            </div>

            {hasActiveFilters && (
              <div
                className="mt-4 flex flex-wrap gap-2"
                aria-label="Active filters"
              >
                {query && <Badge>Search: {query}</Badge>}
                {platform && <Badge>Platform: {platform}</Badge>}
                {categoryId && <Badge>Category: {categoryId}</Badge>}
              </div>
            )}

            {browseNeedsFilter || !hasActiveFilters ? (
              <>
                <section
                  className="mt-8"
                  aria-labelledby="browse-by-category-heading"
                >
                  <h2
                    id="browse-by-category-heading"
                    className="text-xl font-semibold"
                  >
                    Browse by category
                  </h2>
                  <div className="mt-4">
                    <CategoryGrid
                      selected={categoryId}
                      counts={categoryCounts}
                      onSelect={(nextCategory) => {
                        setCategoryId(nextCategory);
                        if (nextCategory) scrollToResults();
                      }}
                    />
                  </div>
                </section>
                <section
                  className="mt-10"
                  aria-labelledby="popular-guides-heading"
                >
                  <h2
                    id="popular-guides-heading"
                    className="text-xl font-semibold"
                  >
                    Popular guides
                  </h2>
                  <ul className="mt-4 grid gap-4">
                    {popularIssues.map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        backParams={backParams}
                      />
                    ))}
                  </ul>
                </section>
              </>
            ) : (
              <>
                <div className="mt-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
                  <p
                    className="text-sm text-muted-foreground"
                    aria-live="polite"
                  >
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
                    forceNoResults={initialPlatformInvalid}
                  />
                  <div ref={resultsEndRef} aria-hidden="true" />
                </div>
                {matchingCount > 0 && (
                  <ResultsNav topRef={resultsRef} bottomRef={resultsEndRef} />
                )}
              </>
            )}
          </div>
        </div>
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-medium">Platform</p>
              <PlatformButtons
                selected={platform}
                variant="list"
                onSelect={(nextPlatform) => {
                  setPlatform(nextPlatform);
                  setFiltersOpen(false);
                }}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Category</p>
              <CategoryGrid
                selected={categoryId}
                variant="list"
                onSelect={(nextCategory) => {
                  setCategoryId(nextCategory);
                  setFiltersOpen(false);
                }}
              />
            </div>
          </div>
        </Sheet>
      </div>
    </section>
  );
}
