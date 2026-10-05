"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Eraser,
  MailWarning,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { ToolReport } from "./diagnostics";
import { analyzeInput, type PhishResult } from "./net-sec-logic";
import {
  Panel,
  ReasonList,
  SectionLabel,
  SegmentMeter,
  fieldClass,
} from "./net-sec-ui";
import {
  IdleHint,
  ToolButton,
  ToolCard,
  ToolNotice,
  ToneIcon,
  Verdict,
} from "./tool-shell";

const MAX_CHARS = 20000;

const ADVICE: Record<PhishResult["level"], string> = {
  low: "No obvious red flags, but this is only a helper. If the message asks for money, a password or a code, verify it another way (call the sender on a known number).",
  some: "Treat it with caution. Don't click links or open attachments — go to the website by typing the address yourself, or check with the sender.",
  suspicious:
    "Don't click, don't reply and don't open attachments. Report it to IT so others are protected.",
  danger:
    "Don't click, don't reply and don't open attachments. Report it to IT right away, and if you already clicked or entered a password, change it and tell IT now.",
};

export function SecPhishTool() {
  const [text, setText] = useState("");
  const [out, setOut] = useState<{
    kind: "url" | "email";
    result: PhishResult;
  } | null>(null);
  const [empty, setEmpty] = useState(false);

  function analyse() {
    if (!text.trim()) {
      setEmpty(true);
      setOut(null);
      return;
    }
    setEmpty(false);
    setOut(analyzeInput(text.slice(0, MAX_CHARS)));
  }

  function clear() {
    setText("");
    setOut(null);
    setEmpty(false);
  }

  const r = out?.result;
  const report: ToolReport | null = r
    ? {
        tool: "Suspicious link / email check",
        tone: r.tone,
        verdict: r.label,
        tip: ADVICE[r.level],
        lines: [
          ["Checked", out?.kind === "url" ? "A link" : "Email text"],
          ["Risk score", `${r.score}/100`],
          ...(r.hosts.length
            ? ([
                ["Sites linked", r.hosts.slice(0, 5).join(", ")],
              ] as ToolReport["lines"])
            : []),
          ...r.reasons
            .slice(0, 6)
            .map((x, i) => [`Reason ${i + 1}`, x.text] as [string, string]),
        ],
      }
    : null;

  return (
    <ToolCard
      id="sec-phish"
      icon={MailWarning}
      title="Suspicious link & email checker"
      description="Paste a link, or the text of an email, and get a quick risk check. It runs on this device only — nothing is sent anywhere and nothing is opened."
      live={r ? r.label : undefined}
      actions={
        <ToolButton icon={Search} onClick={analyse}>
          Check it
        </ToolButton>
      }
    >
      <div className="grid gap-3">
        <label className="grid gap-1.5">
          <SectionLabel>Link or email text</SectionLabel>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={MAX_CHARS}
            spellCheck={false}
            autoComplete="off"
            placeholder="Paste a link, or paste the email (HTML is fine) here…"
            className={`${fieldClass} min-h-32 resize-y py-3 font-mono text-[13px]`}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <ToolButton
            variant="ghost"
            icon={Eraser}
            onClick={clear}
            disabled={!text && !out}
          >
            Clear
          </ToolButton>
          <p className="text-xs font-semibold text-white/55">
            Don&apos;t paste passwords or private details.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        {empty && (
          <ToolNotice tone="warn" title="Nothing to check yet">
            Paste a link or email text above first.
          </ToolNotice>
        )}
        {!out && !empty && <IdleHint>Results appear here.</IdleHint>}
        {r && out && (
          <>
            <Panel className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-lg font-extrabold">
                  <ToneIcon tone={r.tone} className="h-5 w-5" />
                  {r.label}
                </p>
                <p className="text-xs font-bold tabular-nums text-white/60">
                  {r.score}/100
                </p>
              </div>
              <SegmentMeter
                filled={
                  r.score === 0 ? 0 : Math.max(1, Math.ceil(r.score / 20))
                }
                total={5}
                tone={r.tone}
                label={`Risk level: ${r.label}`}
              />
              {r.hosts.length > 0 && (
                <p className="text-xs font-semibold text-white/60">
                  Real destination{r.hosts.length > 1 ? "s" : ""}:{" "}
                  <span className="font-mono text-white/85">
                    {r.hosts.slice(0, 4).join(", ")}
                  </span>
                </p>
              )}
            </Panel>

            {r.reasons.length > 0 ? (
              <div className="grid gap-2">
                <SectionLabel>Why</SectionLabel>
                <ReasonList items={r.reasons} />
              </div>
            ) : (
              <ToolNotice tone="good" title="No warning signs found">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                  That doesn&apos;t prove it&apos;s safe.
                </span>
              </ToolNotice>
            )}

            <Panel>
              <p className="text-sm font-extrabold">What to do</p>
              <ul className="mt-1.5 grid gap-1 pl-4 text-sm font-medium text-white/80 [&>li]:list-disc">
                <li>
                  Don&apos;t click links, open attachments or scan QR codes in
                  it.
                </li>
                <li>Don&apos;t reply or send any codes, passwords or money.</li>
                <li>
                  Not sure? Contact the sender using a phone number or website
                  you already trust.
                </li>
              </ul>
              {(r.level === "suspicious" || r.level === "danger") && (
                <Link
                  href="/tickets"
                  className="group mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-extrabold text-[#c9b8ff] hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9b8ff]/40"
                >
                  Open Tickets to report it to IT
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-1"
                    aria-hidden
                  />
                </Link>
              )}
            </Panel>
            <p className="text-xs font-semibold text-white/55">
              This is a helper, not a guarantee: it uses simple warning-sign
              rules, so a clean result can still be a scam and a warning can be
              a false alarm. When in doubt, ask IT.
            </p>
            {report && <Verdict report={report} />}
          </>
        )}
      </div>
    </ToolCard>
  );
}
