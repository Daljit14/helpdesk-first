"use client";

import Link from "next/link";
import { useEffect, useState, type ChangeEvent } from "react";
import { LifeBuoy, Laptop, Monitor, Paperclip, X } from "lucide-react";
import { SAFE_USE_WARNING } from "@/lib/ui-copy";
import type { Platform } from "@/lib/helpdesk-data";

type StartPlatform = "General" | Extract<Platform, "Mac" | "Windows">;

const prompts: Record<StartPlatform, string> = {
  General: "Describe the IT problem you need help with.",
  Mac: "Tell us what problem you are having with your Mac.",
  Windows: "Tell us what problem you are having with your Windows computer.",
};

function assistantHref(
  platform: StartPlatform,
  description: string,
  intent: "solve" | "ticket" | "human",
  attached: boolean
) {
  const params = new URLSearchParams({ q: description, intent });
  if (platform !== "General") params.set("platform", platform);
  if (attached) params.set("attach", "1");
  return `/assistant?${params.toString()}`;
}

export function HomeStart({ signedIn = false }: { signedIn?: boolean }) {
  const [platform, setPlatform] = useState<StartPlatform | null>(null);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("hf-v2-start");
    if (!saved) return;
    try {
      const value = JSON.parse(saved) as {
        platform?: StartPlatform | null;
        description?: string;
        fileName?: string;
        fileSize?: number;
      };
      queueMicrotask(() => {
        setPlatform(value.platform ?? null);
        setDescription(value.description ?? "");
      });
    } catch {
      sessionStorage.removeItem("hf-v2-start");
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(
      "hf-v2-start",
      JSON.stringify({
        platform,
        description,
        fileName: file?.name,
        fileSize: file?.size,
      })
    );
  }, [description, file, platform]);

  function choose(next: StartPlatform) {
    setPlatform(next);
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  return (
    <section className="flex flex-1 flex-col px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            How can we help with your IT problem?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Start with a device or describe what you need help with.
          </p>
        </div>

        {!platform ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <Option
              icon={LifeBuoy}
              label="General IT Support"
              onClick={() => choose("General")}
            />
            <Option icon={Laptop} label="Mac" onClick={() => choose("Mac")} />
            <Option
              icon={Monitor}
              label="Windows"
              onClick={() => choose("Windows")}
            />
          </div>
        ) : (
          <div className="mt-10">
            <button
              type="button"
              className="v2-badge v2-touch"
              aria-label="Change platform"
              onClick={() => setPlatform(null)}
            >
              {platform === "General" ? "General IT Support" : platform}
              <X className="h-4 w-4" aria-hidden />
            </button>
            <label
              htmlFor="v2-start-description"
              className="mt-5 block text-lg font-medium"
            >
              {prompts[platform]}
            </label>
            <textarea
              id="v2-start-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={6}
              className="mt-3 w-full rounded-2xl border border-input bg-background p-4 text-base outline-none focus:ring-2 focus:ring-ring"
              placeholder="Include what you noticed and when it started."
            />
            <div className="mt-3 rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
              {SAFE_USE_WARNING}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={assistantHref(
                  platform,
                  description,
                  "solve",
                  Boolean(file)
                )}
                aria-disabled={!description.trim()}
                className={`v2-touch inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 font-medium text-primary-foreground ${
                  !description.trim() ? "pointer-events-none opacity-50" : ""
                }`}
              >
                Find a solution
              </Link>
              <Link
                href={assistantHref(
                  platform,
                  description,
                  "ticket",
                  Boolean(file)
                )}
                aria-disabled={!description.trim()}
                className={`v2-touch inline-flex items-center justify-center rounded-xl border border-border px-4 py-2 font-medium ${
                  !description.trim() ? "pointer-events-none opacity-50" : ""
                }`}
              >
                Create a support ticket
              </Link>
              <label className="v2-touch inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-2 text-sm">
                <Paperclip className="h-4 w-4" aria-hidden />
                Upload screenshot or PDF
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="sr-only"
                  onChange={handleFile}
                />
              </label>
              <Link
                href={assistantHref(
                  platform,
                  description,
                  "human",
                  Boolean(file)
                )}
                aria-disabled={!description.trim()}
                className={`v2-touch inline-flex items-center justify-center rounded-xl border border-border px-4 py-2 font-medium ${
                  !description.trim() ? "pointer-events-none opacity-50" : ""
                }`}
              >
                I want a person
              </Link>
            </div>
            {file && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="v2-badge">
                  <Paperclip className="h-3.5 w-3.5" aria-hidden />
                  {file.name} ({Math.ceil(file.size / 1024)} KB)
                  <button
                    type="button"
                    aria-label="Remove attachment"
                    onClick={() => setFile(null)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
                {!signedIn && (
                  <span className="text-muted-foreground">
                    Sign in to attach files to a ticket
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {!platform && (
          <Link
            href="/browse"
            className="mx-auto mt-8 block w-fit text-sm underline underline-offset-4"
          >
            Browse all solutions
          </Link>
        )}
      </div>
    </section>
  );
}

function Option({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof LifeBuoy;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="v2-touch flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-5 text-center transition-colors hover:bg-[var(--hover)]"
    >
      <Icon className="h-8 w-8" aria-hidden />
      <span className="font-medium">{label}</span>
    </button>
  );
}
