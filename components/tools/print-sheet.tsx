import type { CSSProperties, ReactNode } from "react";

/**
 * The printable test page. Everything is sized in millimetres and uses
 * fixed paper colours (not theme tokens) so the preview matches the print.
 */
export const SHEET_WIDTH_MM = 186;

const INK = "#111";
const CAP: CSSProperties = {
  fontSize: "2.6mm",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  margin: "0 0 1.2mm",
  color: "#333",
};

const CMYK = [
  { name: "Cyan", hex: "#00aeef" },
  { name: "Magenta", hex: "#ec008c" },
  { name: "Yellow", hex: "#fff200" },
  { name: "Black", hex: "#000000" },
];
const RGB = [
  { name: "Red", hex: "#ff0000" },
  { name: "Green", hex: "#00b050" },
  { name: "Blue", hex: "#0000ff" },
];
const TINTS = [100, 75, 50, 25, 10];
const GRAY_STEPS = 16;

function Block({
  title,
  children,
  style,
}: {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section style={{ breakInside: "avoid", marginTop: "3.5mm", ...style }}>
      <h4 style={CAP}>{title}</h4>
      {children}
    </section>
  );
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function tint(hex: string, pct: number) {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(255 - (255 - c) * (pct / 100));
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

export function PrintSheet({ stamp }: { stamp: string }) {
  const grays = Array.from({ length: GRAY_STEPS }, (_, i) =>
    Math.round((i / (GRAY_STEPS - 1)) * 255)
  );
  const bars = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div
      className="hf-dt-sheet"
      style={{
        width: `${SHEET_WIDTH_MM}mm`,
        boxSizing: "border-box",
        background: "#fff",
        color: INK,
        fontFamily: "Arial, Helvetica, sans-serif",
        padding: "0",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          borderBottom: "0.5mm solid #111",
          paddingBottom: "2mm",
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "6mm", fontWeight: 800 }}>
            Printer test page
          </h3>
          <p style={{ margin: "0.8mm 0 0", fontSize: "2.8mm", color: "#444" }}>
            HelpDesk First · check alignment, colour, tone, text and nozzles
          </p>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: "2.8mm",
            color: "#444",
            textAlign: "right",
          }}
        >
          {stamp}
        </p>
      </header>

      <Block title="1 · Alignment grid (every square is 5 mm)">
        <div
          style={{
            position: "relative",
            height: "44mm",
            border: "0.5mm solid #000",
            backgroundImage:
              "linear-gradient(to right, rgba(0,0,0,0.35) 0.2mm, transparent 0.2mm), linear-gradient(to bottom, rgba(0,0,0,0.35) 0.2mm, transparent 0.2mm)",
            backgroundSize: "5mm 5mm",
          }}
        >
          <svg
            viewBox="0 0 186 44"
            width="100%"
            height="100%"
            style={{ position: "absolute", inset: 0 }}
            aria-hidden
          >
            <line
              x1="0"
              y1="0"
              x2="186"
              y2="44"
              stroke="#000"
              strokeWidth="0.3"
            />
            <line
              x1="0"
              y1="44"
              x2="186"
              y2="0"
              stroke="#000"
              strokeWidth="0.3"
            />
            <circle
              cx="93"
              cy="22"
              r="15"
              fill="none"
              stroke="#000"
              strokeWidth="0.5"
            />
            <circle
              cx="93"
              cy="22"
              r="8"
              fill="none"
              stroke="#000"
              strokeWidth="0.3"
            />
            <line
              x1="93"
              y1="0"
              x2="93"
              y2="44"
              stroke="#000"
              strokeWidth="0.5"
            />
            <line
              x1="0"
              y1="22"
              x2="186"
              y2="22"
              stroke="#000"
              strokeWidth="0.5"
            />
            {[
              [0, 0],
              [186, 0],
              [0, 44],
              [186, 44],
            ].map(([x, y], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r="3" fill="#000" />
              </g>
            ))}
            <text
              x="93"
              y="4.5"
              textAnchor="middle"
              fontSize="3"
              fontWeight="700"
              fill="#000"
            >
              TOP
            </text>
            <text
              x="93"
              y="42"
              textAnchor="middle"
              fontSize="3"
              fontWeight="700"
              fill="#000"
            >
              BOTTOM
            </text>
          </svg>
        </div>
        <p style={{ margin: "1mm 0 0", fontSize: "2.6mm", color: "#444" }}>
          Lines should be straight, squares even, and all four corner dots
          visible with nothing cut off.
        </p>
      </Block>

      <Block title="2 · Colour bars">
        <div style={{ display: "flex", gap: "1.5mm", height: "12mm" }}>
          {CMYK.map((c) => (
            <div
              key={c.name}
              style={{
                flex: 1,
                background: c.hex,
                display: "flex",
                alignItems: "flex-end",
                padding: "0.8mm 1.2mm",
                boxSizing: "border-box",
                border: "0.2mm solid #999",
              }}
            >
              <span
                style={{
                  fontSize: "2.4mm",
                  fontWeight: 700,
                  color: c.name === "Yellow" ? "#000" : "#fff",
                }}
              >
                {c.name}
              </span>
            </div>
          ))}
          <div style={{ width: "3mm" }} />
          {RGB.map((c) => (
            <div
              key={c.name}
              style={{
                flex: 1,
                background: c.hex,
                display: "flex",
                alignItems: "flex-end",
                padding: "0.8mm 1.2mm",
                boxSizing: "border-box",
              }}
            >
              <span
                style={{ fontSize: "2.4mm", fontWeight: 700, color: "#fff" }}
              >
                {c.name}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gap: "1mm", marginTop: "1.5mm" }}>
          {CMYK.map((c) => (
            <div
              key={c.name}
              style={{ display: "flex", gap: "0.8mm", height: "3.6mm" }}
            >
              {TINTS.map((t) => (
                <div
                  key={t}
                  style={{
                    flex: 1,
                    background: tint(c.hex, t),
                    border: "0.15mm solid #ccc",
                  }}
                />
              ))}
              <span
                style={{
                  width: "20mm",
                  fontSize: "2.4mm",
                  color: "#444",
                  lineHeight: "3.6mm",
                  whiteSpace: "nowrap",
                }}
              >
                {c.name} tints
              </span>
            </div>
          ))}
        </div>
      </Block>

      <Block title="3 · Grayscale ramp (black to white)">
        <div
          style={{
            display: "flex",
            height: "10mm",
            border: "0.2mm solid #999",
          }}
        >
          {grays.map((g) => (
            <div
              key={g}
              style={{ flex: 1, background: `rgb(${g},${g},${g})` }}
            />
          ))}
        </div>
        <p style={{ margin: "1mm 0 0", fontSize: "2.6mm", color: "#444" }}>
          You should be able to tell all 16 steps apart. If the lightest ones
          vanish into the paper, the printer is running low or set to draft
          quality.
        </p>
      </Block>

      <Block title="4 · Text sizes">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "3mm",
          }}
        >
          <div style={{ lineHeight: 1.25 }}>
            {[6, 8, 10, 12, 14].map((pt) => (
              <p key={pt} style={{ margin: 0, fontSize: `${pt}pt` }}>
                {pt} pt - The quick brown fox jumps over the lazy dog 0123456789
              </p>
            ))}
          </div>
          <div style={{ display: "grid", gap: "1.5mm", alignContent: "start" }}>
            <div
              style={{
                background: "#000",
                color: "#fff",
                padding: "1.2mm 2mm",
              }}
            >
              <p style={{ margin: 0, fontSize: "8pt" }}>
                8 pt reversed: white text on black
              </p>
              <p style={{ margin: 0, fontSize: "12pt", fontWeight: 700 }}>
                12 pt reversed bold
              </p>
            </div>
            <p style={{ margin: 0, fontSize: "10pt", color: "#777" }}>
              10 pt mid-grey text
            </p>
            <p style={{ margin: 0, fontSize: "10pt", color: "#aaa" }}>
              10 pt light-grey text
            </p>
          </div>
        </div>
      </Block>

      <Block title="5 · Fine line patterns">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "2mm",
            height: "14mm",
          }}
        >
          {[
            "repeating-linear-gradient(to bottom, #000 0, #000 0.15mm, #fff 0.15mm, #fff 0.45mm)",
            "repeating-linear-gradient(to bottom, #000 0, #000 0.3mm, #fff 0.3mm, #fff 0.9mm)",
            "repeating-linear-gradient(to right, #000 0, #000 0.2mm, #fff 0.2mm, #fff 0.8mm)",
            "repeating-linear-gradient(45deg, #000 0, #000 0.2mm, #fff 0.2mm, #fff 1mm)",
            "repeating-radial-gradient(circle at 50% 50%, #000 0, #000 0.2mm, #fff 0.2mm, #fff 1mm)",
          ].map((bg, i) => (
            <div
              key={i}
              style={{ background: bg, border: "0.2mm solid #666" }}
            />
          ))}
        </div>
        <p style={{ margin: "1mm 0 0", fontSize: "2.6mm", color: "#444" }}>
          Patterns should look crisp and evenly spaced. Grey mush or moiré means
          low resolution or a dirty print head.
        </p>
      </Block>

      <Block title="6 · Nozzle check (every line should be solid and complete)">
        <div style={{ display: "grid", gap: "1.2mm" }}>
          {CMYK.map((c) => (
            <div
              key={c.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                height: "4.4mm",
              }}
            >
              {bars.map((b) => (
                <div
                  key={b}
                  style={{ width: "0.45mm", background: c.hex, height: "100%" }}
                />
              ))}
            </div>
          ))}
        </div>
        <p style={{ margin: "1mm 0 0", fontSize: "2.6mm", color: "#444" }}>
          Gaps or faded lines in a colour mean clogged nozzles. Run a head
          cleaning and print this page again.
        </p>
      </Block>
    </div>
  );
}
