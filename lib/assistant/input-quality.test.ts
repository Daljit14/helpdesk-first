import { describe, expect, test } from "vitest";
import {
  classifyInput,
  detectSensitive,
  inputHint,
  isGibberishToken,
} from "./input-quality";

const kind = (text: string, mode?: "problem" | "answer") =>
  classifyInput(text, { mode }).kind;

describe("classifyInput", () => {
  test("flags empty input", () => {
    expect(kind("")).toBe("empty");
    expect(kind("   \n ")).toBe("empty");
  });

  test.each([
    "hello",
    "Hello!",
    "hi",
    "hiiii",
    "helloooo",
    "hyyyyyyyyy",
    "hey",
    "heyyyy",
    "hey there",
    "yo",
    "sup",
    "good morning",
    "hi how are you",
  ])("recognises the greeting %j", (text) => {
    expect(kind(text)).toBe("greeting");
  });

  test.each([
    "thanks",
    "thank you",
    "ok",
    "okay",
    "lol",
    "hahaha",
    "how are you",
    "who are you",
    "what can you do",
  ])("recognises small talk %j", (text) => {
    expect(kind(text)).toBe("small_talk");
  });

  test.each([
    "dikncjkdbcjb ajbdkajbd",
    "dikncjkdbcjb",
    "asdf",
    "asdfghjkl",
    "qwerty",
    "zxcvbnm",
    "jjjjjjj",
    "hdhdhdhd",
    "fjfjfjfj kdkdkd",
  ])("flags keyboard mashing %j as gibberish", (text) => {
    expect(kind(text)).toBe("gibberish");
  });

  test.each([
    "my wifi keeps dropping",
    "printer offline",
    "outlook wont open",
    "outlook won't open",
    "vpn",
    "wifi",
    "Wi-Fi",
    "pc",
    "mic",
    "wifii keeps droping",
    "prnter offline",
    "outlok",
    "my laptop is really slow",
    "hi my laptop is slow",
    "excel is frozen and not responding",
    "0x80070005 error on update",
    "my password is expired",
    "it says my password is wrong",
    "Inspect this",
  ])("accepts the real IT description %j", (text) => {
    expect(kind(text)).toBe("ok");
  });

  test.each([
    "x",
    "??",
    "404",
    "help",
    "it's not working",
    "something is wrong",
  ])("asks for more detail on %j", (text) => {
    expect(kind(text)).toBe("too_short");
  });

  test.each([
    "what's the weather today",
    "give me a pizza recipe",
    "help me with my math homework",
    "tell me a joke",
  ])("flags the clearly non-IT request %j as off topic", (text) => {
    expect(kind(text)).toBe("off_topic");
  });

  test("does not call IT problems off topic just because of a topic word", () => {
    expect(kind("I can't upload my homework, the file upload fails")).toBe(
      "ok"
    );
  });

  test.each([
    ["my password is hunter2", "password"],
    ["password: abc123", "password"],
    ["4111 1111 1111 1111", "card"],
    ["my ssn is 123-45-6789", "ssn"],
    ["sk-proj-abcdefghijklmnop1234", "api_key"],
    ["AKIAIOSFODNN7EXAMPLE", "api_key"],
    ["-----BEGIN RSA PRIVATE KEY-----", "private_key"],
  ])("flags the secret in %j", (text, type) => {
    const result = classifyInput(text);
    expect(result.kind).toBe("sensitive");
    expect(result.sensitiveType).toBe(type);
  });

  test("answer mode accepts short replies but still blocks mashing and secrets", () => {
    expect(kind("yes", "answer")).toBe("ok");
    expect(kind("no", "answer")).toBe("ok");
    expect(kind("Mac", "answer")).toBe("ok");
    expect(kind("today", "answer")).toBe("ok");
    expect(kind("dikncjkdbcjb ajbdkajbd", "answer")).toBe("gibberish");
    expect(kind("password: hunter2", "answer")).toBe("sensitive");
  });

  test("reports recognised IT terms", () => {
    expect(classifyInput("prnter offline").itTerms).toContain("printer");
  });
});

describe("detectSensitive", () => {
  test("ignores ordinary password problems and non-Luhn numbers", () => {
    expect(detectSensitive("my password is not working")).toBeNull();
    expect(detectSensitive("forgot my password")).toBeNull();
    expect(detectSensitive("order 1234567890123 failed")).toBeNull();
  });
});

describe("isGibberishToken", () => {
  test("keeps real and IT words", () => {
    for (const word of [
      "printer",
      "outlook",
      "bluetooth",
      "hdmi",
      "spreadsheet",
      "projector",
    ])
      expect(isGibberishToken(word)).toBe(false);
  });
});

describe("inputHint", () => {
  test("gives live, non-blocking hints", () => {
    expect(inputHint("")).toBeNull();
    expect(inputHint("printer offline")).toBeNull();
    expect(inputHint("dikncjkdbcjb")).toBe(
      "That doesn’t look like a problem description yet."
    );
    expect(inputHint("password: abc123")).toMatch(/password or secret/);
  });
});
