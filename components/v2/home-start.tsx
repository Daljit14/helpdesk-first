"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Headset } from "lucide-react";
import { useRouter } from "next/navigation";
import { SAFE_USE_WARNING } from "@/lib/ui-copy";
import { normalizePlatform, platformSlug } from "@/lib/platform";
import { getIssueBySlug } from "@/lib/search";
import { clearAllSessions, getActiveSessions } from "@/lib/session";
import type { TroubleshootingSession } from "@/lib/session";
import { ticketState } from "@/lib/tickets/user-status";
import { IssueCard } from "@/components/issue-card";
import { CategoryGrid } from "@/components/category-grid";
import { ContinueCard } from "@/components/home/continue-card";
import { QUICK_SEARCHES } from "@/components/home/home-copy";
import { RecentlyViewed } from "@/components/recently-viewed";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnimatedAvatar } from "@/components/avatar/animated-avatar";
import { TypewriterText } from "@/components/assistant/typewriter-text";
import {
  HowItWorks,
  QuickTips,
  StillStuckCard,
} from "@/components/home/dashboard-extras";
import { cn } from "@/lib/utils";

const popularIds = [
  "slow-computer",
  "no-internet",
  "wifi-disconnecting",
  "printer-offline",
  "forgot-password",
  "camera-mic-not-working",
];

const EXAMPLES = [
  "My Wi-Fi keeps dropping…",
  "Printer says offline…",
  "I forgot my password…",
  "Camera not working in meetings…",
  "Laptop is really slow…",
];

const HELPER_DEMO = [
  {
    user: "My Wi-Fi keeps dropping",
    bot: "Let’s fix it. Which device are you on?",
  },
  {
    user: "Printer says offline",
    bot: "First, is the printer on the same network as you?",
  },
  {
    user: "I forgot my password",
    bot: "No problem — here’s the safe way to reset it.",
  },
];

export function HomeStart({
  signedIn = false,
  openTickets = [],
}: {
  signedIn?: boolean;
  openTickets?: Array<{
    id: string;
    subject: string;
    status: string;
    updatedAt: string;
  }>;
}) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [platform, setPlatform] = useState("");
  const [example, setExample] = useState(0);
  const [activeSessions, setActiveSessions] = useState<
    TroubleshootingSession[]
  >([]);
  const problemRef = useRef<HTMLInputElement>(null);
  const canSubmit = description.trim().length >= 3;

  useEffect(() => {
    const saved = sessionStorage.getItem("hf-v2-start");
    if (!saved) return;
    try {
      const value = JSON.parse(saved) as {
        description?: string;
        platform?: string;
      };
      queueMicrotask(() => {
        setDescription(value.description ?? "");
        setPlatform(value.platform ?? "");
      });
    } catch {
      sessionStorage.removeItem("hf-v2-start");
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(
      "hf-v2-start",
      JSON.stringify({ description, platform })
    );
  }, [description, platform]);

  useEffect(() => {
    const id = window.setInterval(
      () => setExample((value) => (value + 1) % EXAMPLES.length),
      2400
    );
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    queueMicrotask(() => setActiveSessions(getActiveSessions()));
  }, []);

  function assistantHref(intent: "solve" | "human", text = description) {
    const params = new URLSearchParams({ q: text.trim(), intent });
    const normalized = normalizePlatform(platform);
    if (normalized) params.set("platform", platformSlug(normalized));
    return `/assistant?${params.toString()}`;
  }

  function applyQuickSearch(term: string) {
    setDescription(term);
    problemRef.current?.focus();
  }

  function handleClearHistory() {
    clearAllSessions();
    setActiveSessions([]);
  }

  return (
    <section className="px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-6xl gap-6">
        {/* ---------- Hero: search card + live helper ---------- */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <div className="hf-rise rounded-[28px] border border-border bg-card p-6 shadow-sm sm:p-8">
            <p className="text-sm font-semibold text-muted-foreground">
              {signedIn ? "Welcome back" : "Hi there"}
            </p>
            <h1 className="mt-1 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              What can we help you fix?
            </h1>
            <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">
              Describe the problem in your own words. We’ll find a safe,
              step-by-step fix for your device.
            </p>

            <form
              className="mt-7"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) router.push(assistantHref("solve"));
              }}
            >
              <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_170px_auto]">
                <div className="grid gap-2">
                  <label htmlFor="start-problem" className="text-sm font-bold">
                    What&apos;s the problem?
                  </label>
                  <input
                    id="start-problem"
                    ref={problemRef}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={`e.g. ${EXAMPLES[example]}`}
                    autoComplete="off"
                    className="h-14 w-full rounded-2xl border border-input bg-surface px-4 text-base outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/15"
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="start-platform" className="text-sm font-bold">
                    Device
                  </label>
                  <select
                    id="start-platform"
                    value={platform}
                    onChange={(event) => setPlatform(event.target.value)}
                    className="h-14 w-full rounded-2xl border border-input bg-surface px-4 text-base outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                  >
                    <option value="">Any device</option>
                    <option value="Windows">Windows</option>
                    <option value="Mac">Mac</option>
                    <option value="iOS">iOS</option>
                    <option value="Android">Android</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={!canSubmit}
                  className="h-14 px-7"
                >
                  Find a solution
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-muted-foreground">
                  <span>Try:</span>
                  {QUICK_SEARCHES.map((pick) => (
                    <button
                      key={pick}
                      type="button"
                      onClick={() => applyQuickSearch(pick)}
                      className="min-h-9 rounded-full border border-border bg-card px-3.5 transition-colors hover:border-primary/30 hover:bg-secondary hover:text-secondary-foreground"
                    >
                      {pick}
                    </button>
                  ))}
                </div>
                <Link
                  href={canSubmit ? assistantHref("human") : "#start-problem"}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg text-sm font-bold text-primary hover:underline"
                >
                  <Headset className="h-4 w-4" aria-hidden />
                  Contact support
                </Link>
              </div>
              <p
                className={cn(
                  "mt-3 text-xs text-muted-foreground",
                  canSubmit && "invisible"
                )}
                aria-hidden={canSubmit}
              >
                Describe the problem (3+ characters) to continue.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {SAFE_USE_WARNING}
              </p>
            </form>
          </div>

          <HelperPreview />
        </div>

        {/* ---------- Open tickets ---------- */}
        {signedIn && openTickets.length > 0 && (
          <section
            aria-labelledby="open-tickets-heading"
            className="hf-rise rounded-[28px] border border-border bg-card p-6 shadow-sm"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 id="open-tickets-heading" className="text-lg font-extrabold">
                Your open tickets
              </h2>
              <Link
                href="/tickets"
                className="text-sm font-bold text-primary hover:underline"
              >
                View all tickets
              </Link>
            </div>
            <ul className="mt-4 grid gap-3 md:grid-cols-3">
              {openTickets.slice(0, 3).map((ticket) => {
                const state = ticketState({ status: ticket.status });
                return (
                  <li key={ticket.id}>
                    <Link
                      href={`/tickets/${ticket.id}`}
                      className="hf-lift flex h-full flex-col gap-2 rounded-2xl border border-border bg-surface p-4"
                    >
                      <span className="font-bold">{ticket.subject}</span>
                      <span className="text-sm text-muted-foreground">
                        {state.nextAction ?? state.description}
                      </span>
                      <Badge
                        variant={state.attention ? "warning" : "neutral"}
                        className="mt-auto self-start"
                      >
                        {state.label}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {activeSessions.length > 0 ? (
          <ContinueCard
            session={activeSessions[0]}
            onClear={handleClearHistory}
            className="hf-rise"
          />
        ) : (
          <StartGuideCard />
        )}

        {/* ---------- Popular solutions ---------- */}
        <section
          aria-labelledby="popular-solutions-heading"
          className="hf-rise"
        >
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2
                id="popular-solutions-heading"
                className="text-2xl font-extrabold"
              >
                Popular solutions
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Start with a guide for a common problem.
              </p>
            </div>
            <Link
              href="/browse"
              className="group inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
            >
              Browse all
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                aria-hidden
              />
            </Link>
          </div>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {popularIds.map((id) => {
              const issue = getIssueBySlug(id);
              return issue ? <IssueCard key={id} issue={issue} /> : null;
            })}
          </ul>
        </section>

        <section aria-labelledby="browse-category-heading" className="hf-rise">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2
                id="browse-category-heading"
                className="text-2xl font-extrabold"
              >
                Browse by category
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Find a guide by the kind of problem you&apos;re seeing.
              </p>
            </div>
            <Link
              href="/browse"
              className="text-sm font-bold text-primary hover:underline"
            >
              Browse all
            </Link>
          </div>
          <div className="mt-4">
            <CategoryGrid
              selected={null}
              onSelect={(id) =>
                router.push(id ? `/browse?category=${id}` : "/browse")
              }
            />
          </div>
        </section>

        <RecentlyViewed />

        {/* ---------- Two balanced columns: no dead space ---------- */}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <div className="grid gap-5">
            <HowItWorks className="hf-rise" />
            <BrowseByDevice />
          </div>
          <div className="grid gap-5">
            <QuickTips className="hf-rise" />
            <StillStuckCard className="hf-rise" />
          </div>
        </div>
      </div>
    </section>
  );
}

function StartGuideCard() {
  return (
    <Link
      href="/browse"
      className="hf-rise hf-lift flex min-w-0 items-center justify-between gap-5 rounded-[28px] bg-[#ece8fd] p-6 text-[#2d205b] dark:bg-[#2c2350] dark:text-white"
    >
      <span className="min-w-0">
        <span className="block text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
          Start here
        </span>
        <span className="mt-1 block text-2xl font-extrabold">
          Start with a guide
        </span>
        <span className="mt-1 block text-sm opacity-75">
          Browse approved fixes and find the right next step.
        </span>
        <span className="hf-lift mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background">
          Browse guides →
        </span>
      </span>
      <svg
        aria-hidden
        viewBox="0 0 120 96"
        className="hidden h-[110px] w-[160px] shrink-0 overflow-visible sm:block"
      >
        <path
          d="M20 17C47 17 43 45 68 45s21 30 44 30"
          fill="none"
          stroke="currentColor"
          strokeDasharray="5 5"
          strokeLinecap="round"
          strokeWidth="2.5"
          className="hf-dash"
        />
        <rect
          x="8"
          y="8"
          width="34"
          height="18"
          rx="7"
          fill="var(--card)"
          stroke="var(--primary)"
          strokeWidth="1.5"
        />
        <rect
          x="51"
          y="36"
          width="34"
          height="18"
          rx="7"
          fill="var(--card)"
          stroke="var(--primary)"
          strokeWidth="1.5"
        />
        <rect
          x="86"
          y="66"
          width="26"
          height="18"
          rx="7"
          fill="var(--card)"
          stroke="var(--primary)"
          strokeWidth="1.5"
        />
        <circle
          cx="99"
          cy="75"
          r="7"
          fill="var(--primary)"
          className="hf-glow"
        />
        <path
          d="m95 75 3 3 5-6"
          fill="none"
          stroke="var(--primary-foreground)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
          className="hf-draw"
        />
      </svg>
    </Link>
  );
}

/** Animated preview of the assistant chatting — cycles through examples. */
function HelperPreview() {
  const [index, setIndex] = useState(0);
  const [showReply, setShowReply] = useState(false);

  useEffect(() => {
    const reply = window.setTimeout(() => setShowReply(true), 1400);
    const next = window.setTimeout(() => {
      setShowReply(false);
      setIndex((value) => (value + 1) % HELPER_DEMO.length);
    }, 6200);
    return () => {
      window.clearTimeout(reply);
      window.clearTimeout(next);
    };
  }, [index]);

  const demo = HELPER_DEMO[index];

  return (
    <aside
      aria-label="Support Assistant preview"
      className="hf-rise relative flex min-h-[320px] flex-col overflow-hidden rounded-[28px] bg-[linear-gradient(150deg,#5b3cc4,#8b6cf6_55%,#c084fc)] p-6 text-white shadow-[var(--shadow-md)]"
      style={{ animationDelay: "0.1s" }}
    >
      <span
        aria-hidden
        className="hf-blob-a absolute -right-16 -top-16 h-52 w-52 rounded-full bg-white/10"
      />
      <span
        aria-hidden
        className="hf-blob-b absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-pink-400/20"
      />

      <div className="relative flex items-center gap-3">
        <AnimatedAvatar id="bot" size={48} className="ring-4 ring-white/25" />
        <div>
          <p className="text-base font-extrabold">Support Assistant</p>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/85">
            <span className="relative flex h-2 w-2">
              <span className="hf-ping absolute inset-0 rounded-full bg-[#5ee0a8]" />
              <span className="relative h-2 w-2 rounded-full bg-[#5ee0a8]" />
            </span>
            Online now
          </p>
        </div>
      </div>

      <div aria-hidden className="relative mt-5 flex flex-1 flex-col gap-3">
        <span
          key={`u-${index}`}
          className="hf-swap self-end rounded-2xl rounded-br-md bg-white px-3.5 py-2.5 text-sm font-semibold text-[#3b2a8f] shadow-sm"
        >
          {demo.user}
        </span>
        {showReply ? (
          <span className="hf-swap max-w-[90%] self-start rounded-2xl rounded-bl-md bg-white/15 px-3.5 py-2.5 text-sm font-semibold backdrop-blur">
            <TypewriterText text={demo.bot} speed={28} />
          </span>
        ) : (
          <span className="flex items-center gap-1.5 self-start rounded-2xl rounded-bl-md bg-white/15 px-4 py-3.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="hf-typing-dot h-2 w-2 rounded-full bg-white"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
        )}
      </div>

      <Link
        href="/assistant"
        className="group relative mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-extrabold text-[#3b2a8f] transition-transform hover:-translate-y-0.5"
      >
        Chat with the assistant
        <ArrowRight
          className="h-4 w-4 transition-transform group-hover:translate-x-1"
          aria-hidden
        />
      </Link>
    </aside>
  );
}

const DEVICES: Array<{
  slug: string;
  label: string;
  hint: string;
  art: ReactNode;
}> = [
  {
    slug: "windows",
    label: "Windows",
    hint: "PCs & laptops",
    art: (
      <svg viewBox="0 0 64 48" className="h-12 w-16" aria-hidden>
        <rect x="6" y="4" width="52" height="32" rx="4" fill="#1c1633" />
        <rect
          x="9"
          y="7"
          width="46"
          height="26"
          rx="2"
          fill="#2553b0"
          className="hf-screen"
        />
        <g fill="#ffffff">
          <rect x="24" y="12" width="7" height="7" rx="1" />
          <rect x="33" y="12" width="7" height="7" rx="1" />
          <rect x="24" y="21" width="7" height="7" rx="1" />
          <rect x="33" y="21" width="7" height="7" rx="1" />
        </g>
        <path d="M2 38h60l-4 6H6z" fill="#6b6385" />
      </svg>
    ),
  },
  {
    slug: "mac",
    label: "Mac",
    hint: "MacBook & iMac",
    art: (
      <svg viewBox="0 0 64 48" className="h-12 w-16" aria-hidden>
        <rect x="6" y="4" width="52" height="32" rx="4" fill="#c9c4d8" />
        <rect
          x="9"
          y="7"
          width="46"
          height="26"
          rx="2"
          fill="#ece8fd"
          className="hf-screen"
        />
        <path
          d="M18 30 L30 16 L38 24 L46 12"
          fill="none"
          stroke="#5b3cc4"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="hf-draw"
        />
        <path d="M2 38h60l-4 6H6z" fill="#b8b2c9" />
      </svg>
    ),
  },
  {
    slug: "ios",
    label: "iOS",
    hint: "iPhone & iPad",
    art: (
      <svg viewBox="0 0 64 48" className="h-12 w-16" aria-hidden>
        <g
          className="hf-tilt"
          style={{ transformOrigin: "32px 24px", transformBox: "view-box" }}
        >
          <rect x="22" y="2" width="20" height="44" rx="5" fill="#1c1633" />
          <rect x="24.5" y="6" width="15" height="36" rx="3" fill="#fde7f1" />
          <rect x="28" y="3.5" width="8" height="2" rx="1" fill="#1c1633" />
          <circle cx="37" cy="10" r="2.6" fill="#e0245e" className="hf-i-rec" />
        </g>
      </svg>
    ),
  },
  {
    slug: "android",
    label: "Android",
    hint: "Phones & tablets",
    art: (
      <svg viewBox="0 0 64 48" className="h-12 w-16" aria-hidden>
        <g className="hf-i-vib">
          <rect x="22" y="2" width="20" height="44" rx="4" fill="#123b2c" />
          <rect x="24.5" y="5" width="15" height="37" rx="2" fill="#e3f6ee" />
          <path d="M28 16a4 4 0 0 1 8 0z" fill="#12805c" />
          <rect x="28" y="17" width="8" height="7" rx="1.5" fill="#12805c" />
        </g>
      </svg>
    ),
  },
];

/** Animated device tiles linking to platform-filtered guides. */
function BrowseByDevice() {
  return (
    <section
      aria-labelledby="browse-device-heading"
      className="hf-rise rounded-[28px] border border-border bg-card p-6 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="browse-device-heading" className="text-lg font-extrabold">
          Browse by device
        </h2>
        <Link
          href="/browse?platform=other"
          className="text-sm font-bold text-primary hover:underline"
        >
          Other devices
        </Link>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {DEVICES.map((device, index) => (
          <li
            key={device.slug}
            className="hf-pop"
            style={{ animationDelay: `${0.15 + index * 0.07}s` }}
          >
            <Link
              href={`/browse?platform=${device.slug}`}
              aria-label={device.label}
              className="hf-cat group flex h-full flex-col items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-4 text-center"
            >
              <span className="hf-cat-icon">{device.art}</span>
              <span className="text-[15px] font-extrabold">{device.label}</span>
              <span
                aria-hidden
                className="text-xs font-semibold text-muted-foreground"
              >
                {device.hint}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
