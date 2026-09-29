"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Monitor } from "lucide-react";
import { useRouter } from "next/navigation";
import { SAFE_USE_WARNING } from "@/lib/ui-copy";
import { normalizePlatform, platformSlug } from "@/lib/platform";
import { getIssueBySlug } from "@/lib/search";
import { ticketState } from "@/lib/tickets/user-status";
import { IssueCard } from "@/components/issue-card";
import { RecentlyViewed } from "@/components/recently-viewed";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const popularIds = [
  "slow-computer",
  "no-internet",
  "wifi-keeps-disconnecting",
  "printer-offline",
  "forgot-password",
  "camera-mic-not-working",
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

  function assistantHref(intent: "solve" | "human") {
    const params = new URLSearchParams({ q: description.trim(), intent });
    const normalized = normalizePlatform(platform);
    if (normalized) params.set("platform", platformSlug(normalized));
    return `/assistant?${params.toString()}`;
  }

  return (
    <section className="px-4 py-10 sm:px-6 lg:px-10">
      <div className="hero-wash mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl pt-2 text-center">
          <h1 className="text-[2.5rem] font-bold leading-[1.05] tracking-tight sm:text-6xl">
            What can we help you fix?
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Describe your issue or explore a troubleshooting guide.
          </p>
        </div>
        <div className="mx-auto mt-8 w-full max-w-2xl rounded-[32px] border border-border bg-card p-6 shadow-md sm:p-8">
          <div className="grid gap-5">
            <Field id="start-problem" label="What's the problem?">
              <textarea
                id="start-problem"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="e.g. My laptop won't connect to the office Wi-Fi since this morning"
                className="w-full rounded-3xl border border-input bg-surface px-4 py-3 text-base outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </Field>
            <Field id="start-platform" label="Device (optional)">
              <select
                id="start-platform"
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                className="h-12 rounded-full border border-input bg-surface px-4 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
              >
                <option value="">Not sure</option>
                <option value="Windows">Windows</option>
                <option value="Mac">Mac</option>
                <option value="iOS">iOS</option>
                <option value="Android">Android</option>
                <option value="Other">Other</option>
              </select>
            </Field>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                size="lg"
                disabled={!canSubmit}
                onClick={() => router.push(assistantHref("solve"))}
              >
                Find a solution
              </Button>
              <Link
                href={canSubmit ? assistantHref("human") : "#start-problem"}
                className={cn(
                  "inline-flex min-h-12 items-center justify-center rounded-full border border-border px-6 font-semibold hover:bg-secondary",
                  !canSubmit && "text-muted-foreground"
                )}
              >
                Contact support
              </Link>
            </div>
            {!canSubmit && (
              <p className="text-sm text-muted-foreground">
                Describe the problem to continue
              </p>
            )}
            <p className="text-xs text-muted-foreground">{SAFE_USE_WARNING}</p>
          </div>
        </div>

        <section className="mt-12" aria-labelledby="popular-solutions-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2
                id="popular-solutions-heading"
                className="text-2xl font-semibold"
              >
                Popular solutions
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Start with a guide for a common problem.
              </p>
            </div>
            <Link
              href="/browse"
              className="text-sm font-medium text-primary hover:underline"
            >
              Browse all <ArrowRight className="inline h-4 w-4" aria-hidden />
            </Link>
          </div>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {popularIds.map((id) => {
              const issue = getIssueBySlug(id);
              return issue ? <IssueCard key={id} issue={issue} /> : null;
            })}
          </ul>
        </section>

        <RecentlyViewed />

        {signedIn && openTickets.length > 0 && (
          <section className="mt-12" aria-labelledby="open-tickets-heading">
            <div className="flex items-end justify-between gap-4">
              <h2 id="open-tickets-heading" className="text-2xl font-semibold">
                Your open tickets
              </h2>
              <Link
                href="/tickets"
                className="text-sm font-medium text-primary hover:underline"
              >
                View all tickets
              </Link>
            </div>
            <ul className="mt-4 grid gap-3">
              {openTickets.slice(0, 3).map((ticket) => {
                const state = ticketState({ status: ticket.status });
                return (
                  <li key={ticket.id} className="glass glass-interactive p-4">
                    <Link
                      href={`/tickets/${ticket.id}`}
                      className="flex items-start justify-between gap-4"
                    >
                      <div>
                        <p className="font-medium">{ticket.subject}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {state.nextAction ?? state.description}
                        </p>
                      </div>
                      <Badge variant={state.attention ? "warning" : "neutral"}>
                        {state.label}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="mt-12" aria-labelledby="browse-device-heading">
          <h2 id="browse-device-heading" className="text-2xl font-semibold">
            Browse by device
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {["windows", "mac", "ios", "android"].map((device) => (
              <Link
                key={device}
                href={`/browse?platform=${device}`}
                className="chip"
              >
                <Monitor className="h-4 w-4" aria-hidden />
                {device === "ios"
                  ? "iOS"
                  : device[0].toUpperCase() + device.slice(1)}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
