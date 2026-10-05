import { describe, expect, it } from "vitest";
import {
  CLAY_BLINK_DURATION_MS,
  CLAY_BREATH_AMPLITUDE,
  CLAY_BREATH_CYCLE_MS,
  CLAY_CROSSFADE_MS,
  CLAY_WAVE_BLEND_MS,
  CLAY_WAVE_DURATION_MS,
  CLAY_WAVE_STEPS,
  createClayTimeline,
  idleLayers,
  type ClayLayer,
} from "./clay-timeline";

const SAMPLE_STEP_MS = 16;
const SIMULATION_DURATION_MS = 120_000;
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

function seededLcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const RANDOM_SOURCES = [
  ...[1, 2, 3, 4, 5].map(
    (seed) => [`LCG seed ${seed}`, () => seededLcg(seed)] as const
  ),
  ["constant 0.5", () => () => 0.5] as const,
];

describe("clay animation timeline", () => {
  it("returns a static first-paint layer", () => {
    expect(idleLayers()).toEqual([{ frame: "base", alpha: 1 }]);
  });

  for (const [sourceName, createRandom] of RANDOM_SOURCES) {
    it(`keeps blink and wave timing bounded over 120 seconds (${sourceName})`, () => {
      let phase = 0;
      let randomCalls = 0;
      const source = createRandom();
      const timeline = createClayTimeline(() => {
        const value = source();
        if (randomCalls === 0) phase = value;
        randomCalls += 1;
        return value;
      });
      const blinkStarts: number[] = [];
      const waveStarts: number[] = [];
      let previousHadBlink = false;
      let previousHadWave = false;
      let activeWaveStart: number | null = null;
      let previousTopAlpha = new Map<string, number>();

      const breathAt = (ms: number) =>
        ((1 - Math.cos(2 * Math.PI * (ms / CLAY_BREATH_CYCLE_MS + phase))) /
          2) *
        CLAY_BREATH_AMPLITUDE;

      for (let ms = 0; ms <= SIMULATION_DURATION_MS; ms += SAMPLE_STEP_MS) {
        const layers = timeline.sample(ms);
        expect(layers[0].alpha).toBe(1);
        for (const layer of layers) {
          expect(layer.alpha).toBeGreaterThanOrEqual(0);
          expect(layer.alpha).toBeLessThanOrEqual(1);
        }

        const hasBlink = layers.some((layer) => layer.frame === "blink");
        const hasWave = layers.some((layer) => WAVE_FRAMES.has(layer.frame));
        if (hasBlink && !previousHadBlink) blinkStarts.push(ms);
        if (hasWave && !previousHadWave) {
          waveStarts.push(ms);
          activeWaveStart = ms;
        } else if (!hasWave && previousHadWave) {
          activeWaveStart = null;
        }
        expect(hasBlink && hasWave).toBe(false);

        for (const layer of layers) {
          if (!WAVE_FRAMES.has(layer.frame)) continue;
          if (!previousTopAlpha.has(layer.frame)) {
            expect(layer.alpha).toBeLessThan(0.5);
          }
        }

        if (activeWaveStart !== null) {
          const elapsed = ms - activeWaveStart;
          if (elapsed < CLAY_WAVE_BLEND_MS) {
            const base = layers.find((layer) => layer.frame === "base");
            const inhale = layers.find((layer) => layer.frame === "inhale");
            const lift = layers.find((layer) => layer.frame === "lift");
            expect(base?.alpha).toBe(1);
            expect(inhale?.alpha).toBeCloseTo(breathAt(ms), 8);
            expect(lift?.alpha).toBeCloseTo(elapsed / CLAY_WAVE_BLEND_MS, 8);
          } else if (elapsed >= CLAY_WAVE_DURATION_MS) {
            const base = layers.find((layer) => layer.frame === "base");
            const inhale = layers.find((layer) => layer.frame === "inhale");
            const blend =
              (elapsed - CLAY_WAVE_DURATION_MS) / CLAY_WAVE_BLEND_MS;
            expect(layers[0]).toEqual({ frame: "lift", alpha: 1 });
            expect(base?.alpha).toBeCloseTo(blend, 8);
            expect(inhale?.alpha).toBeCloseTo(breathAt(ms) * blend, 8);
          }
        }

        previousTopAlpha = new Map(
          layers.map((layer) => [layer.frame, layer.alpha])
        );
        previousHadBlink = hasBlink;
        previousHadWave = hasWave;
      }

      expect(blinkStarts.length).toBeGreaterThan(10);
      expect(blinkStarts[0]).toBeGreaterThanOrEqual(1000);
      for (let index = 1; index < blinkStarts.length; index += 1) {
        const gap =
          blinkStarts[index] - blinkStarts[index - 1] - CLAY_BLINK_DURATION_MS;
        const waveOccurred = waveStarts.some(
          (start) =>
            start > blinkStarts[index - 1] && start < blinkStarts[index]
        );
        if (waveOccurred) {
          expect(gap).toBeLessThanOrEqual(
            5000 +
              CLAY_WAVE_DURATION_MS +
              CLAY_WAVE_BLEND_MS +
              800 +
              SAMPLE_STEP_MS
          );
        } else {
          expect(gap).toBeGreaterThanOrEqual(3000 - SAMPLE_STEP_MS);
          expect(gap).toBeLessThanOrEqual(5000 + SAMPLE_STEP_MS);
        }
      }

      expect(waveStarts.length).toBeGreaterThan(5);
      expect(waveStarts[0]).toBeGreaterThanOrEqual(800);
      expect(waveStarts[0]).toBeLessThanOrEqual(1600 + 200 + SAMPLE_STEP_MS);
      const waveTotalMs = CLAY_WAVE_DURATION_MS + CLAY_WAVE_BLEND_MS;
      for (let index = 1; index < waveStarts.length; index += 1) {
        const gap = waveStarts[index] - waveStarts[index - 1] - waveTotalMs;
        expect(gap).toBeGreaterThanOrEqual(8000);
        expect(gap).toBeLessThanOrEqual(12_000 + 200 + SAMPLE_STEP_MS);
      }

      expect(CLAY_BLINK_DURATION_MS).toBe(200);
      expect(CLAY_CROSSFADE_MS).toBe(60);
      expect(CLAY_WAVE_BLEND_MS).toBe(200);
      expect(CLAY_WAVE_STEPS[0]).toEqual(["lift", 200]);
      expect(CLAY_WAVE_DURATION_MS).toBe(
        CLAY_WAVE_STEPS.reduce((total, [, duration]) => total + duration, 0)
      );
    });
  }

  it("plays the wave frames in order and crossfades each new pose", () => {
    const timeline = createClayTimeline(() => 0.5);
    const waveSamples: ClayLayer[][] = [];
    let wasWaving = false;

    for (let ms = 0; ms <= 20_000; ms += SAMPLE_STEP_MS) {
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
