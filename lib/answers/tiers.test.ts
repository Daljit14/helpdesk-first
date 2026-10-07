import { describe, expect, test } from "vitest";
import { answerTierFor, isRedditHost, registrableDomain } from "./tiers";

describe("answer source tiers", () => {
  test("classifies only HTTPS trusted hosts and rejects blocked organization domains", () => {
    expect(answerTierFor("http://support.microsoft.com/help")).toBeNull();
    expect(
      answerTierFor("https://person:secret@support.microsoft.com/help")
    ).toBeNull();
    expect(answerTierFor("https://support.microsoft.com/help")).toBe("vendor");
    expect(answerTierFor("https://developer.mozilla.org/en-US/")).toBe(
      "reference"
    );
    expect(answerTierFor("https://meta.superuser.com/questions/1")).toBe(
      "qa_community"
    );
    expect(answerTierFor("https://company.example/help", ["example"])).toBe(
      "org_approved"
    );
    expect(
      answerTierFor("https://www.reddit.com/r/example", ["reddit.com"])
    ).toBe("community");
    expect(answerTierFor("https://support-microsoft.com.example.io/help")).toBe(
      "community"
    );
    expect(answerTierFor("not a URL")).toBeNull();
  });

  test("recognizes Reddit hosts case-insensitively, including subdomains and trailing dots", () => {
    for (const host of [
      "reddit.com",
      "www.reddit.com",
      "API.REDDIT.COM.",
      "redd.it",
      "v.redd.it",
      "redditmedia.com",
      "preview.redditstatic.com.",
    ])
      expect(isRedditHost(host)).toBe(true);
    expect(isRedditHost("reddit.com.example.io")).toBe(false);
  });

  test("uses the expected registrable domain for independent-source counting", () => {
    expect(registrableDomain("WWW.Support.Microsoft.com.")).toBe(
      "microsoft.com"
    );
    expect(registrableDomain("answers.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("docs.example.com.au")).toBe("example.com.au");
    expect(registrableDomain("localhost")).toBe("localhost");
  });
});
