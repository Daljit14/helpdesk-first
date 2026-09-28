"use client";

import { FormEvent } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

type SearchBoxProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  id?: string;
};

export function SearchBox({
  value,
  onChange,
  onSubmit,
  placeholder = "Search...",
  id = "browse-search",
}: SearchBoxProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit?.(value);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative w-full"
      role="search"
      aria-label="Support issue search"
    >
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Search problems"
        className="h-12 w-full rounded-lg border border-input bg-background py-3 pl-12 pr-28 text-base outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-[var(--focus)]"
      />
      <Button
        type="submit"
        className="absolute right-2 top-1/2 -translate-y-1/2"
        size="sm"
      >
        Search
      </Button>
    </form>
  );
}
