import { describe, expect, test } from "vitest";
import {
  describeRedactions,
  mergeRedactionSummaries,
  redactForLearning,
} from "./learning-redaction";

describe("redactForLearning", () => {
  test("removes emails, names, student/employee IDs, hostnames, IPs, credentials, and URLs", () => {
    const original =
      "Contact John Smith at john.smith@example.com. Student ID: STU-1234 and employee number EMP-9876. Host fileserver.internal, IP 10.20.30.40. password: hunter2 token: abcdefghijk. See https://external.example/help.";
    const result = redactForLearning(original);

    expect(result.text).not.toContain("john.smith@example.com");
    expect(result.text).not.toContain("John Smith");
    expect(result.text).not.toContain("STU-1234");
    expect(result.text).not.toContain("EMP-9876");
    expect(result.text).not.toContain("fileserver.internal");
    expect(result.text).not.toContain("10.20.30.40");
    expect(result.text).not.toContain("hunter2");
    expect(result.text).not.toContain("abcdefghijk");
    expect(result.text).not.toContain("https://external.example/help");
    expect(result.summary).toEqual({
      credential: 2,
      email: 1,
      hostname: 1,
      identifier: 2,
      ip_address: 1,
      link: 1,
      name: 1,
    });
  });

  test("keeps approved internal links while redacting external links", () => {
    const result = redactForLearning(
      "See https://helpdesk-first.vercel.app/issues/no-internet and https://example.com."
    );
    expect(result.text).toContain(
      "https://helpdesk-first.vercel.app/issues/no-internet"
    );
    expect(result.text).not.toContain("https://example.com");
    expect(result.summary).toEqual({ link: 1 });
  });
});

describe("redaction summaries", () => {
  test("mergeRedactionSummaries combines category counts", () => {
    expect(
      mergeRedactionSummaries(
        { email: 1, credential: 2 },
        { email: 3, hostname: 1 }
      )
    ).toEqual({ email: 4, credential: 2, hostname: 1 });
  });

  test("describeRedactions reports categories without original secrets", () => {
    expect(describeRedactions({ email: 1, credential: 2, ip_address: 1 })).toBe(
      "Removed 1 email addresses, 2 credentials, 1 IP addresses."
    );
    expect(describeRedactions({})).toBe("Nothing removed.");
  });
});
