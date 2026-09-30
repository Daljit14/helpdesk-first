import type { ReactNode } from "react";

/**
 * Original, illustrated human avatars drawn as inline SVG (viewBox 0 0 44 44).
 * No external images, no real people. Each avatar is a small recipe of skin
 * tone, hair style/colour, outfit and accessories so the set stays consistent.
 *
 * Motion (all CSS, see the "Human avatars" block in app/globals.css):
 * - `.hf-ava-eyes`   blink every few seconds
 * - `.hf-ava-head`   gentle head bob / tilt
 * - `.hf-ava-hand`   waves when the avatar is hovered or selected
 * - `.hf-ava-spark`  sparkles when hovered or selected
 * Reduced-motion users get a still avatar (hand + sparkle simply stay visible
 * on hover/selection without moving).
 */
export const HUMAN_AVATAR_IDS = [
  "nova",
  "kai",
  "amara",
  "leo",
  "mei",
  "zuri",
  "sol",
  "ravi",
  "juno",
  "ines",
  "theo",
  "ada",
] as const;

export type HumanAvatarId = (typeof HUMAN_AVATAR_IDS)[number];

type HairStyle =
  | "curly"
  | "quiff"
  | "buzz"
  | "bun"
  | "braids"
  | "long"
  | "short"
  | "beanie"
  | "bob"
  | "puffs"
  | "none";

type Recipe = {
  label: string;
  bg: [string, string];
  skin: string;
  shade: string;
  hair: string;
  style: HairStyle;
  outfit: string;
  trim: string;
  glasses?: "round" | "square";
  headphones?: string;
  earrings?: string;
  beard?: boolean;
  hijab?: string;
  beanie?: string;
  freckles?: boolean;
};

export const HUMAN_AVATARS: Record<HumanAvatarId, Recipe> = {
  nova: {
    label: "Curly hair with glasses",
    bg: ["#ede7ff", "#c9b8ff"],
    skin: "#8d5a3b",
    shade: "#76482d",
    hair: "#2b1a14",
    style: "curly",
    outfit: "#7c5cff",
    trim: "#b8a4ff",
    glasses: "round",
  },
  kai: {
    label: "Quiff with headphones",
    bg: ["#e0f7f4", "#a7e3dc"],
    skin: "#e8b98f",
    shade: "#d29f74",
    hair: "#1d1b22",
    style: "quiff",
    outfit: "#0f9f8f",
    trim: "#6fd6c8",
    headphones: "#3b2f6b",
  },
  amara: {
    label: "Hijab",
    bg: ["#fde7f3", "#f5b6d6"],
    skin: "#b07a52",
    shade: "#966242",
    hair: "#000000",
    style: "none",
    outfit: "#db2777",
    trim: "#f9a8d4",
    hijab: "#7c3aed",
  },
  leo: {
    label: "Buzz cut with beard",
    bg: ["#fff1dc", "#ffcf99"],
    skin: "#5c3a24",
    shade: "#4a2e1c",
    hair: "#17110e",
    style: "buzz",
    outfit: "#ea7a1a",
    trim: "#fdba74",
    beard: true,
  },
  mei: {
    label: "Top bun with earrings",
    bg: ["#ffe9ee", "#ffc2d1"],
    skin: "#f3cfae",
    shade: "#e2b793",
    hair: "#1f1a24",
    style: "bun",
    outfit: "#f472b6",
    trim: "#fbcfe8",
    earrings: "#ffc24b",
  },
  zuri: {
    label: "Braids with gold hoops",
    bg: ["#fff7d6", "#ffe08a"],
    skin: "#4a2c1d",
    shade: "#3b2216",
    hair: "#161013",
    style: "braids",
    outfit: "#d97706",
    trim: "#fcd34d",
    earrings: "#f5b400",
  },
  sol: {
    label: "Long auburn hair",
    bg: ["#e5f7e8", "#b4e6be"],
    skin: "#f6d5c0",
    shade: "#e8bda3",
    hair: "#a4431c",
    style: "long",
    outfit: "#16a34a",
    trim: "#86efac",
    freckles: true,
  },
  ravi: {
    label: "Short hair with square glasses",
    bg: ["#e6efff", "#b7cdff"],
    skin: "#a8704a",
    shade: "#8e5c3a",
    hair: "#131018",
    style: "short",
    outfit: "#2563eb",
    trim: "#93c5fd",
    glasses: "square",
  },
  juno: {
    label: "Cosy beanie",
    bg: ["#efe9ff", "#d9c9ff"],
    skin: "#d6a57c",
    shade: "#c08e65",
    hair: "#5a3a22",
    style: "beanie",
    outfit: "#4b2fb8",
    trim: "#a78bfa",
    beanie: "#d946ef",
  },
  ines: {
    label: "Pink bob",
    bg: ["#e3f4ff", "#ade0ff"],
    skin: "#efc5a0",
    shade: "#dcab83",
    hair: "#f472b6",
    style: "bob",
    outfit: "#0ea5e9",
    trim: "#bae6fd",
    earrings: "#ffffff",
  },
  theo: {
    label: "Silver hair with glasses",
    bg: ["#eceef6", "#c8cde0"],
    skin: "#f1d0b5",
    shade: "#ddb597",
    hair: "#c9ccd6",
    style: "short",
    outfit: "#334155",
    trim: "#94a3b8",
    glasses: "round",
    beard: true,
  },
  ada: {
    label: "Afro puffs with headphones",
    bg: ["#ffe8f6", "#e9b6ff"],
    skin: "#7a4a2e",
    shade: "#643b23",
    hair: "#1b1210",
    style: "puffs",
    outfit: "#a21caf",
    trim: "#f0abfc",
    headphones: "#ff5fa2",
  },
};

export function humanAvatarBackground(id: HumanAvatarId) {
  const [from, to] = HUMAN_AVATARS[id].bg;
  return `linear-gradient(150deg, ${from} 0%, ${to} 100%)`;
}

/** Hair drawn BEHIND the head (long hair, buns, braids, puffs). */
function BackHair({ r }: { r: Recipe }) {
  switch (r.style) {
    case "long":
      return (
        <path
          d="M12.2 20c-1-8.6 4.2-12.8 9.8-12.8S32.8 11.4 31.8 20l1.4 13.5c-3.6 2.2-18.8 2.2-22.4 0Z"
          fill={r.hair}
        />
      );
    case "bob":
      return (
        <path
          d="M12.4 21.5C11.4 11.6 16.6 7.6 22 7.6s10.6 4 9.6 13.9c-.3 3.4-2.4 5-4.2 4.6H16.6c-1.8.4-3.9-1.2-4.2-4.6Z"
          fill={r.hair}
        />
      );
    case "bun":
      return <circle cx="22" cy="6.8" r="4.3" fill={r.hair} />;
    case "puffs":
      return (
        <>
          <circle cx="12.6" cy="10.4" r="5" fill={r.hair} />
          <circle cx="31.4" cy="10.4" r="5" fill={r.hair} />
        </>
      );
    case "braids":
      return (
        <g fill={r.hair}>
          {[20, 23.4, 26.8, 30.2, 33.6].map((y) => (
            <g key={y}>
              <ellipse cx="12.8" cy={y} rx="2" ry="1.9" />
              <ellipse cx="31.2" cy={y} rx="2" ry="1.9" />
            </g>
          ))}
          <path d="M13.2 21c-1.4-8 3.4-12.4 8.8-12.4s10.2 4.4 8.8 12.4Z" />
        </g>
      );
    case "curly":
      return (
        <g fill={r.hair}>
          <circle cx="13.2" cy="21" r="3" />
          <circle cx="30.8" cy="21" r="3" />
          <circle cx="12.8" cy="16" r="3.4" />
          <circle cx="31.2" cy="16" r="3.4" />
        </g>
      );
    default:
      return null;
  }
}

/** Hair drawn IN FRONT of the head (fringes, caps, tops). */
function FrontHair({ r }: { r: Recipe }) {
  switch (r.style) {
    case "curly":
      return (
        <g fill={r.hair}>
          <circle cx="15.2" cy="12.4" r="3.8" />
          <circle cx="19" cy="9.6" r="4" />
          <circle cx="23.6" cy="9" r="4.1" />
          <circle cx="28" cy="11" r="3.9" />
          <circle cx="30" cy="14.8" r="2.8" />
          <circle cx="14" cy="16" r="2.4" />
        </g>
      );
    case "quiff":
      return (
        <path
          d="M13.8 17.6c-.8-6.4 2.6-10.4 7.4-11.2 4.6-.8 9.2 1.4 9.4 6.2.1 1.8-.3 3.4-.8 5-1.6-2.6-4.4-4.4-8.2-4.2-3 .1-5.6 1.6-7.8 4.2Z"
          fill={r.hair}
        />
      );
    case "buzz":
      return (
        <path
          d="M13.8 17.4c.2-5.6 3.8-8.4 8.2-8.4s8 2.8 8.2 8.4c-2-2.6-4.8-3.8-8.2-3.8s-6.2 1.2-8.2 3.8Z"
          fill={r.hair}
          opacity={0.92}
        />
      );
    case "short":
      return (
        <path
          d="M13.5 19c-.8-7 3.2-10.4 8.5-10.4 5.2 0 9.3 3.4 8.5 10.4-.8-2.8-2.2-4.6-4.6-5.4-2.8 1.8-7.4 2.2-10.6 1.4-.9 1-1.5 2.3-1.8 4Z"
          fill={r.hair}
        />
      );
    case "long":
      return (
        <path
          d="M13.4 19.4c-.4-6.8 3.8-10.8 9-10.8 5 0 8.6 3.6 8.2 10.4-2.6-3-6-5-10.4-4.8-2.8.1-5 1.8-6.8 5.2Z"
          fill={r.hair}
        />
      );
    case "bob":
      return (
        <path
          d="M13.4 18.6c0-6.2 4-9.8 8.6-9.8 5 0 8.6 3.4 8.6 9.6-3.4-.6-6.4-2.4-8.2-4.8-1.8 2.6-5 4.4-9 5Z"
          fill={r.hair}
        />
      );
    case "bun":
    case "braids":
      return (
        <path
          d="M13.6 18.4c-.4-6 3.6-9.6 8.4-9.6s8.8 3.6 8.4 9.6c-2.2-2.6-4.8-4-7.6-4.2l-.8-1.4-.8 1.4c-2.8.2-5.4 1.6-7.6 4.2Z"
          fill={r.hair}
        />
      );
    case "puffs":
      return (
        <path
          d="M13.6 18.6c-.2-6 3.6-9.4 8.4-9.4s8.6 3.4 8.4 9.4c-2.4-2.8-5.2-4-8.4-4s-6 1.2-8.4 4Z"
          fill={r.hair}
        />
      );
    case "beanie":
      return (
        <>
          <path
            d="M13.6 19.6c-.2 2.4.4 4.4 1.2 5.6l1-4.6ZM30.4 19.6c.2 2.4-.4 4.4-1.2 5.6l-1-4.6Z"
            fill={r.hair}
          />
          <path
            d="M12.8 17.4c-.2-6.6 4-10.6 9.2-10.6s9.4 4 9.2 10.6Z"
            fill={r.beanie}
          />
          <rect
            x="12.2"
            y="15.2"
            width="19.6"
            height="4"
            rx="2"
            fill={r.beanie}
          />
          <path
            d="M14.6 17.2h14.8"
            stroke="#ffffff"
            strokeOpacity={0.35}
            strokeWidth={0.8}
            strokeDasharray="1.2 1.4"
          />
          <circle cx="22" cy="6.4" r="2.2" fill="#fbcfe8" />
        </>
      );
    default:
      return null;
  }
}

function Glasses({ kind }: { kind: "round" | "square" }) {
  const stroke = "#1c1633";
  return (
    <g fill="#ffffff" fillOpacity={0.18} stroke={stroke} strokeWidth={0.9}>
      {kind === "round" ? (
        <>
          <circle cx="18.4" cy="20" r="2.9" />
          <circle cx="25.6" cy="20" r="2.9" />
        </>
      ) : (
        <>
          <rect x="15.2" y="17.8" width="6.2" height="4.6" rx="1.3" />
          <rect x="22.6" y="17.8" width="6.2" height="4.6" rx="1.3" />
        </>
      )}
      <path d="M21.3 19.6q.7-.6 1.4 0" fill="none" />
    </g>
  );
}

function Headphones({ color }: { color: string }) {
  return (
    <g>
      <path
        d="M12.6 20.4c-.6-7.6 4-12.4 9.4-12.4s10 4.8 9.4 12.4"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <rect x="10.8" y="17.8" width="4" height="6.4" rx="2" fill={color} />
      <rect x="29.2" y="17.8" width="4" height="6.4" rx="2" fill={color} />
      <rect
        x="11.6"
        y="19"
        width="1.4"
        height="4"
        rx="0.7"
        fill="#ffffff"
        opacity={0.4}
      />
    </g>
  );
}

function hijabParts(color: string) {
  return {
    back: (
      <path
        d="M22 7.6c-6.2 0-10.4 4.6-10.4 11.2 0 4.8 1.6 8.6 3.6 11.2L8 44h28l-7.2-14c2-2.6 3.6-6.4 3.6-11.2 0-6.6-4.2-11.2-10.4-11.2Z"
        fill={color}
      />
    ),
    front: (
      <>
        <path
          d="M22 8.4c-5.6 0-9.4 4.2-9.4 10.4 0 3.6 1 6.8 2.8 9.2 1.6-4.2 1.6-10.6 3-13.2 1-1.6 2.4-2.2 3.6-2.2s2.6.6 3.6 2.2c1.4 2.6 1.4 9 3 13.2 1.8-2.4 2.8-5.6 2.8-9.2 0-6.2-3.8-10.4-9.4-10.4Z"
          fill={color}
        />
        <path
          d="M15.2 28.2c2 2.4 4.4 3.4 6.8 3.4s4.8-1 6.8-3.4"
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.25}
          strokeWidth={0.8}
        />
      </>
    ),
  };
}

export function HumanFigure({
  id,
  index = 0,
}: {
  id: HumanAvatarId;
  /** Offsets animation timing so a grid of avatars doesn't move in lockstep. */
  index?: number;
}) {
  const r = HUMAN_AVATARS[id];
  const hijab = r.hijab ? hijabParts(r.hijab) : null;
  const delay = `${(index % 6) * 0.55}s`;

  let neckline: ReactNode = (
    <path
      d="M17.6 30.6q4.4 3.6 8.8 0"
      fill="none"
      stroke={r.trim}
      strokeWidth={1.4}
      strokeLinecap="round"
    />
  );
  if (r.headphones) {
    // Hoodie strings
    neckline = (
      <>
        <path
          d="M16.4 30.2q5.6 4.6 11.2 0l-1 3.2q-4.6 2.8-9.2 0Z"
          fill={r.trim}
        />
        <path
          d="M19.8 33.4v4M24.2 33.4v4"
          stroke="#ffffff"
          strokeWidth={0.8}
          strokeLinecap="round"
        />
      </>
    );
  }

  return (
    <g data-avatar={id}>
      {/* sparkle (hover / selected) */}
      <g className="hf-ava-spark" fill="#ffffff">
        <path d="M36 8.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9Z" />
        <path d="M8.4 12l.6 1.3 1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6Z" />
      </g>

      {hijab?.back}

      {/* body */}
      <path d="M5 44c0-8.4 6.8-13.6 17-13.6S39 35.6 39 44Z" fill={r.outfit} />
      {!hijab && (
        <>
          <path d="M19.2 25.6h5.6v5.2q-2.8 2-5.6 0Z" fill={r.shade} />
          {neckline}
        </>
      )}
      {hijab && (
        <path
          d="M14 33.6q8 5.2 16 0"
          fill="none"
          stroke={r.trim}
          strokeWidth={1.2}
          strokeLinecap="round"
          opacity={0.7}
        />
      )}

      {/* waving hand (hover / selected) */}
      <g className="hf-ava-hand">
        <path
          d="M33.6 44v-6.2"
          stroke={r.outfit}
          strokeWidth={4.2}
          strokeLinecap="round"
        />
        <circle cx="33.6" cy="35.4" r="2.6" fill={r.skin} />
        <path
          d="M32.2 33.4v-2M33.6 33v-2.4M35 33.4v-2"
          stroke={r.skin}
          strokeWidth={1.1}
          strokeLinecap="round"
        />
      </g>

      {/* head group: bobs + tilts gently */}
      <g className="hf-ava-head" style={{ animationDelay: delay }}>
        {!hijab && <BackHair r={r} />}
        {!hijab && (
          <>
            <circle cx="13.6" cy="20.6" r="2" fill={r.shade} />
            <circle cx="30.4" cy="20.6" r="2" fill={r.shade} />
          </>
        )}
        <ellipse cx="22" cy="19.4" rx="8.4" ry="9.4" fill={r.skin} />

        {r.earrings && !hijab && (
          <g fill={r.earrings}>
            {r.style === "braids" ? (
              <>
                <circle
                  cx="13.4"
                  cy="24.2"
                  r="1.6"
                  fill="none"
                  stroke={r.earrings}
                  strokeWidth={0.8}
                />
                <circle
                  cx="30.6"
                  cy="24.2"
                  r="1.6"
                  fill="none"
                  stroke={r.earrings}
                  strokeWidth={0.8}
                />
              </>
            ) : (
              <>
                <circle cx="13.6" cy="23.4" r="0.95" />
                <circle cx="30.4" cy="23.4" r="0.95" />
              </>
            )}
          </g>
        )}

        {/* cheeks */}
        <g fill="#ff7aa8" opacity={0.28}>
          <ellipse cx="16.6" cy="23.2" rx="1.6" ry="1" />
          <ellipse cx="27.4" cy="23.2" rx="1.6" ry="1" />
        </g>
        {r.freckles && (
          <g fill="#b45309" opacity={0.45}>
            <circle cx="16.4" cy="22" r="0.3" />
            <circle cx="17.4" cy="22.6" r="0.3" />
            <circle cx="27.6" cy="22" r="0.3" />
            <circle cx="26.6" cy="22.6" r="0.3" />
          </g>
        )}

        {/* brows */}
        <path
          d="M16.8 16.6q1.6-.9 3.2-.1M24 16.5q1.6-.8 3.2.1"
          fill="none"
          stroke={
            r.style === "none"
              ? "#2b1a14"
              : r.hair === "#c9ccd6"
                ? "#8b8f9c"
                : r.hair
          }
          strokeWidth={0.9}
          strokeLinecap="round"
        />

        {/* eyes: blink */}
        <g
          className="hf-ava-eyes"
          style={{ animationDelay: delay }}
          fill="#1c1633"
        >
          <ellipse cx="18.5" cy="20" rx="1.1" ry="1.3" />
          <ellipse cx="25.5" cy="20" rx="1.1" ry="1.3" />
          <circle cx="18.9" cy="19.5" r="0.35" fill="#ffffff" />
          <circle cx="25.9" cy="19.5" r="0.35" fill="#ffffff" />
        </g>

        {/* nose + smile */}
        <path
          d="M22 21.4v1.6"
          stroke={r.shade}
          strokeWidth={0.9}
          strokeLinecap="round"
        />
        {r.beard ? (
          <>
            <path
              d="M13.8 20.8c.2 5.4 3.4 8.2 8.2 8.2s8-2.8 8.2-8.2c-1 2.4-2.2 3-3.4 3-1.2-1-3-1.4-4.8-1.4s-3.6.4-4.8 1.4c-1.2 0-2.4-.6-3.4-3Z"
              fill={r.hair === "#c9ccd6" ? "#b8bcc8" : r.hair}
            />
            <path
              d="M19.6 25.2q2.4 1.6 4.8 0"
              fill="none"
              stroke="#ffffff"
              strokeWidth={1}
              strokeLinecap="round"
            />
          </>
        ) : (
          <path
            d="M19.4 24.6q2.6 2.2 5.2 0"
            fill="none"
            stroke="#7a2e3a"
            strokeWidth={1.1}
            strokeLinecap="round"
          />
        )}

        {!hijab && <FrontHair r={r} />}
        {hijab?.front}
        {r.glasses && <Glasses kind={r.glasses} />}
        {r.headphones && <Headphones color={r.headphones} />}
      </g>
    </g>
  );
}
