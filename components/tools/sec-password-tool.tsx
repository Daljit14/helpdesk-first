"use client";

import { useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Dices,
  Eye,
  EyeOff,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { copyText, type ToolReport } from "./diagnostics";
import {
  assessPassword,
  generatePassphrase,
  generatePassword,
  passphraseEntropyBits,
  passwordEntropyBits,
} from "./net-sec-logic";
import { errorMessage, pwnedCount, secureFill } from "./net-probe";
import { Panel, SectionLabel, SegmentMeter, fieldClass } from "./net-sec-ui";
import {
  StatTile,
  ToolButton,
  ToolCard,
  ToolNotice,
  ToneIcon,
  Verdict,
} from "./tool-shell";

const CHARSET_SHORT: Record<string, string> = {
  lowercase: "a-z",
  uppercase: "A-Z",
  numbers: "0-9",
  symbols: "!@#",
  unicode: "unicode",
};

type Mode = "check" | "generate";
type Breach =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "found"; count: number }
  | { state: "clean" }
  | { state: "error"; message: string };

export function SecPasswordTool() {
  const [mode, setMode] = useState<Mode>("check");
  return (
    <ToolCard
      id="sec-password"
      icon={KeyRound}
      title="Password strength & generator"
      description="Check how strong a password is, or make a new one. Everything runs in your browser — your password is never saved or sent anywhere unless you press the breach-check button."
      actions={
        <div role="group" aria-label="Mode" className="flex gap-2">
          <ToolButton
            variant="ghost"
            aria-pressed={mode === "check"}
            onClick={() => setMode("check")}
          >
            Test a password
          </ToolButton>
          <ToolButton
            variant="ghost"
            aria-pressed={mode === "generate"}
            onClick={() => setMode("generate")}
          >
            Make a password
          </ToolButton>
        </div>
      }
    >
      {mode === "check" ? <Checker /> : <Generator />}
    </ToolCard>
  );
}

function Checker() {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [breach, setBreach] = useState<Breach>({ state: "idle" });
  const a = useMemo(() => assessPassword(pw), [pw]);
  const req = useRef(0);

  function onChange(v: string) {
    setPw(v);
    req.current = (req.current ?? 0) + 1; // ignore any breach lookup still in flight for older text
    setBreach({ state: "idle" }); // result belongs to the previous text
  }

  async function checkBreach() {
    const checked = pw;
    const mine = (req.current = (req.current ?? 0) + 1);
    setBreach({ state: "loading" });
    try {
      const count = await pwnedCount(checked);
      if (mine !== req.current) return;
      setBreach(count > 0 ? { state: "found", count } : { state: "clean" });
    } catch (err) {
      if (mine !== req.current) return;
      const m = errorMessage(err);
      setBreach({
        state: "error",
        message: m === "timed out" ? "The breach service timed out." : m,
      });
    }
  }

  const has = pw.length > 0;
  const report: ToolReport | null = has
    ? {
        tool: "Password strength",
        tone: breach.state === "found" ? "bad" : a.tone,
        verdict:
          breach.state === "found"
            ? `${a.label} — and found in known data breaches`
            : a.label,
        tip:
          breach.state === "found"
            ? "Stop using this password everywhere and pick a new one. Attackers already have it."
            : a.score >= 3
              ? "Good length and variety. Use it for one account only and store it in a password manager."
              : (a.warnings[0] ??
                a.suggestions[0] ??
                "Make it longer and less predictable."),
        lines: [
          ["Strength", `${a.label} (about ${Math.round(a.bits)} bits)`],
          [
            "Estimated crack time",
            `${a.crackTime} (offline attack, 10 billion guesses/s)`,
          ],
          ["Length", `${a.length} characters`],
          [
            "Seen in breaches",
            breach.state === "found"
              ? `Yes (${breach.count.toLocaleString()} times)`
              : breach.state === "clean"
                ? "Not found"
                : "Not checked",
          ],
        ],
      }
    : null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="sec-pw-input">
          <SectionLabel>Type or paste a password to test</SectionLabel>
        </label>
        <div className="flex gap-2">
          <input
            id="sec-pw-input"
            type={show ? "text" : "password"}
            value={pw}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={256}
            data-lpignore="true"
            data-1p-ignore="true"
            name="hf-pw-strength-test"
            placeholder="Don't use a password you rely on if you're unsure"
            className={cn(fieldClass, "font-mono")}
          />
          <ToolButton
            variant="ghost"
            icon={show ? EyeOff : Eye}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            onClick={() => setShow((s) => !s)}
            className="shrink-0"
          >
            <span className="sr-only sm:not-sr-only">
              {show ? "Hide" : "Show"}
            </span>
          </ToolButton>
        </div>
      </div>

      {!has ? (
        <p className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-5 text-center text-sm font-semibold text-white/60">
          Strength is estimated on this device. Nothing you type is logged or
          stored.
        </p>
      ) : (
        <div className="grid gap-4">
          <Panel className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-lg font-extrabold">
                <ToneIcon tone={a.tone} className="h-5 w-5" />
                {a.label}
              </p>
              <p className="text-xs font-bold tabular-nums text-white/60">
                ~{Math.round(a.bits)} bits
              </p>
            </div>
            <SegmentMeter
              filled={a.score + 1}
              total={5}
              tone={a.tone}
              label={`Password strength: ${a.label}`}
            />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <StatTile
                label="Could be cracked in"
                value={a.crackTime}
                tone={a.tone}
              />
              <StatTile label="Length" value={`${a.length}`} />
              <StatTile
                label="Character types"
                value={
                  a.charsets.map((c) => CHARSET_SHORT[c] ?? c).join(" ") || "—"
                }
              />
            </div>
            <p className="text-xs font-semibold text-white/55">
              Estimate assumes an attacker with stolen password hashes trying 10
              billion guesses per second. Real sites are usually slower, but
              data leaks happen.
            </p>
          </Panel>

          {(a.warnings.length > 0 || a.suggestions.length > 0) && (
            <Panel>
              <ul className="grid gap-1.5 text-sm font-medium">
                {a.warnings.map((w) => (
                  <li key={w} className="flex gap-2 text-[#ffe4ea]">
                    <ShieldAlert
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#ff9bb3]"
                      aria-hidden
                    />
                    {w}
                  </li>
                ))}
                {a.suggestions.map((s) => (
                  <li key={s} className="flex gap-2 text-white/80">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#5ee0a8]"
                      aria-hidden
                    />
                    {s}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-sm font-extrabold">
                  Has it appeared in a data breach?
                </p>
                <p className="mt-1 text-xs font-semibold text-white/60">
                  Private by design (k-anonymity): your browser hashes the
                  password and sends only the first 5 characters of the hash to
                  Have I Been Pwned. The password itself never leaves this page.
                </p>
              </div>
              <ToolButton
                icon={ShieldCheck}
                disabled={breach.state === "loading"}
                onClick={checkBreach}
              >
                {breach.state === "loading"
                  ? "Checking…"
                  : breach.state === "idle"
                    ? "Check for breaches"
                    : "Check again"}
              </ToolButton>
            </div>
            {breach.state === "found" && (
              <ToolNotice
                tone="bad"
                title={`Found ${breach.count.toLocaleString()} times in known breaches`}
              >
                Don&apos;t use this password anywhere. Change it on any account
                that uses it.
              </ToolNotice>
            )}
            {breach.state === "clean" && (
              <ToolNotice tone="good" title="Not found in known breaches">
                That doesn&apos;t guarantee it&apos;s safe — it just hasn&apos;t
                shown up in leaked lists yet.
              </ToolNotice>
            )}
            {breach.state === "error" && (
              <ToolNotice tone="warn" title="Couldn't check right now">
                {breach.message} Your password was not sent anywhere. Try again
                later.
              </ToolNotice>
            )}
          </Panel>
        </div>
      )}
      {/* The report never contains the password itself. */}
      {report && <Verdict report={report} />}
    </div>
  );
}

function Generator() {
  const [kind, setKind] = useState<"random" | "phrase">("random");
  const [length, setLength] = useState(16);
  const [symbols, setSymbols] = useState(true);
  const [lookalikes, setLookalikes] = useState(false);
  const [words, setWords] = useState(6);
  const [number, setNumber] = useState(true);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const [hidden, setHidden] = useState(false);

  const bits =
    kind === "random"
      ? passwordEntropyBits({ length, symbols, avoidLookalikes: lookalikes })
      : passphraseEntropyBits({ words, addNumber: number });

  function generate() {
    try {
      setError("");
      setValue(
        kind === "random"
          ? generatePassword(
              { length, symbols, avoidLookalikes: lookalikes },
              secureFill
            )
          : generatePassphrase(
              { words, separator: "-", capitalize: true, addNumber: number },
              secureFill
            )
      );
      setCopied("idle");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function copy() {
    const ok = await copyText(value);
    setCopied(ok ? "ok" : "fail");
    window.setTimeout(() => setCopied("idle"), 2500);
  }

  const strength =
    bits < 60
      ? { l: "Fair", t: "warn" as const }
      : bits < 80
        ? { l: "Strong", t: "good" as const }
        : { l: "Very strong", t: "good" as const };

  return (
    <div className="grid gap-4">
      <div
        role="group"
        aria-label="Generator type"
        className="flex flex-wrap gap-2"
      >
        <ToolButton
          variant="ghost"
          aria-pressed={kind === "random"}
          onClick={() => {
            setKind("random");
            setValue("");
          }}
        >
          Random password
        </ToolButton>
        <ToolButton
          variant="ghost"
          aria-pressed={kind === "phrase"}
          onClick={() => {
            setKind("phrase");
            setValue("");
          }}
        >
          Passphrase (words)
        </ToolButton>
      </div>

      <Panel className="grid gap-3">
        {kind === "random" ? (
          <>
            <label className="grid gap-1.5">
              <span className="flex items-center justify-between text-sm font-extrabold">
                Length{" "}
                <span className="tabular-nums text-[#c9b8ff]">{length}</span>
              </span>
              <input
                type="range"
                min={8}
                max={64}
                value={length}
                onChange={(e) => setLength(Number(e.target.value))}
                className="w-full accent-[#a78bfa]"
              />
            </label>
            <Toggle
              label="Include symbols (!@#$…)"
              checked={symbols}
              onChange={setSymbols}
            />
            <Toggle
              label="Avoid look-alike characters (I, l, 1, O, 0)"
              checked={lookalikes}
              onChange={setLookalikes}
            />
          </>
        ) : (
          <>
            <label className="grid gap-1.5">
              <span className="flex items-center justify-between text-sm font-extrabold">
                Number of words{" "}
                <span className="tabular-nums text-[#c9b8ff]">{words}</span>
              </span>
              <input
                type="range"
                min={4}
                max={10}
                value={words}
                onChange={(e) => setWords(Number(e.target.value))}
                className="w-full accent-[#a78bfa]"
              />
            </label>
            <Toggle
              label="Add a number"
              checked={number}
              onChange={setNumber}
            />
          </>
        )}
        <p className="text-xs font-semibold text-white/60">
          About {Math.round(bits)} bits of randomness —{" "}
          <span
            className={
              strength.t === "good" ? "text-[#5ee0a8]" : "text-[#ffd27c]"
            }
          >
            {strength.l}
          </span>
          .
          {kind === "phrase" &&
            bits < 60 &&
            " Add more words for extra strength."}
        </p>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <ToolButton icon={Dices} onClick={generate}>
          {value ? "Generate another" : "Generate"}
        </ToolButton>
      </div>
      {error && (
        <ToolNotice tone="bad" title="Couldn't generate">
          {error}
        </ToolNotice>
      )}

      {value && (
        <Panel className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>
              Your new {kind === "random" ? "password" : "passphrase"}
            </SectionLabel>
            <button
              type="button"
              onClick={() => setHidden((h) => !h)}
              aria-pressed={hidden}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-extrabold text-[#c9b8ff] hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9b8ff]/40"
            >
              {hidden ? (
                <Eye className="h-4 w-4" aria-hidden />
              ) : (
                <EyeOff className="h-4 w-4" aria-hidden />
              )}
              {hidden ? "Show" : "Hide"}
            </button>
          </div>
          <p
            className="hf-pop break-all rounded-xl bg-black/30 px-3 py-3 font-mono text-lg font-bold tracking-wide"
            data-testid="generated-secret"
          >
            {hidden ? "•".repeat(Math.min(value.length, 40)) : value}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <ToolButton
              variant="ghost"
              icon={copied === "ok" ? Check : Copy}
              onClick={copy}
            >
              {copied === "ok"
                ? "Copied!"
                : copied === "fail"
                  ? "Couldn't copy — select it manually"
                  : "Copy"}
            </ToolButton>
            <p className="min-w-0 flex-1 basis-48 text-xs font-semibold text-white/60">
              Paste it into your password manager, then clear your clipboard
              (copy any other text) — this page can&apos;t do it for you. Never
              reuse it.
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm font-semibold text-white/85">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-[#a78bfa]"
      />
      {label}
    </label>
  );
}
