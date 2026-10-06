import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { CAPABILITY_DEFINITIONS } from "../capabilities/definitions";
import { canonical, parameterHash } from "./hash";

function legacyCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(legacyCanonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${legacyCanonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

describe("canonical audit JSON", () => {
  test("capability parameter hashes retain their prior key ordering", () => {
    for (const definition of CAPABILITY_DEFINITIONS) {
      const schema = z.toJSONSchema(definition.inputSchema, {
        io: "input",
      }) as { properties?: Record<string, unknown> };
      const parameterKeys = Object.keys(schema.properties ?? {});
      const keys = ["capabilityId", "parameters", "version", ...parameterKeys];
      const oldOrder = [...keys].sort((left, right) =>
        left.localeCompare(right)
      );
      const newOrder = [...keys].sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0
      );
      expect(newOrder, definition.id).toEqual(oldOrder);

      const parameters = Object.fromEntries(
        parameterKeys.map((key) => [key, `value-${key}`])
      );
      const hashInput = {
        capabilityId: definition.id,
        version: definition.version,
        parameters,
      };
      const oldHash = createHash("sha256")
        .update(legacyCanonical(hashInput))
        .digest("hex");
      expect(parameterHash(hashInput), definition.id).toBe(oldHash);
    }
  });

  test("sorts keys in code-point order and preserves JSON values", () => {
    expect(
      canonical({
        z: [true, null, { b: "quoted", a: 1 }],
        A: false,
      })
    ).toBe('{"A":false,"z":[true,null,{"a":1,"b":"quoted"}]}');
  });
});
