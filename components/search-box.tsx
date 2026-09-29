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
};

export function SearchBox({
  value,
  onChange,
  onSubmit,
  placeholder = "Search...",
  id = "browse-search",
  onClear,
}: SearchBoxProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit?.(value);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full" role="search">
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        Search problems
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id={id}
            type="search"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className="h-11 w-full rounded-lg border border-input bg-background py-3 pl-12 pr-3 text-base outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-[var(--focus)]"
          />
        </div>
        <Button type="submit" className="min-h-11" size="sm">
          Search
        </Button>
        {onClear && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            size="sm"
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
