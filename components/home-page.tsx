"use client";

import { useState, useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/search-box";
import { CategoryGrid } from "@/components/category-grid";
import { PlatformButtons } from "@/components/platform-buttons";
import { IssueList } from "@/components/issue-list";
import { filterIssues } from "@/lib/search";
import { type Platform } from "@/lib/helpdesk-data";

export function HomePage() {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);

  const matchingCount = useMemo(
    () => filterIssues({ query, categoryId, platform }).length,
    [query, categoryId, platform]
  );

  const hasActiveFilters = query || categoryId || platform;

  function clearFilters() {
    setQuery("");
    setCategoryId(null);
    setPlatform(null);
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

        <div className="mt-8 flex justify-center">
          <div className="w-full max-w-3xl">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="What problem are you having?"
            />
          </div>
        </div>

        <div className="mt-8">
          <PlatformButtons selected={platform} onSelect={setPlatform} />
        </div>

        <div className="mt-8">
          <CategoryGrid selected={categoryId} onSelect={setCategoryId} />
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

        <div className="mt-6">
          <IssueList
            query={query}
            categoryId={categoryId}
            platform={platform}
          />
        </div>
      </div>
    </section>
  );
}
