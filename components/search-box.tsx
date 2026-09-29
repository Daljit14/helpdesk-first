"use client";

import { FormEvent } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type SearchBoxProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  id?: string;
  onClear?: () => void;
  /** "hero" = white field on a gradient header (used on /browse). */
  appearance?: "default" | "hero";
};

export function SearchBox({
  value,
  onChange,
  onSubmit,
  placeholder = "Search...",
  id = "browse-search",
  onClear,
  appearance = "default",
}: SearchBoxProps) {
  const hero = appearance === "hero";
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit?.(value);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full" role="search">
      <label
        htmlFor={id}
        className={
          hero
            ? "mb-2 block text-sm font-extrabold text-white/90"
            : "mb-2 block text-sm font-bold"
        }
      >
        Search problems
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search
            className={`pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 ${hero ? "text-[#6d4aff]" : "text-muted-foreground"}`}
            aria-hidden="true"
          />
          <input
            id={id}
            type="search"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className={
              hero
                ? "h-14 w-full rounded-[18px] border-2 border-white/60 bg-white py-3 pl-12 pr-4 text-base font-semibold text-[#1c1633] shadow-[0_12px_30px_-12px_rgb(0_0_0/0.45)] outline-none transition-[border-color,box-shadow] placeholder:text-[#6b6385] focus:border-white focus:ring-4 focus:ring-white/40"
                : "h-14 w-full rounded-[18px] border border-input bg-card py-3 pl-12 pr-4 text-base shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/15"
            }
          />
        </div>
        <Button
          type="submit"
          className={
            hero
              ? "min-h-14 bg-[#1c1633] px-7 font-extrabold text-white shadow-lg hover:bg-[#2c2350]"
              : "min-h-14 px-6"
          }
          size="lg"
        >
          Search
        </Button>
        {onClear && (
          <Button
            type="button"
            variant="outline"
            className={
              hero
                ? "min-h-14 border-white/50 bg-white/15 text-white hover:bg-white/25 hover:text-white disabled:opacity-60"
                : "min-h-14"
            }
            size="lg"
            onClick={onClear}
            disabled={!value}
          >
            <X className="mr-2 h-4 w-4" aria-hidden />
            Clear
          </Button>
        )}
      </div>
    </form>
  );
}
