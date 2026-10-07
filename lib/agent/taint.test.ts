import { describe, expect, test } from "vitest";
import { getCapability } from "@/lib/autonomy/capabilities/registry";
import {
  applyDeviceSignedTrust,
  findTaintedParams,
  normalizeForTaint,
  provenanceFromTool,
  reconfirmSatisfied,
  splitUserTurn,
  taintDecision,
  type SessionProvenance,
} from "./taint";

const capability = getCapability("device_flush_dns", 1)!;
const wifiCapability = getCapability("device_reset_wifi_profile", 1)!;

function provenance(
  text: string,
  trust: SessionProvenance["items"][number]["trust"] = "external_untrusted"
): SessionProvenance {
  return {
    userTexts: [],
    items: [{ evidenceId: "ev-1", source: "device", trust, text }],
  };
}

describe("taint provenance", () => {
  test("matches nested string parameters against raw tool values", () => {
    const items = provenanceFromTool("get_device_diagnostics", "ev-1", {
      events: [{ hostname: "PC-7ABCDE" }],
      count: 2,
    });
    expect(
      findTaintedParams(
        { target: { hostname: "PC-7ABCDE" } },
        {},
        { userTexts: [], items }
      )
    ).toEqual([
      {
        param: "target.hostname",
        value: "PC-7ABCDE",
        evidenceId: "ev-1",
        source: "get_device_diagnostics",
        trust: "external_untrusted",
        sources: ["get_device_diagnostics"],
      },
    ]);
    expect(items.map((item) => item.text)).toContain("PC-7ABCDE");
  });

  test("flattens arrays into stable parameter paths and fails closed by tool", () => {
    const items = [
      ...provenanceFromTool("get_recent_sign_in_failures", "ev-1", {
        failures: [{ host: "PC-7ABCDE" }],
      }),
      ...provenanceFromTool("get_account_status", "ev-2", {
        host: "PC-7ABCDE",
      }),
    ];
    expect(
      findTaintedParams(
        { attempts: [{ host: "PC-7ABCDE" }] },
        {},
        { userTexts: [], items }
      )
    ).toEqual([
      {
        param: "attempts[0].host",
        value: "PC-7ABCDE",
        evidenceId: "ev-1",
        source: "get_recent_sign_in_failures",
        trust: "external_untrusted",
        sources: ["get_recent_sign_in_failures", "get_account_status"],
      },
    ]);
  });

  test("taints a proposal parameter copied from find_answer steps", () => {
    const tip = "Sign out and back into the application.";
    const items = provenanceFromTool("find_answer", "ev-1", {
      steps: [{ kind: "community_tip", text: tip }],
    });

    expect(
      findTaintedParams(
        { params: { instruction: tip } },
        {},
        { userTexts: [], items }
      )
    ).toEqual([
      {
        param: "params.instruction",
        value: tip,
        evidenceId: "ev-1",
        source: "find_answer",
        trust: "external_untrusted",
        sources: ["find_answer"],
      },
    ]);
  });

  test("does not match unrelated text or normalized values shorter than four", () => {
    expect(
      findTaintedParams(
        { hostname: "PC-7ABCDE", code: "abc" },
        {},
        provenance("No matching host.")
      )
    ).toEqual([]);
    expect(
      findTaintedParams({ code: "abc" }, {}, provenance("abc was observed"))
    ).toEqual([]);
  });

  test("skips enum and const schema properties but checks unknown keys", () => {
    const schema = {
      properties: {
        mode: { enum: ["PC-7ABCDE"] },
        fixed: { const: "PC-7ABCDE" },
      },
    };
    expect(
      findTaintedParams(
        { mode: "PC-7ABCDE", fixed: "PC-7ABCDE", extra: "PC-7ABCDE" },
        schema,
        provenance("PC-7ABCDE")
      ).map((item) => item.param)
    ).toEqual(["extra"]);
  });

  test("normalizes compatibility characters, hidden controls, case and whitespace", () => {
    expect(normalizeForTaint(" ＡＢＣ\u200B\tDef ")).toBe("abc def");
    expect(
      findTaintedParams(
        { host: "PＣ-7ＡＢＣＤＥ" },
        {},
        provenance("pc-7abcde")
      )
    ).toHaveLength(1);
  });

  test("exempts values the requester typed", () => {
    expect(
      findTaintedParams(
        { hostname: "PC-7ABCDE" },
        {},
        {
          userTexts: ["Please use PC-7ABCDE for this device."],
          items: provenance("PC-7ABCDE").items,
        }
      )
    ).toEqual([]);
  });

  test("extracts screenshot OCR from double-encoded untrusted blocks", () => {
    const block = `<untrusted_data source="screenshot">${JSON.stringify(
      JSON.stringify({ attachmentId: "attachment-1", text: "PC-7ABCDE" })
    )}</untrusted_data>`;
    const result = splitUserTurn(`Please inspect this. ${block}`);
    expect(result.userText).toBe("Please inspect this.");
    expect(result.untrusted).toEqual([
      {
        evidenceId: "screenshot-1",
        source: "screenshot",
        trust: "external_untrusted",
        text: "attachment-1\nPC-7ABCDE",
      },
    ]);
  });

  test("treats a truncated screenshot block as untrusted", () => {
    const block = `<untrusted_data source="screenshot">${JSON.stringify(
      JSON.stringify({ attachmentId: "attachment-1", text: "PC-7ABCDE" })
    )}`;
    const result = splitUserTurn(`Please inspect this. ${block}`);

    expect(result.userText).toBe("Please inspect this.");
    expect(result.untrusted[0]).toMatchObject({
      source: "screenshot",
      trust: "external_untrusted",
    });
    expect(result.untrusted[0]?.text).toContain("PC-7ABCDE");
    expect(
      findTaintedParams(
        { hostname: "PC-7ABCDE" },
        {},
        { userTexts: [result.userText], items: result.untrusted }
      )
    ).toHaveLength(1);
  });

  test("chooses the most severe source and keeps web source trust per item", () => {
    const items = provenanceFromTool("search_web", "ev-2", {
      sources: [
        { domain: "docs.example", trust: "vendor", title: "PC-7ABCDE" },
        { domain: "reddit.example", trust: "community", title: "PC-7ABCDE" },
      ],
    });
    expect(items.map((item) => item.trust)).toEqual([
      "vendor",
      "vendor",
      "community",
      "community",
    ]);
    expect(
      findTaintedParams(
        { hostname: "PC-7ABCDE" },
        {},
        { userTexts: [], items }
      )[0]
    ).toMatchObject({ trust: "community", source: "search_web" });
  });

  test("keeps reference provenance at community severity", () => {
    const items = provenanceFromTool("search_web", "ev-2", {
      sources: [
        { domain: "en.wikipedia.org", trust: "reference", title: "PC-7ABCDE" },
      ],
    });
    const cautionCapability = {
      ...capability,
      riskLevel: "caution" as const,
    };

    expect(items.map((item) => item.trust)).toEqual(["reference", "reference"]);
    expect(
      taintDecision(cautionCapability, [
        {
          param: "value",
          value: "PC-7ABCDE",
          evidenceId: "ev-2",
          source: "search_web",
          trust: "reference",
          sources: ["search_web"],
        },
      ])
    ).toBe("reject");
    expect(
      taintDecision(cautionCapability, [
        {
          param: "value",
          value: "PC-7ABCDE",
          evidenceId: "ev-2",
          source: "search_web",
          trust: "community",
          sources: ["search_web"],
        },
      ])
    ).toBe("reject");
  });

  test.each([
    ["org-approved", "org_approved", "reconfirm"],
    ["vendor", "vendor", "reconfirm"],
    ["community", "community", "reject"],
    ["external", "external_untrusted", "reject"],
  ] as const)("applies the taint decision for %s", (_name, trust, decision) => {
    expect(
      taintDecision(capability, [
        {
          param: "value",
          value: "PC-7ABCDE",
          evidenceId: "ev-1",
          source: "tool",
          trust,
          sources: ["tool"],
        },
      ])
    ).toBe(decision);
  });

  test("reconfirms all tainted safe-capability values and keeps clean values clean", () => {
    const safeCapability = {
      ...capability,
      riskLevel: "safe" as const,
    };
    expect(
      taintDecision(safeCapability, [
        {
          param: "value",
          value: "PC-7ABCDE",
          evidenceId: "ev-1",
          source: "tool",
          trust: "external_untrusted",
          sources: ["tool"],
        },
      ])
    ).toBe("reconfirm");
    expect(taintDecision(capability, [])).toBe("clean");
  });

  test.each([
    ["clean", false, false, true],
    ["device_signed", false, false, true],
    ["device_signed", true, false, false],
    ["reconfirm", false, false, false],
    ["clean", true, false, false],
    ["reconfirm", true, true, true],
    [null, true, true, true],
  ] as const)(
    "checks reconfirmation for %s with lookup failure %s",
    (policyDecision, lookupFailed, reconfirmTainted, expected) => {
      expect(
        reconfirmSatisfied({ policyDecision, lookupFailed, reconfirmTainted })
      ).toBe(expected);
    }
  );
});

describe("device-signed taint trust", () => {
  const item = {
    param: "ssid",
    value: "Contoso-Corp",
    evidenceId: "ev-1",
    source: "get_device_diagnostics",
    trust: "external_untrusted" as const,
    sources: ["get_device_diagnostics"],
  };

  test.each([
    [
      "flag disabled",
      {
        enabled: false,
        capability: wifiCapability,
        signedIdentifiers: ["Contoso-Corp"],
      },
      item,
    ],
    [
      "account capability",
      {
        enabled: true,
        capability: getCapability("send_password_reset_link", 1)!,
        signedIdentifiers: ["Contoso-Corp"],
      },
      item,
    ],
    [
      "diagnostics are not a provenance source",
      {
        enabled: true,
        capability: wifiCapability,
        signedIdentifiers: ["Contoso-Corp"],
      },
      { ...item, sources: ["earlier reply"] },
    ],
    [
      "identifier does not match exactly",
      {
        enabled: true,
        capability: wifiCapability,
        signedIdentifiers: ["Contoso"],
      },
      item,
    ],
  ])("leaves taint unchanged when %s", (_name, input, candidate) => {
    expect(applyDeviceSignedTrust([candidate], input)).toEqual([candidate]);
  });

  test("upgrades an exact identifier from the device diagnostics source", () => {
    expect(
      applyDeviceSignedTrust([item], {
        enabled: true,
        capability: wifiCapability,
        signedIdentifiers: ["ＣＯＮＴＯＳＯ－ＣＯＲＰ"],
      })
    ).toEqual([
      {
        ...item,
        source: "get_device_diagnostics",
        trust: "device_signed",
      },
    ]);
  });

  test("allows an earlier-reply co-source but not screenshot or ticket history", () => {
    expect(
      applyDeviceSignedTrust(
        [{ ...item, sources: ["get_device_diagnostics", "earlier reply"] }],
        {
          enabled: true,
          capability: wifiCapability,
          signedIdentifiers: ["Contoso-Corp"],
        }
      )[0]?.trust
    ).toBe("device_signed");
    expect(
      applyDeviceSignedTrust(
        [{ ...item, sources: ["get_device_diagnostics", "screenshot"] }],
        {
          enabled: true,
          capability: wifiCapability,
          signedIdentifiers: ["Contoso-Corp"],
        }
      )[0]?.trust
    ).toBe("external_untrusted");
    expect(
      applyDeviceSignedTrust(
        [
          {
            ...item,
            sources: ["get_device_diagnostics", "get_ticket_history"],
          },
        ],
        {
          enabled: true,
          capability: wifiCapability,
          signedIdentifiers: ["Contoso-Corp"],
        }
      )[0]?.trust
    ).toBe("external_untrusted");
  });

  test("does not upgrade a read-only device action", () => {
    expect(
      applyDeviceSignedTrust([item], {
        enabled: true,
        capability: getCapability("device_wifi_status", 1)!,
        signedIdentifiers: ["Contoso-Corp"],
      })
    ).toEqual([item]);
  });

  test("limits device-signed decisions to local device writes", () => {
    const signed = { ...item, trust: "device_signed" as const };
    expect(taintDecision(wifiCapability, [signed])).toBe("device_signed");
    expect(
      taintDecision(getCapability("send_password_reset_link", 1)!, [signed])
    ).toBe("reject");
    expect(
      taintDecision(wifiCapability, [
        signed,
        { ...signed, trust: "vendor" as const },
      ])
    ).toBe("reconfirm");
    expect(
      taintDecision({ ...wifiCapability, riskLevel: "caution" }, [
        signed,
        { ...signed, trust: "external_untrusted" },
      ])
    ).toBe("reject");
  });
});
