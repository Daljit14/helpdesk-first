import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_LABELS,
  Avatar,
  AvatarPicker,
  normalizeAvatarId,
} from "./avatar";
import { HUMAN_AVATAR_IDS, PORTRAITS } from "./portraits";

const EXPECTED_PORTRAITS = [
  ["nova", "Curly hair with glasses"],
  ["kai", "Short dark hair with earbuds"],
  ["amara", "Rose hijab"],
  ["leo", "Buzz cut with beard"],
  ["mei", "Top bun with stud earrings"],
  ["zuri", "Braids with gold hoops"],
  ["sol", "Long auburn hair"],
  ["ravi", "Short hair with square glasses"],
  ["juno", "Wavy hair with beanie"],
  ["ines", "Pink bob"],
  ["theo", "Silver hair with glasses"],
  ["ada", "Space buns with earbuds"],
  ["remy", "Bald with grey beard"],
  ["noor", "Patterned head wrap"],
  ["finn", "Cap with freckles"],
  ["luca", "Locs with headband"],
] as const;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("shared portrait avatars", () => {
  it("defines the 16 ordered portrait ids and exact captions", () => {
    expect(HUMAN_AVATAR_IDS).toEqual(EXPECTED_PORTRAITS.map(([id]) => id));
    expect(new Set(HUMAN_AVATAR_IDS).size).toBe(16);
    expect(
      new Set(HUMAN_AVATAR_IDS.map((id) => PORTRAITS[id].label)).size
    ).toBe(16);
    expect(HUMAN_AVATAR_IDS.map((id) => [id, PORTRAITS[id].label])).toEqual(
      EXPECTED_PORTRAITS
    );
    expect(HUMAN_AVATAR_IDS.map((id) => AVATAR_LABELS[id])).toEqual(
      EXPECTED_PORTRAITS.map(([, label]) => label)
    );
  });

  it("includes both portrait sizes on disk", () => {
    for (const [id] of EXPECTED_PORTRAITS) {
      for (const px of [96, 256] as const) {
        expect(
          existsSync(
            resolve(process.cwd(), "public", "avatars", `${id}-${px}.webp`)
          )
        ).toBe(true);
      }
    }
  });

  it("renders the requested srcset and falls back if the image fails", () => {
    const { container } = render(<Avatar id="nova" size={96} />);
    const image = container.querySelector("img")!;
    expect(image).toHaveAttribute(
      "srcset",
      "/avatars/nova-96.webp 96w, /avatars/nova-256.webp 256w"
    );
    expect(image).toHaveAttribute("sizes", "96px");
    expect(image).toHaveAttribute("width", "96");
    expect(image).toHaveAttribute("height", "96");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveAttribute("loading", "lazy");
    fireEvent.error(image);
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-avatar="nova"] svg')
    ).toBeInTheDocument();
  });

  it("falls back when a server-rendered image failed before hydration", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
      true
    );
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
      0
    );
    const { container } = render(<Avatar id="nova" size={96} />);

    expect(
      container.querySelector('[data-avatar="nova"] svg')
    ).toBeInTheDocument();
  });

  it("gives the bot avatar its accessible default name", () => {
    render(<Avatar id="bot" />);
    expect(
      screen.getByRole("img", { name: "Support Assistant (AI)" })
    ).toBeInTheDocument();
  });

  it("normalizes current, char-prefixed, and legacy values", () => {
    expect(normalizeAvatarId("nova")).toBe("nova");
    expect(normalizeAvatarId("char:zuri")).toBe("zuri");
    expect(normalizeAvatarId("char:cat")).toBe("mei");
    expect(normalizeAvatarId("fox")).toBe("sol");
    expect(normalizeAvatarId("initial")).toBe("initial");
    expect(normalizeAvatarId("unknown")).toBeNull();
  });
});

describe("AvatarPicker", () => {
  it("keeps the selected caption and previews hover and focus", () => {
    render(<AvatarPicker value="nova" initial="D" onChange={vi.fn()} />);
    const caption = () =>
      screen.getByText(/^(Selected: )?(Curly hair with glasses|Pink bob)$/);

    fireEvent.blur(
      screen.getByRole("radio", { name: "Curly hair with glasses" })
    );
    expect(caption()).toHaveTextContent("Selected: Curly hair with glasses");

    const pinkBob = screen.getByRole("radio", { name: "Pink bob" });
    fireEvent.mouseEnter(pinkBob);
    expect(caption()).toHaveTextContent("Pink bob");
    fireEvent.mouseLeave(pinkBob);
    expect(caption()).toHaveTextContent("Selected: Curly hair with glasses");
    fireEvent.focus(pinkBob);
    expect(caption()).toHaveTextContent("Pink bob");
    fireEvent.blur(pinkBob);
    expect(caption()).toHaveTextContent("Selected: Curly hair with glasses");
  });

  it("focuses the selected radio when the picker mounts", () => {
    render(<AvatarPicker value="kai" initial="D" onChange={vi.fn()} />);
    expect(document.activeElement).toBe(
      screen.getByRole("radio", { name: "Short dark hair with earbuds" })
    );
  });

  it("moves focus without saving and selects with Enter", () => {
    const onChange = vi.fn();
    render(<AvatarPicker value="nova" initial="D" onChange={onChange} />);
    const nova = screen.getByRole("radio", { name: "Curly hair with glasses" });
    const kai = screen.getByRole("radio", {
      name: "Short dark hair with earbuds",
    });
    expect(nova).toHaveAttribute("tabindex", "0");
    expect(kai).toHaveAttribute("tabindex", "-1");

    nova.focus();
    fireEvent.keyDown(nova, { key: "ArrowRight" });
    expect(document.activeElement).toBe(kai);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(kai, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("kai");
  });

  it("supports Home and End keyboard navigation", () => {
    render(<AvatarPicker value="nova" initial="D" onChange={vi.fn()} />);
    const nova = screen.getByRole("radio", { name: "Curly hair with glasses" });
    const initial = screen.getByRole("radio", { name: "Use my initial" });
    nova.focus();
    fireEvent.keyDown(nova, { key: "End" });
    expect(document.activeElement).toBe(initial);
    fireEvent.keyDown(initial, { key: "Home" });
    expect(document.activeElement).toBe(nova);
  });

  it("keeps the initial selection caption until another option is previewed", () => {
    render(<AvatarPicker value="initial" initial="D" onChange={vi.fn()} />);
    fireEvent.blur(screen.getByRole("radio", { name: "Use my initial" }));
    expect(screen.getByText("Selected: Your initial")).toBeInTheDocument();
    const pinkBob = screen.getByRole("radio", { name: "Pink bob" });
    fireEvent.mouseEnter(pinkBob);
    expect(screen.getByText("Pink bob")).toBeInTheDocument();
    fireEvent.mouseLeave(pinkBob);
    expect(screen.getByText("Selected: Your initial")).toBeInTheDocument();
  });
});
