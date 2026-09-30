import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AVATAR_IDS,
  AVATAR_LABELS,
  AnimatedAvatar,
  DEFAULT_AVATAR,
  LEGACY_AVATAR_MAP,
  normalizeAvatarId,
} from "./animated-avatar";
import { HUMAN_AVATAR_IDS } from "./human-avatars";

afterEach(cleanup);

describe("human avatars", () => {
  it("offers 16 people with unique labels, including the new four", () => {
    expect(AVATAR_IDS).toHaveLength(16);
    expect(new Set(AVATAR_IDS.map((id) => AVATAR_LABELS[id])).size).toBe(16);
    for (const id of ["remy", "noor", "finn", "luca"]) {
      expect(HUMAN_AVATAR_IDS).toContain(id);
    }
    expect(DEFAULT_AVATAR).toBe("nova");
  });

  it("maps legacy animal ids and stored values to people", () => {
    for (const legacy of Object.keys(LEGACY_AVATAR_MAP)) {
      expect(AVATAR_IDS).toContain(normalizeAvatarId(legacy));
      expect(AVATAR_IDS).toContain(normalizeAvatarId(`char:${legacy}`));
    }
    expect(normalizeAvatarId("finn")).toBe("finn");
    expect(normalizeAvatarId("initial")).toBe("initial");
    expect(normalizeAvatarId("nope")).toBeNull();
  });

  it("renders every person as an svg with closable eyelids (blink) and unique gradients", () => {
    for (const id of AVATAR_IDS) {
      const { container, unmount } = render(<AnimatedAvatar id={id} />);
      expect(container.querySelector(`[data-avatar="${id}"]`)).toBeTruthy();
      expect(container.querySelectorAll(".hf-ava3-lid")).toHaveLength(2);
      unmount();
    }
    const { container } = render(
      <>
        <AnimatedAvatar id="nova" />
        <AnimatedAvatar id="nova" />
      </>
    );
    const ids = [...container.querySelectorAll("defs [id]")].map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the assistant bot and fill size working", () => {
    const { container } = render(
      <>
        <AnimatedAvatar id="bot" size={32} />
        <AnimatedAvatar id="cat" size="fill" title="Cat" />
      </>
    );
    expect(container.querySelector('[data-avatar="mei"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Cat"]')).toBeTruthy();
  });
});
