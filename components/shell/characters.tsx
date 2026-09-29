import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const CHARACTERS = [
  "bot",
  "cat",
  "ghost",
  "alien",
  "owl",
  "rocket",
] as const;

export type CharacterId = (typeof CHARACTERS)[number];

export function Character({
  id,
  className,
}: {
  id: CharacterId;
  className?: string;
}) {
  const eyes = (
    <g className="hf-blink-eyes" fill="var(--primary-foreground)">
      <circle cx="17" cy="22" r="2" />
      <circle cx="27" cy="22" r="2" />
    </g>
  );

  const face = (
    <>
      {eyes}
      <path
        d="M19 28c2 2 4 2 6 0"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </>
  );

  let body: ReactNode;
  switch (id) {
    case "cat":
      body = (
        <>
          <path d="m10 17 2-8 6 5h4l6-5 2 8" fill="var(--primary)" />
          <rect
            x="9"
            y="13"
            width="22"
            height="21"
            rx="9"
            fill="var(--primary)"
            className="hf-bob"
          />
          {face}
          <circle cx="30" cy="10" r="3" fill="#ffc24b" className="hf-glow" />
        </>
      );
      break;
    case "ghost":
      body = (
        <>
          <path
            d="M10 32V18a11 11 0 0 1 22 0v14l-4-3-4 3-4-3-4 3-4-3-2 3Z"
            fill="var(--primary)"
            className="hf-bob"
          />
          {face}
          <circle cx="29" cy="13" r="3" fill="#ffc24b" className="hf-glow" />
        </>
      );
      break;
    case "alien":
      body = (
        <>
          <path
            d="M13 17c0-6 4-10 9-10s9 4 9 10v8c0 6-4 9-9 9s-9-3-9-9Z"
            fill="var(--primary)"
            className="hf-bob"
          />
          <path
            d="M18 8 15 4M27 8l3-4"
            stroke="#ffc24b"
            strokeWidth="2"
            className="hf-glow"
          />
          {face}
        </>
      );
      break;
    case "owl":
      body = (
        <>
          <path
            d="M9 17c0-7 5-11 12-11s12 4 12 11v12c0 4-5 7-12 7S9 33 9 29Z"
            fill="var(--primary)"
            className="hf-bob"
          />
          <circle cx="17" cy="22" r="5" fill="#ffc24b" className="hf-glow" />
          <circle cx="27" cy="22" r="5" fill="#ffc24b" className="hf-glow" />
          {eyes}
          <path d="m21 25 3 3 3-3" fill="#ffc24b" />
        </>
      );
      break;
    case "rocket":
      body = (
        <>
          <path
            d="M20 32c-7-5-7-13-2-22 2-4 5-6 6-6 1 0 4 2 6 6 5 9 5 17-2 22l-4-3Z"
            fill="var(--primary)"
            className="hf-bob"
          />
          {face}
          <path
            d="m19 31-4 5 6-2M29 31l4 5-6-2"
            fill="#ffc24b"
            className="hf-glow"
          />
        </>
      );
      break;
    case "bot":
    default:
      body = (
        <>
          <rect
            x="9"
            y="12"
            width="22"
            height="21"
            rx="8"
            fill="var(--primary)"
            className="hf-bob"
          />
          <path d="M20 12V7" stroke="var(--primary)" strokeWidth="2" />
          <circle cx="20" cy="5" r="3" fill="#ffc24b" className="hf-glow" />
          {face}
        </>
      );
      break;
  }

  return (
    <svg
      aria-hidden
      data-character={id}
      viewBox="0 0 40 40"
      className={cn("h-11 w-11 overflow-visible", className)}
      fill="none"
    >
      {body}
    </svg>
  );
}
