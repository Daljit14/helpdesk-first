export function isSafeNextPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}
