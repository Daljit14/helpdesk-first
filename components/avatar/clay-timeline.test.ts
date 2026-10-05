import { describe, expect, it } from "vitest";
import {
  CLAY_BLINK_DURATION_MS,
  CLAY_BREATH_AMPLITUDE,
  CLAY_BREATH_CYCLE_MS,
  CLAY_CROSSFADE_MS,
  CLAY_WAVE_DURATION_MS,
  CLAY_WAVE_STEPS,
  createClayTimeline,
  idleLayers,
  type ClayLayer,
} from "./clay-timeline";

const WAVE_FRAMES = new Set(["lift", "raise", "wave-a", "wave-b"]);

function dominantWaveFrame(layers: ClayLayer[]) {
  return layers
    .filter((layer) => WAVE_FRAMES.has(layer.frame))
    .reduce<ClayLayer | null>(
      (dominant, layer) =>
        !dominant || layer.alpha >= dominant.alpha ? layer : dominant,
      null
    );
}

function sequenceRandom(values: number[]) {
  let index = 0;
  return () => values[index++ % values.length];
}

describe("clay animation timeline", () => {
  it("returns a static first-paint layer", () => {
    expect(idleLayers()).toEqual([{ frame: "base", alpha: 1 }]);
  });

  it("schedules non-overlapping blinks and waves with bounded blends", () => {
    const timeline = createClayTimeline(sequenceRandom([0.5]));
    const blinkStarts: number[] = [];
    const waveStarts: number[] = [];
    let previousHadBlink = false;
    let previousHadWave = false;
    let previousTopAlpha = new Map<string, number>();

    for (let ms = 0; ms <= 60_000; ms += 16) {
      const layers = timeline.sample(ms);
      expect(layers[0].alpha).toBe(1);
      for (const layer of layers) {
        expect(layer.alpha).toBeGreaterThanOrEqual(0);
        expect(layer.alpha).toBeLessThanOrEqual(1);
      }

      const hasBlink = layers.some(
        (layer) => layer.frame === "blink" && layer.alpha > 0
      );
      const hasWave = layers.some((layer) => WAVE_FRAMES.has(layer.frame));
      if (hasBlink && !previousHadBlink) blinkStarts.push(ms);
      if (hasWave && !previousHadWave) {
        waveStarts.push(ms);
        const phase = 0.5;
        const breath =
          ((1 - Math.cos(2 * Math.PI * (ms / CLAY_BREATH_CYCLE_MS + phase))) /
            2) *
          CLAY_BREATH_AMPLITUDE;
        expect(breath).toBeLessThan(0.12);
      }
      expect(hasBlink && hasWave).toBe(false);

      for (const layer of layers) {
        if (!WAVE_FRAMES.has(layer.frame)) continue;
        const previousAlpha = previousTopAlpha.get(layer.frame);
        if (previousAlpha === undefined) {
          expect(layer.alpha).toBeLessThan(0.5);
        }
      }
      previousTopAlpha = new Map(
        layers.map((layer) => [layer.frame, layer.alpha])
      );
      previousHadBlink = hasBlink;
      previousHadWave = hasWave;
    }

    expect(blinkStarts.length).toBeGreaterThan(3);
    expect(blinkStarts[0]).toBeGreaterThanOrEqual(1000);
    expect(blinkStarts[0]).toBeLessThanOrEqual(3000);
    for (let index = 1; index < blinkStarts.length; index += 1) {
      const spacing = blinkStarts[index] - blinkStarts[index - 1];
      expect(spacing).toBeGreaterThanOrEqual(3000);
      expect(spacing).toBeLessThanOrEqual(5200);
    }

    expect(waveStarts.length).toBeGreaterThan(2);
    expect(waveStarts[0]).toBeGreaterThanOrEqual(800);
    for (let index = 1; index < waveStarts.length; index += 1) {
      const spacing = waveStarts[index] - waveStarts[index - 1];
      expect(spacing).toBeGreaterThanOrEqual(8000);
      expect(spacing).toBeLessThanOrEqual(12_000 + CLAY_BREATH_CYCLE_MS);
    }

    expect(CLAY_BLINK_DURATION_MS).toBe(200);
    expect(CLAY_CROSSFADE_MS).toBe(60);
    expect(CLAY_WAVE_DURATION_MS).toBe(
      CLAY_WAVE_STEPS.reduce((total, [, duration]) => total + duration, 0)
    );
  });

  it("plays the wave frames in order and crossfades each new pose", () => {
    const timeline = createClayTimeline(sequenceRandom([0.5]));
    const waveSamples: ClayLayer[][] = [];
    let wasWaving = false;

    for (let ms = 0; ms <= 20_000; ms += 16) {
      const layers = timeline.sample(ms);
      const isWaving = layers.some((layer) => WAVE_FRAMES.has(layer.frame));
      if (isWaving) waveSamples.push(layers);
      if (wasWaving && !isWaving && waveSamples.length > 0) break;
      wasWaving = isWaving;
    }

    const dominantFrames = waveSamples
      .map(dominantWaveFrame)
      .filter((layer): layer is ClayLayer => layer !== null)
      .map((layer) => layer.frame);
    const transitions = dominantFrames.filter(
      (frame, index) => index === 0 || frame !== dominantFrames[index - 1]
    );
    expect(transitions).toEqual(CLAY_WAVE_STEPS.map(([frame]) => frame));
  });
});
