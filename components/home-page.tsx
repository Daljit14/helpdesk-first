"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Bot,
  ChevronRight,
  Flame,
  LayoutGrid,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Sheet } from "@/components/ui/sheet";
import { SearchBox } from "@/components/search-box";
import { CategoryGrid } from "@/components/category-grid";
import { PlatformButtons } from "@/components/platform-buttons";
import { RecentlyViewed } from "@/components/recently-viewed";
import { IssueList } from "@/components/issue-list";
import { IssueCard } from "@/components/issue-card";
import { ContinueCard } from "@/components/home/continue-card";
import { QUICK_SEARCHES, SEARCH_PROMPTS } from "@/components/home/home-copy";
import {
  HowItWorks,
  QuickTips,
  StillStuckCard,
} from "@/components/home/dashboard-extras";
import { ResultsNav } from "@/components/results-nav";
import { BrowseHero } from "@/components/browse/browse-hero";
import { filterIssues } from "@/lib/search";
import { categories, platforms, type Platform } from "@/lib/helpdesk-data";
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
  const searchParams = useSearchParams();
  const isFirstRender = useRef(true);
  const isFirstUrlSync = useRef(true);
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
  const [promptIndex, setPromptIndex] = useState(0);
  const isHome = basePath !== "/browse";

  useEffect(() => {
    const id = window.setInterval(
      () => setPromptIndex((value) => (value + 1) % SEARCH_PROMPTS.length),
      2200
    );
    return () => window.clearInterval(id);
  }, []);

  const urlFilters = useMemo(() => {
    const rawPlatform = searchParams.get("platform");
    return {
      query: searchParams.get("q")?.trim() ?? "",
      categoryId: searchParams.get("category") || null,
      platform: normalizePlatform(rawPlatform),
      platformInvalid:
        Boolean(rawPlatform?.trim()) && !normalizePlatform(rawPlatform),
    };
  }, [searchParams]);

  useEffect(() => {
    if (isFirstUrlSync.current) {
      isFirstUrlSync.current = false;
      return;
    }
    setQuery(urlFilters.query);
    setCategoryId(urlFilters.categoryId);
    setPlatform(urlFilters.platform);
  }, [urlFilters]);

  useEffect(() => {
    queueMicrotask(() => {
      setActiveSessions(getActiveSessions());
      setSessionCount(getAllSessions().length);
    });
  }, []);

  const matchingCount = useMemo(
    () =>
      urlFilters.platformInvalid
        ? 0
        : filterIssues({ query, categoryId, platform }).length,
    [query, categoryId, platform, urlFilters.platformInvalid]
  );

  const backParams = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (categoryId) params.set("category", categoryId);
    if (platform) params.set("platform", platformSlug(platform));
    return params.toString();
  }, [query, categoryId, platform]);

  const hasActiveFilters = Boolean(
    query || categoryId || platform || urlFilters.platformInvalid
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
  const allIssueCount = useMemo(() => filterIssues({}).length, []);
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

  const pushUrl = useCallback(
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
      router.push(search ? `${basePath}?${search}` : basePath, {
        scroll: false,
      });
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

  function applyQuickSearch(nextQuery: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery(nextQuery);
    pushUrl(nextQuery, categoryId, platform);
    scrollToResults();
  }

  function selectCategory(nextCategory: string | null) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setCategoryId(nextCategory);
    pushUrl(query, nextCategory, platform);
    if (nextCategory) scrollToResults();
  }

  function selectPlatform(nextPlatform: Platform | null) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPlatform(nextPlatform);
    pushUrl(query, categoryId, nextPlatform);
    if (nextPlatform) scrollToResults();
  }

  function removeFilter(filter: "query" | "category" | "platform") {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const nextQuery = filter === "query" ? "" : query;
    const nextCategory = filter === "category" ? null : categoryId;
    const nextPlatform = filter === "platform" ? null : platform;
    setQuery(nextQuery);
    setCategoryId(nextCategory);
    setPlatform(nextPlatform);
    pushUrl(nextQuery, nextCategory, nextPlatform);
  }

  const activeFilterChips = hasActiveFilters && (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="Active filters"
    >
      {query && (
        <button
          type="button"
          className="hf-pop inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/30 bg-secondary px-3.5 text-sm font-bold text-secondary-foreground transition-colors hover:bg-secondary/70"
          aria-label={`Remove filter: Search ${query}`}
          onClick={() => removeFilter("query")}
        >
          Search: {query}
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
      {platform && (
        <button
          type="button"
          className="hf-pop inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/30 bg-secondary px-3.5 text-sm font-bold text-secondary-foreground transition-colors hover:bg-secondary/70"
          aria-label={`Remove filter: Platform ${platform}`}
          onClick={() => removeFilter("platform")}
        >
          Platform: {platform}
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
      {categoryId && (
        <button
          type="button"
          className="hf-pop inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/30 bg-secondary px-3.5 text-sm font-bold text-secondary-foreground transition-colors hover:bg-secondary/70"
          aria-label={`Remove filter: Category ${categoryId}`}
          onClick={() => removeFilter("category")}
        >
          Category:{" "}
          {categories.find((category) => category.id === categoryId)?.label ??
            categoryId}
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );

  if (!isHome) {
    return (
      <section className="flex flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl space-y-8">
          <BrowseHero
            guideCount={allIssueCount}
            platformCount={platforms.length}
          >
            <SearchBox
              value={query}
              onChange={setQuery}
              onSubmit={handleSearchSubmit}
              placeholder="Describe your problem…"
              onClear={clearFilters}
              appearance="hero"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] font-bold text-white/85">
              <span>Try:</span>
              {QUICK_SEARCHES.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => applyQuickSearch(term)}
                  className="min-h-9 rounded-full border border-white/35 bg-white/15 px-3.5 text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white hover:text-[#3b1fa8]"
                >
                  {term}
                </button>
              ))}
            </div>
          </BrowseHero>

          {activeSessions.length > 0 && (
            <ContinueCard
              session={activeSessions[0]}
              onClear={handleClearHistory}
            />
          )}

          {/* Sticky filter bar */}
          <div className="sticky top-16 z-20 -mx-1 space-y-3 rounded-[22px] border border-border bg-background/90 p-3 shadow-sm backdrop-blur-md sm:p-4">
            <div className="flex items-center gap-3">
              <span className="hidden shrink-0 items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-muted-foreground sm:inline-flex">
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                Device
              </span>
              <div className="min-w-0 flex-1">
                <PlatformButtons
                  selected={platform}
                  variant="pills"
                  onSelect={selectPlatform}
                />
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="hidden shrink-0 rounded-full px-3 py-2 text-xs font-extrabold text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex"
                >
                  Reset
                </button>
              )}
            </div>
            {hasActiveFilters && (
              <div className="flex items-center gap-3">
                <span className="hidden shrink-0 items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-muted-foreground sm:inline-flex">
                  <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                  Topic
                </span>
                <div className="min-w-0 flex-1">
                  <CategoryGrid
                    selected={categoryId}
                    variant="chips"
                    onSelect={selectCategory}
                  />
                </div>
              </div>
            )}
          </div>

          {activeSessions.length === 0 && sessionCount > 0 && (
            <div className="-mt-4 flex justify-end">
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
              className="hf-lift group relative flex items-center gap-4 overflow-hidden rounded-[24px] border border-primary/20 bg-[linear-gradient(120deg,#1c1633,#2c2350_55%,#3b2a8f)] p-5 text-left text-white"
            >
              <span
                aria-hidden
                className="hf-blob-a pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-[radial-gradient(closest-side,rgb(185_162_255/0.35),transparent)]"
              />
              <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                <span
                  aria-hidden
                  className="hf-halo absolute inset-0 rounded-2xl"
                />
                <Bot className="hf-bob h-6 w-6 text-[#c9b8ff]" aria-hidden />
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="block text-base font-extrabold">
                  Not sure where to start? Ask the Support Assistant
                </span>
                <span className="mt-1 block text-sm text-[#cfc6ea]">
                  Describe the problem in plain words and get routed to the
                  right guide.
                </span>
              </span>
              <span className="relative hidden items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-extrabold text-[#3b2a8f] transition-transform group-hover:translate-x-1 sm:inline-flex">
                <Sparkles className="h-4 w-4" aria-hidden />
                Ask now
              </span>
              <ChevronRight
                className="relative h-5 w-5 shrink-0 text-white/80 sm:hidden"
                aria-hidden
              />
            </Link>
          )}

          <RecentlyViewed variant="rich" />

          {activeFilterChips}

          {!hasActiveFilters ? (
            <>
              <section aria-labelledby="browse-by-category-heading">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2
                      id="browse-by-category-heading"
                      className="flex items-center gap-2 text-2xl font-extrabold tracking-tight"
                    >
                      <LayoutGrid
                        className="h-5 w-5 text-primary"
                        aria-hidden
                      />
                      Browse by category
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Pick the area that matches your problem.
                    </p>
                  </div>
                </div>
                <div className="mt-5">
                  <CategoryGrid
                    selected={categoryId}
                    counts={categoryCounts}
                    variant="tiles"
                    onSelect={selectCategory}
                  />
                </div>
              </section>
              <section aria-labelledby="popular-guides-heading">
                <h2
                  id="popular-guides-heading"
                  className="flex items-center gap-2 text-2xl font-extrabold tracking-tight"
                >
                  <Flame className="h-5 w-5 text-[#f97316]" aria-hidden />
                  Popular guides
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  What people fix most often.
                </p>
                <ul className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {popularIssues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      backParams={backParams}
                      variant="rich"
                    />
                  ))}
                </ul>
              </section>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center justify-between gap-4 rounded-[20px] bg-secondary/50 px-5 py-4 sm:flex-row">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  <span className="text-2xl font-extrabold text-foreground tabular-nums">
                    {matchingCount}
                  </span>{" "}
                  matching {matchingCount === 1 ? "problem" : "problems"}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear all filters
                </Button>
              </div>

              <div
                ref={resultsRef}
                tabIndex={-1}
                aria-label="Search results"
                className="scroll-mt-40 outline-none"
              >
                <IssueList
                  query={query}
                  categoryId={categoryId}
                  platform={platform}
                  backParams={backParams}
                  forceNoResults={initialPlatformInvalid}
                  variant="rich"
                />
                <div ref={resultsEndRef} aria-hidden="true" />
              </div>
              {matchingCount > 0 && (
                <ResultsNav topRef={resultsRef} bottomRef={resultsEndRef} />
              )}
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        {isHome ? (
          <header className="hf-rise max-w-3xl">
            <p className="text-[15px] font-semibold text-muted-foreground">
              Welcome to HelpDesk First
            </p>
            <h1 className="mt-1.5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-[2.9rem]">
              What can we fix today?
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">
              Search a problem, pick a category or your device, and follow safe,
              step-by-step Level-1 guidance.
            </p>
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              For example:{" "}
              <span
                key={promptIndex}
                className="hf-swap inline-block font-bold text-primary"
              >
                “{SEARCH_PROMPTS[promptIndex]}”
              </span>
            </p>
          </header>
        ) : (
          <PageHeader
            title="Browse solutions"
            description="Search issues, filter by category, or choose a platform to find Level-1 support guidance."
          />
        )}

        {activeSessions.length > 0 && (
          <ContinueCard
            session={activeSessions[0]}
            onClear={handleClearHistory}
          />
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
          <aside
            aria-label="Filters"
            className="mb-6 hidden self-start lg:mb-0 lg:block"
          >
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-[24px] border border-border bg-card p-4 shadow-sm hf-scrollbar">
              <div className="flex items-center justify-between gap-3 px-1 text-base font-extrabold">
                <span className="flex items-center gap-2">
                  Filters
                  {hasActiveFilters && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                      Active
                    </span>
                  )}
                </span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    className="rounded-full px-2 py-1 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={clearFilters}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="mt-4 grid gap-5">
                <details open>
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold [&::-webkit-details-marker]:hidden">
                    Platform <span aria-hidden>⌄</span>
                  </summary>
                  <div className="mt-2 grid grid-cols-2 gap-2 [&>div]:contents">
                    <PlatformButtons
                      selected={platform}
                      variant="list"
                      onSelect={selectPlatform}
                    />
                  </div>
                </details>
                <details open>
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold [&::-webkit-details-marker]:hidden">
                    Category <span aria-hidden>⌄</span>
                  </summary>
                  <div className="mt-2">
                    <CategoryGrid
                      selected={categoryId}
                      variant="list"
                      onSelect={selectCategory}
                    />
                  </div>
                </details>
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
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] font-bold text-muted-foreground">
              <span>Try:</span>
              {QUICK_SEARCHES.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => applyQuickSearch(term)}
                  className="min-h-9 rounded-full border border-border bg-card px-3.5 transition-colors hover:border-primary/30 hover:bg-secondary hover:text-secondary-foreground"
                >
                  {term}
                </button>
              ))}
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

            {process.env.NEXT_PUBLIC_AI_ENABLED === "true" && (
              <Link
                href="/assistant"
                className="hf-lift group relative mt-5 flex items-center gap-4 overflow-hidden rounded-[24px] bg-[#1c1633] p-5 text-left text-white dark:bg-[#2c2350]"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                  <Bot className="hf-bob h-6 w-6 text-[#c9b8ff]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-extrabold">
                    Not sure where to start? Ask the Support Assistant
                  </span>
                  <span className="mt-1 block text-sm text-[#cfc6ea]">
                    Describe the problem in plain words and get routed to the
                    right guide.
                  </span>
                </span>
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-white/80 transition-transform group-hover:translate-x-1"
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
                {query && (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
                    aria-label={`Remove filter: Search ${query}`}
                    onClick={() => removeFilter("query")}
                  >
                    Search: {query}
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
                {platform && (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
                    aria-label={`Remove filter: Platform ${platform}`}
                    onClick={() => removeFilter("platform")}
                  >
                    Platform: {platform}
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
                {categoryId && (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
                    aria-label={`Remove filter: Category ${categoryId}`}
                    onClick={() => removeFilter("category")}
                  >
                    Category: {categoryId}
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
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
                    className="text-xl font-extrabold"
                  >
                    Browse by category
                  </h2>
                  <div className="mt-4">
                    <CategoryGrid
                      selected={categoryId}
                      counts={categoryCounts}
                      onSelect={selectCategory}
                    />
                  </div>
                </section>
                <section
                  className="mt-10"
                  aria-labelledby="popular-guides-heading"
                >
                  <h2
                    id="popular-guides-heading"
                    className="text-xl font-extrabold"
                  >
                    Popular guides
                  </h2>
                  <ul className="mt-4 grid gap-4 md:grid-cols-2">
                    {popularIssues.map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        backParams={backParams}
                      />
                    ))}
                  </ul>
                </section>
                {isHome && (
                  <div className="mt-10 grid gap-5 md:grid-cols-2">
                    <HowItWorks className="hf-rise md:col-span-2" />
                    <QuickTips className="hf-rise" />
                    <StillStuckCard className="hf-rise" />
                  </div>
                )}
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
                  selectPlatform(nextPlatform);
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
                  selectCategory(nextCategory);
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
