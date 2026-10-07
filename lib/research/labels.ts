import type { TrustTier } from "./types";

export function trustLabel(
  trust: TrustTier
): "Official docs" | "Community post" | "Reference" {
  if (trust === "vendor") return "Official docs";
  if (trust === "reference") return "Reference";
  return "Community post";
}
