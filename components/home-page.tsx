"use client";

import { useState } from "react";
import { SearchBox } from "@/components/search-box";
import { CategoryGrid } from "@/components/category-grid";
import { PlatformButtons } from "@/components/platform-buttons";

export function HomePage() {
  const [query, setQuery] = useState("");

  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          What can we help you with?
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Search issues or pick a category to get started.
        </p>

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
          <PlatformButtons />
        </div>

        <h2 className="mt-12 text-2xl font-semibold">Categories</h2>
        <div className="mt-6">
          <CategoryGrid query={query} />
        </div>
      </div>
    </section>
  );
}
