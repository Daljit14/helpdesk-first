"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Keyboard, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolReport } from "./diagnostics";
import { ToolButton, ToolCard } from "./tool-shell";

type Cap = { code: string; label: string; w?: number };

const ROWS: Cap[][] = [
  [
    { code: "Backquote", label: "`" },
    ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => ({
      code: `Digit${d}`,
      label: d,
    })),
    { code: "Minus", label: "-" },
    { code: "Equal", label: "=" },
    { code: "Backspace", label: "⌫", w: 2 },
  ],
  [
    { code: "Tab", label: "Tab", w: 1.5 },
    ..."QWERTYUIOP".split("").map((k) => ({ code: `Key${k}`, label: k })),
    { code: "BracketLeft", label: "[" },
    { code: "BracketRight", label: "]" },
    { code: "Backslash", label: "\\", w: 1.5 },
  ],
  [
    { code: "CapsLock", label: "Caps", w: 1.8 },
    ..."ASDFGHJKL".split("").map((k) => ({ code: `Key${k}`, label: k })),
    { code: "Semicolon", label: ";" },
    { code: "Quote", label: "'" },
    { code: "Enter", label: "Enter", w: 2.2 },
  ],
  [
    { code: "ShiftLeft", label: "Shift", w: 2.4 },
    ..."ZXCVBNM".split("").map((k) => ({ code: `Key${k}`, label: k })),
    { code: "Comma", label: "," },
    { code: "Period", label: "." },
    { code: "Slash", label: "/" },
    { code: "ShiftRight", label: "Shift", w: 2.6 },
  ],
  [
    { code: "ControlLeft", label: "Ctrl", w: 1.4 },
    { code: "MetaLeft", label: "⊞/⌘", w: 1.4 },
    { code: "AltLeft", label: "Alt", w: 1.4 },
    { code: "Space", label: "Space", w: 6 },
    { code: "AltRight", label: "Alt", w: 1.4 },
    { code: "ArrowLeft", label: "←" },
    { code: "ArrowUp", label: "↑" },
    { code: "ArrowDown", label: "↓" },
    { code: "ArrowRight", label: "→" },
  ],
];

const LABELS: Record<string, string> = Object.fromEntries(
  ROWS.flat().map((c) => [c.code, c.label])
);

function labelFor(code: string, key: string) {
  if (LABELS[code] && LABELS[code] !== "Shift" && LABELS[code] !== "Alt")
    return LABELS[code];
  if (code.endsWith("Left") || code.endsWith("Right")) {
    const base = code.replace(/(Left|Right)$/, "");
    if (["Shift", "Control", "Alt", "Meta"].includes(base)) {
      return `${base === "Control" ? "Ctrl" : base} (${code.endsWith("Left") ? "L" : "R"})`;
    }
  }
  if (key === " ") return "Space";
  return key.length === 1 ? key.toUpperCase() : key || code;
}

const STUCK_REPEATS = 30;

export function KeyboardTool() {
  const [seen, setSeen] = useState<Record<string, true>>({});
  const [down, setDown] = useState<Record<string, true>>({});
  const [last, setLast] = useState<Array<{ id: number; label: string }>>([]);
  const repeatsRef = useRef<Record<string, number>>({});
  const [stuck, setStuck] = useState<{ code: string; label: string } | null>(
    null
  );
  const [count, setCount] = useState(0);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Tab") return; // keep keyboard navigation working
    if (e.key === "Escape") {
      e.currentTarget.blur();
      return;
    }
    e.preventDefault();
    const code = e.code || e.key;
    const label = labelFor(code, e.key);
    setDown((d) => ({ ...d, [code]: true }));
    if (e.repeat) {
      const n = (repeatsRef.current[code] ?? 0) + 1;
      repeatsRef.current[code] = n;
      if (n === STUCK_REPEATS) setStuck({ code, label });
      return;
    }
    setSeen((s) => ({ ...s, [code]: true }));
    setCount((c) => c + 1);
    setLast((l) =>
      [{ id: Date.now() + Math.random(), label }, ...l].slice(0, 10)
    );
  }

  function onKeyUp(e: KeyboardEvent<HTMLDivElement>) {
    const code = e.code || e.key;
    setDown((d) => {
      const next = { ...d };
      delete next[code];
      return next;
    });
    repeatsRef.current[code] = 0;
  }

  function reset() {
    setSeen({});
    setDown({});
    setLast([]);
    repeatsRef.current = {};
    setStuck(null);
    setCount(0);
  }

  const tested = Object.keys(seen).length;
  let report: ToolReport | null = null;
  if (tested > 0) {
    const lines: ToolReport["lines"] = [
      ["Different keys tested", String(tested)],
      ["Key presses", String(count)],
      [
        "Last keys",
        last
          .slice(0, 8)
          .map((k) => k.label)
          .join(" ") || "—",
      ],
    ];
    if (stuck) lines.push(["Possibly stuck", stuck.label]);
    report = stuck
      ? {
          tool: "Keyboard",
          tone: "warn",
          verdict: `The “${stuck.label}” key kept repeating — it may be stuck.`,
          tip: "Tap the key a few times firmly, then clean around it with compressed air. If it keeps repeating, turn off Sticky/Filter Keys in accessibility settings or try an external keyboard.",
          lines,
        }
      : {
          tool: "Keyboard",
          tone: "good",
          verdict: `Keys are registering — ${tested} different key${tested === 1 ? "" : "s"} tested.`,
          tip: "A key that doesn't light up when pressed may be worn or dirty. Try an external keyboard to tell a hardware fault from a settings problem (like the wrong keyboard language).",
          lines,
        };
  }

  const latest = last[0]?.label;

  return (
    <ToolCard
      id="keyboard"
      icon={Keyboard}
      title="Keyboard tester"
      description="Click the keyboard below and press keys — each one lights up as your computer receives it."
      report={report}
      live={latest ? `Pressed ${latest}` : undefined}
      actions={
        tested > 0 ? (
          <ToolButton variant="ghost" icon={RefreshCw} onClick={reset}>
            Reset
          </ToolButton>
        ) : null
      }
    >
      <div
        tabIndex={0}
        role="application"
        aria-label="Keyboard test area. Press any keys to test them. Press Tab or Escape to leave."
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => setDown({})}
        className="group rounded-[20px] border border-white/10 bg-[#0a0716] p-3 outline-none transition-[border-color,box-shadow] focus:border-[#c9b8ff]/70 focus:shadow-[0_0_0_4px_rgb(124_92_255/0.3)] sm:p-4"
      >
        <div className="mb-3 flex items-center justify-between gap-3 text-xs font-bold text-white/60">
          <span className="group-focus:hidden">
            Click or tab here, then start typing
          </span>
          <span className="hidden text-[#c9b8ff] group-focus:inline">
            Ready — press any key (Esc to leave)
          </span>
          <span className="tabular-nums">{tested} keys</span>
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[520px] gap-1.5" aria-hidden>
            {ROWS.map((row, r) => (
              <div key={r} className="flex gap-1.5">
                {row.map((cap) => {
                  const isDown = !!down[cap.code];
                  const wasSeen = !!seen[cap.code];
                  return (
                    <span
                      key={cap.code}
                      style={{ flex: `${cap.w ?? 1} 1 0` }}
                      className={cn(
                        "flex h-9 min-w-0 items-center justify-center rounded-lg border text-[11px] font-extrabold transition-[background-color,border-color,transform,box-shadow] duration-150",
                        isDown
                          ? "hf-tool-key translate-y-0.5 border-[#e9d5ff] bg-[linear-gradient(180deg,#a78bfa,#7c5cff)] text-white shadow-[0_0_18px_#7c5cff]"
                          : wasSeen
                            ? "border-[#5ee0a8]/40 bg-[#5ee0a8]/15 text-[#a7f3d0]"
                            : "border-white/10 bg-white/5 text-white/55 shadow-[inset_0_-2px_0_rgb(255_255_255/0.06)]",
                        stuck?.code === cap.code &&
                          "border-[#ffd27c] bg-[#ffd27c]/20 text-[#fef3c7]"
                      )}
                    >
                      {cap.label}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex min-h-10 flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-white/55">
          Last keys
        </span>
        {last.length === 0 ? (
          <span className="text-sm text-white/50">None yet</span>
        ) : (
          last.map((k, i) => (
            <span
              key={k.id}
              className={cn(
                "rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-extrabold",
                i === 0 && "hf-pop border-[#c9b8ff]/60 bg-[#7c5cff]/30"
              )}
            >
              {k.label}
            </span>
          ))
        )}
      </div>
    </ToolCard>
  );
}
