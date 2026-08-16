import { test, expect } from "vitest";
import { greet } from "./utils";

test("greet returns a personalized greeting", () => {
  expect(greet("HelpDesk")).toBe("Hello, HelpDesk");
});
