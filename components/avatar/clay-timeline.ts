import type { ClayFrame } from "@/components/avatar/portraits";

export type ClayLayer = { frame: ClayFrame; alpha: number };

export const CLAY_BREATH_CYCLE_MS = 4200;
export const CLAY_BREATH_AMPLITUDE = 0.85;
export const CLAY_BLINK_DURATION_MS = 200;
export const CLAY_BLINK_INTERVAL_MS = [3000, 5000] as const;
export const CLAY_FIRST_BLINK_MS = [1000, 3000] as const;
export const CLAY_FIRST_WAVE_MS = [800, 1600] as const;
export const CLAY_WAVE_INTERVAL_MS = [8000, 12000] as const;
export const CLAY_CROSSFADE_MS = 60;
export const CLAY_WAVE_BLEND_MS = 200;
export const CLAY_WAVE_STEPS = [
  ["lift", 200],
  ["raise", 130],
  ["wave-a", 230],
  ["wave-b", 230],
  ["wave-a", 230],
  ["wave-b", 230],
  ["wave-a", 210],
  ["raise", 130],
  ["lift", 110],
] as const satisfies readonly (readonly [ClayFrame, number])[];
export const CLAY_WAVE_DURATION_MS = CLAY_WAVE_STEPS.reduce(
  (total, [, duration]) => total + duration,
  0
);

function randomUnit(random: () => number) {
  const value = random();
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

function randomInRange(
  random: () => number,
  [min, max]: readonly [number, number]
) {
  return min + randomUnit(random) * (max - min);
}

export function idleLayers(): ClayLayer[] {
  return [{ frame: "base", alpha: 1 }];
}

export function createClayTimeline(random: () => number = Math.random): {
  sample(ms: number): ClayLayer[];
} {
  const phase = randomUnit(random);
  let nextBlinkAt = randomInRange(random, CLAY_FIRST_BLINK_MS);
  let nextWaveAt = randomInRange(random, CLAY_FIRST_WAVE_MS);
  let blinkStart: number | null = null;
  let waveStart: number | null = null;
  let lastMs = 0;

  function breathAt(ms: number) {
    return (
      ((1 - Math.cos(2 * Math.PI * (ms / CLAY_BREATH_CYCLE_MS + phase))) / 2) *
      CLAY_BREATH_AMPLITUDE
    );
  }

  function updateBlink(ms: number) {
    while (true) {
      if (blinkStart !== null) {
        if (ms < blinkStart + CLAY_BLINK_DURATION_MS) return;
        nextBlinkAt =
          blinkStart +
          CLAY_BLINK_DURATION_MS +
          randomInRange(random, CLAY_BLINK_INTERVAL_MS);
        blinkStart = null;
        continue;
      }
      if (ms < nextBlinkAt) return;
      if (ms < nextBlinkAt + CLAY_BLINK_DURATION_MS) {
        blinkStart = nextBlinkAt;
        return;
      }
      nextBlinkAt =
        nextBlinkAt +
        CLAY_BLINK_DURATION_MS +
        randomInRange(random, CLAY_BLINK_INTERVAL_MS);
    }
  }

  function waveLayers(ms: number, breath: number): ClayLayer[] {
    const elapsed = ms - (waveStart ?? ms);
    let stepStart = 0;

    for (let index = 0; index < CLAY_WAVE_STEPS.length; index += 1) {
      const [frame, duration] = CLAY_WAVE_STEPS[index];
      if (elapsed < stepStart + duration) {
        const blendDuration =
          index === 0 ? CLAY_WAVE_BLEND_MS : CLAY_CROSSFADE_MS;
        const alpha = Math.min(1, (elapsed - stepStart) / blendDuration);
        if (index === 0) {
          return [
            { frame: "base", alpha: 1 },
            { frame: "inhale", alpha: breath },
            { frame, alpha },
          ];
        }
        return [
          { frame: CLAY_WAVE_STEPS[index - 1][0], alpha: 1 },
          { frame, alpha },
        ];
      }
      stepStart += duration;
    }

    const alpha = Math.min(
      1,
      (elapsed - CLAY_WAVE_DURATION_MS) / CLAY_WAVE_BLEND_MS
    );
    return [
      { frame: "lift", alpha: 1 },
      { frame: "base", alpha },
      { frame: "inhale", alpha: breath * alpha },
    ];
  }

  return {
    sample(ms: number) {
      const time = Math.max(lastMs, Number.isFinite(ms) ? ms : lastMs);
      lastMs = time;
      const breath = breathAt(time);

      if (waveStart !== null) {
        const waveEnd = waveStart + CLAY_WAVE_DURATION_MS + CLAY_WAVE_BLEND_MS;
        if (time >= waveEnd) {
          if (nextBlinkAt < waveEnd) {
            nextBlinkAt = waveEnd + randomInRange(random, [300, 800]);
          }
          nextWaveAt = waveEnd + randomInRange(random, CLAY_WAVE_INTERVAL_MS);
          waveStart = null;
        }
      }

      if (waveStart === null) updateBlink(time);

      if (waveStart === null && time >= nextWaveAt && blinkStart === null) {
        waveStart = time;
      }

      if (waveStart !== null) return waveLayers(time, breath);

      const layers: ClayLayer[] = [
        { frame: "base", alpha: 1 },
        { frame: "inhale", alpha: breath },
      ];
      if (blinkStart !== null) {
        const alpha = Math.sin(
          (Math.PI * (time - blinkStart)) / CLAY_BLINK_DURATION_MS
        );
        layers.push({ frame: "blink", alpha });
      }
      return layers;
    },
  };
}
