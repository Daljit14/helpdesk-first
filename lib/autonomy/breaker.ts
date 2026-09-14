export function evaluateBreaker(
  failureTimestamps: number[],
  now: number,
  limits: { threshold: number; windowMs: number }
): { open: boolean; failuresInWindow: number } {
  const cutoff = now - limits.windowMs;
  const failuresInWindow = failureTimestamps.filter(
    (timestamp) => timestamp >= cutoff && timestamp <= now
  ).length;
  return {
    open: failuresInWindow >= limits.threshold,
    failuresInWindow,
  };
}
