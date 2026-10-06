import { describe, expect, test } from "vitest";
import { getAllIssueSlugs, getIssueBySlug } from "@/lib/search";
import { getIssueStepPolicies, isOfferable } from "@/lib/investigation/policy";
import {
  guardAgentEvent,
  NO_REQUESTER,
  guardAgentOutput,
  minimizeToolOutput,
  toUserText,
  type OutputGuardContext,
} from "./output-guard";

const context = (): OutputGuardContext => ({
  requesterIdentifiers: ["requester@example.test", "LAPTOP-OWN123"],
  redactions: [],
});

describe("requester-agent output guard", () => {
  test.each([
    ["sk_live_abcdef1234567890", "api_key"],
    ["pk_test_abcdef1234567890", "api_key"],
    ["ghp_abcdefghijklmnopqrstuvwxyz123456", "api_key"],
    ["xoxb-1234567890-abcdefghij", "api_key"],
    [`AIza${"A".repeat(35)}`, "api_key"],
    ["AKIA1234567890ABCDEF", "aws_key"],
    ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJlLXZhbHVl", "jwt"],
    ["Bearer abc.def/ghijklmnop==", "token"],
    [
      "-----BEGIN RSA PRIVATE KEY-----private material-----END RSA PRIVATE KEY-----",
      "private_key",
    ],
    ["password: Hunter2!", "password"],
    ["Password is Hunter2!", "password"],
    ["password was p@ss.", "password"],
    ["the password is Hunter2!", "password"],
    ["MFA code: 482913", "mfa_code"],
    ["recovery key = ABCD-1234", "mfa_code"],
    ["4111 1111 1111 1111", "card"],
    ["a.person@contoso.example", "email"],
    ["a.person@contoso.example.onmicrosoft.com", "email"],
    ["192.168.1.24", "ip_address"],
    ["2001:0db8:85a3:0000:0000:8a2e:0370:7334", "ip_address"],
    ["::1", "ip_address"],
    ["::ffff:192.0.2.1", "ip_address"],
    ["fe80::1", "ip_address"],
    ["2001:db8::1", "ip_address"],
    ["AA:BB:CC:DD:EE:FF", "mac_address"],
    ["AA-BB-CC-DD-EE-FF", "mac_address"],
    ["S-1-5-21-3623811015-3361044348-30300820-1013", "windows_sid"],
    ["DESKTOP-ABC1234", "hostname"],
    ["fileserver.corp", "hostname"],
    ["\\\\FS01", "hostname"],
  ] as const)("redacts %s as %s", (secret, kind) => {
    const result = guardAgentOutput(secret, context());
    expect(result.text).toContain("[removed:");
    expect(result.redactions).toContainEqual({ kind });
  });

  test.each([
    "Your password is expired.",
    "the recovery key is stored.",
    "your password was changed yesterday",
    "ticket #1234",
    "Windows 11 build 10.0.22631.4317",
    "Restart at 10:30",
    "Restart at 10:30:45",
    "::",
    "Note:: restart",
    "the bearer of bad news",
    "microsoft.com",
    "4111111111111112",
    "00000000-0000-4000-8000-000000000001",
    "a sentence about Wi-Fi. Another sentence explains the safe next step.",
  ])("keeps benign text unchanged: %s", (text) => {
    expect(guardAgentOutput(text, context()).text).toBe(text);
  });

  test("preserves the requester's own email and hostname case-insensitively", () => {
    const text = "Contact REQUESTER@EXAMPLE.TEST and check laptop-own123.";
    expect(guardAgentOutput(text, context()).text).toBe(text);
  });

  test("keeps invalid card numbers and UUID-like identifiers", () => {
    const text =
      "A non-Luhn number 4111111111111112 and UUID 00000000-0000-4000-8000-000000000001.";
    expect(guardAgentOutput(text, context()).text).toBe(text);
  });

  test("records only redaction kinds and is idempotent", () => {
    const original =
      "Token ghp_abcdefghijklmnopqrstuvwxyz123456 for a.person@contoso.example";
    const first = guardAgentOutput(original, context());
    const second = guardAgentOutput(first.text, context());

    expect(first.text).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz123456");
    expect(first.text).not.toContain("a.person@contoso.example");
    expect(JSON.stringify(first.redactions)).not.toContain(
      "ghp_abcdefghijklmnopqrstuvwxyz123456"
    );
    expect(JSON.stringify(first.redactions)).not.toContain(
      "a.person@contoso.example"
    );
    expect(second).toEqual({ text: first.text, redactions: [] });
  });

  test.each([
    ["password: Hunter2!", "password"],
    ["MFA code: 482913", "mfa_code"],
  ] as const)("keeps %s redaction idempotent", (text, kind) => {
    const first = guardAgentOutput(text, context());
    const second = guardAgentOutput(first.text, context());

    expect(first.redactions).toEqual([{ kind }]);
    expect(second).toEqual({ text: first.text, redactions: [] });
  });

  test("toUserText sanitizes before guarding and collects only kinds", () => {
    const ctx = context();
    expect(
      toUserText(
        "See https://example.test ghp_abcdefghijklmnopqrstuvwxyz123456",
        ctx
      )
    ).toBe("See [link removed] [removed: credential]");
    expect(ctx.redactions).toEqual([{ kind: "api_key" }]);
  });

  test("guards user-visible AgentEvent fields while copying identifiers unchanged", () => {
    const ctx = context();
    const events = [
      {
        type: "final_answer" as const,
        text: "Bearer abc.def/ghijklmnop==",
        confidence: 0.9,
        evidence: ["ev-1"],
      },
      {
        type: "user_step" as const,
        card: {
          stepId: "step-1",
          instruction: "Open fileserver.corp.",
          why: "Use the approved guide.",
          source: {
            kind: "guide" as const,
            guideSlug: "wifi",
            stepIndex: 0,
            title: "Wi-Fi 192.168.1.1",
            url: "https://example.test/wifi",
          },
          citation: {
            kind: "web" as const,
            trust: "vendor" as const,
            title: "Docs for DESKTOP-ABC1234",
            domain: "192.168.1.1",
            url: "https://learn.microsoft.com/support",
          },
        },
      },
      {
        type: "consent_required" as const,
        card: {
          approvalRequestId: "approval-1",
          capabilityId: "device_flush_dns",
          title: "Check DESKTOP-ABC1234",
          whatHappens: "Flush DNS.",
          target: { kind: "device" as const, label: "192.168.1.20" },
          reversible: true,
          expiresAt: "later",
          tainted: [
            {
              param: "hostname",
              value: "DESKTOP-ABC1234",
              source: "device DESKTOP-ABC1234 diagnostics",
              trust: "external_untrusted" as const,
            },
          ],
          requiresReconfirm: true,
        },
      },
      {
        type: "tool_result_summary" as const,
        tool: "get_device_diagnostics",
        summary: "Found 192.168.1.24.",
      },
    ];

    const guarded = events.map((event) => guardAgentEvent(event, ctx));

    expect(guarded[0]).toMatchObject({
      type: "final_answer",
      text: "[removed: credential]",
      evidence: ["ev-1"],
    });
    expect(guarded[1]).toMatchObject({
      type: "user_step",
      card: {
        stepId: "step-1",
        instruction: "Open [removed: device or network detail].",
        source: {
          guideSlug: "wifi",
          title: "Wi-Fi [removed: device or network detail]",
          url: "https://example.test/wifi",
        },
        citation: {
          title: "Docs for [removed: device or network detail]",
          domain: "[removed: device or network detail]",
          url: "https://learn.microsoft.com/support",
        },
      },
    });
    expect(guarded[2]).toMatchObject({
      type: "consent_required",
      card: {
        capabilityId: "device_flush_dns",
        title: "Check [removed: device or network detail]",
        target: {
          label: "[removed: device or network detail]",
        },
        tainted: [
          {
            param: "hostname",
            value: "[removed: device or network detail]",
            source: "device [removed: device or network detail] diagnostics",
            trust: "external_untrusted",
          },
        ],
        requiresReconfirm: true,
      },
    });
    expect(guarded[3]).toMatchObject({
      type: "tool_result_summary",
      tool: "get_device_diagnostics",
      summary: "Found [removed: device or network detail].",
    });
  });

  test("guards web-source text and drops non-HTTPS links", () => {
    const guarded = guardAgentEvent(
      {
        type: "web_sources",
        sources: [
          {
            title: "Support for DESKTOP-ABC1234",
            domain: "learn.microsoft.com",
            url: "https://learn.microsoft.com/support",
            trust: "vendor",
          },
          {
            title: "Unsafe source",
            domain: "reddit.com",
            url: "http://reddit.com/r/support",
            trust: "community",
          },
        ],
      },
      context()
    );
    expect(guarded).toEqual({
      type: "web_sources",
      sources: [
        {
          title: "Support for [removed: device or network detail]",
          domain: "learn.microsoft.com",
          url: "https://learn.microsoft.com/support",
          trust: "vendor",
        },
      ],
    });
  });

  test("preserves the consent id on guarded error events", () => {
    const event = {
      type: "error" as const,
      message:
        "Please tick “I checked these values and want to continue” and approve again.",
      recoverable: true,
      reopenConsentId: "approval-1",
    };

    expect(guardAgentEvent(event, context())).toEqual(event);
  });

  test("minimizes nested tool data and bounds arrays and depth", () => {
    const output = minimizeToolOutput({
      requester_id: "requester-1",
      ip_address: ["192.168.1.1", "192.168.1.2"],
      nested: [
        {
          access_token: "token",
          user_principal_name: "requester@example.test",
          mac_address: "AA:BB:CC:DD:EE:FF",
          dns_servers: ["192.168.1.1"],
          keep: "safe",
        },
      ],
      many: Array.from({ length: 60 }, (_, index) => index),
      deep: { a: { b: { c: { d: { e: { f: { g: "value" } } } } } } },
    }) as Record<string, unknown>;

    expect(output).toEqual({
      ip_addressCount: 2,
      nested: [
        {
          mac_addressCount: 1,
          dns_serversCount: 1,
          keep: "safe",
        },
      ],
      many: Array.from({ length: 50 }, (_, index) => index),
      deep: {
        a: { b: { c: { d: { e: "[truncated]" } } } },
      },
    });
  });

  test("preserves every requester-offerable issue step", () => {
    let checkedSteps = 0;

    for (const slug of getAllIssueSlugs()) {
      const issue = getIssueBySlug(slug);
      if (!issue) throw new Error(`Issue slug from index is missing: ${slug}`);

      for (const policy of getIssueStepPolicies(issue)) {
        if (!isOfferable(policy.risk, "requester")) continue;
        checkedSteps += 1;
        expect(
          toUserText(policy.text, { requesterIdentifiers: [] }),
          `${slug} step ${policy.stepIndex}`
        ).toBe(policy.text.trim());
      }
    }

    expect(checkedSteps).toBeGreaterThan(0);
  });

  test("drops a user-step citation whose url is not https", () => {
    const guarded = guardAgentEvent(
      {
        type: "user_step",
        card: {
          stepId: "step-1",
          instruction: "Restart the app.",
          why: "It clears a stuck session.",
          source: {
            kind: "guide",
            guideSlug: "wifi",
            stepIndex: 0,
            title: "Wi-Fi",
            url: "/issues/wifi/guide",
          },
          citation: {
            kind: "web",
            trust: "vendor",
            domain: "learn.microsoft.com",
            title: "Docs",
            url: "javascript:alert(1)",
          },
        },
      },
      NO_REQUESTER
    );
    expect(guarded.type === "user_step" && guarded.card.citation).toBe(
      undefined
    );
  });
});
