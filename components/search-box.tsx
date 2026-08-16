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
        className="w-full rounded-2xl border border-border bg-background py-4 pl-14 pr-24 text-lg shadow-sm outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
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
