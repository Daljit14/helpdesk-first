"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Play, RefreshCw, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { detectOS, type Tone, type ToolReport } from "./diagnostics";
import {
  DNS_TYPES,
  compareResolvers,
  flushDnsTip,
  formatTtl,
  isValidDomain,
  normalizeDomain,
  type DnsFinding,
  type DnsType,
  type ResolverOutcome,
} from "./net-sec-logic";
import { RESOLVERS, resolveDoh } from "./net-probe";
import { Panel, SectionLabel, fieldClass } from "./net-sec-ui";
import { TONE_TEXT, ToolCard, ToolNotice, ToneIcon } from "./tool-shell";

type Outcomes = Record<DnsType, ResolverOutcome[]>;
type Done = { domain: string; outcomes: Outcomes; findings: DnsFinding[] };

function rowsFor(outcome: ResolverOutcome, type: string) {
  if (!outcome.ok) return [];
  const addr = type === "A" || type === "AAAA";
  return outcome.result.answers.filter(
    (a) => a.type === type || (addr && a.type === "CNAME")
  );
}

function summarize(outcome: ResolverOutcome, type: string): string {
  if (!outcome.ok) return outcome.error;
  const rows = rowsFor(outcome, type);
  if (outcome.result.status !== 0) return outcome.result.statusLabel;
  if (rows.length === 0) return "No record";
  return `${rows.length} record${rows.length > 1 ? "s" : ""}`;
}

export function NetDnsTool({ defaultHost }: { defaultHost?: string } = {}) {
  const [value, setValue] = useState(defaultHost ?? "");
  const [os, setOs] = useState("your device");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const run = useRef(0);

  // Default to this site's own host and detect the OS (browser only).
  useEffect(() => {
    queueMicrotask(() => {
      setValue((v) => v || window.location.hostname);
      setOs(
        detectOS(
          navigator.userAgent,
          navigator.platform,
          navigator.maxTouchPoints
        )
      );
    });
  }, []);

  async function check() {
    const domain = normalizeDomain(value);
    if (!isValidDomain(domain)) {
      setError(
        "Enter a domain name such as example.com (letters, numbers, dots and hyphens only)."
      );
      setDone(null);
      return;
    }
    setError(null);
    setBusy(true);
    const id = ++run.current;
    const entries = await Promise.all(
      DNS_TYPES.map(
        async (t) =>
          [
            t,
            await Promise.all(RESOLVERS.map((r) => resolveDoh(r, domain, t))),
          ] as const
      )
    );
    if (id !== run.current) return;
    const outcomes = Object.fromEntries(entries) as Outcomes;
    const findings = DNS_TYPES.flatMap((t) =>
      compareResolvers(t, outcomes[t][0], outcomes[t][1])
    );
    setDone({ domain, outcomes, findings });
    setBusy(false);
  }

  const report = done ? buildReport(done, os) : null;

  return (
    <ToolCard
      id="net-dns"
      icon={Globe}
      title="DNS check"
      description="Looks up a website's address through two public resolvers to tell whether the name works. Only the domain you type is sent."
      active={busy}
      report={report}
      live={
        busy ? "Looking up DNS records" : report ? report.verdict : undefined
      }
    >
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
      >
        <label className="grid gap-1.5">
          <SectionLabel>Domain to check</SectionLabel>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={260}
            placeholder="example.com"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "net-dns-error" : undefined}
            className={fieldClass}
          />
        </label>
        <div>
          <button
            type="submit"
            disabled={busy}
            className="group relative inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[linear-gradient(110deg,#7c5cff,#c084fc,#7c5cff)] bg-[length:200%_100%] px-4 text-sm font-extrabold text-[#0d0a1c] shadow-[0_10px_30px_-10px_#7c5cff] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c084fc]/40 disabled:opacity-60"
          >
            {done ? (
              <RefreshCw
                className={cn("h-4 w-4", busy && "animate-spin")}
                aria-hidden
              />
            ) : (
              <Play className="h-4 w-4" aria-hidden />
            )}
            {busy ? "Looking up…" : done ? "Check again" : "Check DNS"}
          </button>
        </div>
        {error && (
          <p
            id="net-dns-error"
            role="alert"
            className="text-sm font-bold text-[#ff9bb3]"
          >
            {error}
          </p>
        )}
      </form>

      {done && (
        <div className="mt-4 grid gap-4">
          <div className="grid gap-3">
            {DNS_TYPES.map((t) => (
              <TypeRow key={t} type={t} outcomes={done.outcomes[t]} />
            ))}
          </div>
          {done.findings.length > 0 && (
            <Panel>
              <SectionLabel>Flags</SectionLabel>
              <ul className="mt-2 grid gap-1.5 text-sm font-medium">
                {done.findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <ToneIcon
                      tone={f.tone}
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <span className="text-white/85">{f.text}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {report && report.tone !== "good" && (
            <ToolNotice
              tone="info"
              title="Site works for others but not for you?"
            >
              {flushDnsTip(os)} Then restart your browser.
            </ToolNotice>
          )}
        </div>
      )}
    </ToolCard>
  );
}

function TypeRow({
  type,
  outcomes,
}: {
  type: DnsType;
  outcomes: ResolverOutcome[];
}) {
  return (
    <Panel className="p-3">
      <p className="text-sm font-extrabold">{type} records</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {outcomes.map((o, i) => (
          <div
            key={RESOLVERS[i].id}
            className="min-w-0 rounded-xl bg-black/20 p-2.5"
          >
            <p className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-white/55">
              <span className="truncate">{RESOLVERS[i].label}</span>
              <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                <Timer className="h-3 w-3" aria-hidden />
                {o.ms === null ? "—" : `${Math.round(o.ms)} ms`}
              </span>
            </p>
            {o.ok && o.result.status === 0 && rowsFor(o, type).length > 0 ? (
              <ul className="mt-1.5 grid gap-1">
                {rowsFor(o, type)
                  .slice(0, 6)
                  .map((a, j) => (
                    <li
                      key={j}
                      className="flex items-baseline justify-between gap-2 text-xs font-semibold"
                    >
                      <span className="min-w-0 break-all text-white/90">
                        {a.data}
                      </span>
                      <span className="shrink-0 tabular-nums text-white/50">
                        TTL {formatTtl(a.ttl)}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p
                className={cn(
                  "mt-1.5 text-xs font-bold",
                  o.ok && o.result.status === 0
                    ? "text-white/55"
                    : TONE_TEXT[o.ok ? "warn" : "bad"]
                )}
              >
                {summarize(o, type)}
              </p>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function buildReport(d: Done, os: string): ToolReport {
  const all = DNS_TYPES.flatMap((t) => d.outcomes[t]);
  const reachable = all.filter((o) => o.ok);
  const lines: ToolReport["lines"] = [["Domain", d.domain]];
  for (const t of DNS_TYPES) {
    d.outcomes[t].forEach((o, i) => {
      lines.push([
        `${t} via ${RESOLVERS[i].id}`,
        summarize(o, t) + (o.ms !== null ? ` (${Math.round(o.ms)} ms)` : ""),
      ]);
    });
  }
  let tone: Tone;
  let verdict: string;
  let tip: string;
  if (reachable.length === 0) {
    tone = "warn";
    verdict = "Couldn't reach the DNS lookup services";
    tip =
      "Your network or browser blocked the lookup, or you're offline. This doesn't mean the domain is broken — try another network or ask IT whether DNS-over-HTTPS is blocked.";
  } else {
    const a = d.outcomes.A.filter((o) => o.ok);
    const nx = a.length > 0 && a.every((o) => o.ok && o.result.status === 3);
    const aOk = a.some(
      (o) =>
        o.ok &&
        o.result.answers.some((x) => x.type === "A" || x.type === "CNAME")
    );
    const aaaaOk = d.outcomes.AAAA.some(
      (o) => o.ok && o.result.answers.some((x) => x.type === "AAAA")
    );
    if (nx) {
      tone = "bad";
      verdict = "This domain doesn't exist";
      tip =
        "Both resolvers say the name isn't registered or has no records. Check the spelling; if it's your company's site, tell IT.";
    } else if (aOk || aaaaOk) {
      const warn = d.findings.some(
        (f) => f.tone === "warn" || f.tone === "bad"
      );
      tone = warn ? "warn" : "good";
      verdict = warn
        ? "Resolves, with some differences between resolvers"
        : "DNS is working for this domain";
      tip = `The name resolves on public DNS. If the site still fails only for you, your own DNS cache or network filter is the likely cause. ${flushDnsTip(os)}`;
    } else {
      tone = "warn";
      verdict = "No address records found";
      tip =
        "The domain exists but has no A/AAAA address, so websites won't load. That's normal for mail-only domains.";
    }
  }
  return { tool: "DNS check", tone, verdict, tip, lines };
}
