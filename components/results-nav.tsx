"use client";

import type { RefObject } from "react";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

type ResultsNavProps = {
  topRef: RefObject<HTMLElement | null>;
  bottomRef: RefObject<HTMLElement | null>;
};

function scrollToRef(ref: RefObject<HTMLElement | null>) {
  const target = ref.current;
  if (!target) return;

  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
  target.scrollIntoView({ behavior, block: "start" });
}

export function ResultsNav({ topRef, bottomRef }: ResultsNavProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = topRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(([entry]) => {
      setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(target);

    return () => observer.disconnect();
  }, [topRef]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => scrollToRef(topRef)}
        aria-label="Jump to top of results"
      >
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => scrollToRef(bottomRef)}
        aria-label="Jump to bottom of results"
      >
        <ArrowDown className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
