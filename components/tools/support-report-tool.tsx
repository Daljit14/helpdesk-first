"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Download,
  FileText,
  RefreshCw,
  Ticket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  batteryReport,
  collectDeviceInfo,
  connectionReport,
  copyText,
  deviceReport,
  getBatteryInfo,
  getPermissionInfo,
  getStorageInfo,
  permissionsReport,
  readConnection,
  storageReport,
  type ToolReport,
} from "./diagnostics";
import {
  formatSupportReport,
  ticketSeed,
  type ReportSection,
} from "./dev-logic";
import { Panel, Pill } from "./dev-shared";
import { getToolResults } from "./tool-results-store";
import { ToolButton, ToolCard, ToolNotice } from "./tool-shell";

type Status = "loading" | "ready" | "error";

function reportBody(r: ToolReport): string {
  return [r.verdict, ...r.lines.map(([l, v]) => `- ${l}: ${v}`)].join("\n");
}

function whenBody(): string {
  let zone = "Unknown";
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
  } catch {
    // keep Unknown
  }
  return `Local time: ${new Date().toString()}\nTime zone: ${zone}`;
}

function fileStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function collect(): Promise<ReportSection[]> {
  const out: ReportSection[] = [];
  try {
    out.push({
      id: "device",
      title: "Device & browser",
      body: reportBody(deviceReport(collectDeviceInfo())),
    });
  } catch {
    // skip
  }
  try {
    const c = readConnection();
    out.push({
      id: "connection",
      title: "Connection (type only, no address)",
      body: reportBody(connectionReport(c.online, c.info)),
    });
  } catch {
    // skip
  }
  const [storage, battery, perms] = await Promise.all([
    safe(getStorageInfo),
    safe(getBatteryInfo),
    safe(getPermissionInfo),
  ]);
  if (storage)
    out.push({
      id: "storage",
      title: "Storage",
      body: reportBody(storageReport(storage)),
    });
  if (battery)
    out.push({
      id: "battery",
      title: "Battery",
      body: reportBody(batteryReport(battery)),
    });
  if (perms)
    out.push({
      id: "permissions",
      title: "Browser permissions",
      body: reportBody(permissionsReport(perms)),
    });
  out.push({ id: "when", title: "Date, time and time zone", body: whenBody() });
  for (const r of getToolResults()) {
    out.push({
      id: `result:${r.id}`,
      title: `Saved result: ${r.title ?? r.id}`,
      body: r.summary,
    });
  }
  return out;
}

export function SupportReportTool() {
  const router = useRouter();
  const runId = useRef(0);
  const navTimer = useRef(0);
  const flashTimer = useRef(0);
  const [status, setStatus] = useState<Status>("loading");
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [contact, setContact] = useState("");
  const [keepPersonal, setKeepPersonal] = useState(false);
  const [flash, setFlash] = useState<{
    tone: "good" | "bad";
    text: string;
  } | null>(null);
  const [stamp, setStamp] = useState<Date | null>(null);

  async function refresh() {
    const my = ++runId.current;
    setStatus("loading");
    try {
      const list = await collect();
      if (runId.current !== my) return;
      setSections(list);
      setChecked((prev) => {
        const next: Record<string, boolean> = {};
        for (const s of list) next[s.id] = prev[s.id] ?? !s.sensitive;
        return next;
      });
      setStamp(new Date());
      setStatus("ready");
    } catch {
      if (runId.current !== my) return;
      setStatus("error");
    }
  }

  useEffect(() => {
    queueMicrotask(() => void refresh());
    return () => {
      runId.current++;
      window.clearTimeout(navTimer.current);
      window.clearTimeout(flashTimer.current);
    };
  }, []);

  const allSections = useMemo<ReportSection[]>(() => {
    const extra: ReportSection[] = [
      {
        id: "contact",
        title: "Contact details I typed",
        body: contact.trim() || "(empty)",
        sensitive: true,
      },
    ];
    return [...sections, ...extra];
  }, [sections, contact]);

  const text = useMemo(
    () =>
      formatSupportReport({
        sections: allSections,
        includeIds: allSections.filter((s) => checked[s.id]).map((s) => s.id),
        note,
        when: stamp,
        allowPersonal: keepPersonal,
      }),
    [allSections, checked, note, stamp, keepPersonal]
  );

  function say(tone: "good" | "bad", msg: string) {
    setFlash({ tone, text: msg });
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 4000);
  }

  async function doCopy() {
    const ok = await copyText(text);
    say(
      ok ? "good" : "bad",
      ok
        ? "Report copied to your clipboard."
        : "Couldn't copy automatically. Select the text and copy it yourself."
    );
  }

  function doDownload() {
    try {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `helpdesk-first-report-${fileStamp()}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      say("good", "Report downloaded as a text file.");
    } catch {
      say("bad", "Couldn't create the file. Use Copy instead.");
    }
  }

  async function doTicket() {
    const ok = await copyText(text);
    say(
      ok ? "good" : "bad",
      ok
        ? "Report copied. Opening support. Paste it into the chat (Ctrl/Cmd+V)."
        : "Opening support. Copy the report text first, then paste it into the chat."
    );
    window.clearTimeout(navTimer.current);
    navTimer.current = window.setTimeout(() => {
      router.push(
        `/assistant?q=${encodeURIComponent(ticketSeed(note))}&intent=human`
      );
    }, 900);
  }

  const loading = status === "loading";
  const resultSections = sections.filter((s) => s.id.startsWith("result:"));
  const autoSections = sections.filter((s) => !s.id.startsWith("result:"));

  return (
    <ToolCard
      id="support-report"
      icon={FileText}
      title="Support report builder"
      description="Bundles your device details and any checks you've run into one report for IT. You choose what goes in. Nothing is sent until you copy or submit it."
      active={loading}
      live={flash?.text ?? (loading ? "Collecting details" : undefined)}
      actions={
        <ToolButton
          icon={RefreshCw}
          spinning={loading}
          onClick={() => void refresh()}
          disabled={loading}
        >
          Refresh details
        </ToolButton>
      }
    >
      {status === "error" && (
        <div className="mb-4">
          <ToolNotice tone="bad" title="Couldn't collect device details">
            You can still describe the problem below and copy the report.
          </ToolNotice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="grid min-w-0 content-start gap-3">
          <Panel title="1 · Describe the problem">
            <label className="grid gap-1.5 text-sm font-bold">
              What&apos;s going wrong?
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 2000))}
                rows={4}
                placeholder="For example: my camera works in this test but Teams shows a black screen since Monday."
                className="resize-y rounded-xl border border-white/15 bg-[#1b1433] p-3 text-sm font-medium text-white outline-none placeholder:text-white/40 focus:border-[#c9b8ff] focus:ring-4 focus:ring-[#7c5cff]/30"
              />
            </label>
            <label className="mt-2 flex items-start gap-2.5 text-xs font-medium text-white/70">
              <input
                type="checkbox"
                checked={keepPersonal}
                onChange={(e) => setKeepPersonal(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#a78bfa]"
              />
              Keep email addresses and IP addresses I typed. Otherwise they are
              hidden automatically.
            </label>
          </Panel>

          <Panel title="2 · Choose what to include">
            {loading && sections.length === 0 && (
              <p className="text-sm font-semibold text-white/60">
                Collecting...
              </p>
            )}
            <ul
              className="grid grid-cols-[minmax(0,1fr)] gap-1.5"
              data-testid="report-sections"
            >
              {autoSections.map((s) => (
                <SectionRow
                  key={s.id}
                  section={s}
                  checked={!!checked[s.id]}
                  onChange={(v) => setChecked((c) => ({ ...c, [s.id]: v }))}
                />
              ))}
            </ul>
            <p className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-white/55">
              Results from other tools
            </p>
            {resultSections.length === 0 ? (
              <p className="text-xs font-medium text-white/55">
                None yet. Run a test (camera, printer, clock...) in this tab and
                its result appears here.
              </p>
            ) : (
              <ul
                className="grid grid-cols-[minmax(0,1fr)] gap-1.5"
                data-testid="saved-results"
              >
                {resultSections.map((s) => (
                  <SectionRow
                    key={s.id}
                    section={s}
                    checked={!!checked[s.id]}
                    onChange={(v) => setChecked((c) => ({ ...c, [s.id]: v }))}
                  />
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="3 · Optional contact details">
            <label className="flex items-start gap-2.5 text-sm font-bold">
              <input
                type="checkbox"
                checked={!!checked.contact}
                onChange={(e) =>
                  setChecked((c) => ({ ...c, contact: e.target.checked }))
                }
                className="mt-1 h-4 w-4 shrink-0 accent-[#a78bfa]"
              />
              <span>
                Include contact details
                <span className="block text-xs font-medium text-white/55">
                  Off by default. Add your name, phone or a good time to reach
                  you.
                </span>
              </span>
            </label>
            {checked.contact && (
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value.slice(0, 300))}
                aria-label="Contact details"
                placeholder="Name, phone or email"
                className="hf-rise mt-2 h-11 w-full rounded-xl border border-white/15 bg-[#1b1433] px-3 text-sm font-medium text-white outline-none placeholder:text-white/40 focus:border-[#c9b8ff] focus:ring-4 focus:ring-[#7c5cff]/30"
              />
            )}
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-3">
          <Panel title={`Your report · ${text.length} characters`}>
            <pre
              data-testid="report-preview"
              tabIndex={0}
              aria-label="Final report text"
              className="max-h-96 min-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-[#0a0716] p-3 font-mono text-xs leading-relaxed text-white/90 outline-none focus-visible:ring-4 focus-visible:ring-[#c9b8ff]/40"
            >
              {text}
            </pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <ToolButton
                variant="ghost"
                icon={Copy}
                onClick={() => void doCopy()}
              >
                Copy
              </ToolButton>
              <ToolButton variant="ghost" icon={Download} onClick={doDownload}>
                Download .txt
              </ToolButton>
              <ToolButton icon={Ticket} onClick={() => void doTicket()}>
                Create a ticket with this report
              </ToolButton>
            </div>
            {flash && (
              <p
                role="status"
                className={cn(
                  "hf-rise mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm font-bold",
                  flash.tone === "good"
                    ? "border-[#5ee0a8]/30 bg-[#5ee0a8]/10 text-[#d1fae5]"
                    : "border-[#ff9bb3]/30 bg-[#ff9bb3]/10 text-[#ffe4ea]"
                )}
              >
                {flash.tone === "good" && (
                  <Check
                    className="hf-pop mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden
                  />
                )}
                {flash.text}
              </p>
            )}
          </Panel>
        </div>
      </div>
    </ToolCard>
  );
}

function SectionRow({
  section,
  checked,
  onChange,
}: {
  section: ReportSection;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const first = section.body.split("\n")[0];
  return (
    <li className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <label className="flex min-h-9 cursor-pointer items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-[#a78bfa]"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 font-bold">
            {section.title}
            {section.sensitive && <Pill tone="warn">Personal</Pill>}
          </span>
          <span className="block truncate text-xs font-medium text-white/55">
            {first}
          </span>
        </span>
      </label>
    </li>
  );
}
