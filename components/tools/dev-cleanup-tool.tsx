"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Database,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes, type ReportLine, type ToolReport } from "./diagnostics";
import {
  cacheClearSteps,
  isAuthCookieName,
  splitCookieNames,
  storageBytes,
  type SiteUsage,
} from "./dev-logic";
import {
  Panel,
  StepList,
  useEnv,
  useSaveResult,
  withTimeout,
} from "./dev-shared";
import { StatTile, ToolButton, ToolCard, ToolNotice } from "./tool-shell";

type Status = "idle" | "loading" | "ready" | "error";
type Action =
  | "caches"
  | "workers"
  | "reload"
  | "session"
  | "local"
  | "cookies"
  | "auth-cookies";

const ACTION_COPY: Record<
  Action,
  { title: string; body: string; button: string; danger?: boolean }
> = {
  caches: {
    title: "Clear this site's cached files?",
    body: "Deletes the saved copies of pages and files this site keeps for speed. You stay signed in and no settings are lost. The next page load may be a little slower.",
    button: "Clear cached files",
  },
  workers: {
    title: "Remove this site's service workers?",
    body: "Service workers are background helpers that enable offline use and notifications. They are re-created the next time you visit. You stay signed in.",
    button: "Remove service workers",
  },
  reload: {
    title: "Clear app cache and reload?",
    body: "Deletes cached files, removes service workers and reloads the page so you get a fresh copy. You stay signed in and keep your settings.",
    button: "Clear and reload",
  },
  session: {
    title: "Clear this tab's temporary data?",
    body: "Removes short-term data this tab remembers, including saved tool results used by the Support report builder. It does not sign you out.",
    button: "Clear temporary data",
  },
  local: {
    title: "Clear saved preferences?",
    body: "Removes everything this site saved in your browser's local storage, such as remembered choices and unsent drafts. Some sites keep sign-in details here, so you may be signed out.",
    button: "Clear saved preferences",
    danger: true,
  },
  cookies: {
    title: "Clear non-sign-in cookies?",
    body: "Deletes small preference cookies this page can see. Cookies that look like sign-in or session cookies are kept, so you stay signed in.",
    button: "Clear cookies (keep sign-in)",
  },
  "auth-cookies": {
    title: "Sign out by clearing sign-in cookies?",
    body: "WARNING: this deletes the cookies that keep you signed in. You will be signed out of this site and may need your password and a one-time code to sign back in. Only do this if support asked you to.",
    button: "Yes, sign me out",
    danger: true,
  },
};

function listCookies(): string[] {
  try {
    return splitCookieNames(document.cookie);
  } catch {
    return [];
  }
}

function expireCookie(name: string) {
  const host = window.location.hostname;
  const parts = host.split(".");
  const domains = [
    "",
    host,
    ...(parts.length > 2 ? [`.${parts.slice(-2).join(".")}`] : []),
    `.${host}`,
  ];
  for (const d of domains) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d ? `; domain=${d}` : ""}`;
  }
}

async function readUsage(): Promise<SiteUsage & { cacheList: string[] }> {
  let localItems: Array<[string, string]> = [];
  let sessionItems = 0;
  try {
    localItems = Object.keys(window.localStorage).map(
      (k) => [k, window.localStorage.getItem(k) ?? ""] as [string, string]
    );
  } catch {
    // blocked
  }
  try {
    sessionItems = window.sessionStorage.length;
  } catch {
    // blocked
  }
  let cacheList: string[] = [];
  try {
    if ("caches" in window) cacheList = await withTimeout(caches.keys(), 4000);
  } catch {
    // unavailable
  }
  let workers = 0;
  try {
    if ("serviceWorker" in navigator)
      workers = (
        await withTimeout(navigator.serviceWorker.getRegistrations(), 4000)
      ).length;
  } catch {
    // unavailable
  }
  let idb: number | null = null;
  try {
    const f = (
      indexedDB as IDBFactory & { databases?: () => Promise<unknown[]> }
    ).databases;
    if (typeof f === "function")
      idb = (await withTimeout(f.call(indexedDB), 4000)).length;
  } catch {
    idb = null;
  }
  let usage: number | null = null;
  let quota: number | null = null;
  try {
    const est = await withTimeout(navigator.storage.estimate(), 4000);
    usage = est.usage ?? null;
    quota = est.quota ?? null;
  } catch {
    // unavailable
  }
  return {
    cookies: listCookies().length,
    localStorageItems: localItems.length,
    localStorageBytes: storageBytes(localItems),
    sessionStorageItems: sessionItems,
    cacheNames: cacheList.length,
    serviceWorkers: workers,
    indexedDbs: idb,
    usageBytes: usage,
    quotaBytes: quota,
    cacheList,
  };
}

export function DevCleanupTool() {
  const env = useEnv();
  const runId = useRef(0);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [usage, setUsage] = useState<
    (SiteUsage & { cacheList: string[] }) | null
  >(null);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "good" | "bad";
    text: string;
  } | null>(null);
  const [authCookies, setAuthCookies] = useState(0);

  async function refresh() {
    const my = ++runId.current;
    setStatus("loading");
    try {
      const u = await readUsage();
      if (runId.current !== my) return;
      setUsage(u);
      setAuthCookies(listCookies().filter(isAuthCookieName).length);
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
    };
  }, []);

  useEffect(() => {
    if (confirm) confirmRef.current?.focus();
  }, [confirm]);

  async function clearCaches(): Promise<number> {
    if (!("caches" in window)) return 0;
    const names = await withTimeout(caches.keys(), 5000);
    await Promise.all(names.map((n) => caches.delete(n)));
    return names.length;
  }
  async function clearWorkers(): Promise<number> {
    if (!("serviceWorker" in navigator)) return 0;
    const regs = await withTimeout(
      navigator.serviceWorker.getRegistrations(),
      5000
    );
    await Promise.all(regs.map((r) => r.unregister()));
    return regs.length;
  }

  async function perform(action: Action) {
    setBusy(true);
    setMessage(null);
    try {
      let text = "";
      if (action === "caches") {
        const n = await clearCaches();
        text = n
          ? `Cleared ${n} cache${n === 1 ? "" : "s"}.`
          : "There were no cached files to clear.";
      } else if (action === "workers") {
        const n = await clearWorkers();
        text = n
          ? `Removed ${n} service worker${n === 1 ? "" : "s"}.`
          : "There were no service workers to remove.";
      } else if (action === "reload") {
        const c = await clearCaches();
        const w = await clearWorkers();
        setMessage({
          tone: "good",
          text: `Cleared ${c} cache(s) and ${w} service worker(s). Reloading...`,
        });
        window.setTimeout(() => window.location.reload(), 400);
        return;
      } else if (action === "session") {
        window.sessionStorage.clear();
        text = "Temporary tab data cleared.";
      } else if (action === "local") {
        const n = window.localStorage.length;
        window.localStorage.clear();
        text = `Cleared ${n} saved preference${n === 1 ? "" : "s"}.`;
      } else if (action === "cookies") {
        const names = listCookies().filter((n) => !isAuthCookieName(n));
        names.forEach(expireCookie);
        text = names.length
          ? `Cleared ${names.length} cookie${names.length === 1 ? "" : "s"}. Sign-in cookies were kept.`
          : "No removable cookies were visible to this page.";
      } else {
        const names = listCookies().filter(isAuthCookieName);
        names.forEach(expireCookie);
        text = names.length
          ? `Removed ${names.length} sign-in cookie${names.length === 1 ? "" : "s"}. Reload the page to sign in again.`
          : "No sign-in cookies were visible to this page (the browser may hide them for security).";
      }
      setMessage({ tone: "good", text });
    } catch {
      setMessage({
        tone: "bad",
        text: "That didn't finish. Your browser may block it. Use the browser steps below instead.",
      });
    } finally {
      setBusy(false);
      setConfirm(null);
      void refresh();
    }
  }

  const lines: ReportLine[] = usage
    ? [
        [
          "Cookies visible to this page",
          `${usage.cookies} (${authCookies} look like sign-in cookies)`,
        ],
        [
          "Saved preferences (localStorage)",
          `${usage.localStorageItems} item(s), about ${formatBytes(usage.localStorageBytes)}`,
        ],
        ["Tab data (sessionStorage)", `${usage.sessionStorageItems} item(s)`],
        ["Cached file groups", String(usage.cacheNames)],
        ["Service workers", String(usage.serviceWorkers)],
        [
          "IndexedDB databases",
          usage.indexedDbs === null ? "Not reported" : String(usage.indexedDbs),
        ],
        [
          "Total site storage",
          usage.usageBytes === null
            ? "Not reported"
            : `${formatBytes(usage.usageBytes)}${usage.quotaBytes ? ` of ${formatBytes(usage.quotaBytes)}` : ""}`,
        ],
      ]
    : [];
  const report: ToolReport | null = usage
    ? {
        tool: "Browser clean-up",
        tone: "info",
        verdict:
          usage.usageBytes !== null
            ? `This site is using about ${formatBytes(usage.usageBytes)} of your browser's storage.`
            : "Here is what this site has saved in your browser.",
        tip: "Stale cached files and old service workers are a common reason a page looks broken or shows an old version. Clearing the app cache is safe: it keeps you signed in.",
        lines,
      }
    : null;
  useSaveResult("dev-cleanup", report);

  const steps = env ? cacheClearSteps(env.browser, env.os) : null;
  const loading = status === "loading";

  return (
    <ToolCard
      id="dev-cleanup"
      icon={Database}
      title="Browser clean-up helper"
      description="See what this site has saved in your browser and clear it safely. Only this site is touched; other sites and your history are not."
      report={report}
      active={loading || busy}
      live={busy ? "Working" : message?.text}
      actions={
        <ToolButton
          icon={RefreshCw}
          spinning={loading}
          onClick={() => void refresh()}
          disabled={loading || busy}
        >
          Refresh
        </ToolButton>
      }
    >
      {status === "error" && (
        <ToolNotice tone="bad" title="Couldn't read this site's storage">
          Your browser blocked access (private mode or a policy). You can still
          use the browser steps below.
        </ToolNotice>
      )}
      {loading && !usage && (
        <p
          className="text-center text-sm font-semibold text-white/60"
          aria-hidden
        >
          Looking at what this site saved...
        </p>
      )}

      {usage && (
        <div className="grid gap-4">
          <div
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
            data-testid="usage-tiles"
          >
            <StatTile
              label="Total storage"
              value={
                usage.usageBytes === null
                  ? "Not reported"
                  : formatBytes(usage.usageBytes)
              }
            />
            <StatTile
              label="Cached groups"
              value={String(usage.cacheNames)}
              delay={0.03}
            />
            <StatTile
              label="Service workers"
              value={String(usage.serviceWorkers)}
              delay={0.06}
            />
            <StatTile
              label="Cookies seen"
              value={String(usage.cookies)}
              delay={0.09}
            />
            <StatTile
              label="Preferences"
              value={`${usage.localStorageItems} · ${formatBytes(usage.localStorageBytes)}`}
              delay={0.12}
            />
            <StatTile
              label="Tab data"
              value={String(usage.sessionStorageItems)}
              delay={0.15}
            />
            <StatTile
              label="IndexedDB"
              value={
                usage.indexedDbs === null
                  ? "Not reported"
                  : String(usage.indexedDbs)
              }
              delay={0.18}
            />
            <StatTile
              label="Browser limit"
              value={
                usage.quotaBytes === null ? "-" : formatBytes(usage.quotaBytes)
              }
              delay={0.21}
            />
          </div>

          <Panel title="Safe clean-up (keeps you signed in)">
            <div className="flex flex-wrap gap-2">
              <ToolButton
                icon={RefreshCw}
                onClick={() => setConfirm("reload")}
                disabled={busy}
              >
                Clear app cache and reload
              </ToolButton>
              <ToolButton
                variant="ghost"
                icon={Trash2}
                onClick={() => setConfirm("caches")}
                disabled={busy || usage.cacheNames === 0}
              >
                Clear cached files
              </ToolButton>
              <ToolButton
                variant="ghost"
                icon={Trash2}
                onClick={() => setConfirm("workers")}
                disabled={busy || usage.serviceWorkers === 0}
              >
                Remove service workers
              </ToolButton>
            </div>
            {usage.cacheList.length > 0 && (
              <p className="mt-2 break-words text-xs font-medium text-white/50">
                Cache names: {usage.cacheList.join(", ")}
              </p>
            )}
          </Panel>

          <details className="group rounded-2xl border border-white/10 bg-white/5 p-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-extrabold outline-none focus-visible:ring-4 focus-visible:ring-[#c9b8ff]/40 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-[#ffd27c]" aria-hidden />
              More options (may sign you out)
              <ChevronDown
                className="ml-auto h-4 w-4 text-white/60 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              <ToolButton
                variant="ghost"
                onClick={() => setConfirm("session")}
                disabled={busy}
              >
                Clear temporary tab data
              </ToolButton>
              <ToolButton
                variant="ghost"
                onClick={() => setConfirm("cookies")}
                disabled={busy}
              >
                Clear cookies (keep sign-in)
              </ToolButton>
              <ToolButton
                variant="danger"
                onClick={() => setConfirm("local")}
                disabled={busy}
              >
                Clear saved preferences
              </ToolButton>
              <ToolButton
                variant="danger"
                onClick={() => setConfirm("auth-cookies")}
                disabled={busy}
              >
                Sign out (clear sign-in cookies)
              </ToolButton>
            </div>
          </details>

          {confirm && (
            <div
              role="alertdialog"
              aria-modal="false"
              aria-labelledby="cleanup-confirm-title"
              aria-describedby="cleanup-confirm-body"
              onKeyDown={(e) => {
                if (e.key === "Escape") setConfirm(null);
              }}
              className={cn(
                "hf-rise rounded-2xl border p-4",
                ACTION_COPY[confirm].danger
                  ? "border-[#ff9bb3]/40 bg-[#ff9bb3]/10"
                  : "border-[#c9b8ff]/40 bg-[#7c5cff]/15"
              )}
            >
              <p id="cleanup-confirm-title" className="font-extrabold">
                {ACTION_COPY[confirm].title}
              </p>
              <p
                id="cleanup-confirm-body"
                className="mt-1 text-sm font-medium text-white/85"
              >
                {ACTION_COPY[confirm].body}
              </p>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  ref={confirmRef}
                  type="button"
                  onClick={() => setConfirm(null)}
                  className="min-h-10 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-extrabold hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9b8ff]/40"
                >
                  Cancel
                </button>
                <ToolButton
                  variant={ACTION_COPY[confirm].danger ? "danger" : "primary"}
                  onClick={() => void perform(confirm)}
                  disabled={busy}
                >
                  {busy ? "Working..." : ACTION_COPY[confirm].button}
                </ToolButton>
              </div>
            </div>
          )}

          {message && (
            <ToolNotice
              tone={message.tone}
              title={message.tone === "good" ? "Done" : "Couldn't finish"}
            >
              {message.text}
            </ToolNotice>
          )}
        </div>
      )}

      {steps && (
        <Panel
          title={`Clear the whole browser cache · ${steps.title}`}
          className="mt-4"
        >
          <StepList steps={steps.steps} />
        </Panel>
      )}
    </ToolCard>
  );
}
