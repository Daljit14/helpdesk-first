/**
 * Shared building blocks for every admin page (Aurora design).
 *
 * Server-component friendly: nothing here uses hooks, so pages that are
 * server components can import these directly. Only `CountUp` (a client
 * component) is rendered inside for animated numbers.
 */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CountUp } from "@/components/admin/ops/visuals";

export type HeroTone =
  "aurora" | "ocean" | "sunset" | "forest" | "midnight" | "rose";

export type StatTone =
  "primary" | "good" | "warn" | "danger" | "info" | "neutral";

const STAT_TONE: Record<StatTone, string> = {
  primary: "bg-secondary text-secondary-foreground",
  good: "bg-status-success/15 text-status-success",
  warn: "bg-status-warning/15 text-status-warning",
  danger: "bg-status-danger/15 text-status-danger",
  info: "bg-status-info/15 text-status-info",
  neutral: "bg-muted text-muted-foreground",
};

const BAR_TONE: Record<StatTone, string> = {
  primary: "hf-adm-bar",
  good: "bg-status-success",
  warn: "bg-status-warning",
  danger: "bg-status-danger",
  info: "bg-status-info",
  neutral: "bg-muted-foreground",
};

/** Full-width page wrapper. Tables inside get the Aurora table styling. */
export function AdminPage({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`adm-page mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 lg:px-8 ${className}`}
    >
      {children}
    </div>
  );
}

/** Gradient header with floating sparkles and an animated icon medallion. */
export function AdminHero({
  eyebrow,
  title,
  description,
  icon: Icon,
  tone = "aurora",
  actions,
  children,
}: {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  icon: LucideIcon;
  tone?: HeroTone;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      className={`hf-adm-hero hf-adm-hero--${tone} hf-rise relative overflow-hidden rounded-[28px] px-5 py-6 shadow-[0_24px_50px_-28px_var(--primary)] sm:px-7`}
    >
      <span
        aria-hidden
        className="hf-adm-blob pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.28),transparent)]"
      />
      <span
        aria-hidden
        className="hf-adm-blob-b pointer-events-none absolute -bottom-32 left-[38%] h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.18),transparent)]"
      />
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="hf-adm-spark"
          style={{
            left: `${5 + i * 10.5}%`,
            width: 4 + (i % 3) * 2,
            height: 4 + (i % 3) * 2,
            animationDuration: `${4 + (i % 4)}s`,
            animationDelay: `${i * 0.55}s`,
          }}
        />
      ))}
      <div className="relative flex flex-wrap items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden
            className="hf-adm-medallion relative hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur sm:flex"
          >
            <span className="hf-adm-orbit absolute -inset-2 rounded-[22px] border border-dashed border-white/35" />
            <Icon className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-sm font-bold text-white/80">{eyebrow}</p>
            )}
            <h1 className="mt-0.5 text-3xl font-extrabold tracking-tight sm:text-[34px]">
              {title}
            </h1>
            {description && (
              <p className="mt-1.5 max-w-2xl text-[15px] font-semibold text-white/90">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {children && <div className="relative mt-5">{children}</div>}
    </section>
  );
}

/** Translucent pill for small facts inside a hero. */
export function HeroChip({
  label,
  value,
  pulse = false,
}: {
  label: string;
  value: ReactNode;
  pulse?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
      {pulse && (
        <span className="relative h-2 w-2" aria-hidden>
          <span className="hf-ping absolute inset-0 rounded-full bg-[#5ee0a8]" />
          <span className="absolute inset-0 rounded-full bg-[#5ee0a8]" />
        </span>
      )}
      <span className="text-white/80">{label}</span>
      <span className="font-extrabold">{value}</span>
    </span>
  );
}

/** Class for buttons/links placed on a hero. */
export const heroButton =
  "inline-flex h-10 items-center gap-2 rounded-xl border border-white/35 bg-white/15 px-3.5 text-sm font-extrabold text-white backdrop-blur transition-colors hover:bg-white/25 disabled:opacity-70";
export const heroButtonSolid =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3.5 text-sm font-extrabold text-[#3b2a8f] shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60";

export function StatGrid({
  children,
  columns = 4,
}: {
  children: ReactNode;
  columns?: 3 | 4 | 5 | 6;
}) {
  const cols = {
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-2 xl:grid-cols-4",
    5: "sm:grid-cols-3 xl:grid-cols-5",
    6: "sm:grid-cols-3 xl:grid-cols-6",
  }[columns];
  return <div className={`grid grid-cols-2 gap-3 ${cols}`}>{children}</div>;
}

/** Animated number tile. `progress` (0–1) draws a small meter. */
export function StatTile({
  label,
  value,
  icon: Icon,
  tone = "primary",
  hint,
  index = 0,
  progress,
  decimals,
  suffix,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: StatTone;
  hint?: ReactNode;
  index?: number;
  progress?: number;
  decimals?: number;
  suffix?: string;
}) {
  return (
    <div
      className="glass hf-adm-card hf-rise flex flex-col gap-1.5 p-4"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-muted-foreground">
          {label}
        </span>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${STAT_TONE[tone]}`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </span>
      <span className="text-[28px] font-extrabold leading-tight tracking-tight tabular-nums">
        {typeof value === "number" ? (
          <CountUp value={value} decimals={decimals} suffix={suffix} />
        ) : (
          value
        )}
      </span>
      {progress !== undefined && (
        <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
          <span
            className={`hf-adm-grow block h-full rounded-full ${BAR_TONE[tone]}`}
            style={{
              width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
              animationDelay: `${0.3 + index * 0.05}s`,
            }}
          />
        </span>
      )}
      {hint && (
        <span className="text-xs font-semibold text-muted-foreground">
          {hint}
        </span>
      )}
    </div>
  );
}

/** Card section with an icon heading. */
export function Panel({
  title,
  description,
  icon: Icon,
  actions,
  children,
  delay = 0,
  id,
  className = "",
  flush = false,
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  delay?: number;
  id?: string;
  className?: string;
  flush?: boolean;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`glass hf-rise scroll-mt-24 overflow-hidden ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div
        className={`flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6 ${
          flush ? "border-b border-border pb-4" : ""
        }`}
      >
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <h2 id={headingId} className="text-lg font-extrabold">
              {title}
            </h2>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className={flush ? "" : "px-5 pb-5 pt-4 sm:px-6"}>{children}</div>
    </section>
  );
}

/** Friendly animated empty state. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
        <span aria-hidden className="hf-halo absolute inset-0 rounded-2xl" />
        <Icon className="hf-bob h-6 w-6" aria-hidden />
      </span>
      <p className="mt-1 font-extrabold">{title}</p>
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
      {action}
    </div>
  );
}

/** Horizontal animated bars; good for "count by X" breakdowns. */
export function BarRows({
  items,
  empty = "Nothing to show yet.",
  tone = "primary",
}: {
  items: { key: string; count: number; hint?: string }[];
  empty?: string;
  tone?: StatTone;
}) {
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={item.key} className="space-y-1.5 text-[13px] font-bold">
          <span className="flex justify-between gap-3">
            <span className="truncate">{item.key}</span>
            <span className="text-muted-foreground tabular-nums">
              {item.hint ?? item.count}
            </span>
          </span>
          <span className="block h-2 overflow-hidden rounded-full bg-muted">
            <span
              className={`hf-adm-grow block h-full rounded-full ${BAR_TONE[tone]}`}
              style={{
                width: `${(item.count / max) * 100}%`,
                animationDelay: `${0.2 + index * 0.06}s`,
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Small coloured status pill. */
export function StatusPill({
  tone,
  children,
  pulse = false,
}: {
  tone: StatTone;
  children: ReactNode;
  pulse?: boolean;
}) {
  const dot = {
    primary: "bg-primary",
    good: "bg-status-success",
    warn: "bg-status-warning",
    danger: "bg-status-danger",
    info: "bg-status-info",
    neutral: "bg-muted-foreground",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ${STAT_TONE[tone]}`}
    >
      <span className="relative h-1.5 w-1.5" aria-hidden>
        {pulse && (
          <span className={`hf-ping absolute inset-0 rounded-full ${dot}`} />
        )}
        <span className={`absolute inset-0 rounded-full ${dot}`} />
      </span>
      {children}
    </span>
  );
}
