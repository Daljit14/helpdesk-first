"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  animationSheetSrc,
  CLAY_FRAME_PX,
  CLAY_FRAMES,
  type HumanAvatarId,
} from "@/components/avatar/portraits";
import { createClayTimeline } from "@/components/avatar/clay-timeline";

function subscribeToDocumentVisibility(onStoreChange: () => void) {
  document.addEventListener("visibilitychange", onStoreChange);
  return () => document.removeEventListener("visibilitychange", onStoreChange);
}

function getDocumentVisibilitySnapshot() {
  return document.visibilityState === "visible";
}

export function ClayCanvas({ id }: { id: HumanAvatarId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<ReturnType<typeof createClayTimeline> | null>(
    null
  );
  if (timelineRef.current === null) {
    timelineRef.current = createClayTimeline();
  }
  const elapsedRef = useRef(0);
  const [sheet, setSheet] = useState<HTMLImageElement | null>(null);
  const [intersecting, setIntersecting] = useState(
    () => typeof IntersectionObserver === "undefined"
  );
  const documentVisible = useSyncExternalStore(
    subscribeToDocumentVisibility,
    getDocumentVisibilitySnapshot,
    () => false
  );

  useEffect(() => {
    let cancelled = false;
    let image: HTMLImageElement | null = null;

    try {
      image = new Image();
      image.onload = () => {
        if (!cancelled) setSheet(image);
      };
      image.onerror = () => {
        if (!cancelled) setSheet(null);
      };
      image.src = animationSheetSrc(id);
    } catch {}

    return () => {
      cancelled = true;
      if (image) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        setIntersecting(
          entries.some(
            (entry) => entry.target === canvas && entry.isIntersecting
          )
        );
      },
      { threshold: 0 }
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const active = sheet !== null && intersecting && documentVisible;
  const requestAnimationFrameAvailable =
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!active || !canvas || !sheet || !requestAnimationFrameAvailable) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const drawingCanvas = canvas;
    const drawingContext = context;
    const spriteSheet = sheet;

    let frameId = 0;
    let lastTimestamp: number | null = null;
    let cancelled = false;

    function draw(timestamp: number) {
      if (cancelled) return;
      if (lastTimestamp !== null) {
        elapsedRef.current += Math.min(
          100,
          Math.max(0, timestamp - lastTimestamp)
        );
      }
      lastTimestamp = timestamp;

      const pixelRatio = window.devicePixelRatio || 1;
      const size = Math.max(
        1,
        Math.min(
          CLAY_FRAME_PX,
          Math.round(drawingCanvas.clientWidth * pixelRatio)
        )
      );
      if (drawingCanvas.width !== size || drawingCanvas.height !== size) {
        drawingCanvas.width = size;
        drawingCanvas.height = size;
      }

      drawingContext.globalAlpha = 1;
      drawingContext.clearRect(0, 0, size, size);
      for (const layer of timelineRef.current!.sample(elapsedRef.current)) {
        const frameIndex = CLAY_FRAMES.indexOf(layer.frame);
        drawingContext.globalAlpha = layer.alpha;
        drawingContext.drawImage(
          spriteSheet,
          frameIndex * CLAY_FRAME_PX,
          0,
          CLAY_FRAME_PX,
          CLAY_FRAME_PX,
          0,
          0,
          size,
          size
        );
      }
      drawingContext.globalAlpha = 1;
      frameId = window.requestAnimationFrame(draw);
    }

    frameId = window.requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [active, requestAnimationFrameAvailable, sheet]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-playing={active && requestAnimationFrameAvailable ? "true" : "false"}
      className={`pointer-events-none absolute inset-0 h-full w-full ${
        sheet ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
