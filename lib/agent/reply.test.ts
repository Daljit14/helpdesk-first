import { describe, expect, test } from "vitest";
import type { TrustTier } from "@/lib/research/types";
import { renderAgentReply } from "./reply";

type TestSource = {
  title: string;
  domain: string;
  url: string;
  trust: TrustTier;
};

const outputGuard = { requesterIdentifiers: [] as string[] };

function source(title: string, domain: string, trust: TrustTier): TestSource {
  return {
    title,
    domain,
    trust,
    url: `https://${domain}/support`,
  };
}

describe("renderAgentReply", () => {
  test("renders vendor, community, and reference sources with safe labels", () => {
    const rendered = renderAgentReply(
      {
        summary: "The printer is offline.",
        checked: ["I checked the printer service."],
        nextStep: {
          action: "Restart the printer.",
          why: "This reconnects it.",
        },
        sourceIds: ["vendor", "community", "reference"],
      },
      {
        webSources: new Map<string, TestSource>([
          [
            "vendor",
            source("Printer support", "support.example.com", "vendor"),
          ],
          ["community", source("Printer forum", "reddit.com", "community")],
          [
            "reference",
            source("Printer definition", "developer.mozilla.org", "reference"),
          ],
        ]),
        outputGuard,
      }
    );

    expect(rendered.text).toMatchInlineSnapshot(`
      "The printer is offline.

      What I checked:
      - I checked the printer service.

      Next step: Restart the printer.
      Why: This reconnects it.

      Sources:
      - Official docs: Printer support (support.example.com)
      - Community post: Printer forum (reddit.com)
      - Reference: Printer definition (developer.mozilla.org)"
    `);
  });

  test("renders a summary without empty checked or next-step sections", () => {
    const rendered = renderAgentReply(
      {
        summary: "I can help with that.",
        checked: [],
        nextStep: null,
        sourceIds: [],
      },
      { webSources: new Map(), outputGuard }
    );

    expect(rendered.text).toMatchInlineSnapshot(`"I can help with that."`);
  });

  test("drops unknown ids and non-HTTPS sources", () => {
    const rendered = renderAgentReply(
      {
        summary: "The printer is offline.",
        checked: [],
        nextStep: null,
        sourceIds: ["unknown", "insecure"],
      },
      {
        webSources: new Map([
          [
            "insecure",
            {
              ...source("Insecure source", "support.example.com", "vendor"),
              url: "http://support.example.com/support",
            },
          ],
        ]),
        outputGuard,
      }
    );

    expect(rendered.text).toMatchInlineSnapshot(`"The printer is offline."`);
    expect(rendered.reply.sources).toEqual([]);
  });

  test("redacts a personal email and secret in a reply field", () => {
    const rendered = renderAgentReply(
      {
        summary:
          "Contact alice@example.com. Use ghp_abcdefghijklmnopqrstuvwxyz123456.",
        checked: [],
        nextStep: null,
        sourceIds: [],
      },
      {
        webSources: new Map(),
        outputGuard: {
          requesterIdentifiers: ["requester@example.test"],
          redactions: [],
        },
      }
    );

    expect(rendered.text).toMatchInlineSnapshot(
      `"Contact [removed: another person's details]. Use [removed: credential]."`
    );
    expect(rendered.text).not.toContain("alice@example.com");
    expect(rendered.text).not.toContain("ghp_");
  });

  test("strips fixed claims from reply text", () => {
    const rendered = renderAgentReply(
      {
        summary: "This fixed the issue.",
        checked: [],
        nextStep: null,
        sourceIds: [],
      },
      { webSources: new Map(), outputGuard }
    );

    expect(rendered.text).toMatchInlineSnapshot(
      `"This may have addressed the issue."`
    );
    expect(rendered.claimStripped).toBe(true);
  });

  test("drops trailing checked items and sources when text exceeds 1200 characters", () => {
    const sources = new Map<string, TestSource>(
      Array.from({ length: 5 }, (_, index) => {
        const domain = `support${index}.example.test`;
        return [
          `source-${index}`,
          source("Document ".repeat(28), domain, "vendor"),
        ];
      })
    );
    const rendered = renderAgentReply(
      {
        summary: "Summary ".repeat(47),
        checked: Array.from(
          { length: 5 },
          (_, index) => `Checked ${index + 1} ${"detail ".repeat(12)}`
        ),
        nextStep: null,
        sourceIds: Array.from({ length: 5 }, (_, index) => `source-${index}`),
      },
      { webSources: sources, outputGuard }
    );

    expect(rendered.text.length).toBeLessThanOrEqual(1200);
    expect(rendered.reply.checked).toEqual([]);
    expect(rendered.reply.sources.length).toBeLessThan(5);
    expect(rendered.text.slice(-80)).toMatchInlineSnapshot(
      `"nt Document Document Document Document Document Document (support1.example.test)"`
    );
  });
});
