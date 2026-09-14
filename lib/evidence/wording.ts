const CERTAINTY_PATTERN =
  /\b(?:confirmed|definitely|certainly|proven)\b|100%|root cause is/gi;

export function neutraliseCertainty(value: string): string {
  return value.replace(CERTAINTY_PATTERN, "likely");
}
