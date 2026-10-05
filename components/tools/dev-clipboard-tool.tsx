"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ClipboardCheck,
  ClipboardPaste,
  Copy,
  Eraser,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { copyText, type ReportLine, type ToolReport } from "./diagnostics";
import {
  clipboardAdvice,
  cleanPaste,
  DEFAULT_CLEAN_OPTIONS,
  type CleanPasteOptions,
  type ClipboardState,
} from "./dev-logic";
import { Panel, Pill, useEnv, useSaveResult, withTimeout } from "./dev-shared";
import { StatTile, ToolButton, ToolCard, ToolNotice } from "./tool-shell";

type TestState = "idle" | "running" | "done";
type Outcome = { ok: boolean; detail: string; errorName?: string };

const PROBE = "HelpDesk First clipboard test";

async function permissionState(
  name: "clipboard-read" | "clipboard-write"
): Promise<ClipboardState> {
  try {
    if (!navigator.permissions?.query) return "unknown";
    const s = await navigator.permissions.query({
      name: name as PermissionName,
    });
    return s.state as ClipboardState;
  } catch {
    return "unknown";
  }
}

function errName(err: unknown): string {
  return err && typeof err === "object" && "name" in err
    ? String((err as { name: unknown }).name)
    : "Error";
}

const OPTION_LABELS: Array<[keyof CleanPasteOptions, string, string]> = [
  [
    "straightenQuotes",
    "Straighten quotes and dashes",
    "Turns curly quotes and long dashes into plain ones",
  ],
  [
    "collapseSpaces",
    "Collapse extra spaces",
    "Several spaces in a row become one",
  ],
  [
    "trimLines",
    "Trim each line",
    "Removes spaces at the start and end of lines",
  ],
  [
    "stripInvisible",
    "Remove hidden characters",
    "Zero-width and non-breaking spaces that break passwords and commands",
  ],
  [
    "joinLines",
    "Join hard-wrapped lines",
    "Keeps paragraphs but removes mid-sentence line breaks",
  ],
];

export function DevClipboardTool() {
  const env = useEnv();
  const browser = env?.browser ?? "";
  const runId = useRef(0);
  const copiedTimer = useRef(0);

  const [state, setState] = useState<TestState>("idle");
  const [secure, setSecure] = useState<boolean | null>(null);
  const [write, setWrite] = useState<Outcome | null>(null);
  const [read, setRead] = useState<Outcome | null>(null);
  const [perms, setPerms] = useState<{
    read: ClipboardState;
    write: ClipboardState;
  } | null>(null);

  const [raw, setRaw] = useState("");
  const [opts, setOpts] = useState<CleanPasteOptions>(DEFAULT_CLEAN_OPTIONS);
  const [hadFormatting, setHadFormatting] = useState<boolean | null>(null);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const [pasteMsg, setPasteMsg] = useState<string | null>(null);

  const cleaned = useMemo(() => cleanPaste(raw, opts), [raw, opts]);

  useEffect(
    () => () => {
      runId.current++;
      window.clearTimeout(copiedTimer.current);
    },
    []
  );

  async function run() {
    const my = ++runId.current;
    setState("running");
    setWrite(null);
    setRead(null);
    setSecure(window.isSecureContext);
    const permsNow = {
      read: await permissionState("clipboard-read"),
      write: await permissionState("clipboard-write"),
    };
    if (runId.current !== my) return;
    setPerms(permsNow);

    // Write
    let w: Outcome;
    if (!navigator.clipboard?.writeText) {
      const fallback = await copyText(PROBE);
      w = fallback
        ? {
            ok: true,
            detail:
              "Works through the older copy method (modern Clipboard API missing)",
          }
        : {
            ok: false,
            detail: "This browser has no clipboard API on this page",
            errorName: "Unsupported",
          };
    } else {
      try {
        await withTimeout(navigator.clipboard.writeText(PROBE), 5000);
        w = { ok: true, detail: "Copying works" };
      } catch (err) {
        w = {
          ok: false,
          detail:
            errName(err) === "NotAllowedError"
              ? "The browser blocked copying"
              : "Copying failed",
          errorName: errName(err),
        };
      }
    }
    if (runId.current !== my) return;
    setWrite(w);

    // Read (never shown, only measured)
    let r: Outcome;
    if (!navigator.clipboard?.readText) {
      r = {
        ok: false,
        detail: "Reading the clipboard isn't supported by this browser",
        errorName: "Unsupported",
      };
    } else {
      try {
        const text = await withTimeout(navigator.clipboard.readText(), 8000);
        r = {
          ok: true,
          detail: `Reading works (${text.length} characters found, not stored)`,
        };
      } catch (err) {
        const n = errName(err);
        r = {
          ok: false,
          errorName: n,
          detail:
            n === "TimeoutError"
              ? "No answer to the paste prompt in time"
              : n === "NotAllowedError"
                ? "The browser blocked reading the clipboard"
                : n === "NotFocusedError" || n === "DocumentIsNotFocused"
                  ? "Click on the page first, then try again"
                  : "Reading failed",
        };
      }
    }
    if (runId.current !== my) return;
    setRead(r);
    setState("done");
  }

  async function pasteFromClipboard() {
    setPasteMsg(null);
    try {
      if (!navigator.clipboard?.readText)
        throw Object.assign(new Error("unsupported"), { name: "Unsupported" });
      const text = await withTimeout(navigator.clipboard.readText(), 8000);
      setRaw(text);
      setHadFormatting(null);
    } catch {
      setPasteMsg(
        `Couldn't read the clipboard automatically. Click in the box and press ${env?.os === "macOS" ? "Cmd" : "Ctrl"}+V instead.`
      );
    }
  }

  async function copyClean() {
    const ok = await copyText(cleaned);
    setCopied(ok ? "ok" : "fail");
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied("idle"), 2200);
  }

  const done = state === "done" && write && read;
  const lines: ReportLine[] = done
    ? [
        ["Secure page (https)", secure ? "Yes" : "No"],
        [
          "Copy to clipboard",
          `${write.ok ? "Works" : "Blocked"} - ${write.detail}`,
        ],
        [
          "Read from clipboard",
          `${read.ok ? "Works" : "Blocked"} - ${read.detail}`,
        ],
        [
          "Permission state (read / write)",
          perms ? `${perms.read} / ${perms.write}` : "Unknown",
        ],
      ]
    : [];
  let report: ToolReport | null = null;
  if (done) {
    if (write.ok && read.ok) {
      report = {
        tool: "Clipboard",
        tone: "good",
        verdict: "Copy and paste both work in this browser.",
        tip: "If copy or paste fails in one particular app, that app (or a work policy) is blocking it, not your browser.",
        lines,
      };
    } else if (!write.ok) {
      report = {
        tool: "Clipboard",
        tone: "bad",
        verdict: "This browser blocked copying.",
        tip: clipboardAdvice(browser, "write"),
        lines,
      };
    } else {
      report = {
        tool: "Clipboard",
        tone: "warn",
        verdict: "Copying works, but reading the clipboard is blocked.",
        tip: clipboardAdvice(browser, "read"),
        lines,
      };
    }
  }
  useSaveResult("dev-clipboard", report);

  const running = state === "running";

  return (
    <ToolCard
      id="dev-clipboard"
      icon={ClipboardCheck}
      title="Clipboard & clean-paste helper"
      description="Checks whether copy and paste are allowed here, and strips fonts, colours and odd characters from text before you paste it. We never store what's on your clipboard."
      report={report}
      active={running}
      live={
        running
          ? "Testing the clipboard"
          : done && report
            ? report.verdict
            : undefined
      }
      actions={
        <ToolButton
          icon={RefreshCw}
          spinning={running}
          onClick={() => void run()}
          disabled={running}
        >
          {state === "idle"
            ? "Test clipboard"
            : running
              ? "Testing..."
              : "Test again"}
        </ToolButton>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="grid min-w-0 content-start gap-3">
          {state === "idle" && (
            <p className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-5 text-center text-sm font-semibold text-white/60">
              Press Test clipboard. Your browser may ask permission to see the
              clipboard. Choose Allow.
            </p>
          )}
          {running && (
            <ToolNotice title="Look for a prompt">
              If a small &quot;Paste&quot; or &quot;Allow&quot; bubble appears
              near the address bar or cursor, accept it.
            </ToolNotice>
          )}
          {(write || read) && (
            <div
              className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1"
              data-testid="clipboard-results"
            >
              <StatTile
                label="Secure page"
                value={secure ? "Yes (https)" : "No"}
                tone={secure ? "good" : "bad"}
              />
              {write && (
                <Panel title="Copy">
                  <div className="flex items-center gap-2">
                    <Pill tone={write.ok ? "good" : "bad"}>
                      {write.ok ? "Works" : "Blocked"}
                    </Pill>
                  </div>
                  <p className="mt-2 text-xs font-medium text-white/75">
                    {write.detail}
                  </p>
                </Panel>
              )}
              {read && (
                <Panel title="Paste / read">
                  <div className="flex items-center gap-2">
                    <Pill tone={read.ok ? "good" : "warn"}>
                      {read.ok ? "Works" : "Blocked"}
                    </Pill>
                  </div>
                  <p className="mt-2 text-xs font-medium text-white/75">
                    {read.detail}
                  </p>
                </Panel>
              )}
            </div>
          )}
          {done && !secure && (
            <ToolNotice tone="bad" title="This page isn't secure">
              Browsers only allow clipboard access on https pages. Make sure the
              address starts with https://.
            </ToolNotice>
          )}
          {done && (!write.ok || !read.ok) && (
            <ToolNotice tone="warn" title="How to allow it">
              {clipboardAdvice(browser, !write.ok ? "write" : "read")}
            </ToolNotice>
          )}
        </div>

        <Panel
          title="Clean paste"
          icon={<ClipboardPaste className="h-3.5 w-3.5" aria-hidden />}
        >
          <label className="grid gap-1.5 text-sm font-bold">
            Paste your text here
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onPaste={(e) => {
                const html = e.clipboardData?.getData("text/html") ?? "";
                setHadFormatting(html.length > 0);
              }}
              rows={4}
              spellCheck={false}
              placeholder={`Paste with ${env?.os === "macOS" ? "Cmd" : "Ctrl"}+V. Any fonts, colours and links are dropped automatically.`}
              className="min-h-24 resize-y rounded-xl border border-white/15 bg-[#1b1433] p-3 text-sm font-medium text-white outline-none placeholder:text-white/40 focus:border-[#c9b8ff] focus:ring-4 focus:ring-[#7c5cff]/30"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <ToolButton
              variant="ghost"
              icon={ClipboardPaste}
              onClick={() => void pasteFromClipboard()}
            >
              Paste from clipboard
            </ToolButton>
            <ToolButton
              variant="ghost"
              icon={Eraser}
              onClick={() => {
                setRaw("");
                setHadFormatting(null);
                setPasteMsg(null);
              }}
              disabled={!raw}
            >
              Clear
            </ToolButton>
          </div>
          {pasteMsg && (
            <p className="mt-2 text-xs font-semibold text-[#ffd27c]">
              {pasteMsg}
            </p>
          )}
          {hadFormatting !== null && (
            <p className="hf-rise mt-2 text-xs font-semibold text-[#9ee7ff]">
              {hadFormatting
                ? "That text had formatting (fonts, colours or links), now removed."
                : "That text was already plain."}
            </p>
          )}

          <fieldset className="mt-3 grid gap-1.5">
            <legend className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/55">
              Tidy-up options
            </legend>
            {OPTION_LABELS.map(([key, label, hint]) => (
              <label
                key={key}
                className="flex min-h-9 cursor-pointer items-start gap-2.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={opts[key]}
                  onChange={(e) =>
                    setOpts((o) => ({ ...o, [key]: e.target.checked }))
                  }
                  className="mt-1 h-4 w-4 shrink-0 accent-[#a78bfa]"
                />
                <span>
                  <span className="font-bold">{label}</span>
                  <span className="block text-xs font-medium text-white/55">
                    {hint}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="mt-3">
            <p className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-white/55">
              <span>Clean result</span>
              <span className="tabular-nums normal-case">
                {raw.length} to {cleaned.length} characters
              </span>
            </p>
            <pre
              data-testid="clean-output"
              aria-live="polite"
              className="max-h-40 min-h-16 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-[#0a0716] p-3 font-mono text-xs text-white/90"
            >
              {cleaned || "Your cleaned text appears here."}
            </pre>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => void copyClean()}
                disabled={!cleaned}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3.5 text-xs font-extrabold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9b8ff]/40 disabled:opacity-50"
                )}
              >
                {copied === "ok" ? (
                  <Check
                    className="hf-pop h-4 w-4 text-[#5ee0a8]"
                    aria-hidden
                  />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
                <span aria-live="polite">
                  {copied === "ok"
                    ? "Copied!"
                    : copied === "fail"
                      ? "Couldn't copy. Select and copy manually"
                      : "Copy clean text"}
                </span>
              </button>
            </div>
          </div>
        </Panel>
      </div>
    </ToolCard>
  );
}
