import { describe, expect, test } from "vitest";
import {
  domainSchema,
  invitationSchema,
  organizationSchema,
  roleSchema,
} from "./organizations";

describe("organization action schemas", () => {
  test("accepts organization and invitation inputs", () => {
    expect(
      organizationSchema.safeParse({ name: "Example School" }).success
    ).toBe(true);
    expect(
      invitationSchema.safeParse({
        email: "person@example.com",
        role: "support_agent",
      }).success
    ).toBe(true);
    expect(roleSchema.safeParse("org_admin").success).toBe(true);
  });

  test("rejects invalid domains", () => {
    expect(domainSchema.safeParse({ domain: "" }).success).toBe(false);
  });
});
