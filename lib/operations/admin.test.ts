import { afterEach, describe, expect, test, vi } from "vitest";
import { isOperationsAdmin } from "./admin";

afterEach(() => vi.unstubAllEnvs());

describe("isOperationsAdmin", () => {
  test("matches trimmed case-insensitive allowlist emails", () => {
    vi.stubEnv(
      "OPERATIONS_ADMIN_EMAILS",
      " first@example.com,ADMIN@example.com "
    );
    expect(isOperationsAdmin("admin@example.com")).toBe(true);
    expect(isOperationsAdmin("other@example.com")).toBe(false);
    expect(isOperationsAdmin(null)).toBe(false);
  });
});
