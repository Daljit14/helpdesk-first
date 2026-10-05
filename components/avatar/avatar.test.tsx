import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

let prefersReducedMotion = false;
let originalVisibilityState: PropertyDescriptor | undefined;
const intersectionObservers: MockIntersectionObserver[] = [];

class MockImage {
  static instances: MockImage[] = [];

  src = "";
  complete = false;
  naturalWidth = 0;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor() {
    MockImage.instances.push(this);
  }

  load() {
    this.complete = true;
    this.naturalWidth = 1344;
    this.onload?.(new Event("load"));
  }
}

class MockIntersectionObserver {
  private target: Element | null = null;

  constructor(private callback: IntersectionObserverCallback) {
    intersectionObservers.push(this);
  }

  observe(target: Element) {
    this.target = target;
  }

  disconnect() {
    this.target = null;
  }

  trigger(isIntersecting: boolean) {
    if (!this.target) return;
    this.callback(
      [
        {
          target: this.target,
          isIntersecting,
        } as unknown as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver
    );
  }
}

const canvasContext = {
  globalAlpha: 1,
  clearRect: vi.fn(),
  drawImage: vi.fn(),
};

function setDocumentVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
}

beforeEach(() => {
  prefersReducedMotion = false;
  originalVisibilityState = Object.getOwnPropertyDescriptor(
    document,
    "visibilityState"
  );
  setDocumentVisibility("visible");
  localStorage.clear();
  intersectionObservers.length = 0;
  MockImage.instances = [];
  canvasContext.clearRect.mockClear();
  canvasContext.drawImage.mockClear();
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: prefersReducedMotion,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    "IntersectionObserver",
    MockIntersectionObserver as unknown as typeof IntersectionObserver
  );
  vi.stubGlobal("Image", MockImage as unknown as typeof Image);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1)
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    canvasContext as unknown as CanvasRenderingContext2D
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  if (originalVisibilityState) {
    Object.defineProperty(document, "visibilityState", originalVisibilityState);
  } else {
    Reflect.deleteProperty(document, "visibilityState");
  }
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

  it("animates only when explicitly requested and keeps the static image", () => {
    const { container, rerender } = render(<Avatar id="nova" size={36} />);
    expect(container.querySelector("canvas")).not.toBeInTheDocument();
    expect(container.querySelector('[data-avatar="nova"]')).toHaveAttribute(
      "data-animating",
      "false"
    );
    expect(container.querySelector("img")).toBeInTheDocument();

    rerender(<Avatar id="nova" size={36} animate />);
    expect(container.querySelector("canvas")).toBeInTheDocument();
    expect(container.querySelector('[data-avatar="nova"]')).toHaveAttribute(
      "data-animating",
      "true"
    );
    expect(container.querySelector("img")).toBeInTheDocument();
  });

  it("does not animate with reduced motion or a disabled preference", () => {
    prefersReducedMotion = true;
    const reduced = render(<Avatar id="nova" size={36} animate />);
    expect(reduced.container.querySelector("canvas")).not.toBeInTheDocument();
    expect(reduced.container.querySelector("img")).toBeInTheDocument();

    reduced.unmount();
    prefersReducedMotion = false;
    localStorage.setItem("hf-avatar-animation", "off");
    const disabled = render(<Avatar id="nova" size={36} animate />);
    expect(disabled.container.querySelector("canvas")).not.toBeInTheDocument();
    expect(disabled.container.querySelector("img")).toBeInTheDocument();
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
    const { container } = render(<Avatar id="bot" animate />);
    expect(
      screen.getByRole("img", { name: "Support Assistant (AI)" })
    ).toBeInTheDocument();
    expect(container.querySelector("canvas")).not.toBeInTheDocument();
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

  it("animates the selected and previewed tiles only", () => {
    render(<AvatarPicker value="kai" initial="D" onChange={vi.fn()} />);
    const group = screen.getByRole("radiogroup");
    expect(group.querySelectorAll("canvas")).toHaveLength(1);
    expect(
      screen
        .getByRole("radio", { name: "Short dark hair with earbuds" })
        .querySelector("canvas")
    ).toBeInTheDocument();

    const mei = screen.getByRole("radio", {
      name: "Top bun with stud earrings",
    });
    fireEvent.mouseEnter(mei);
    expect(group.querySelectorAll("canvas")).toHaveLength(2);
    expect(mei.querySelector("canvas")).toBeInTheDocument();

    fireEvent.mouseLeave(mei);
    expect(group.querySelectorAll("canvas")).toHaveLength(1);

    fireEvent.focus(mei);
    expect(group.querySelectorAll("canvas")).toHaveLength(2);
    fireEvent.blur(mei);
    expect(group.querySelectorAll("canvas")).toHaveLength(1);
  });

  it("toggles the animation preference outside the radio group", () => {
    render(<AvatarPicker value="kai" initial="D" onChange={vi.fn()} />);
    const switchButton = screen.getByRole("switch", {
      name: "Avatar animation",
    });
    expect(screen.getByText("Avatar animation")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup")).not.toContainElement(switchButton);
    expect(switchButton).toHaveClass("min-h-11");
    expect(switchButton).toHaveAttribute("aria-checked", "true");
    expect(document.querySelectorAll("canvas")).toHaveLength(1);

    fireEvent.click(switchButton);
    expect(switchButton).toHaveAttribute("aria-checked", "false");
    expect(localStorage.getItem("hf-avatar-animation")).toBe("off");
    expect(document.querySelectorAll("canvas")).toHaveLength(0);

    fireEvent.click(switchButton);
    expect(switchButton).toHaveAttribute("aria-checked", "true");
    expect(localStorage.getItem("hf-avatar-animation")).toBeNull();
    expect(document.querySelectorAll("canvas")).toHaveLength(1);
  });

  it("shows the preference as disabled without changing it under reduced motion", () => {
    prefersReducedMotion = true;
    render(<AvatarPicker value="kai" initial="D" onChange={vi.fn()} />);
    const switchButton = screen.getByRole("switch", {
      name: "Avatar animation",
    });

    expect(switchButton).toHaveAttribute("aria-disabled", "true");
    expect(switchButton).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByText("Off while your device reduces motion")
    ).toBeInTheDocument();
    fireEvent.click(switchButton);
    expect(localStorage.getItem("hf-avatar-animation")).toBeNull();
  });

  it("pauses the canvas while hidden or outside the viewport", () => {
    setDocumentVisibility("hidden");
    const { container } = render(<Avatar id="nova" size={36} animate />);
    const canvas = container.querySelector("canvas")!;
    const observer = intersectionObservers[0];

    act(() => {
      MockImage.instances[0].load();
      observer.trigger(true);
    });
    expect(canvas).toHaveAttribute("data-playing", "false");

    act(() => {
      setDocumentVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(canvas).toHaveAttribute("data-playing", "true");

    act(() => observer.trigger(false));
    expect(canvas).toHaveAttribute("data-playing", "false");
  });

  it("treats the canvas as visible when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = render(<Avatar id="nova" size={36} animate />);
    act(() => MockImage.instances[0].load());
    expect(container.querySelector("canvas")).toHaveAttribute(
      "data-playing",
      "true"
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
