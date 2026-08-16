import { test, expect } from "vitest";
import { cn } from "./utils";

test("cn merges and deduplicates tailwind classes", () => {
  expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
});
