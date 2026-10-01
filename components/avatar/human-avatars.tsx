import { useId, type CSSProperties, type ReactNode } from "react";

/**
 * Original, stylised 2.5D portrait avatars drawn as inline SVG (viewBox
 * 0 0 100 100). No external images, no real people.
 *
 * Art direction: editorial, fashion-illustration proportions (narrow head,
 * long neck, defined shoulders, bust cropped mid-chest) with a slight 3/4
 * turn, flat colour blocking and hard-edged cel shading. Every shape is
 * painted in up to three flat tones: a base, one shadow tone (an offset
 * crescent on the lower-right) and a bold coloured rim light on the outer
 * edge. Backgrounds are layered colour blocks (arch / sun / blob), a
 * halftone or stripe pattern and a small accent shape.
 *
 * Motion (CSS only, see the "Stylised portraits" block in app/globals.css):
 * - `.hf-ava3-bgA` / `.hf-ava3-bgB`  slow parallax float of background shapes
 * - `.hf-ava3-body` / `.hf-ava3-head` / `.hf-ava3-hair`  gentle sway
 * - `.hf-ava3-lid`   soft blink (one lid per eye)
 * - hover / focus / selected: the face turns toward the viewer, winks, waves,
 *   sparkles, softens its smile and spins the accent shape.
 * Reduced-motion users get a still avatar.
 */
export const AVATAR_VIEWBOX = "0 0 100 100";

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
  "remy",
  "noor",
  "finn",
  "luca",
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
  | "locs"
  | "cap"
  | "wrap"
  | "hijab"
  | "bald";

type Kind =
  "blazer" | "shirt" | "knit" | "bomber" | "puffer" | "trench" | "hoodie";

/** base, shadow, light */
type Tone = [string, string, string];

type Recipe = {
  label: string;
  /** Mirrors the whole portrait so the rim light / turn comes from the other side. */
  flip?: boolean;
  bg: {
    v: 0 | 1 | 2 | 3 | 4 | 5;
    a: string;
    b: string;
    c: string;
    d: string;
    ink: string;
    rim: string;
  };
  skin: [string, string];
  hair: Tone;
  style: HairStyle;
  top: { kind: Kind; c: Tone; inner: [string, string] };
  lip: string;
  iris: string;
  lashes?: boolean;
  glasses?: {
    shape: "round" | "square";
    frame: string;
    lens: string;
    a: number;
  };
  sunUp?: { frame: string; lens: string };
  earring?: { kind: "stud" | "drop" | "hoop" | "bar"; c: string };
  chain?: string;
  buds?: boolean;
  tote?: string;
  beard?: "short" | "full";
  stubble?: boolean;
  freckles?: boolean;
  lines?: boolean;
  /** Head wrap / hijab / bandana / cap / beanie colours (base, shadow, light). */
  acc?: Tone;
  /** Pattern ink drawn on the head wrap / bandana. */
  pat?: string;
};

export const HUMAN_AVATARS: Record<HumanAvatarId, Recipe> = {
  nova: {
    label: "Curly hair with glasses",
    bg: {
      v: 0,
      a: "#5b3cd6",
      b: "#ffd66b",
      c: "#ff7a5c",
      d: "#ffffff",
      ink: "#4a2fb4",
      rim: "#ffe7a6",
    },
    skin: ["#dfa77a", "#bd7d55"],
    hair: ["#3b2620", "#1b110e", "#6c4838"],
    style: "curly",
    top: {
      kind: "blazer",
      c: ["#cbbcff", "#9d88ea", "#e8e0ff"],
      inner: ["#fdf8ef", "#e4d9c6"],
    },
    lip: "#b24a5a",
    iris: "#4a2c1c",
    lashes: true,
    glasses: { shape: "round", frame: "#2b1d5e", lens: "#ff9a7a", a: 0.42 },
    chain: "#ffce54",
  },
  kai: {
    label: "Quiff with earbuds",
    flip: true,
    bg: {
      v: 1,
      a: "#38c9b0",
      b: "#c9f6ea",
      c: "#ff8f6b",
      d: "#1f1a4d",
      ink: "#1fa58f",
      rim: "#dcfff4",
    },
    skin: ["#efc7a0", "#d09973"],
    hair: ["#2c2434", "#120e19", "#5d5170"],
    style: "quiff",
    top: {
      kind: "knit",
      c: ["#5b3cd6", "#3a24a6", "#8b6cff"],
      inner: ["#fdf8ef", "#e4d9c6"],
    },
    lip: "#b9736a",
    iris: "#2a1a12",
    buds: true,
  },
  amara: {
    label: "Hijab",
    bg: {
      v: 3,
      a: "#ff8a70",
      b: "#ffe2b8",
      c: "#7c5cff",
      d: "#ffffff",
      ink: "#e86a52",
      rim: "#ffe9d6",
    },
    skin: ["#c58a5e", "#a1633f"],
    hair: ["#2a1a14", "#120a07", "#4a3226"],
    style: "hijab",
    top: {
      kind: "trench",
      c: ["#ead3ae", "#c5a173", "#f8eacd"],
      inner: ["#fdf8ef", "#e4d9c6"],
    },
    lip: "#a24455",
    iris: "#3a2114",
    lashes: true,
    acc: ["#7b3fa0", "#542876", "#a86bc9"],
  },
  leo: {
    label: "Buzz cut with beard",
    bg: {
      v: 2,
      a: "#ffd35a",
      b: "#ff7a5c",
      c: "#5b3cd6",
      d: "#ffffff",
      ink: "#e9b636",
      rim: "#fff2b8",
    },
    skin: ["#f5cfb4", "#dca284"],
    hair: ["#c8985a", "#9c7036", "#e8c78c"],
    style: "buzz",
    top: {
      kind: "bomber",
      c: ["#3f6b52", "#284a3a", "#68a381"],
      inner: ["#fdf8ef", "#e4d9c6"],
    },
    lip: "#c0776b",
    iris: "#4a78a8",
    beard: "short",
  },
  mei: {
    label: "Top bun with earrings",
    flip: true,
    bg: {
      v: 4,
      a: "#ff8fb8",
      b: "#ffe3ee",
      c: "#5b3cd6",
      d: "#ffd35a",
      ink: "#f0669a",
      rim: "#fff0f5",
    },
    skin: ["#f2cfae", "#d5a280"],
    hair: ["#251d2d", "#0d0913", "#574b6c"],
    style: "bun",
    top: {
      kind: "puffer",
      c: ["#4b2fb8", "#33208a", "#7c5cff"],
      inner: ["#fff1dc", "#e6d2b2"],
    },
    lip: "#d0506e",
    iris: "#2f1c14",
    lashes: true,
    earring: { kind: "drop", c: "#ffd35a" },
    acc: ["#ff8fb8", "#d9648f", "#ffc1d8"],
  },
  zuri: {
    label: "Braids with gold hoops",
    bg: {
      v: 5,
      a: "#63b8ff",
      b: "#ffe9a8",
      c: "#ffffff",
      d: "#ff7a5c",
      ink: "#3d95e0",
      rim: "#fff2c4",
    },
    skin: ["#f6d5bf", "#e0a892"],
    hair: ["#e9c672", "#c0942e", "#fff2b8"],
    style: "braids",
    top: {
      kind: "blazer",
      c: ["#c98b4b", "#9a6027", "#e5b57f"],
      inner: ["#2a2540", "#120e1e"],
    },
    lip: "#d0606a",
    iris: "#4a80b0",
    lashes: true,
    earring: { kind: "hoop", c: "#ffcf3a" },
    freckles: true,
    acc: ["#ffcf3a", "#c9962a", "#fff0a0"],
  },
  sol: {
    label: "Long auburn hair",
    flip: true,
    bg: {
      v: 0,
      a: "#3fbf8f",
      b: "#c9f2df",
      c: "#ffd35a",
      d: "#ffffff",
      ink: "#2ea577",
      rim: "#e8fff4",
    },
    skin: ["#f7d8c4", "#e2ac96"],
    hair: ["#b7532a", "#7c2e14", "#e28c58"],
    style: "long",
    top: {
      kind: "shirt",
      c: ["#fff4e4", "#e2d2b8", "#ffffff"],
      inner: ["#fff4e4", "#e2d2b8"],
    },
    lip: "#d0606a",
    iris: "#3a8a5a",
    lashes: true,
    freckles: true,
    tote: "#2b2670",
  },
  ravi: {
    label: "Short hair with square glasses",
    bg: {
      v: 2,
      a: "#63b8ff",
      b: "#d6edff",
      c: "#ffd35a",
      d: "#ff7a5c",
      ink: "#3d95e0",
      rim: "#e8f5ff",
    },
    skin: ["#c98a5c", "#a2633c"],
    hair: ["#251d27", "#0f0b13", "#55475b"],
    style: "short",
    top: {
      kind: "shirt",
      c: ["#f4735a", "#c94f3a", "#ff9a84"],
      inner: ["#f4735a", "#c94f3a"],
    },
    lip: "#9c4a4a",
    iris: "#2d1a10",
    glasses: { shape: "square", frame: "#1f1a4d", lens: "#bfe3ff", a: 0.3 },
    stubble: true,
    chain: "#ffce54",
  },
  juno: {
    label: "Cosy beanie",
    bg: {
      v: 3,
      a: "#ffb25c",
      b: "#ffe6bf",
      c: "#5b3cd6",
      d: "#1f1a4d",
      ink: "#ee9838",
      rim: "#fff1d6",
    },
    skin: ["#dea77a", "#bb7b52"],
    hair: ["#6b4a2e", "#3c2716", "#9a7048"],
    style: "beanie",
    top: {
      kind: "hoodie",
      c: ["#4b2fb8", "#33208a", "#7c5cff"],
      inner: ["#4b2fb8", "#33208a"],
    },
    lip: "#b8665a",
    iris: "#3f6f4a",
    acc: ["#ff7a5c", "#d5533a", "#ffa88e"],
  },
  ines: {
    label: "Pink bob with sunglasses",
    flip: true,
    bg: {
      v: 2,
      a: "#2b2670",
      b: "#5b3cd6",
      c: "#ff8fb8",
      d: "#ffd35a",
      ink: "#3d35a3",
      rim: "#ffb9d6",
    },
    skin: ["#e9b790", "#c88b66"],
    hair: ["#ff6fae", "#c53a80", "#ffa6cd"],
    style: "bob",
    top: {
      kind: "bomber",
      c: ["#63b8ff", "#3a8ad0", "#a0d6ff"],
      inner: ["#fdf8ef", "#e4d9c6"],
    },
    lip: "#d84a72",
    iris: "#3a2a1c",
    lashes: true,
    sunUp: { frame: "#1a1433", lens: "#3b2f7a" },
  },
  theo: {
    label: "Silver hair with glasses",
    bg: {
      v: 4,
      a: "#8fd3b2",
      b: "#e6f8ef",
      c: "#ffd35a",
      d: "#2b2670",
      ink: "#6fbb96",
      rim: "#ecfff5",
    },
    skin: ["#f3cdb5", "#d8a48a"],
    hair: ["#e1e5ef", "#a1a8bc", "#ffffff"],
    style: "short",
    top: {
      kind: "trench",
      c: ["#2f3a5c", "#1c2540", "#56668f"],
      inner: ["#fdf8ef", "#e4d9c6"],
    },
    lip: "#b8706c",
    iris: "#5b7f9a",
    glasses: { shape: "round", frame: "#c99a3c", lens: "#ffc46a", a: 0.3 },
    lines: true,
  },
  ada: {
    label: "Twin buns with earbuds",
    bg: {
      v: 1,
      a: "#8b6cff",
      b: "#e2d9ff",
      c: "#ff7a5c",
      d: "#ffd35a",
      ink: "#6d4ee6",
      rim: "#efe8ff",
    },
    skin: ["#f0c8a4", "#d29d78"],
    hair: ["#231a24", "#0c080e", "#54455a"],
    style: "puffs",
    top: {
      kind: "puffer",
      c: ["#ff7a5c", "#d5533a", "#ffa88e"],
      inner: ["#fff1dc", "#e6d2b2"],
    },
    lip: "#c84a66",
    iris: "#2a1810",
    lashes: true,
    buds: true,
  },
  remy: {
    label: "Bald with full beard",
    flip: true,
    bg: {
      v: 5,
      a: "#a8d8ff",
      b: "#eaf5ff",
      c: "#5b3cd6",
      d: "#ff7a5c",
      ink: "#7fbdf0",
      rim: "#ffffff",
    },
    skin: ["#8b5533", "#623519"],
    hair: ["#d9dbe5", "#a3a7b8", "#f6f7fb"],
    style: "bald",
    top: {
      kind: "knit",
      c: ["#e2643f", "#b34324", "#ff8d68"],
      inner: ["#e2643f", "#b34324"],
    },
    lip: "#6a3030",
    iris: "#25150c",
    beard: "full",
    lines: true,
  },
  noor: {
    label: "Patterned head wrap",
    bg: {
      v: 0,
      a: "#a8ecd6",
      b: "#5b3cd6",
      c: "#ffd35a",
      d: "#ffffff",
      ink: "#7fd0b6",
      rim: "#eafff8",
    },
    skin: ["#dca57a", "#b97b52"],
    hair: ["#2b1a14", "#140a07", "#4a3226"],
    style: "wrap",
    top: {
      kind: "blazer",
      c: ["#2b2670", "#19154d", "#4a43a0"],
      inner: ["#fdf8ef", "#e4d9c6"],
    },
    lip: "#b04a5a",
    iris: "#3a2214",
    lashes: true,
    earring: { kind: "bar", c: "#ffd35a" },
    acc: ["#ff7a5c", "#c9523a", "#ffa088"],
    pat: "#fff1dc",
  },
  finn: {
    label: "Cap with freckles",
    bg: {
      v: 1,
      a: "#ff9d6b",
      b: "#ffe0cc",
      c: "#5b3cd6",
      d: "#ffffff",
      ink: "#e67f4f",
      rim: "#fff0e4",
    },
    skin: ["#f6d6c0", "#dfa992"],
    hair: ["#d9763a", "#a8501e", "#f2a46e"],
    style: "cap",
    top: {
      kind: "hoodie",
      c: ["#c9d3e6", "#98a6c4", "#eaeff9"],
      inner: ["#c9d3e6", "#98a6c4"],
    },
    lip: "#cc6a6a",
    iris: "#4c8a9c",
    freckles: true,
    tote: "#ffd35a",
    acc: ["#2b2670", "#19154d", "#4a43a0"],
  },
  luca: {
    label: "Locs with bandana",
    bg: {
      v: 4,
      a: "#ffb3d1",
      b: "#fff0f6",
      c: "#5b3cd6",
      d: "#ffd35a",
      ink: "#ef8db4",
      rim: "#fff5fa",
    },
    skin: ["#7d4b2c", "#552f17"],
    hair: ["#3b281e", "#180f0a", "#66483a"],
    style: "locs",
    top: {
      kind: "shirt",
      c: ["#f4ecd9", "#d5c8ac", "#fffaf0"],
      inner: ["#f4ecd9", "#d5c8ac"],
    },
    lip: "#6f3535",
    iris: "#2a170b",
    earring: { kind: "stud", c: "#e6ebf5" },
    chain: "#ffce54",
    acc: ["#ff5a45", "#c73a2b", "#ff8a78"],
    pat: "#fff1dc",
  },
};

export function humanAvatarBackground(id: HumanAvatarId) {
  return HUMAN_AVATARS[id].bg.a;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const INK = "#1d1526";

function circ(cx: number, cy: number, r: number) {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
}

type CelProps = {
  u: string;
  k: string;
  d: string;
  c: string;
  s: string;
  rim?: string;
  dx?: number;
  dy?: number;
  rw?: number;
  children?: ReactNode;
};

/**
 * Cel-shaded shape: base tone with a hard-edged shadow crescent on the
 * lower-right (the base is shifted up-left inside a clip) and, optionally,
 * a thin rim-light crescent on the outer right edge.
 */
function Cel({
  u,
  k,
  d,
  c,
  s,
  rim,
  dx = -4.2,
  dy = -2.2,
  rw = 1.5,
  children,
}: CelProps) {
  const id = `${u}${k}`;
  return (
    <g>
      <clipPath id={id}>
        <path d={d} />
      </clipPath>
      <path d={d} fill={rim ?? s} />
      <g clipPath={`url(#${id})`}>
        {rim && <path d={d} fill={s} transform={`translate(${-rw} 0)`} />}
        <path d={d} fill={c} transform={`translate(${dx} ${dy})`} />
        {children}
      </g>
    </g>
  );
}

type Ctx = { r: Recipe; u: string };

/* ------------------------------------------------------------------ */
/* Background                                                          */
/* ------------------------------------------------------------------ */

const STAR =
  "M0 -6.5C.9 -2 2 -.9 6.5 0C2 .9.9 2 0 6.5C-.9 2-2 .9-6.5 0C-2-.9-.9-2 0-6.5Z";

function Accent({ v, d }: { v: number; d: string }) {
  const at: [number, number] = [
    [80, 20],
    [19, 74],
    [84, 48],
    [21, 21],
    [81, 22],
    [20, 24],
  ][v] as [number, number];
  return (
    <g transform={`translate(${at[0]} ${at[1]})`}>
      <g className="hf-ava3-acc">
        {v === 0 && <circle r="4.4" fill="none" stroke={d} strokeWidth="1.9" />}
        {v === 1 && <path d={STAR} fill={d} />}
        {v === 2 && (
          <path
            d="M-8 0q4-6 8 0t8 0"
            fill="none"
            stroke={d}
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
        {v === 3 && (
          <path
            d="M-5 0H5M0 -5V5"
            fill="none"
            stroke={d}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        )}
        {v === 4 && <path d={STAR} fill={d} transform="scale(.85)" />}
        {v === 5 && <circle r="3.4" fill={d} />}
      </g>
    </g>
  );
}

function Sparkles({ r }: { r: Recipe }) {
  const sparkles: [number, number, number][] = [
    [16, 16, 0.45],
    [82, 12, 0.35],
    [84, 35, 0.3],
  ];
  return (
    <g>
      {sparkles.map(([x, y, scale], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <g transform={`scale(${scale})`}>
            <path
              className="hf-ava3-spark"
              d={STAR}
              fill="#ffffff"
              stroke={r.bg.rim}
              strokeWidth="0.8"
              style={{ "--hf-si": i } as CSSProperties}
            />
          </g>
        </g>
      ))}
    </g>
  );
}

function Backdrop({ r, u }: Ctx) {
  const { a, b, c, d, ink, v } = r.bg;
  const dots = `url(#${u}dots)`;
  const stripes = `url(#${u}stripes)`;
  return (
    <g>
      <defs>
        <pattern
          id={`${u}dots`}
          width="4.6"
          height="4.6"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="2.3" cy="2.3" r="1.05" fill={ink} />
        </pattern>
        <pattern
          id={`${u}stripes`}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-38)"
        >
          <rect width="1.5" height="4" fill={ink} />
        </pattern>
      </defs>
      <rect x="-10" y="-10" width="120" height="120" fill={a} />
      {v === 0 && (
        <>
          <g className="hf-ava3-bgB">
            <rect x="-6" y="52" width="40" height="60" fill={dots} />
            <circle cx="22" cy="24" r="13" fill={c} />
          </g>
          <g className="hf-ava3-bgA">
            <path d="M20 112V46a32 32 0 0 1 64 0V112Z" fill={b} />
          </g>
        </>
      )}
      {v === 1 && (
        <>
          <g className="hf-ava3-bgB">
            <rect x="58" y="-6" width="52" height="42" fill={stripes} />
            <circle cx="82" cy="72" r="11" fill={c} />
          </g>
          <g className="hf-ava3-bgA">
            <path
              d="M14 52C10 28 30 8 54 10C78 12 92 30 88 56C84 82 70 96 50 96C28 96 18 76 14 52Z"
              fill={b}
            />
          </g>
        </>
      )}
      {v === 2 && (
        <>
          <g className="hf-ava3-bgB">
            <path d="M-10 70L110 20V112H-10Z" fill={c} />
          </g>
          <g className="hf-ava3-bgA">
            <circle cx="58" cy="38" r="31" fill={b} />
            <circle cx="58" cy="38" r="31" fill={dots} opacity=".3" />
          </g>
        </>
      )}
      {v === 3 && (
        <>
          <g className="hf-ava3-bgB">
            <rect x="60" y="48" width="50" height="60" fill={dots} />
            <circle cx="20" cy="70" r="9" fill={c} />
          </g>
          <g className="hf-ava3-bgA">
            <path d="M14 112V50a34 34 0 0 1 68 0V112Z" fill={b} />
            <path d="M28 112V52a20 20 0 0 1 40 0V112Z" fill={c} opacity=".9" />
          </g>
        </>
      )}
      {v === 4 && (
        <>
          <g className="hf-ava3-bgB">
            <rect x="-6" y="-6" width="44" height="34" fill={stripes} />
            <circle cx="80" cy="60" r="10" fill={c} />
          </g>
          <g className="hf-ava3-bgA">
            <circle cx="50" cy="62" r="42" fill={b} />
          </g>
        </>
      )}
      {v === 5 && (
        <>
          <g className="hf-ava3-bgB">
            <rect x="64" y="56" width="46" height="60" fill={dots} />
            <circle cx="16" cy="28" r="10" fill={c} />
          </g>
          <g className="hf-ava3-bgA">
            <rect
              x="18"
              y="12"
              width="62"
              height="100"
              rx="30"
              fill={b}
              transform="rotate(-9 50 60)"
            />
          </g>
        </>
      )}
      <Accent v={v} d={d} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Shared geometry                                                     */
/* ------------------------------------------------------------------ */

const HEAD =
  "M50 19C60.5 19 66.5 27 66.5 37C66.5 44 65.5 49.5 62.5 53.5C59.5 57.4 55 59.5 50 59.5C45 59.5 40.5 57.4 37.5 53.5C34.5 49.5 33.5 44 33.5 37C33.5 27 39.5 19 50 19Z";
const NECK =
  "M43 46L43.4 66C43.4 72 38 75 30 77.5V102H70V77.5C62 75 56.6 72 56.6 66L57 46Z";
const TORSO =
  "M-6 102V92C-2 84 10 79 24 75.5C32 74 38 72 41.5 69.5H58.5C62 72 68 74 76 75.5C90 79 102 84 106 92V102Z";

/* ------------------------------------------------------------------ */
/* Hair                                                                */
/* ------------------------------------------------------------------ */

const HAIR = {
  short:
    "M33.4 39C31.8 25 38.5 14.5 50.5 14.2C62.5 13.8 69 22.5 66.8 39.5C66.2 34 64.6 30 62 27.6C56 29.8 47.5 29 42 25.6C38 28.5 35.6 33 33.4 39Z",
  quiff:
    "M33 40C30.6 27 33.5 16.5 42.5 12.8C46 7.6 57 6.4 63.2 12.2C69.5 17 69.4 28 67 40.5C66.4 34.5 64.8 30 61.6 27.2C56.4 30.2 47 29 41 25.2C37.5 29 35 33 33 40Z",
  buzz: "M34.2 38.5C33 27 39.6 18 50.6 17.6C61.4 17.4 68.2 25.5 66.4 38.6C65.6 34 64 30.8 61.2 28.6C55.4 30.4 46.5 30 41.6 27.8C38 30 35.6 33.6 34.2 38.5Z",
  sleek:
    "M33.6 39.5C32 25 39 15.5 50.6 15.2C62.4 15 69 24 66.6 39.5C65.6 33 63.4 28.8 60 26.2C55.6 24.4 50.4 23.4 50.4 23.4C50.4 23.4 45 24.6 40.6 27C36.8 30 35 34 33.6 39.5Z",
  longCap:
    "M33.4 40C31.4 24 40 13.4 51.6 13.4C63.6 13.4 70 22.6 66.8 40C66 33 63.6 28 58 25C52 30 42 30.6 36 30C35 33 34 36 33.4 40Z",
  bobBack:
    "M31 34C30.4 15.6 40 10.6 51 10.6C62 10.6 71 16 70 34C70 48 71 58 72.6 66L29.4 66C31 58 31 48 31 34Z",
  bobFront:
    "M32.4 40C30.4 22 39.4 13.6 51 13.6C63 13.6 70.6 22 67.6 40L68.6 63L61 64.6C61.6 54 61.4 46 60.6 40.5C59 35 57 32 56 30C50 31.6 42 31.2 38.4 29.4C38 34 37.8 40 38 46C38 54 37.6 60 37.4 64.6L30.6 63C32 55 32.6 48 32.4 40Z",
};

function Curls({ pts }: { pts: [number, number, number][] }) {
  return pts.map((p) => circ(p[0], p[1], p[2])).join("");
}

function HairBack({ r, u }: Ctx) {
  const [c, s] = r.hair;
  const rim = r.bg.rim;
  switch (r.style) {
    case "curly": {
      const d = Curls({
        pts: [
          [30.5, 32, 9],
          [30, 44, 8.6],
          [32.5, 55, 8],
          [36.5, 64, 7.4],
          [70, 31, 9],
          [70.5, 44, 8.6],
          [68, 55, 8],
          [64, 64, 7.4],
          [38, 20, 9],
          [47.5, 14.5, 9.5],
          [58.5, 15.5, 9.5],
          [66, 22, 9],
        ],
      });
      return <Cel u={u} k="hb" d={d} c={c} s={s} rim={rim}></Cel>;
    }
    case "long":
      return (
        <Cel
          u={u}
          k="hb"
          d="M31 38C29 20 39 11 51 11C63 11 71.5 20 69.5 42C69 58 71 74 74 92L28 94C32 78 32 56 31 38Z"
          c={c}
          s={s}
          rim={rim}
        />
      );
    case "bob":
      return <Cel u={u} k="hb" d={HAIR.bobBack} c={c} s={s} rim={rim} />;
    case "bun":
      return (
        <Cel
          u={u}
          k="hb"
          d={circ(50.5, 10.4, 7.8)}
          c={c}
          s={s}
          rim={rim}
          dx={-2.4}
          dy={-1.6}
        />
      );
    case "puffs":
      return (
        <Cel
          u={u}
          k="hb"
          d={circ(37, 13.4, 6.4) + circ(65, 14.6, 5.8)}
          c={c}
          s={s}
          rim={rim}
          dx={-2.4}
          dy={-1.6}
        />
      );
    case "braids":
      return (
        <Cel
          u={u}
          k="hb"
          d="M32.4 38C30.6 20 39.4 11.6 51 11.6C62.6 11.6 70.6 21 68.4 40L66.6 62L34 60Z"
          c={c}
          s={s}
          rim={rim}
        />
      );
    case "locs": {
      const strands: [number, number, number, number][] = [
        [34, 34, 27, 78],
        [36, 30, 31, 84],
        [65, 30, 71, 82],
        [67, 35, 74, 76],
        [40, 24, 38, 70],
        [61, 24, 63, 72],
      ];
      return (
        <g>
          {strands.map(([x1, y1, x2, y2], i) => (
            <g key={i} strokeLinecap="round" fill="none">
              <path
                d={`M${x1} ${y1}C${x1 - 4} ${(y1 + y2) / 2} ${x2 + 2} ${(y1 + y2) / 2} ${x2} ${y2}`}
                stroke={s}
                strokeWidth="4.6"
              />
              <path
                d={`M${x1 - 0.6} ${y1}C${x1 - 4.6} ${(y1 + y2) / 2} ${x2 + 1.4} ${(y1 + y2) / 2} ${x2 - 0.6} ${y2}`}
                stroke={c}
                strokeWidth="3.3"
              />
            </g>
          ))}
        </g>
      );
    }
    case "wrap":
      return (
        <g>
          <path d="M65 30L76 27L73 38Z" fill={r.acc![1]} />
          <path d="M66 32L77 36L70 42Z" fill={r.acc![0]} />
        </g>
      );
    default:
      return null;
  }
}

function HairFront({ r, u }: Ctx) {
  const [c, s, hi] = r.hair;
  const rim = r.bg.rim;
  const acc = r.acc ?? r.hair;
  switch (r.style) {
    case "short":
      return (
        <Cel u={u} k="hf" d={HAIR.short} c={c} s={s} rim={rim}>
          <path
            d="M40 19.4C46 15.6 55 15.4 61 19.4C55 18.4 47 19.6 41.6 22.4Z"
            fill={hi}
          />
        </Cel>
      );
    case "quiff":
      return (
        <Cel u={u} k="hf" d={HAIR.quiff} c={c} s={s} rim={rim}>
          <path
            d="M44 14C50 8.6 58.6 8.8 63 13C56.6 11.8 50.6 13.6 46.4 18.6Z"
            fill={hi}
          />
          <path
            d="M34 34C34.6 30 36.6 27.6 40 26.6"
            stroke={s}
            strokeWidth="1.2"
            fill="none"
          />
        </Cel>
      );
    case "buzz":
      return (
        <Cel u={u} k="hf" d={HAIR.buzz} c={c} s={s} rim={rim}>
          <path
            d="M40 21.6C46 18.8 55 18.6 61 21.6C55 21 47 21.8 41.6 24Z"
            fill={hi}
          />
        </Cel>
      );
    case "bun":
      return (
        <>
          <Cel u={u} k="hf" d={HAIR.sleek} c={c} s={s} rim={rim}>
            <path
              d="M42 19C47 16.4 55 16.6 60 19.6C54 18.6 47 19.4 43 22.4Z"
              fill={hi}
            />
          </Cel>
          <rect
            x="45"
            y="15.2"
            width="11"
            height="2.4"
            rx="1.2"
            fill={acc[0]}
          />
        </>
      );
    case "puffs":
      return (
        <Cel u={u} k="hf" d={HAIR.sleek} c={c} s={s} rim={rim}>
          <path
            d="M42 19C47 16.4 55 16.6 60 19.6C54 18.6 47 19.4 43 22.4Z"
            fill={hi}
          />
        </Cel>
      );
    case "curly": {
      const d = Curls({
        pts: [
          [40, 24, 6.2],
          [47, 20.4, 6.6],
          [55, 20, 6.6],
          [62, 24, 6.2],
          [36.4, 31, 4.6],
          [65, 31, 4.8],
          [50.5, 25.4, 4.6],
        ],
      });
      return (
        <Cel u={u} k="hf" d={d} c={c} s={s} rim={rim} dx={-3.2} dy={-1.8}>
          <path
            d="M40 20c3-3 7-4 10-3"
            stroke={hi}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </Cel>
      );
    }
    case "long":
      return (
        <Cel
          u={u}
          k="hf"
          d={`${HAIR.longCap}M33.6 36C30 50 28.6 70 27 90L38 92C37.5 76 38.5 60 38.5 46C36.4 44 35 40 33.6 36Z`}
          c={c}
          s={s}
          rim={rim}
        >
          <path
            d="M42 18C48 14.6 57 15.4 62 20C55 18.6 47 20 41 24Z"
            fill={hi}
          />
          <path
            d="M31.5 56C31 66 30 76 29.4 86"
            stroke={hi}
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />
        </Cel>
      );
    case "bob":
      return (
        <Cel u={u} k="hf" d={HAIR.bobFront} c={c} s={s} rim={rim}>
          <path d="M42 19C48 16 57 16.6 62 21C55 19 47 20.6 41 25Z" fill={hi} />
        </Cel>
      );
    case "braids":
      return (
        <>
          <Cel u={u} k="hf" d={HAIR.sleek} c={c} s={s} rim={rim}>
            <path
              d="M42 19C47 16.4 55 16.6 60 19.6C54 18.6 47 19.4 43 22.4Z"
              fill={hi}
            />
          </Cel>
          {(
            [
              [37.4, 44, 33.4, 92, -1],
              [63.2, 44, 67.4, 92, 1],
            ] as const
          ).map(([x0, y0, x1, y1, sg], bi) => (
            <g key={bi}>
              {Array.from({ length: 11 }).map((_, i) => {
                const t = i / 10;
                const x = x0 + (x1 - x0) * t + Math.sin(t * 5) * 0.8 * sg;
                const y = y0 + (y1 - y0) * t;
                return (
                  <g key={i}>
                    <ellipse
                      cx={x + 0.9}
                      cy={y + 0.9}
                      rx="3.3"
                      ry="2.9"
                      fill={s}
                    />
                    <ellipse cx={x} cy={y} rx="3.3" ry="2.9" fill={c} />
                    <path
                      d={`M${x - 1.6} ${y - 0.8}q1.4-1.2 3 0`}
                      stroke={hi}
                      strokeWidth="0.8"
                      fill="none"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}
              <circle cx={x1} cy={y1 + 3.6} r="1.9" fill={acc[0]} />
            </g>
          ))}
        </>
      );
    case "locs": {
      const front: [number, number, number, number][] = [
        [34, 38, 30, 84],
        [66, 38, 71, 84],
        [36, 42, 34, 90],
        [64, 42, 66, 92],
      ];
      return (
        <>
          <Cel u={u} k="hf" d={HAIR.sleek} c={c} s={s} rim={rim}>
            <path
              d="M42 19C47 16.4 55 16.6 60 19.6C54 18.6 47 19.4 43 22.4Z"
              fill={hi}
            />
          </Cel>
          {front.map(([x1, y1, x2, y2], i) => (
            <g key={i} strokeLinecap="round" fill="none">
              <path
                d={`M${x1} ${y1}C${x1 - 3} ${(y1 + y2) / 2} ${x2 + 1} ${(y1 + y2) / 2} ${x2} ${y2}`}
                stroke={s}
                strokeWidth="4.8"
              />
              <path
                d={`M${x1 - 0.6} ${y1}C${x1 - 3.6} ${(y1 + y2) / 2} ${x2 + 0.4} ${(y1 + y2) / 2} ${x2 - 0.6} ${y2}`}
                stroke={c}
                strokeWidth="3.4"
              />
              <path
                d={`M${x2 - 1.2} ${y2 - 12}L${x2 - 1.2} ${y2 - 4}`}
                stroke={hi}
                strokeWidth="0.9"
              />
            </g>
          ))}
          {/* bandana */}
          <Cel
            u={u}
            k="bnd"
            d="M32.6 33C36 23.4 66 23.4 69.4 33L69.8 39.4C64 33.4 38 33.4 32.2 39.4Z"
            c={acc[0]}
            s={acc[1]}
            rim={rim}
            dx={-3.4}
            dy={-1.6}
          >
            <rect x="30" y="24" width="42" height="16" fill={`url(#${u}pat)`} />
          </Cel>
        </>
      );
    }
    case "wrap":
      return (
        <>
          <Cel
            u={u}
            k="wr"
            d="M31.6 38C28.6 20 39.6 8.6 52 9.4C64.6 10 72.4 20.6 68.6 38C64.4 31 40 30.4 31.6 38Z"
            c={acc[0]}
            s={acc[1]}
            rim={rim}
            dx={-4}
            dy={-2}
          >
            <rect x="26" y="6" width="50" height="36" fill={`url(#${u}pat)`} />
            <path
              d="M34 30C40 15 58 11 70 24"
              stroke={acc[2]}
              strokeWidth="1.3"
              fill="none"
            />
            <path
              d="M31.6 34C43 22 60 20 69 30"
              stroke={acc[1]}
              strokeWidth="2.2"
              fill="none"
            />
          </Cel>
          <path d="M37 21C34 16 36 10 41 9C44 12 43 18 37 21Z" fill={acc[0]} />
          <path d="M37 21C41 22 46 18 46 13C42 12 38 14 37 21Z" fill={acc[1]} />
          <circle cx="37.6" cy="20.4" r="1.7" fill={acc[2]} />
        </>
      );
    case "beanie":
      return (
        <>
          <path
            d="M33.6 27.4C33 31 33.2 35.4 34.6 40L38.4 38.4L38.6 28Z"
            fill={c}
          />
          <Cel
            u={u}
            k="bn"
            d="M32.4 24C30 9.6 41 5.2 51.4 5.4C62 5.6 71 10.6 68.4 24Z"
            c={acc[0]}
            s={acc[1]}
            rim={rim}
            dx={-4}
            dy={-2}
          >
            <path
              d="M38 12C43 8 54 7.6 62 11"
              stroke={acc[2]}
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
            />
          </Cel>
          <Cel
            u={u}
            k="bc"
            d="M31.4 21.6H69.2L69.8 30.2C56 33.4 45 33.4 31.2 30.2Z"
            c={acc[2]}
            s={acc[1]}
            rim={rim}
            dx={-3}
            dy={-1.2}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <path
                key={i}
                d={`M${34 + i * 3} 21V34`}
                stroke={acc[1]}
                strokeWidth="0.7"
                opacity="0.55"
              />
            ))}
          </Cel>
        </>
      );
    case "cap":
      return (
        <>
          <path
            d="M32.6 36C31.4 40 32.4 44 33.6 47L36.6 44.4L36 36Z"
            fill={c}
          />
          <Cel
            u={u}
            k="cp"
            d="M33.2 33C31.4 17.6 41 10.8 51.4 10.8C62.6 10.8 69.6 17.6 68.2 33Z"
            c={acc[0]}
            s={acc[1]}
            rim={rim}
            dx={-4}
            dy={-2}
          >
            <path
              d="M36 20C41 13.6 56 12.4 66 19"
              stroke={acc[2]}
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="50" cy="12" r="1.5" fill={acc[1]} />
            <rect
              x="44.6"
              y="21.4"
              width="11.6"
              height="4.4"
              rx="2.2"
              fill="#ffffff"
            />
          </Cel>
          <Cel
            u={u}
            k="br"
            d="M34.4 31.4C46 27.2 66 28.6 80 36.4C71 39.4 52 38.4 34.6 34.6Z"
            c={acc[0]}
            s={acc[1]}
            rim={rim}
            dx={-3}
            dy={-1.6}
          />
        </>
      );
    case "hijab":
      return null;
    default:
      return null;
  }
}

/** Shape that casts a hard shadow onto the forehead. */
function castPath(r: Recipe): string | null {
  switch (r.style) {
    case "short":
      return HAIR.short;
    case "quiff":
      return HAIR.quiff;
    case "buzz":
      return HAIR.buzz;
    case "bun":
    case "puffs":
    case "braids":
    case "locs":
      return HAIR.sleek;
    case "long":
      return HAIR.longCap;
    case "bob":
      return HAIR.bobFront;
    case "curly":
      return "M33 42C31 24 40 16 50 16C60 16 69 24 67 42C64 30 60 27 50 27C42 27 37 30 33 42Z";
    case "wrap":
      return "M31.6 38C28.6 20 39.6 8.6 52 9.4C64.6 10 72.4 20.6 68.6 38C64.4 31 40 30.4 31.6 38Z";
    case "beanie":
      return "M31.4 21.6H69.2L69.8 30.2C56 33.4 45 33.4 31.2 30.2Z";
    case "cap":
      return "M34.4 31.4C46 27.2 66 28.6 80 36.4C71 39.4 52 38.4 34.6 34.6Z";
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Face                                                                */
/* ------------------------------------------------------------------ */

function Eye({
  u,
  k,
  cx,
  cy,
  w,
  outer,
  r,
  wink,
}: {
  u: string;
  k: string;
  cx: number;
  cy: number;
  w: number;
  outer: -1 | 1;
  r: Recipe;
  wink?: boolean;
}) {
  const h = w * 0.36;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const yl = cy + (outer < 0 ? -0.9 : 0.35);
  const yr = cy + (outer > 0 ? -0.9 : 0.35);
  const top = `M${x0} ${yl}C${cx - w * 0.22} ${cy - h * 1.2} ${cx + w * 0.22} ${cy - h * 1.2} ${x1} ${yr}`;
  const shape = `${top}C${cx + w * 0.22} ${cy + h * 0.72} ${cx - w * 0.22} ${cy + h * 0.72} ${x0} ${yl}Z`;
  const bot = `M${x0} ${yl}C${cx - w * 0.22} ${cy + h * 0.72} ${cx + w * 0.22} ${cy + h * 0.72} ${x1} ${yr}`;
  const id = `${u}${k}`;
  const ox = outer < 0 ? x0 : x1;
  const oy = outer < 0 ? yl : yr;
  const ix = cx + (outer < 0 ? 0.35 : -0.35);
  const wing = r.lashes ? 1.9 : 1.1;
  return (
    <g>
      <clipPath id={id}>
        <path d={shape} />
      </clipPath>
      <path d={shape} fill="#f8f2ee" />
      <g clipPath={`url(#${id})`}>
        <circle cx={ix} cy={cy - 0.15} r={w * 0.27} fill={r.iris} />
        <circle cx={ix} cy={cy - 0.15} r={w * 0.13} fill={INK} />
        <circle
          cx={ix + w * 0.11}
          cy={cy - 0.85}
          r={w * 0.075}
          fill="#ffffff"
        />
        <path
          d={top}
          stroke="#000"
          strokeOpacity="0.12"
          strokeWidth="2.6"
          fill="none"
        />
      </g>
      <g className={wink ? "hf-ava3-lid hf-ava3-wink" : "hf-ava3-lid"}>
        <path d={shape} fill={r.skin[0]} stroke={r.skin[0]} strokeWidth="0.6" />
        <path
          d={bot}
          stroke={INK}
          strokeWidth={r.lashes ? 1 : 0.85}
          fill="none"
          strokeLinecap="round"
        />
      </g>
      <path
        d={top}
        stroke={INK}
        strokeWidth={r.lashes ? 1.3 : 1.05}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M${ox} ${oy}l${outer * wing} -0.9`}
        stroke={INK}
        strokeWidth={r.lashes ? 1.1 : 0.9}
        strokeLinecap="round"
      />
    </g>
  );
}

function Face({ r, u }: Ctx) {
  const sh = r.skin[1];
  const browC = r.style === "bald" || r.beard ? r.hair[1] : r.hair[1];
  const bw = r.lashes ? 1.5 : 1.9;
  return (
    <g>
      {/* brows */}
      <path
        d="M38.6 34.4C41 32.2 45 31.8 48 33.2"
        stroke={browC}
        strokeWidth={bw}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M53.4 33.2C55.8 31.8 59 32 61.2 33.8"
        stroke={browC}
        strokeWidth={bw}
        strokeLinecap="round"
        fill="none"
      />
      <Eye u={u} k="eL" cx={43.2} cy={38.6} w={8.6} outer={-1} r={r} />
      <Eye u={u} k="eR" cx={57.4} cy={38.4} w={7} outer={1} r={r} wink />
      {/* nose: hard shadow shape on the far side + tip line */}
      <path
        d="M51.6 40.4C52.6 43.8 54 46.2 55 47.8C54.4 49.6 51.6 50.2 49.2 49.6C50.6 49 51.6 48.6 51.6 47.4C51.8 45 51.6 42.6 51 40.6Z"
        fill={sh}
      />
      <path
        d="M47.8 49.2C48.8 50.2 51.2 50.4 52.6 49.6"
        stroke={sh}
        strokeWidth="0.9"
        fill="none"
        strokeLinecap="round"
      />
      {/* mouth: soft closed smile (neutral + warmer variant crossfaded on hover) */}
      <g className="hf-ava3-m0">
        <path
          d="M46.4 53.2C48 52 49.6 52.1 51.2 52.7C52.8 52.1 54.4 52 55.8 53.2C54.2 55.7 48 55.7 46.4 53.2Z"
          fill={r.lip}
        />
        <path
          d="M46.4 53.2C49 53.9 53.4 53.9 55.8 53.2"
          stroke="#000"
          strokeOpacity="0.28"
          strokeWidth="0.6"
          fill="none"
        />
        <path
          d="M49.2 55.9C50.6 56.3 52.2 56.3 53.4 55.8"
          stroke={sh}
          strokeWidth="0.7"
          fill="none"
          strokeLinecap="round"
        />
      </g>
      <g className="hf-ava3-m1">
        <path
          d="M46 52.3C47.6 51.6 49.4 51.9 51.2 52.6C53 51.9 54.8 51.6 56.2 52.3C54.8 56 47.6 56 46 52.3Z"
          fill={r.lip}
        />
        <path
          d="M46 52.3C49 54 53.2 54 56.2 52.3"
          stroke="#000"
          strokeOpacity="0.3"
          strokeWidth="0.6"
          fill="none"
        />
        <path
          d="M45.4 51.6q0.6 0.4 0.9 1M56.8 51.6q-0.6 0.4-0.9 1"
          stroke={sh}
          strokeWidth="0.6"
          fill="none"
          strokeLinecap="round"
        />
      </g>
      {r.freckles && (
        <g fill={sh} opacity="0.85">
          {[
            [40, 45],
            [42.6, 46.4],
            [44.6, 44.4],
            [38.4, 43.2],
            [57.6, 45],
            [60, 43.4],
            [55.4, 46.6],
            [47.4, 43.4],
            [51.2, 43],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="0.55" />
          ))}
        </g>
      )}
      {r.lines && (
        <g stroke={sh} strokeWidth="0.7" fill="none" strokeLinecap="round">
          <path d="M40.6 26.6C44 25.4 48 25.4 50 26M53 26C55.6 25.4 58.6 25.6 60.6 26.6" />
          <path d="M40 43.4C41.4 47 43.4 49.6 45.4 51M60.8 43C60.6 46 59.4 49 57.4 51" />
          <path d="M37.6 37.8q-1 0.9-1.1 2M62.6 37.4q1 0.9 1.1 2" />
        </g>
      )}
    </g>
  );
}

function Beard({ r, u }: Ctx) {
  if (!r.beard && !r.stubble) return null;
  const { hair, skin } = r;
  if (r.stubble) {
    return (
      <path
        d="M37.6 48C39 54 43 58 50 58.4C56 58 59.4 54.4 60.6 49.6C59 51 57.6 51.6 56.4 51.8C53 55.6 47 55.6 44 51.8C41.6 51.6 39 50.4 37.6 48Z"
        fill={skin[1]}
        opacity="0.42"
      />
    );
  }
  const full = r.beard === "full";
  const d = full
    ? "M33.4 40C33 52 39 62.4 50 63.4C61 62.4 67 52 66.6 40C65.4 46 62 48 59.4 48.4C57.4 49.6 55.8 50.4 55 50.6C52.4 51.6 47.6 51.6 45 50.6C44.2 50.4 42.6 49.6 40.6 48.4C38 48 34.6 46 33.4 40Z"
    : "M34.2 42C34.4 51.4 40 60.6 50 61.4C60 60.6 65.6 51.4 65.8 42C64.6 46.6 61 48.2 58.6 48.8C56.6 49.6 55.4 50.2 55 50.6C52.4 51.4 47.6 51.4 45 50.6C44.6 50.2 43.4 49.6 41.4 48.8C39 48.2 35.4 46.6 34.2 42Z";
  return (
    <Cel
      u={u}
      k="bd"
      d={d}
      c={hair[0]}
      s={hair[1]}
      rim={r.bg.rim}
      dx={-3.4}
      dy={-1.6}
    >
      <path
        d="M40 51C42 55 45 58 48 59"
        stroke={hair[2]}
        strokeWidth="1"
        fill="none"
        opacity="0.7"
        strokeLinecap="round"
      />
    </Cel>
  );
}

function Glasses({ r }: { r: Recipe }) {
  const g = r.glasses;
  if (!g) return null;
  const round = g.shape === "round";
  const lensL = round ? (
    <circle cx="43.2" cy="38.6" r="6.4" />
  ) : (
    <rect x="36.6" y="33.4" width="13.2" height="10.4" rx="3" />
  );
  const lensR = round ? (
    <ellipse cx="57.4" cy="38.4" rx="5.4" ry="6.2" />
  ) : (
    <rect x="52" y="33.4" width="11" height="10.4" rx="3" />
  );
  return (
    <g>
      <g fill={g.lens} fillOpacity={g.a}>
        {lensL}
        {lensR}
      </g>
      <g fill="none" stroke={g.frame} strokeWidth="1.25">
        {lensL}
        {lensR}
        <path
          d={
            round
              ? "M49.4 37.4C50.8 36.2 51.8 36.2 52.4 37.4"
              : "M49.8 37C50.6 36.2 51.4 36.2 52 37"
          }
          strokeLinecap="round"
        />
        <path d="M36.7 37.4L33.6 36.6" strokeLinecap="round" />
        <path d="M62.8 37.2L65.6 36.6" strokeLinecap="round" />
      </g>
      <path
        d="M39.6 35.6L42.6 33.6M54 35.4L56.4 33.8"
        stroke="#fff"
        strokeOpacity="0.7"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </g>
  );
}

function SunUp({ r }: { r: Recipe }) {
  const s = r.sunUp;
  if (!s) return null;
  return (
    <g>
      <path
        d="M36 22.6C40 19 47 19 50 21.6L49 27C44 28 39 27.6 36 26Z"
        fill={s.lens}
        stroke={s.frame}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M53 21.4C56 19 62 19.4 65 22.8L64.4 26.2C60 28 56 27.6 53.4 26.6Z"
        fill={s.lens}
        stroke={s.frame}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M49.6 23.2C50.6 22.2 52 22.2 53 23.2"
        stroke={s.frame}
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M38.5 22.4l4-1.6M55.4 22.4l3-1"
        stroke="#fff"
        strokeOpacity="0.6"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </g>
  );
}

function Ear({ r, u }: Ctx) {
  if (r.style === "hijab") return null;
  return (
    <Cel
      u={u}
      k="ear"
      d="M35.6 41.6C32.6 40.4 30.8 44.4 32.4 48.6C33.4 51.2 35.6 51.8 37 50.4Z"
      c={r.skin[0]}
      s={r.skin[1]}
      dx={-1.5}
      dy={-1}
    />
  );
}

function Earring({ r }: { r: Recipe }) {
  const e = r.earring;
  if (!e || r.style === "hijab") return null;
  const hidden =
    r.style === "long" ||
    r.style === "bob" ||
    r.style === "curly" ||
    r.style === "locs";
  if (hidden && e.kind !== "stud") return null;
  const x = 33.2;
  const y = 50.4;
  switch (e.kind) {
    case "stud":
      return <circle cx={34.4} cy={49.6} r="1.5" fill={e.c} />;
    case "drop":
      return (
        <g>
          <circle cx={x} cy={y} r="1.2" fill={e.c} />
          <path
            d={`M${x} ${y + 1}L${x - 1.7} ${y + 5.4}L${x + 0.7} ${y + 7.6}L${x + 2.5} ${y + 5}Z`}
            fill={e.c}
          />
          <path
            d={`M${x - 0.6} ${y + 3.4}L${x} ${y + 5.6}`}
            stroke="#fff"
            strokeOpacity="0.7"
            strokeWidth="0.7"
          />
        </g>
      );
    case "hoop":
      return (
        <circle
          cx={x}
          cy={y + 3.2}
          r="3.7"
          fill="none"
          stroke={e.c}
          strokeWidth="1.5"
        />
      );
    case "bar":
      return (
        <g>
          <circle cx={x} cy={y} r="1.2" fill={e.c} />
          <rect
            x={x - 1.2}
            y={y + 1.4}
            width="2.4"
            height="8"
            rx="1.2"
            fill={e.c}
          />
          <rect
            x={x - 0.5}
            y={y + 2.4}
            width="0.9"
            height="4.6"
            rx="0.4"
            fill="#fff"
            opacity="0.55"
          />
        </g>
      );
  }
}

/* ------------------------------------------------------------------ */
/* Hijab                                                               */
/* ------------------------------------------------------------------ */

const HIJAB_OUTER =
  "M27 42C25.4 20 38 9.6 51 9.6C64 9.6 76.6 20 75 42C74.6 54 76 64 82 78C86 86 92 92 96 102H8C14 92 20 86 24 78C30 64 28 54 27 42Z";
const HIJAB_HOLE =
  "M50.4 22.6C58.4 22.6 63.8 29 63.8 37.6C63.8 44.6 62.6 50 60 53.8C57.6 57.2 54 59.8 50.4 59.8C46.6 59.8 43 57.2 40.6 53.8C38 50 36.8 44.6 36.8 37.6C36.8 29 42.4 22.6 50.4 22.6Z";

function HijabFront({ r, u }: Ctx) {
  const [c, s, hi] = r.acc!;
  const id = `${u}hj`;
  return (
    <g>
      <clipPath id={id}>
        <path d={`${HIJAB_OUTER}${HIJAB_HOLE}`} clipRule="evenodd" />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <path d={HIJAB_OUTER} fill={r.bg.rim} />
        <path d={HIJAB_OUTER} fill={s} transform="translate(-1.4 0)" />
        <path d={HIJAB_OUTER} fill={c} transform="translate(-4.6 -1.8)" />
        {/* soft folds */}
        <path
          d="M30 40C30 30 34 20 44 14M50 60C40 66 34 74 30 86"
          stroke={hi}
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
          opacity="0.8"
        />
        <path
          d="M63 64C68 72 72 80 76 90M56 66C60 76 62 84 62 92"
          stroke={s}
          strokeWidth="1.1"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M37 60C30 62 26 72 24 84"
          stroke={s}
          strokeWidth="1.1"
          fill="none"
          strokeLinecap="round"
        />
        {/* inner band shadow along the face opening */}
        <path d={HIJAB_HOLE} fill="none" stroke={s} strokeWidth="2.2" />
      </g>
    </g>
  );
}

function Hand({ r, u }: Ctx) {
  const hand =
    "M7.2 19C5.8 18.7 5 17.5 5 16.2V12.1C4.2 12.1 3.7 11.7 3 11L1.5 9.4C.4 8.1 2.2 6.7 3.4 7.9L7.6 11V5.2C7.6 3.4 10.1 3.4 10.1 5.2V9.2V3.1C10.1 1.2 12.6 1.2 12.6 3.1V9.2V4.4C12.6 2.6 15.1 2.6 15.1 4.4V9.7V6.4C15.1 4.6 17.6 4.6 17.6 6.4V13C17.6 16.6 15.4 19 12 19Z";
  return (
    <>
      <Cel
        u={u}
        k="hand"
        d={hand}
        c={r.skin[0]}
        s={r.skin[1]}
        dx={-1.8}
        dy={-0.8}
      />
      <path
        d={hand}
        fill="none"
        stroke={INK}
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <path
        d="M7.3 16.7H12.9L12.5 19H7.5Z"
        fill={r.top.c[0]}
        stroke={INK}
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <path d="M7.4 17.2H12.8" stroke={r.top.c[1]} strokeWidth="0.6" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Outfit                                                              */
/* ------------------------------------------------------------------ */

function Garment({ r, u }: Ctx) {
  const { c, inner } = r.top;
  const rim = r.bg.rim;
  const line = {
    stroke: c[1],
    strokeWidth: 0.9,
    fill: "none",
    strokeLinecap: "round" as const,
  };
  switch (r.top.kind) {
    case "blazer": {
      const body =
        "M-6 102V92C-2 84 10 79 24 75.5C32 74 38 72 41 70L48 102ZM59 70C62 72 68 74 76 75.5C90 79 102 84 106 92V102H52Z";
      return (
        <g>
          <Cel
            u={u}
            k="tee"
            d="M41 70C44 80 56 80 59 70L61 102H39Z"
            c={inner[0]}
            s={inner[1]}
            dx={-2.2}
            dy={-1}
          />
          <Cel
            u={u}
            k="bz"
            d={body}
            c={c[0]}
            s={c[1]}
            rim={rim}
            dx={-5}
            dy={-2.4}
          />
          <path d="M41 70L29.8 81.4L37.4 85.4L45.6 102L48 102Z" fill={c[2]} />
          <path d="M59 70L70.2 81.4L62.6 85.4L54.4 102L52 102Z" fill={c[0]} />
          <path
            d="M59 70L70.2 81.4L62.6 85.4L54.4 102L52 102Z"
            fill={c[1]}
            opacity="0.5"
          />
          <path
            d="M29.8 81.4L37.4 85.4L45.6 102M70.2 81.4L62.6 85.4L54.4 102"
            {...line}
          />
          <path
            d="M22 78C16 88 13 96 12 102M78 78C84 88 88 96 90 102"
            {...line}
            opacity="0.7"
          />
        </g>
      );
    }
    case "shirt": {
      return (
        <g>
          <Cel
            u={u}
            k="sh"
            d={TORSO}
            c={c[0]}
            s={c[1]}
            rim={rim}
            dx={-5}
            dy={-2.4}
          >
            <path
              d="M22 78C16 88 13 96 12 102M78 78C84 88 88 96 90 102"
              stroke={c[1]}
              strokeWidth="0.9"
              fill="none"
              strokeLinecap="round"
              opacity="0.8"
            />
          </Cel>
          <path
            d="M43.6 69.6L50 90L56.4 69.6C53 71.4 47 71.4 43.6 69.6Z"
            fill={r.skin[0]}
          />
          <path d="M50 90V102" stroke={c[1]} strokeWidth="1" />
          <circle cx="50" cy="96" r="0.9" fill={c[1]} />
          <path d="M42.4 66.6L33.2 80.6L46 78L49 72Z" fill={c[2]} />
          <path d="M57.6 66.6L66.8 80.6L54 78L51 72Z" fill={c[0]} />
          <path
            d="M57.6 66.6L66.8 80.6L54 78L51 72Z"
            fill={c[1]}
            opacity="0.55"
          />
          <path d="M33.2 80.6L46 78M66.8 80.6L54 78" {...line} />
        </g>
      );
    }
    case "knit": {
      return (
        <g>
          <Cel
            u={u}
            k="kn"
            d={TORSO}
            c={c[0]}
            s={c[1]}
            rim={rim}
            dx={-5}
            dy={-2.4}
          >
            <path
              d="M22 78C16 88 13 96 12 102M78 78C84 88 88 96 90 102"
              stroke={c[1]}
              strokeWidth="0.9"
              fill="none"
              strokeLinecap="round"
              opacity="0.8"
            />
            {Array.from({ length: 9 }).map((_, i) => (
              <path
                key={i}
                d={`M${30 + i * 5} 90V102`}
                stroke={c[1]}
                strokeWidth="0.6"
                opacity="0.35"
              />
            ))}
          </Cel>
          <Cel
            u={u}
            k="mn"
            d="M42 63.2C42 60.6 58 60.6 58 63.2L59.6 74C56 76.4 44 76.4 40.4 74Z"
            c={c[2]}
            s={c[1]}
            dx={-2.6}
            dy={-1.2}
          >
            {[66, 69, 72].map((y) => (
              <path
                key={y}
                d={`M40 ${y}Q50 ${y + 2.4} 60 ${y}`}
                stroke={c[1]}
                strokeWidth="0.7"
                fill="none"
                opacity="0.6"
              />
            ))}
          </Cel>
        </g>
      );
    }
    case "bomber": {
      return (
        <g>
          <Cel
            u={u}
            k="bm"
            d={TORSO}
            c={c[0]}
            s={c[1]}
            rim={rim}
            dx={-5}
            dy={-2.4}
          >
            <path
              d="M22 78C16 88 13 96 12 102M78 78C84 88 88 96 90 102"
              stroke={c[1]}
              strokeWidth="0.9"
              fill="none"
              strokeLinecap="round"
              opacity="0.8"
            />
            <path
              d="M14 96C24 92 32 91 40 92M86 96C76 92 68 91 60 92"
              stroke={c[2]}
              strokeWidth="2.2"
              fill="none"
            />
          </Cel>
          <path d="M50 74V102" stroke={c[1]} strokeWidth="1.1" />
          <path
            d="M51.6 76V102"
            stroke={c[2]}
            strokeWidth="0.8"
            strokeDasharray="1 1.2"
          />
          <Cel
            u={u}
            k="bcl"
            d="M41.4 64.4C41.4 62 58.6 62 58.6 64.4L61.2 75.4C56 78.4 44 78.4 38.8 75.4Z"
            c={c[2]}
            s={c[1]}
            dx={-2.6}
            dy={-1.2}
          >
            {[67, 70, 73].map((y) => (
              <path
                key={y}
                d={`M38 ${y}Q50 ${y + 2.6} 62 ${y}`}
                stroke={c[1]}
                strokeWidth="0.8"
                fill="none"
                opacity="0.55"
              />
            ))}
          </Cel>
        </g>
      );
    }
    case "puffer": {
      const vest =
        "M11 102C11 91 14 84 22 79C30 75.6 37 73 40.5 68H59.5C63 73 70 75.6 78 79C86 84 89 91 89 102Z";
      return (
        <g>
          <Cel
            u={u}
            k="pk"
            d={TORSO}
            c={inner[0]}
            s={inner[1]}
            dx={-4}
            dy={-2}
          />
          <Cel
            u={u}
            k="pv"
            d={vest}
            c={c[0]}
            s={c[1]}
            rim={rim}
            dx={-5}
            dy={-2.4}
          >
            <path
              d="M14 82C30 86 70 86 86 82M11 91C30 95 70 95 89 91M11 100C30 104 70 104 89 100"
              stroke={c[1]}
              strokeWidth="1"
              fill="none"
              opacity="0.85"
            />
            <path
              d="M18 80C18 88 17 95 16 102"
              stroke={c[2]}
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
            />
            <path d="M50 74V102" stroke={c[1]} strokeWidth="1.2" />
          </Cel>
          <Cel
            u={u}
            k="pc"
            d="M39 65.6C39 62 61 62 61 65.6L63 76C56 79.6 44 79.6 37 76Z"
            c={c[2]}
            s={c[1]}
            dx={-3}
            dy={-1.4}
          >
            <path
              d="M38 71C46 74 54 74 62 71"
              stroke={c[1]}
              strokeWidth="0.9"
              fill="none"
              opacity="0.7"
            />
          </Cel>
        </g>
      );
    }
    case "trench": {
      return (
        <g>
          <Cel
            u={u}
            k="tn"
            d={TORSO}
            c={c[0]}
            s={c[1]}
            rim={rim}
            dx={-5}
            dy={-2.4}
          >
            <path
              d="M22 78C16 88 13 96 12 102M78 78C84 88 88 96 90 102"
              stroke={c[1]}
              strokeWidth="0.9"
              fill="none"
              strokeLinecap="round"
              opacity="0.8"
            />
          </Cel>
          <path d="M43 68L50 92L57 68C54 71 46 71 43 68Z" fill={inner[0]} />
          <path
            d="M43 68L50 92L57 68"
            stroke={inner[1]}
            strokeWidth="0.7"
            fill="none"
          />
          <path d="M41.6 64.6L26.6 76.6L34.4 91L48 84L46 68Z" fill={c[2]} />
          <path d="M58.4 64.6L73.4 76.6L65.6 91L52 84L54 68Z" fill={c[0]} />
          <path
            d="M58.4 64.6L73.4 76.6L65.6 91L52 84L54 68Z"
            fill={c[1]}
            opacity="0.45"
          />
          <path
            d="M26.6 76.6L34.4 91L48 84M73.4 76.6L65.6 91L52 84"
            {...line}
          />
          <circle cx="45" cy="94.5" r="1.3" fill={c[1]} />
          <circle cx="55" cy="94.5" r="1.3" fill={c[1]} />
        </g>
      );
    }
    case "hoodie": {
      return (
        <g>
          <Cel
            u={u}
            k="hood"
            d={TORSO}
            c={c[0]}
            s={c[1]}
            rim={rim}
            dx={-5}
            dy={-2.4}
          >
            <path
              d="M22 78C16 88 13 96 12 102M78 78C84 88 88 96 90 102"
              stroke={c[1]}
              strokeWidth="0.9"
              fill="none"
              strokeLinecap="round"
              opacity="0.8"
            />
            <path
              d="M34 98C44 96 56 96 66 98"
              stroke={c[1]}
              strokeWidth="1"
              fill="none"
              opacity="0.6"
            />
          </Cel>
          <Cel
            u={u}
            k="hc"
            d="M31 74C31 66 39.6 65.4 43 67.4C44.4 75 55.6 75 57 67.4C60.4 65.4 69 66 69 74C69 84.4 58 88.6 50 88.6C42 88.6 31 84.4 31 74Z"
            c={c[2]}
            s={c[1]}
            dx={-3.4}
            dy={-1.6}
          />
          <path
            d="M43 67.4C44.4 75 55.6 75 57 67.4C55 71.6 45 71.6 43 67.4Z"
            fill={c[1]}
            opacity="0.8"
          />
          <path
            d="M45 79L44 92M55 79L56 92"
            stroke={c[2]}
            strokeWidth="1.1"
            strokeLinecap="round"
          />
          <circle cx="44" cy="92.6" r="1" fill={c[1]} />
          <circle cx="56" cy="92.6" r="1" fill={c[1]} />
        </g>
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Accessories on the body                                             */
/* ------------------------------------------------------------------ */

function BodyExtras({ r }: { r: Recipe }) {
  return (
    <g>
      {r.chain && (
        <g>
          <path
            d="M41.4 72C43 88 57 88 58.6 72"
            stroke={r.chain}
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
            strokeDasharray="1.6 0.5"
          />
          <circle cx="50" cy="86.4" r="1.7" fill={r.chain} />
        </g>
      )}
      {r.tote && (
        <g>
          <path d="M69 72.4L38 102H27L60 72Z" fill={r.tote} />
          <path
            d="M60 72L27 102"
            stroke="#fff"
            strokeOpacity="0.35"
            strokeWidth="0.7"
            strokeDasharray="1.6 1.4"
          />
        </g>
      )}
      {r.buds && (
        <g fill="none" strokeLinecap="round">
          <path
            d="M35.6 50C37.6 58 39.4 66 41 76C42 84 42.4 90 42 98"
            stroke="#f4f0ff"
            strokeWidth="1.1"
          />
          <path
            d="M36 50C38 58 39.8 66 41.4 76"
            stroke="#000"
            strokeOpacity="0.15"
            strokeWidth="0.5"
          />
        </g>
      )}
    </g>
  );
}

function BudInEar({ r }: { r: Recipe }) {
  if (!r.buds) return null;
  return (
    <ellipse
      cx="35"
      cy="47.6"
      rx="1.7"
      ry="2.2"
      fill="#f4f0ff"
      stroke="#c9c1e6"
      strokeWidth="0.5"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Figure                                                              */
/* ------------------------------------------------------------------ */

export function HumanFigure({
  id,
  index = 0,
}: {
  id: HumanAvatarId;
  /** Offsets animation timing so a grid of avatars doesn't move in lockstep. */
  index?: number;
}) {
  const r = HUMAN_AVATARS[id];
  const u = `hfa${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const ctx: Ctx = { r, u };
  const delay = `${(index % 8) * 0.9 + 0.7}s`;
  const hijab = r.style === "hijab";
  const cast = castPath(r);
  const patInk = r.pat ?? "#ffffff";

  return (
    <g
      data-avatar={id}
      style={{ "--hf-d": delay, "--hf-t": "3px" } as CSSProperties}
    >
      <g transform={r.flip ? "translate(100 0) scale(-1 1)" : undefined}>
        <defs>
          <pattern
            id={`${u}pat`}
            width="4.4"
            height="4.4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(20)"
          >
            <circle cx="2.2" cy="2.2" r="0.95" fill={patInk} opacity="0.85" />
          </pattern>
        </defs>
        <Backdrop {...ctx} />
        <Sparkles r={r} />

        <g transform="translate(0 2) translate(50 80) scale(1.06) translate(-50 -80)">
          <g className="hf-ava3-hair">
            <HairBack {...ctx} />
          </g>

          <g className="hf-ava3-body">
            {/* neck + chest, with the head's shadow falling under the chin */}
            <Cel
              u={u}
              k="nk"
              d={NECK}
              c={r.skin[0]}
              s={r.skin[1]}
              rim={r.bg.rim}
              dx={-3}
              dy={-1}
            >
              <path d={HEAD} fill={r.skin[1]} transform="translate(1.6 7.4)" />
              <path
                d={HEAD}
                fill={r.skin[1]}
                transform="translate(1.6 15)"
                opacity="0.5"
              />
            </Cel>
            <Garment {...ctx} />
            <BodyExtras r={r} />
          </g>

          <g className="hf-ava3-head">
            <g transform="translate(1.6 0)">
              <Ear {...ctx} />
              <Cel
                u={u}
                k="head"
                d={HEAD}
                c={r.skin[0]}
                s={r.skin[1]}
                rim={r.bg.rim}
                dx={-5}
                dy={-2.4}
              >
                {cast && (
                  <path
                    d={cast}
                    transform="translate(0.6 4.2)"
                    fill={r.skin[1]}
                  />
                )}
              </Cel>
              <g className="hf-ava3-face">
                <Beard {...ctx} />
                <Face {...ctx} />
                <Glasses r={r} />
              </g>
              <BudInEar r={r} />
              <g className="hf-ava3-hair">
                <HairFront {...ctx} />
                <SunUp r={r} />
                {hijab && <HijabFront {...ctx} />}
                <Earring r={r} />
              </g>
            </g>
          </g>
        </g>
        <g transform="translate(71 77)">
          <g className="hf-ava3-hand">
            <Hand {...ctx} />
          </g>
        </g>
      </g>
    </g>
  );
}

/** Convenience for callers that just need the full <svg>. */
export function HumanSvg({
  id,
  index,
}: {
  id: HumanAvatarId;
  index?: number;
}): ReactNode {
  return (
    <svg viewBox={AVATAR_VIEWBOX} width="100%" height="100%" className="block">
      <HumanFigure id={id} index={index} />
    </svg>
  );
}
