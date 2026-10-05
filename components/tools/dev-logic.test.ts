import { describe, expect, it } from "vitest";
import {
  analyzeClicks,
  analyzeWheel,
  bestClockOffset,
  cacheClearSteps,
  cameraQuality,
  capabilityTips,
  classifyClickGap,
  classifyRenderer,
  classifySkew,
  clipboardAdvice,
  clockFixSteps,
  clockVerdict,
  cleanPaste,
  computeClockOffset,
  describeSkew,
  formatOffset,
  formatSpan,
  formatSupportReport,
  fpsFromTimes,
  gridCoverage,
  isAuthCookieName,
  jitterStats,
  levelToPercent,
  meetingSummary,
  micLevelState,
  permissionHelp,
  missingCellLabels,
  pointerVerdict,
  PRINT_SYMPTOMS,
  rmsLevel,
  scrubSensitive,
  splitCookieNames,
  storageBytes,
  ticketSeed,
  touchVerdict,
  wheelLines,
  type MeetingCheck,
} from "./dev-logic";
import { ISSUES } from "@/lib/issues";

describe("click timing", () => {
  it("classifies gaps", () => {
    expect(classifyClickGap(20)).toBe("bounce");
    expect(classifyClickGap(60)).toBe("double");
    expect(classifyClickGap(500)).toBe("double");
    expect(classifyClickGap(501)).toBe("separate");
    expect(classifyClickGap(300, 250)).toBe("separate");
  });
  it("counts doubles and bounces per button", () => {
    const a = analyzeClicks([
      { button: 0, t: 0 },
      { button: 0, t: 30 },
      { button: 0, t: 330 },
      { button: 2, t: 340 },
      { button: 0, t: 2000 },
    ]);
    expect(a.total).toBe(5);
    expect(a.bounces).toBe(1);
    expect(a.doubles).toBe(1);
    expect(a.fastestGapMs).toBe(30);
    expect(a.buttonsSeen).toEqual([0, 2]);
  });
  it("handles empty input", () => {
    expect(analyzeClicks([])).toEqual({
      total: 0,
      doubles: 0,
      bounces: 0,
      fastestGapMs: null,
      buttonsSeen: [],
    });
  });
});

describe("jitter", () => {
  it("none for no samples, none for one sample", () => {
    expect(jitterStats([]).level).toBe("none");
    expect(jitterStats([{ x: 1, y: 1, t: 0 }]).level).toBe("none");
  });
  it("tiny / noticeable / high", () => {
    const mk = (d: number) => [
      { x: 100, y: 100, t: 0 },
      { x: 100 + d, y: 100, t: 50 },
    ];
    expect(jitterStats(mk(1)).level).toBe("tiny");
    expect(jitterStats(mk(5)).level).toBe("noticeable");
    expect(jitterStats(mk(20)).level).toBe("high");
  });
  it("computes net drift and rms", () => {
    const s = jitterStats([
      { x: 0, y: 0, t: 0 },
      { x: 3, y: 4, t: 10 },
    ]);
    expect(s.netDrift).toBe(5);
    expect(s.maxDeviation).toBe(2.5);
    expect(s.rms).toBe(2.5);
  });
});

describe("wheel", () => {
  it("normalises delta modes", () => {
    expect(wheelLines({ deltaX: 0, deltaY: 40, deltaMode: 0 }).y).toBe(1);
    expect(wheelLines({ deltaX: 0, deltaY: 3, deltaMode: 1 }).y).toBe(3);
    expect(wheelLines({ deltaX: 0, deltaY: 1, deltaMode: 2 }).y).toBe(20);
  });
  it("detects direction", () => {
    const ev = (dy: number, t: number) => ({
      deltaX: 0,
      deltaY: dy,
      deltaMode: 0,
      t,
    });
    expect(analyzeWheel([ev(100, 0), ev(100, 50)]).direction).toBe("down");
    expect(analyzeWheel([ev(-100, 0), ev(-100, 50)]).direction).toBe("up");
    expect(
      analyzeWheel([{ deltaX: 80, deltaY: 0, deltaMode: 0, t: 0 }]).direction
    ).toBe("right");
    expect(analyzeWheel([]).direction).toBe("none");
  });
  it("counts reversals inside a burst only", () => {
    const ev = (dy: number, t: number) => ({
      deltaX: 0,
      deltaY: dy,
      deltaMode: 0,
      t,
    });
    const jumpy = analyzeWheel([
      ev(100, 0),
      ev(-100, 30),
      ev(100, 60),
      ev(-100, 90),
    ]);
    expect(jumpy.reversals).toBe(3);
    const separate = analyzeWheel([ev(100, 0), ev(-100, 1000)]);
    expect(separate.reversals).toBe(0);
  });
  it("measures a peak speed", () => {
    const ev = [0, 50, 100, 150, 200].map((t) => ({
      deltaX: 0,
      deltaY: 120,
      deltaMode: 0,
      t,
    }));
    expect(analyzeWheel(ev).peakSpeed).toBeGreaterThan(5);
  });
});

describe("pointer verdict", () => {
  const clean = {
    total: 3,
    doubles: 0,
    bounces: 0,
    fastestGapMs: null,
    buttonsSeen: [0, 1, 2],
  };
  const wheel = {
    events: 4,
    direction: "down" as const,
    peakSpeed: 5,
    reversals: 0,
  };
  it("good when clean", () => {
    expect(
      pointerVerdict({ clicks: clean, wheel, jitter: null, dragged: true }).tone
    ).toBe("good");
  });
  it("warns on bounce, jitter and wheel reversal", () => {
    expect(
      pointerVerdict({
        clicks: { ...clean, bounces: 2 },
        wheel,
        jitter: null,
        dragged: true,
      }).tone
    ).toBe("warn");
    expect(
      pointerVerdict({
        clicks: clean,
        wheel,
        jitter: {
          samples: 5,
          maxDeviation: 12,
          rms: 4,
          netDrift: 10,
          level: "high",
        },
        dragged: true,
      }).verdict
    ).toContain("12 px");
    expect(
      pointerVerdict({
        clicks: clean,
        wheel: { ...wheel, reversals: 4 },
        jitter: null,
        dragged: false,
      }).tone
    ).toBe("warn");
  });
  it("info when untested or partial", () => {
    const none = {
      total: 0,
      doubles: 0,
      bounces: 0,
      fastestGapMs: null,
      buttonsSeen: [],
    };
    expect(
      pointerVerdict({
        clicks: none,
        wheel: { ...wheel, events: 0 },
        jitter: null,
        dragged: false,
      }).tone
    ).toBe("info");
    expect(
      pointerVerdict({
        clicks: { ...clean, buttonsSeen: [0] },
        wheel,
        jitter: null,
        dragged: false,
      }).tone
    ).toBe("info");
  });
});

describe("touch", () => {
  it("coverage maths", () => {
    expect(gridCoverage(12, 9)).toEqual({
      total: 12,
      hit: 9,
      missing: 3,
      percent: 75,
    });
    expect(gridCoverage(0, 0).percent).toBe(0);
    expect(gridCoverage(4, 9).hit).toBe(4);
  });
  it("labels missing cells", () => {
    expect(
      missingCellLabels(3, [true, false, true, true, true, false])
    ).toEqual(["row 1, column 2", "row 2, column 3"]);
  });
  it("verdicts", () => {
    expect(
      touchVerdict({
        maxTouches: 0,
        coverage: gridCoverage(12, 0),
        touched: false,
      }).tone
    ).toBe("info");
    expect(
      touchVerdict({
        maxTouches: 5,
        coverage: gridCoverage(12, 12),
        touched: true,
      }).tone
    ).toBe("good");
    expect(
      touchVerdict({
        maxTouches: 2,
        coverage: gridCoverage(100, 95),
        touched: true,
      }).tone
    ).toBe("warn");
    expect(
      touchVerdict({
        maxTouches: 2,
        coverage: gridCoverage(12, 6),
        touched: true,
      }).verdict
    ).toContain("50%");
    expect(
      touchVerdict({
        maxTouches: 1,
        coverage: gridCoverage(12, 0),
        touched: true,
      }).verdict
    ).toContain("1 finger ");
  });
});

describe("clock offset", () => {
  it("uses the midpoint and rtt", () => {
    // device clock 10s behind: server says 10_000 later than device midpoint
    const o = computeClockOffset({ t0: 1000, t1: 1100, server: 11_050 });
    expect(o.rttMs).toBe(100);
    expect(o.offsetMs).toBe(10_000);
    expect(o.uncertaintyMs).toBe(50);
  });
  it("negative offset when device is ahead", () => {
    const o = computeClockOffset({ t0: 100_000, t1: 100_000, server: 40_000 });
    expect(o.offsetMs).toBe(-60_000);
  });
  it("adds half a second for a coarse Date header", () => {
    const o = computeClockOffset({ t0: 0, t1: 200, server: 100, coarse: true });
    expect(o.offsetMs).toBe(500);
    expect(o.uncertaintyMs).toBe(600);
  });
  it("picks the lowest-latency sample", () => {
    const best = bestClockOffset([
      { t0: 0, t1: 800, server: 5_400 },
      { t0: 0, t1: 40, server: 5_020 },
      { t0: 0, t1: 300, server: 5_150 },
    ]);
    expect(best?.rttMs).toBe(40);
    expect(bestClockOffset([])).toBeNull();
  });
  it("classifies skew with a 2 minute alarm", () => {
    expect(classifySkew(0)).toBe("ok");
    expect(classifySkew(30_000)).toBe("ok");
    expect(classifySkew(45_000)).toBe("drift");
    expect(classifySkew(120_000)).toBe("drift");
    expect(classifySkew(120_001)).toBe("bad");
    expect(classifySkew(-300_000)).toBe("bad");
  });
  it("formats offsets", () => {
    expect(formatOffset(250)).toBe("250 ms");
    expect(formatOffset(4200)).toBe("+4.2 s");
    expect(formatOffset(-4200)).toBe("-4.2 s");
    expect(formatOffset(185_000)).toBe("+3 min 5 s");
    expect(formatOffset(3_660_000)).toBe("+1 h 1 min");
  });
  it("formats spans and skew wording without signs", () => {
    expect(formatSpan(-185_000)).toBe("3 min 5 s");
    expect(formatSpan(900)).toBe("900 ms");
    expect(describeSkew(-300_000)).toBe("5 min 0 s ahead");
    expect(describeSkew(4200)).toBe("4.2 s behind");
    expect(describeSkew(400)).toBe("in sync");
  });
  it("verdict wording and direction", () => {
    const v = clockVerdict(-200_000, 50);
    expect(v.tone).toBe("bad");
    expect(v.verdict).toContain("ahead of");
    expect(v.verdict).not.toContain("+");
    expect(v.verdict).not.toContain("-");
    expect(clockVerdict(200_000, 50).verdict).toContain("behind");
    expect(clockVerdict(100, 50).tone).toBe("good");
    expect(clockVerdict(60_000, 50).tone).toBe("warn");
  });
  it("gives OS specific steps", () => {
    expect(clockFixSteps("Windows").join(" ")).toContain("Sync now");
    expect(clockFixSteps("macOS").join(" ")).toContain("Date & Time");
    expect(clockFixSteps("iOS").join(" ")).toContain("Set Automatically");
    expect(clockFixSteps("Android").length).toBeGreaterThan(2);
    expect(clockFixSteps("Plan9").length).toBeGreaterThan(1);
  });
});

describe("renderer classification", () => {
  it("flags software rasterisers", () => {
    expect(
      classifyRenderer(
        "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
        true
      ).kind
    ).toBe("software");
    expect(
      classifyRenderer("llvmpipe (LLVM 15.0.7, 256 bits)", true).kind
    ).toBe("software");
    expect(classifyRenderer("Microsoft Basic Render Driver", true).kind).toBe(
      "software"
    );
  });
  it("detects vendors", () => {
    expect(
      classifyRenderer(
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)",
        true
      )
    ).toMatchObject({ kind: "hardware", vendor: "NVIDIA" });
    expect(classifyRenderer("Intel(R) UHD Graphics 620", true).vendor).toBe(
      "Intel"
    );
    expect(classifyRenderer("AMD Radeon Pro 5500M", true).vendor).toBe("AMD");
    expect(classifyRenderer("Apple M2", true).vendor).toBe("Apple");
    expect(classifyRenderer("Adreno (TM) 650", true).vendor).toBe("Qualcomm");
  });
  it("handles hidden and missing", () => {
    expect(classifyRenderer("", true).kind).toBe("unknown");
    expect(classifyRenderer(null, true).kind).toBe("unknown");
    expect(classifyRenderer("whatever", false).kind).toBe("none");
  });
  it("tips mention acceleration for software", () => {
    const tips = capabilityTips({
      renderer: classifyRenderer("llvmpipe", true),
      webgl2: true,
      missing: [{ id: "webrtc", label: "WebRTC", supported: false }],
      cores: 2,
      memoryGb: 2,
    });
    expect(tips.join(" ")).toContain("hardware acceleration");
    expect(tips.join(" ")).toContain("WebRTC");
    expect(tips.length).toBe(4);
    expect(
      capabilityTips({
        renderer: classifyRenderer("Apple M2", true),
        webgl2: true,
        missing: [],
        cores: 8,
        memoryGb: 8,
      })
    ).toHaveLength(1);
  });
});

describe("meeting maths", () => {
  it("fps from frame times", () => {
    expect(fpsFromTimes([0, 33.3, 66.6, 100])).toBeCloseTo(30, 0);
    expect(fpsFromTimes([5])).toBeNull();
    expect(fpsFromTimes([5, 5])).toBeNull();
  });
  it("rms and level", () => {
    expect(rmsLevel([])).toBe(0);
    expect(rmsLevel([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5);
    expect(rmsLevel([128, 128, 128], true)).toBe(0);
    expect(levelToPercent(0)).toBe(0);
    expect(levelToPercent(1)).toBe(100);
    expect(levelToPercent(0.1)).toBeGreaterThan(60);
  });
  it("camera and mic quality", () => {
    expect(cameraQuality(1280, 720, 30).state).toBe("pass");
    expect(cameraQuality(320, 240, 30).state).toBe("warn");
    expect(cameraQuality(1280, 720, 5).note).toContain("slowly");
    expect(cameraQuality(1280, 720, 15).note).toContain("choppy");
    expect(cameraQuality(null, null, null).state).toBe("warn");
    expect(micLevelState(null).state).toBe("skipped");
    expect(micLevelState(3).state).toBe("warn");
    expect(micLevelState(99).note).toContain("clipping");
    expect(micLevelState(50).state).toBe("pass");
  });
  it("summarises", () => {
    const mk = (s: Record<string, MeetingCheck["state"]>): MeetingCheck[] =>
      (["camera", "mic", "speaker", "share"] as const).map((id) => ({
        id,
        label: id,
        state: s[id] ?? "pending",
        detail: "",
      }));
    expect(meetingSummary(mk({})).ready).toBe("pending");
    expect(
      meetingSummary(
        mk({ camera: "pass", mic: "pass", speaker: "pass", share: "pass" })
      ).ready
    ).toBe("ready");
    expect(
      meetingSummary(
        mk({ camera: "pass", mic: "pass", speaker: "pass", share: "fail" })
      ).ready
    ).toBe("almost");
    expect(meetingSummary(mk({ camera: "fail", mic: "pass" })).ready).toBe(
      "not-ready"
    );
    expect(meetingSummary(mk({ camera: "pass", mic: "warn" })).ready).toBe(
      "almost"
    );
  });
});

describe("clean paste", () => {
  it("straightens smart punctuation and invisible chars", () => {
    expect(cleanPaste("“Hi” — it’s me​")).toBe('"Hi" - it\'s me');
  });
  it("collapses spaces and trims lines", () => {
    expect(cleanPaste("  a    b  \n   c  ")).toBe("a b\nc");
  });
  it("joins hard-wrapped lines but keeps paragraphs", () => {
    const opts = {
      collapseSpaces: true,
      straightenQuotes: true,
      joinLines: true,
      trimLines: true,
      stripInvisible: true,
    };
    expect(cleanPaste("one\ntwo\n\nthree\nfour", opts)).toBe(
      "one two\n\nthree four"
    );
  });
  it("respects switches", () => {
    const off = {
      collapseSpaces: false,
      straightenQuotes: false,
      joinLines: false,
      trimLines: false,
      stripInvisible: false,
    };
    expect(cleanPaste("“x”  y", off)).toBe("“x”  y");
  });
  it("normalises CRLF", () => {
    expect(cleanPaste("a\r\nb\r\n\r\n\r\n\r\nc")).toBe("a\nb\n\nc");
  });
});

describe("permission help", () => {
  it("is browser and kind specific", () => {
    expect(permissionHelp("Chrome", "camera")).toContain("Site settings");
    expect(permissionHelp("Firefox", "microphone")).toContain("microphone");
    expect(permissionHelp("Safari", "camera")).toContain("Settings → Websites");
    expect(permissionHelp("Safari", "screen")).toContain("12.3");
    expect(permissionHelp("Edge", "screen")).toContain("Screen");
    expect(permissionHelp("Odd", "camera")).toContain("padlock");
  });
});

describe("clipboard advice", () => {
  it("is browser specific", () => {
    expect(clipboardAdvice("Firefox", "read")).toContain("Firefox");
    expect(clipboardAdvice("Safari", "write")).toContain("Safari");
    expect(clipboardAdvice("Chrome", "read")).toContain("Site settings");
    expect(clipboardAdvice("Weird", "read")).toContain("padlock");
  });
});

describe("cleanup helpers", () => {
  it("gives per-browser steps with the right shortcut", () => {
    expect(cacheClearSteps("Chrome", "Windows").steps[0]).toContain(
      "Ctrl+Shift+Delete"
    );
    expect(cacheClearSteps("Chrome", "macOS").steps[0]).toContain(
      "Cmd+Shift+Delete"
    );
    expect(cacheClearSteps("Safari", "macOS").title).toContain("Mac");
    expect(cacheClearSteps("Safari", "iOS").title).toContain("iPhone");
    expect(cacheClearSteps("Firefox", "Linux").title).toContain("Firefox");
    expect(cacheClearSteps("Edge", "Windows").title).toContain("Edge");
    expect(cacheClearSteps("Opera", "Windows").title).toBe("Your browser");
  });
  it("recognises auth cookies", () => {
    expect(isAuthCookieName("sb-abc-auth-token")).toBe(true);
    expect(isAuthCookieName("session_id")).toBe(true);
    expect(isAuthCookieName("theme")).toBe(false);
    expect(splitCookieNames("a=1; sb-x-auth-token=2;  ")).toEqual([
      "a",
      "sb-x-auth-token",
    ]);
    expect(splitCookieNames("")).toEqual([]);
  });
  it("estimates storage bytes", () => {
    expect(storageBytes([["ab", "cde"]])).toBe(10);
  });
});

describe("support report", () => {
  const sections = [
    {
      id: "device",
      title: "Device",
      body: "Windows, Chrome 140\nIP 192.168.1.20 via me@example.com",
    },
    {
      id: "ip",
      title: "Network address",
      body: "203.0.113.9",
      sensitive: true,
    },
    { id: "clock", title: "Clock", body: "In sync" },
  ];
  const when = new Date("2026-01-02T03:04:05Z");
  it("scrubs ips, emails and tokens", () => {
    expect(
      scrubSensitive(
        "a@b.co 10.0.0.1 2001:db8::1 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkw.abcdefghij"
      )
    ).toBe("[email removed] [ip removed] [ip removed] [secret removed]");
    expect(scrubSensitive("nothing here")).toBe("nothing here");
    expect(scrubSensitive("at 12:30:45 today")).toBe("at 12:30:45 today");
  });
  it("only includes ticked sections and scrubs by default", () => {
    const text = formatSupportReport({
      sections,
      includeIds: ["device"],
      when,
    });
    expect(text).toContain("== Device ==");
    expect(text).not.toContain("Clock");
    expect(text).not.toContain("192.168.1.20");
    expect(text).not.toContain("me@example.com");
    expect(text).not.toContain("203.0.113.9");
  });
  it("includes a sensitive section only when ticked", () => {
    const text = formatSupportReport({ sections, includeIds: ["ip"], when });
    expect(text).toContain("203.0.113.9");
  });
  it("allows personal details when asked", () => {
    const text = formatSupportReport({
      sections,
      includeIds: ["device"],
      when,
      allowPersonal: true,
    });
    expect(text).toContain("192.168.1.20");
  });
  it("adds the user's note, scrubbed", () => {
    const text = formatSupportReport({
      sections,
      includeIds: [],
      note: "Email me@x.org when fixed",
      when,
    });
    expect(text).toContain("What's wrong:\nEmail [email removed] when fixed");
  });
  it("ticket seed is a short first line", () => {
    expect(ticketSeed("")).toBe("Support report from the Toolkit");
    expect(ticketSeed("Printer broken\nmore")).toBe("Printer broken");
    expect(ticketSeed("x".repeat(300)).length).toBe(140);
    expect(ticketSeed("a@b.co is stuck")).toBe("[email removed] is stuck");
  });
});

describe("print symptoms", () => {
  const ids = new Set(ISSUES.map((i) => i.id));
  it("only links to guides that exist", () => {
    for (const s of PRINT_SYMPTOMS) {
      expect(s.steps.length).toBeGreaterThan(1);
      for (const g of s.guides) expect(ids.has(g.id)).toBe(true);
    }
  });
});
