"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SheetContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: RefObject<HTMLElement | null>;
};

const SheetContext = createContext<SheetContextValue | null>(null);

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
    <SheetContext.Provider
      value={{ open, onOpenChange, triggerRef: returnRef }}
    >
      <div
        className="fixed inset-0 z-50 bg-slate-950/50"
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-y-0 left-0 z-50 flex w-[min(320px,85vw)] flex-col bg-nav p-5 text-nav-foreground shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-nav-muted/30 pb-4">
          <h2 className="font-semibold">{title}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-nav-foreground hover:bg-nav-foreground/10 hover:text-nav-foreground"
            aria-label="Close navigation"
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-4">{children}</div>
      </div>
    </SheetContext.Provider>,
    document.body
  );
}

export function SheetTrigger({
  children,
  ...props
}: HTMLAttributes<HTMLButtonElement>) {
  const context = useContext(SheetContext);
  return (
    <button
      type="button"
      ref={context?.triggerRef as never}
      onClick={() => context?.onOpenChange(true)}
      {...props}
    >
      {children}
    </button>
  );
}

export function SheetClose({
  children,
  ...props
}: HTMLAttributes<HTMLButtonElement>) {
  const context = useContext(SheetContext);
  return (
    <button
      type="button"
      onClick={() => context?.onOpenChange(false)}
      {...props}
    >
      {children}
    </button>
  );
}

export function SheetNavLink({
  children,
  className,
  ...props
}: React.ComponentProps<"a">) {
  return (
    <a
      className={cn(
        "block rounded-lg px-3 py-3 text-sm hover:bg-nav-foreground/10",
        className
      )}
      {...props}
    >
      {children}
    </a>
  );
}
