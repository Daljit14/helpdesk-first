import { describe, expect, test } from "vitest";
import { openSecret, sealSecret } from "./secret-box";

const key = Buffer.alloc(32, 7);

describe("connector secret box", () => {
  test("round trips with AES-GCM", () => {
    expect(openSecret(sealSecret("secret-value", key), key)).toBe(
      "secret-value"
    );
  });

  test("rejects a wrong key", () => {
    expect(() =>
      openSecret(sealSecret("secret-value", key), Buffer.alloc(32, 8))
    ).toThrow();
  });

  test("rejects a tampered authentication tag", () => {
    const sealed = JSON.parse(sealSecret("secret-value", key)) as {
      tag: string;
    };
    sealed.tag = Buffer.alloc(16, 3).toString("base64");
    expect(() => openSecret(JSON.stringify(sealed), key)).toThrow();
  });
});
