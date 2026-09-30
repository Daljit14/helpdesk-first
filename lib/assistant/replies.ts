import type { InputKind, SensitiveType } from "./input-quality";

/** Clickable example problems offered when we need a real description. */
export const EXAMPLE_PROBLEMS = [
  "Wi-Fi keeps dropping",
  "Printer is offline",
  "Forgot my password",
  "Laptop is slow",
  "Camera not working",
  "Outlook won't open",
] as const;

/** Local (no server round-trip) notice kinds the assistant can show. */
export type NoticeKind = Exclude<InputKind, "ok" | "empty"> | "no_match";

export type NoticeTone = "friendly" | "warning" | "danger" | "info";

export function noticeTone(kind: NoticeKind): NoticeTone {
  switch (kind) {
    case "greeting":
    case "small_talk":
      return "friendly";
    case "sensitive":
      return "danger";
    case "no_match":
      return "info";
    default:
      return "warning";
  }
}

const SENSITIVE_LABEL: Record<SensitiveType, string> = {
  password: "a password",
  card: "a card number",
  ssn: "a Social Security number",
  api_key: "an access key or token",
  private_key: "a private key",
};

/** Friendly assistant copy for each local notice. */
export function noticeText(
  kind: NoticeKind,
  sensitiveType?: SensitiveType
): string {
  switch (kind) {
    case "greeting":
      return "Hi there! I’m the HelpDesk First assistant. Tell me what’s going wrong with your device, account or apps and I’ll find an approved guide. You can also pick a common problem:";
    case "small_talk":
      return "Happy to help! I’m here for IT problems — describe what isn’t working, or pick a common one:";
    case "gibberish":
      return "Hmm, I couldn’t understand that. Try describing what’s wrong, for example “my Wi-Fi keeps dropping” or “printer is offline”.";
    case "too_short":
      return "Could you tell me a bit more? Say what isn’t working and on which device — for example “Outlook won’t open on my laptop”.";
    case "off_topic":
      return "I can only help with IT problems — things like Wi-Fi, email, printers, passwords and devices. What’s going wrong with your tech?";
    case "sensitive":
      return `That looks like ${sensitiveType ? SENSITIVE_LABEL[sensitiveType] : "a secret"}. Please never share passwords, card numbers or keys here — I cleared it and didn’t send it anywhere. Describe the problem without the secret, for example “my password isn’t accepted”.`;
    case "no_match":
      return "I couldn’t find an approved guide for this yet.";
  }
}

export function noticeTitle(kind: NoticeKind): string {
  switch (kind) {
    case "gibberish":
      return "I didn’t catch that";
    case "too_short":
      return "A little more detail, please";
    case "off_topic":
      return "That’s outside what I can help with";
    case "sensitive":
      return "Don’t share secrets";
    case "no_match":
      return "I couldn’t find an approved guide for this yet";
    default:
      return "Assistant";
  }
}
