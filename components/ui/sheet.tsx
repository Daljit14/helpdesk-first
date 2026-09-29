"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
export function Sheet({
  open,
  onOpenChange,
  title = "Navigation",
  children,
  triggerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  const internalTriggerRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const returnRef = triggerRef ?? internalTriggerRef;

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = contentRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])"
    );
    focusables?.[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key !== "Tab" || !contentRef.current) return;
      const items = Array.from(
        contentRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])"
        )
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      returnRef.current?.focus();
    };
  }, [onOpenChange, open, returnRef]);

  if (!mounted || !open) return null;
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50 bg-[#2a1b3d]/40 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-y-2 left-2 z-50 flex w-[min(340px,88vw)] flex-col rounded-[28px] border border-border bg-card p-5 text-card-foreground shadow-md"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="w-auto px-3"
            aria-label="Close navigation"
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden />
            <span className="ml-1">Close</span>
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-4">{children}</div>
      </div>
    </>,
    document.body
  );
}
