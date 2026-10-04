export type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
};

export type ModelPrice = {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
};

const PRICES: Array<[string, ModelPrice]> = [
  [
    "claude-haiku-4-5",
    { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 },
  ],
  [
    "claude-sonnet-4-5",
    { input: 3, cacheWrite: 3.75, cacheRead: 0.3, output: 15 },
  ],
  [
    "claude-sonnet-4-6",
    { input: 3, cacheWrite: 3.75, cacheRead: 0.3, output: 15 },
  ],
  [
    "claude-sonnet-5",
    { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 },
  ],
  [
    "claude-opus-4-5",
    { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
  ],
  [
    "claude-opus-4-6",
    { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
  ],
  [
    "claude-opus-4-7",
    { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
  ],
  [
    "claude-opus-4-8",
    { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
  ],
  ["claude-opus-5", { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 }],
];

const UNKNOWN_PRICE: ModelPrice = {
  input: 10,
  cacheWrite: 12.5,
  cacheRead: 1,
  output: 50,
};

export function priceForModel(model: string): {
  price: ModelPrice;
  known: boolean;
} {
  const match = PRICES.find(([prefix]) => model.startsWith(prefix));
  return match
    ? { price: match[1], known: true }
    : { price: UNKNOWN_PRICE, known: false };
}

export function costMicros(model: string, usage: ModelUsage): number {
  const { price } = priceForModel(model);
  return Math.ceil(
    usage.inputTokens * price.input +
      usage.cacheCreationInputTokens * price.cacheWrite +
      usage.cacheReadInputTokens * price.cacheRead +
      usage.outputTokens * price.output
  );
}
