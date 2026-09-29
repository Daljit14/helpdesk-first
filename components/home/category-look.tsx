import type { ReactNode } from "react";

/**
 * Colour tile, animated icon and a short "what's covered" line for each guide
 * category. Icons are inline SVG so individual strokes can animate (see the
 * `.hf-i-*` classes in globals.css). Everything here is decorative.
 */
export type CategoryLook = {
  tile: string;
  ink: string;
  hint: string;
  icon: ReactNode;
};

const svg = (ink: string, children: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={ink}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className="h-[21px] w-[21px] overflow-visible"
  >
    {children}
  </svg>
);

const looks: Record<string, CategoryLook> = {
  computer: {
    tile: "bg-[#ece8fd] dark:bg-[#2c2350] text-primary",
    ink: "var(--primary)",
    hint: "Slow, freezing, won’t start",
    icon: svg(
      "currentColor",
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
        <path className="hf-i-blink" d="M7 12l3-3 2 2 4-4" />
      </>
    ),
  },
  network: {
    tile: "bg-[#e3f6ee] dark:bg-[#123b2c] text-[#12805c] dark:text-[#5ee0a8]",
    ink: "#12805c",
    hint: "Drops, VPN, Ethernet",
    icon: svg(
      "currentColor",
      <>
        <path
          className="hf-i-blink"
          style={{ animationDelay: "0.6s" }}
          d="M5 12.5a10 10 0 0 1 14 0"
        />
        <path
          className="hf-i-blink"
          style={{ animationDelay: "0.3s" }}
          d="M8.5 16a5 5 0 0 1 7 0"
        />
        <path
          className="hf-i-blink"
          style={{ animationDelay: "0.9s" }}
          d="M2 9a15 15 0 0 1 20 0"
        />
        <circle cx="12" cy="19.5" r="0.8" />
      </>
    ),
  },
  printer: {
    tile: "bg-[#fff0e0] dark:bg-[#3d2612] text-[#c25e00] dark:text-[#ffb26b]",
    ink: "#c25e00",
    hint: "Offline, jams, stuck jobs",
    icon: svg(
      "currentColor",
      <>
        <path d="M6 9V3h12v6" />
        <rect x="3" y="9" width="18" height="8" rx="2" />
        <path className="hf-i-bob" d="M7 14h10v7H7z" />
      </>
    ),
  },
  email: {
    tile: "bg-[#fde7f1] dark:bg-[#3d1a2c] text-[#b1245f] dark:text-[#f9a8d4]",
    ink: "#b1245f",
    hint: "Sync, sending, sign-in",
    icon: svg(
      "currentColor",
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path className="hf-i-flap" d="m3 7 9 6 9-6" />
      </>
    ),
  },
  software: {
    tile: "bg-[#e0efff] dark:bg-[#1a2a45] text-[#2553b0] dark:text-[#93c5fd]",
    ink: "#2553b0",
    hint: "Won’t open, installs, updates",
    icon: svg(
      "currentColor",
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
        <circle className="hf-i-blink" cx="7" cy="6.5" r="0.6" />
      </>
    ),
  },
  audio: {
    tile: "bg-[#e3f6ee] dark:bg-[#123b2c] text-[#0f6f63] dark:text-[#5eead4]",
    ink: "#0f6f63",
    hint: "No sound, mic, Bluetooth",
    icon: svg(
      "currentColor",
      <>
        <path d="M11 5 6 9H3v6h3l5 4z" />
        <path className="hf-i-blink" d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path
          className="hf-i-blink"
          style={{ animationDelay: "0.4s" }}
          d="M18.5 5.5a9 9 0 0 1 0 13"
        />
      </>
    ),
  },
  accounts: {
    tile: "bg-[#fff1d6] dark:bg-[#3a2c17] text-[#8a5200] dark:text-[#ffd68a]",
    ink: "#8a5200",
    hint: "Passwords, 2FA, SSO",
    icon: svg(
      "currentColor",
      <g className="hf-i-wiggle">
        <circle cx="8" cy="15" r="4" />
        <path d="m10.8 12.2 8.2-8.2M16 7l3 3" />
      </g>
    ),
  },
  files: {
    tile: "bg-[#e0efff] dark:bg-[#1a2a45] text-[#2553b0] dark:text-[#93c5fd]",
    ink: "#2553b0",
    hint: "Sync, sharing, lost files",
    icon: svg(
      "currentColor",
      <>
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path className="hf-i-bob" d="M12 11v5M9.5 13.5 12 11l2.5 2.5" />
      </>
    ),
  },
  video: {
    tile: "bg-[#e0efff] dark:bg-[#1a2a45] text-[#2553b0] dark:text-[#93c5fd]",
    ink: "#2553b0",
    hint: "Join, video, echo",
    icon: svg(
      "currentColor",
      <>
        <rect x="3" y="6" width="13" height="12" rx="2" />
        <path d="m16 10 5-3v10l-5-3" />
        <circle
          className="hf-i-rec"
          cx="7"
          cy="10"
          r="1.4"
          fill="#e0245e"
          stroke="none"
        />
      </>
    ),
  },
  mobile: {
    tile: "bg-[#e3f6ee] dark:bg-[#123b2c] text-[#0f6f63] dark:text-[#5eead4]",
    ink: "#0f6f63",
    hint: "Apps, hotspot, battery",
    icon: svg(
      "currentColor",
      <g className="hf-i-vib">
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
      </g>
    ),
  },
  peripherals: {
    tile: "bg-[#fff0e0] dark:bg-[#3d2612] text-[#c25e00] dark:text-[#ffb26b]",
    ink: "#c25e00",
    hint: "Monitors, USB, keyboard",
    icon: svg(
      "currentColor",
      <>
        <path d="M9 2v6M15 2v6" />
        <path d="M6 8h12v3a6 6 0 0 1-12 0z" />
        <path className="hf-i-bob" d="M12 17v5" />
      </>
    ),
  },
  collab: {
    tile: "bg-[#ece8fd] dark:bg-[#2c2350] text-primary",
    ink: "var(--primary)",
    hint: "Chat, calendar, workspace",
    icon: svg(
      "currentColor",
      <>
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        <circle className="hf-i-blink" cx="9" cy="12" r="0.8" />
        <circle
          className="hf-i-blink"
          style={{ animationDelay: "0.3s" }}
          cx="13"
          cy="12"
          r="0.8"
        />
        <circle
          className="hf-i-blink"
          style={{ animationDelay: "0.6s" }}
          cx="17"
          cy="12"
          r="0.8"
        />
      </>
    ),
  },
  security: {
    tile: "bg-[#fde7f1] dark:bg-[#3d1a2c] text-[#b1245f] dark:text-[#f9a8d4]",
    ink: "#b1245f",
    hint: "Phishing, pop-ups, lost device",
    icon: svg(
      "currentColor",
      <>
        <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z" />
        <path className="hf-i-draw" d="m9 12 2 2 4-4" />
      </>
    ),
  },
};

const fallback: CategoryLook = looks.computer;

export function categoryLook(id: string): CategoryLook {
  return looks[id] ?? fallback;
}
