import { cn } from "@/lib/utils";

/**
 * HelpDesk First logo: a violet circle with a lifebuoy and a small marigold
 * dot. Decorative; always pair it with the visible "HelpDesk First" name.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "hf-logomark relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground",
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        className="h-5 w-5"
      >
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
        <path d="m5.6 5.6 3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6" />
      </svg>
      <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-highlight" />
    </span>
  );
}

/** Friendly assistant robot used in the sidebar helper card. Decorative. */
export function AssistantBot({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 44 44"
      aria-hidden
      className={cn("h-12 w-12 shrink-0 overflow-visible", className)}
    >
      <path
        d="M22 10V4"
        stroke="var(--primary)"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx="22" cy="4" r="3" fill="#ffc24b" />
      <rect x="6" y="10" width="32" height="24" rx="8" fill="var(--primary)" />
      <g>
        <circle cx="16" cy="22" r="3" fill="var(--primary-foreground)" />
        <circle cx="28" cy="22" r="3" fill="var(--primary-foreground)" />
      </g>
      <path
        d="M17 28q5 3 10 0"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}
