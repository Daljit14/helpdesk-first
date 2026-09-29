import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("next/font/google", () => ({
  Bricolage_Grotesque: () => ({ variable: "" }),
  Figtree: () => ({ variable: "" }),
  IBM_Plex_Mono: () => ({ variable: "" }),
}));

import { metadata as rootMetadata } from "./layout";
import { metadata as assistantMetadata } from "./assistant/page";
import { metadata as browseMetadata } from "./browse/page";
import { metadata as signupMetadata } from "./signup/page";
import { metadata as notFoundMetadata } from "./not-found";

describe("public metadata", () => {
  it("uses the root title template", () => {
    expect(rootMetadata.title).toEqual({
      default: "HelpDesk First",
      template: "%s · HelpDesk First",
    });
  });

  it("leaves page titles to the root template", () => {
    for (const metadata of [
      assistantMetadata,
      browseMetadata,
      signupMetadata,
      notFoundMetadata,
    ]) {
      expect(String(metadata.title)).not.toContain("· HelpDesk First");
    }
  });
});
