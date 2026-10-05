import { describe, expect, it } from "vitest";
import {
  COMMON_PASSWORDS,
  WIFI_GUIDES,
  WORDLIST,
  analyzeEmailText,
  analyzeInput,
  analyzeUrl,
  assessPassword,
  classifyStability,
  compareResolvers,
  correlatedLossShare,
  diagnoseStability,
  diagnoseWifi,
  extractLinks,
  flushDnsTip,
  formatCrackTime,
  formatTtl,
  generatePassphrase,
  generatePassword,
  isCommonPassword,
  isValidDomain,
  latencyStats,
  levenshtein,
  maskIp,
  normalizeDomain,
  parseDoh,
  parsePwnedRange,
  parseTrace,
  passphraseEntropyBits,
  passwordEntropyBits,
  randomInt,
  registrableDomain,
  sha1Hex,
  sparkPoints,
  splitHash,
  vpnHints,
  type RandomFill,
  type ResolverOutcome,
} from "./net-sec-logic";
import { ISSUES } from "@/lib/issues";

// Deterministic "random" source for tests.
function seeded(seed = 1): RandomFill {
  let s = seed >>> 0;
  return (buf) => {
    for (let i = 0; i < buf.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      buf[i] = s;
    }
    return buf;
  };
}

describe("latency maths", () => {
  it("computes avg/min/max/jitter/loss", () => {
    const s = latencyStats([10, 20, null, 40, 30]);
    expect(s.sent).toBe(5);
    expect(s.received).toBe(4);
    expect(s.lossPct).toBe(20);
    expect(s.avg).toBe(25);
    expect(s.min).toBe(10);
    expect(s.max).toBe(40);
    expect(s.jitter).toBeCloseTo((10 + 20 + 10) / 3, 5);
    expect(s.p95).toBe(40);
  });
  it("handles empty, all-lost and single samples", () => {
    expect(latencyStats([]).avg).toBeNull();
    expect(latencyStats([]).lossPct).toBe(0);
    const lost = latencyStats([null, null]);
    expect(lost.lossPct).toBe(100);
    expect(lost.jitter).toBeNull();
    expect(latencyStats([50]).jitter).toBeNull();
  });
  it("ignores NaN/negative values", () => {
    expect(latencyStats([NaN, -5, 20]).received).toBe(1);
  });
  it("classifies steady, shaky and failing connections", () => {
    expect(classifyStability(latencyStats(Array(20).fill(30)))).toBe("good");
    expect(
      classifyStability(
        latencyStats([
          30,
          30,
          30,
          null,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
          30,
        ])
      )
    ).toBe("stutter");
    expect(classifyStability(latencyStats([30, 400, 20, 500, 30, 450]))).toBe(
      "drop"
    );
    expect(classifyStability(latencyStats([null, null, null]))).toBe("offline");
  });
  it("measures correlated loss", () => {
    expect(correlatedLossShare([1, null, null], [1, null, 1])).toBeCloseTo(0.5);
    expect(correlatedLossShare([1, 1], [1, 1])).toBeNull();
  });
  it("diagnoses local vs route problems", () => {
    const bad = [20, null, 400, null, 30, null, 500, 20, null, null];
    const good = Array(10).fill(25);
    expect(diagnoseStability(good, good).verdictKey).toBe("good");
    expect(diagnoseStability(good, good).culprit).toBe("none");
    const both = diagnoseStability(bad, bad);
    expect(both.verdictKey).toBe("drop");
    expect(both.culprit).toBe("local");
    expect(both.verdict).toBe("Likely to drop");
    expect(diagnoseStability(bad, good).culprit).toBe("route");
    expect(diagnoseStability(good, bad).culprit).toBe("route");
    expect(diagnoseStability(bad, Array(10).fill(null)).culprit).toBe(
      "unknown"
    );
    expect(diagnoseStability([null, null], good).verdictKey).toBe("offline");
    const stutter = diagnoseStability([20, 90, 20, 100, 20, 95, 20, 90], null);
    expect(stutter.verdict).toBe("Calls may stutter");
  });
  it("builds sparkline geometry with gaps for lost probes", () => {
    const { points, lost } = sparkPoints([10, null, 100], 100, 40, 3);
    expect(points).toHaveLength(2);
    expect(lost).toEqual([50]);
    expect(points[0].y).toBeGreaterThan(points[1].y); // higher latency is higher on screen
  });
});

describe("trace parsing and IP masking", () => {
  const TRACE =
    "fl=123f45\nh=www.cloudflare.com\nip=203.0.113.42\nts=1700000000.1\nvisit_scheme=https\nuag=Mozilla/5.0 (X11; a=b)\ncolo=EWR\nsliver=none\nhttp=http/2\nloc=US\ntls=TLSv1.3\nsni=plaintext\nwarp=off\ngateway=off\nrbi=off\nkex=X25519";
  it("parses key=value text, keeping '=' inside values", () => {
    const t = parseTrace(TRACE)!;
    expect(t.ip).toBe("203.0.113.42");
    expect(t.loc).toBe("US");
    expect(t.colo).toBe("EWR");
    expect(t.http).toBe("http/2");
    expect(t.tls).toBe("TLSv1.3");
    expect(t.raw.uag).toContain("a=b");
  });
  it("returns null for junk", () => {
    expect(parseTrace("<html>nope</html>")).toBeNull();
    expect(parseTrace("")).toBeNull();
  });
  it("masks IPv4 and IPv6", () => {
    expect(maskIp("203.0.113.42")).toBe("203.0.•••.•••");
    expect(maskIp("2001:db8::1")).toBe("2001:••••:••••:••••");
    expect(maskIp("weird")).not.toContain("weird");
    expect(maskIp("203.0.113.42")).not.toContain("113");
  });
  it("detects WARP hints", () => {
    expect(vpnHints(parseTrace(TRACE)!).tone).toBe("good");
    expect(
      vpnHints(parseTrace(TRACE.replace("warp=off", "warp=on"))!).tone
    ).toBe("info");
    expect(
      vpnHints(parseTrace(TRACE.replace("gateway=off", "gateway=on"))!).label
    ).toContain("Gateway");
  });
});

describe("DNS helpers", () => {
  it("normalizes input", () => {
    expect(normalizeDomain(" HTTPS://User@Example.COM:8080/path?q=1 ")).toBe(
      "example.com"
    );
    expect(normalizeDomain("example.com.")).toBe("example.com");
  });
  it("validates domains strictly", () => {
    for (const ok of [
      "example.com",
      "a.b.example.co.uk",
      "xn--bcher-kva.example",
      "my-site.io",
    ])
      expect(isValidDomain(ok)).toBe(true);
    for (const bad of [
      "",
      "localhost",
      "-a.com",
      "a-.com",
      "a..com",
      "exa mple.com",
      "<script>.com",
      "example.c",
      "example.123",
      "a".repeat(64) + ".com",
      "ex_ample.com",
      "example.com/path",
      "javascript:alert(1)",
    ]) {
      expect(isValidDomain(bad)).toBe(false);
    }
  });
  it("parses DoH JSON and strips TXT quotes", () => {
    const r = parseDoh({
      Status: 0,
      AD: false,
      Answer: [
        { name: "example.com.", type: 1, TTL: 300, data: "93.184.216.34" },
        { name: "example.com.", type: 16, TTL: 60, data: '"v=spf1 -all"' },
        { name: "example.com.", type: 16, TTL: 60, data: '"part1" "part2"' },
        {
          name: "example.com.",
          type: 15,
          TTL: 60,
          data: "10 mail.example.com.",
        },
        { name: "x.", type: 999, TTL: 1, data: "?" },
        { bogus: true },
      ],
    })!;
    expect(r.statusLabel).toBe("OK");
    expect(r.answers.map((a) => a.type)).toEqual([
      "A",
      "TXT",
      "TXT",
      "MX",
      "TYPE999",
    ]);
    expect(r.answers[1].data).toBe("v=spf1 -all");
    expect(r.answers[2].data).toBe("part1part2");
    expect(r.answers[3].data).toBe("10 mail.example.com");
    expect(r.answers[0].name).toBe("example.com");
  });
  it("labels error statuses and rejects garbage", () => {
    expect(parseDoh({ Status: 3 })!.statusLabel).toBe("Domain does not exist");
    expect(parseDoh({ Status: 2 })!.statusLabel).toBe("Server failure");
    expect(parseDoh({ Status: 42 })!.statusLabel).toBe("Status 42");
    expect(parseDoh(null)).toBeNull();
    expect(parseDoh({ Answer: [] })).toBeNull();
    expect(parseDoh("x")).toBeNull();
  });
  it("formats TTLs", () => {
    expect(formatTtl(30)).toBe("30s");
    expect(formatTtl(600)).toBe("10m");
    expect(formatTtl(7200)).toBe("2h");
    expect(formatTtl(400000)).toBe("5d");
  });
  const ok = (data: string[], status = 0): ResolverOutcome => ({
    ok: true,
    ms: 20,
    result: {
      status,
      statusLabel: status ? "Domain does not exist" : "OK",
      authenticated: false,
      answers: data.map((d) => ({ name: "x", type: "A", ttl: 60, data: d })),
    },
  });
  const fail: ResolverOutcome = { ok: false, ms: null, error: "timeout" };
  it("compares resolvers", () => {
    expect(
      compareResolvers("A", ok(["1.1.1.1"]), ok(["1.1.1.1", "2.2.2.2"]))
    ).toEqual([]);
    expect(compareResolvers("A", ok(["1.1.1.1"]), fail)[0].tone).toBe("warn");
    expect(compareResolvers("A", fail, fail)[0].tone).toBe("bad");
    expect(compareResolvers("A", ok([], 3), ok([], 3))[0].text).toContain(
      "does not exist"
    );
    expect(compareResolvers("A", ok([], 3), ok(["1.1.1.1"]))[0].text).toContain(
      "disagree"
    );
    expect(
      compareResolvers("A", ok(["1.1.1.1"]), ok(["9.9.9.9"]))[0].tone
    ).toBe("info");
    expect(compareResolvers("A", ok(["1.1.1.1"]), ok([]))[0].text).toContain(
      "only one"
    );
    expect(compareResolvers("A", ok([]), ok([]))).toEqual([]);
  });
  it("gives per-OS flush tips", () => {
    expect(flushDnsTip("Windows")).toContain("ipconfig /flushdns");
    expect(flushDnsTip("macOS")).toContain("dscacheutil -flushcache");
    expect(flushDnsTip("Android")).toContain("Airplane");
    expect(flushDnsTip("Plan 9")).toContain("Restart");
  });
});

describe("password strength", () => {
  it("embeds a sizeable common list", () => {
    expect(COMMON_PASSWORDS.length).toBeGreaterThanOrEqual(200);
  });
  it("flags common passwords, including simple variants", () => {
    for (const p of [
      "password",
      "Password1",
      "P@ssw0rd",
      "qwerty123",
      "letmein!",
      "Dragon2024",
    ])
      expect(isCommonPassword(p)).toBe(true);
    expect(isCommonPassword("x7#Lq!9vTz2m")).toBe(false);
  });
  it("scores weak vs strong", () => {
    expect(assessPassword("password").score).toBe(0);
    expect(assessPassword("password").common).toBe(true);
    expect(assessPassword("Summer2024!").score).toBeLessThanOrEqual(2);
    expect(assessPassword("aaaaaaaaaaaa").score).toBeLessThanOrEqual(1);
    expect(assessPassword("abcdefgh").warnings.join(" ")).toMatch(/Sequences/);
    expect(assessPassword("qwertyuiop").warnings.join(" ")).toMatch(
      /Keyboard|common/
    );
    expect(assessPassword("1990mypet").warnings.join(" ")).toMatch(/Years/);
    expect(assessPassword("k8#Vd!q2Lw9zRt5x").score).toBeGreaterThanOrEqual(3);
    expect(
      assessPassword("correct-horse-battery-staple-fox-lamp").score
    ).toBeGreaterThanOrEqual(3);
  });
  it("is monotonic in length for random-looking text", () => {
    const a = assessPassword("k8#Vd!q2").bits;
    const b = assessPassword("k8#Vd!q2Lw9z").bits;
    expect(b).toBeGreaterThan(a);
  });
  it("handles empty and unicode input", () => {
    expect(assessPassword("").label).toBe("Empty");
    expect(assessPassword("пароль-Ж9ёй").charsets).toContain("unicode");
  });
  it("words crack times sensibly", () => {
    expect(formatCrackTime(2)).toBe("instantly");
    expect(formatCrackTime(12)).toMatch(/seconds|minutes/);
    expect(formatCrackTime(20)).toMatch(/years/);
    expect(formatCrackTime(60)).toBe("longer than the age of the universe");
  });
  it("never returns the password itself in any text", () => {
    const pw = "Zx9!UniqueSecret";
    const a = assessPassword(pw);
    expect(JSON.stringify(a)).not.toContain(pw);
  });
});

describe("generators", () => {
  it("randomInt is in range and unbiased-ish", () => {
    const fill = seeded(7);
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 6000; i++) counts[randomInt(6, fill)]++;
    for (const c of counts) expect(c).toBeGreaterThan(800);
    expect(() => randomInt(0, fill)).toThrow();
  });
  it("randomInt rejects values in the biased tail", () => {
    // 2^32 % 3 === 1, so 0xffffffff must be rejected and the next value used
    const seq = [0xffffffff, 4];
    let i = 0;
    const fill: RandomFill = (buf) => {
      buf[0] = seq[i++];
      return buf;
    };
    expect(randomInt(3, fill)).toBe(1);
  });
  it("generates passwords with every selected class", () => {
    const fill = seeded(3);
    for (let n = 0; n < 50; n++) {
      const p = generatePassword(
        { length: 12, lower: true, upper: true, digits: true, symbols: true },
        fill
      );
      expect(p).toHaveLength(12);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
      expect(p).toMatch(/[^A-Za-z0-9]/);
    }
  });
  it("respects options", () => {
    const fill = seeded(5);
    expect(
      generatePassword(
        { length: 30, symbols: false, upper: false, digits: false },
        fill
      )
    ).toMatch(/^[a-z]{30}$/);
    expect(
      generatePassword({ length: 200, avoidLookalikes: true }, fill)
    ).toHaveLength(128);
    expect(
      generatePassword({ length: 400, avoidLookalikes: true }, fill)
    ).not.toMatch(/[Il1O0o|]/);
    expect(() =>
      generatePassword(
        {
          length: 10,
          lower: false,
          upper: false,
          digits: false,
          symbols: false,
        },
        fill
      )
    ).toThrow();
  });
  it("different seeds give different passwords; entropy grows with length", () => {
    expect(generatePassword({ length: 16 }, seeded(1))).not.toBe(
      generatePassword({ length: 16 }, seeded(2))
    );
    expect(passwordEntropyBits({ length: 20 })).toBeGreaterThan(
      passwordEntropyBits({ length: 10 })
    );
    expect(passwordEntropyBits({ length: 16 })).toBeGreaterThan(90);
  });
  it("has a clean wordlist of >= 300 unique words", () => {
    expect(WORDLIST.length).toBeGreaterThanOrEqual(300);
    expect(new Set(WORDLIST).size).toBe(WORDLIST.length);
    for (const w of WORDLIST) expect(w).toMatch(/^[a-z]{3,9}$/);
  });
  it("generates passphrases", () => {
    const p = generatePassphrase(
      { words: 5, separator: "-", capitalize: true, addNumber: true },
      seeded(9)
    );
    expect(p.split("-")).toHaveLength(5);
    expect(p).toMatch(/\d/);
    expect(p).toMatch(/^[A-Z]/);
    const plain = generatePassphrase({ words: 4, separator: " " }, seeded(9));
    expect(plain.split(" ").every((w) => WORDLIST.includes(w))).toBe(true);
    expect(passphraseEntropyBits({ words: 6 })).toBeGreaterThan(
      passphraseEntropyBits({ words: 5 })
    );
    expect(
      passphraseEntropyBits({ words: 5, addNumber: true })
    ).toBeGreaterThan(passphraseEntropyBits({ words: 5 }));
  });
});

describe("HaveIBeenPwned k-anonymity helpers", () => {
  it("computes SHA-1 correctly", async () => {
    expect(await sha1Hex("password")).toBe(
      "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8"
    );
    expect(await sha1Hex("")).toBe("DA39A3EE5E6B4B0D3255BFEF95601890AFD80709");
  });
  it("splits into a 5-char prefix and 35-char suffix", async () => {
    const { prefix, suffix } = splitHash(await sha1Hex("password"));
    expect(prefix).toBe("5BAA6");
    expect(suffix).toBe("1E4C9B93F3F0682250B6CF8331B7EE68FD8");
    expect(suffix).toHaveLength(35);
  });
  it("finds counts and treats padding rows as zero", () => {
    const body =
      "0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:10434004\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0\r\n";
    expect(parsePwnedRange(body, "1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toBe(
      10434004
    );
    expect(parsePwnedRange(body, "1e4c9b93f3f0682250b6cf8331b7ee68fd8")).toBe(
      10434004
    );
    expect(parsePwnedRange(body, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(
      0
    );
    expect(parsePwnedRange(body, "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")).toBe(
      0
    );
    expect(parsePwnedRange("garbage", "X")).toBe(0);
  });
});

describe("domain helpers", () => {
  it("finds the registrable domain", () => {
    expect(registrableDomain("a.b.example.com")).toBe("example.com");
    expect(registrableDomain("www.bbc.co.uk")).toBe("bbc.co.uk");
    expect(registrableDomain("example.com")).toBe("example.com");
  });
  it("computes edit distance", () => {
    expect(levenshtein("google", "goggle")).toBe(1);
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("phishing heuristics: URLs", () => {
  const reasons = (u: string) =>
    analyzeUrl(u)
      .reasons.map((r) => r.text)
      .join(" | ");
  it("does not alarm on ordinary sites", () => {
    for (const u of [
      "https://www.google.com/search?q=cats",
      "https://github.com/anthropics",
      "https://login.microsoftonline.com/common/oauth2",
      "https://mail.google.com",
      "example.com",
      "https://www.amazon.co.uk/dp/123",
    ]) {
      const r = analyzeUrl(u);
      expect(r.level).toBe("low");
      expect(r.reasons).toEqual([]);
    }
  });
  it("catches raw IP hosts, including decimal IPs", () => {
    expect(reasons("http://192.168.1.5/login")).toMatch(/raw IP/);
    expect(reasons("http://3232235777/")).toMatch(/raw IP/);
    expect(analyzeUrl("http://192.168.1.5/login").score).toBeGreaterThanOrEqual(
      38
    );
  });
  it("catches @ tricks", () => {
    const r = reasons("https://paypal.com@evil.example.net/login");
    expect(r).toMatch(/@ sign/);
    expect(r).toMatch(/evil\.example\.net/);
  });
  it("catches punycode and non-ASCII look-alikes", () => {
    expect(reasons("https://xn--pypal-4ve.com/")).toMatch(/punycode/);
    expect(reasons("https://раypal.com/")).toMatch(/look-alike|punycode/);
  });
  it("catches brand impersonation and typos", () => {
    expect(reasons("https://paypal.com.account-verify.xyz/")).toMatch(/Paypal/);
    expect(reasons("https://paypa1.com/")).toMatch(/look-alike|misspelling/);
    expect(reasons("https://micr0soft-support.com/")).toMatch(/Microsoft/);
    expect(reasons("https://goggle.com/")).toMatch(/Google/);
    expect(reasons("https://rnicrosoft.com/")).toMatch(/Microsoft/);
    expect(analyzeUrl("https://paypal.com.account-verify.xyz/").level).not.toBe(
      "low"
    );
  });
  it("does not flag legit brand domains or unrelated words", () => {
    expect(reasons("https://pineapple.com/")).toBe("");
    expect(reasons("https://www.paypal.com/signin")).toBe("");
  });
  it("flags too many subdomains, shorteners, risky TLDs, http", () => {
    expect(reasons("https://a.b.c.d.e.example.com/")).toMatch(/subdomains/);
    expect(reasons("https://bit.ly/3abc")).toMatch(/shortener/);
    expect(reasons("https://prize-now.top/")).toMatch(/\.top/);
    expect(reasons("http://example.com/login")).toMatch(/Not encrypted/);
    expect(reasons("example.com/login")).not.toMatch(/Not encrypted/);
  });
  it("flags dangerous schemes without throwing", () => {
    expect(analyzeUrl("javascript:alert(1)").level).not.toBe("low");
    expect(
      analyzeUrl("data:text/html;base64,PHNjcmlwdD4=").reasons.length
    ).toBe(1);
  });
  it("copes with garbage", () => {
    expect(analyzeUrl("not a url at all").reasons).toEqual([]);
    expect(() => analyzeUrl("http://[bad")).not.toThrow();
    expect(analyzeUrl("").level).toBe("low");
  });
  it("caps the score at 100 and orders high severity first", () => {
    const r = analyzeUrl(
      "http://user@paypa1-secure-login-verify-account.a.b.c.d.example.xyz:8080/login"
    );
    expect(r.score).toBe(100);
    expect(r.reasons[0].severity).toBe("high");
  });
});

describe("phishing heuristics: email text", () => {
  it("extracts links from html, markdown and plain text", () => {
    const links = extractLinks(
      '<a href="https://evil.test/x">https://paypal.com</a> see [docs](https://ok.example/doc) and www.plain.example/path.'
    );
    expect(links.map((l) => l.href)).toEqual([
      "https://evil.test/x",
      "https://ok.example/doc",
      "www.plain.example/path",
    ]);
    expect(links[0].text).toBe("https://paypal.com");
  });
  it("detects displayed vs real link mismatch", () => {
    const r = analyzeEmailText(
      'Please <a href="https://evil.example.net/login">www.paypal.com</a> now'
    );
    expect(r.reasons.some((x) => /actually goes to/.test(x.text))).toBe(true);
    expect(r.level).not.toBe("low");
  });
  it("accepts matching display and target", () => {
    const r = analyzeEmailText(
      'Read <a href="https://www.example.com/a">example.com/a</a>'
    );
    expect(r.reasons.some((x) => /actually goes to/.test(x.text))).toBe(false);
  });
  it("flags urgency + credential requests + generic greeting", () => {
    const r = analyzeEmailText(
      "Dear customer,\nYour account will be suspended within 24 hours. Verify your password immediately: http://secure-update.example.top/login"
    );
    const texts = r.reasons.map((x) => x.text).join(" | ");
    expect(texts).toMatch(/urgent/);
    expect(texts).toMatch(/sensitive details/);
    expect(texts).toMatch(/Generic greeting/);
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.level).toBe("danger");
  });
  it("flags sender display name / domain mismatch", () => {
    const r = analyzeEmailText(
      'From: "PayPal Support" <help@mail-secure.example>\nSubject: hi\n\nHello there'
    );
    expect(r.reasons.some((x) => /Sender name says/.test(x.text))).toBe(true);
    const fine = analyzeEmailText(
      'From: "PayPal" <service@paypal.com>\n\nHello'
    );
    expect(fine.reasons.some((x) => /Sender name says/.test(x.text))).toBe(
      false
    );
  });
  it("is calm for a normal message", () => {
    const r = analyzeEmailText(
      "Hi Sam, are we still on for lunch Thursday? Menu: https://www.example.com/menu"
    );
    expect(r.level).toBe("low");
  });
  it("flags risky attachments and money hooks", () => {
    expect(
      analyzeEmailText("See invoice.html attached, enable macros to view")
        .reasons.length
    ).toBeGreaterThan(0);
    expect(
      analyzeEmailText("Buy gift cards and send the codes").reasons.length
    ).toBeGreaterThan(0);
  });
  it("routes input to URL or email mode", () => {
    expect(analyzeInput("https://example.com").kind).toBe("url");
    expect(analyzeInput("www.example.com/a").kind).toBe("url");
    expect(analyzeInput("Dear customer, click here").kind).toBe("email");
    expect(analyzeInput('<a href="https://x.test">y</a>').kind).toBe("email");
  });
  it("does not treat injected markup as anything but data", () => {
    const r = analyzeEmailText(
      '<img src=x onerror="alert(1)"> <a href="javascript:alert(1)">click</a>'
    );
    expect(r.reasons.length).toBeGreaterThan(0);
  });
});

describe("Wi-Fi diagnosis", () => {
  const healthy = {
    online: true,
    medianMs: 30,
    lossPct: 0,
    jitterMs: 5,
    externalOk: true,
  };
  const base = {
    scope: "all",
    distance: "near",
    vpn: "off",
    mobile: "works",
    sites: "all",
  } as const;
  it("blames the router when everything is affected but mobile works", () => {
    const d = diagnoseWifi(base, { ...healthy, lossPct: 12 });
    expect(d[0].id).toBe("router");
    expect(d[0].likelihood).toBe("Most likely");
  });
  it("blames the ISP when mobile is bad too", () => {
    expect(
      diagnoseWifi(
        { ...base, mobile: "also-bad" },
        { ...healthy, online: false, medianMs: null, lossPct: 100 }
      )[0].id
    ).toBe("isp");
  });
  it("blames the device when only one device is affected", () => {
    expect(diagnoseWifi({ ...base, scope: "one" }, healthy)[0].id).toBe(
      "device"
    );
  });
  it("blames the VPN when it is on", () => {
    expect(
      diagnoseWifi({ ...base, scope: "one", vpn: "on" }, healthy)[0].id
    ).toBe("vpn");
  });
  it("blames DNS when only some sites fail on a healthy line", () => {
    expect(
      diagnoseWifi({ ...base, scope: "one", sites: "some" }, healthy)[0].id
    ).toBe("dns");
  });
  it("sorts by score, clamps 0..100 and always has reasons", () => {
    const d = diagnoseWifi(base, healthy);
    for (let i = 1; i < d.length; i++)
      expect(d[i - 1].score).toBeGreaterThanOrEqual(d[i].score);
    for (const c of d) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
      expect(c.why.length).toBeGreaterThan(0);
      expect(c.steps.length).toBeGreaterThan(0);
    }
  });
  it("only links guides that exist", () => {
    const ids = new Set(ISSUES.map((i) => i.id));
    for (const g of Object.values(WIFI_GUIDES))
      expect(ids.has(g.id)).toBe(true);
  });
});

describe("password messaging", () => {
  it("distinguishes exact common passwords from common-word-plus-digits", () => {
    expect(assessPassword("password").commonExact).toBe(true);
    const v = assessPassword("Summer2024!");
    expect(v.common).toBe(true);
    expect(v.commonExact).toBe(false);
    expect(v.warnings[0]).toMatch(/common word/);
  });
});
