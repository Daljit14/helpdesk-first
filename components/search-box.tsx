"use client";

import { FormEvent } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

type SearchBoxProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
};

export function SearchBox({
  value,
  onChange,
  onSubmit,
  placeholder = "Search...",
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
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-14 w-full rounded-full border border-border/70 bg-background/60 py-4 pl-12 pr-28 text-base shadow-sm backdrop-blur outline-none ring-ring placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
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
