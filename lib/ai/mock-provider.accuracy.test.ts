import { describe, expect, test } from "vitest";
import { createAiProvider } from "./mock-provider";
import type { Platform } from "@/lib/helpdesk-data";

const provider = createAiProvider();

// Realistic end-user phrasings and the approved guide each one must route to.
// The assistant may answer "match" (correct slug) or "clarify"; it must never
// match a different guide and must never escalate for these.
const mustRoute: [string, string, Platform][] = [
  ["my wifi keeps disconnecting", "wifi-disconnecting", "Windows"],
  ["wi-fi drops every few minutes", "wifi-disconnecting", "Windows"],
  ["I can't connect to the internet", "no-internet", "Windows"],
  ["internet is not working", "no-internet", "Windows"],
  ["no internet on my laptop", "no-internet", "Windows"],
  ["internet is really slow today", "slow-internet", "Mac"],
  ["my laptop is really slow", "slow-computer", "Windows"],
  ["computer is running very slowly lately", "slow-computer", "Windows"],
  ["my pc keeps freezing", "computer-freezing", "Windows"],
  ["computer won't turn on", "computer-wont-start", "Windows"],
  ["I got a blue screen and it restarted", "blue-screen", "Windows"],
  ["disk is almost full", "low-storage", "Windows"],
  [
    "ethernet cable plugged in but no connection",
    "ethernet-not-working",
    "Windows",
  ],
  ["vpn won't connect", "vpn-problem", "Windows"],
  ["the vpn keeps dropping", "vpn-problem", "Mac"],
  ["my printer says offline", "printer-offline", "Windows"],
  ["print job is stuck in the queue", "print-job-stuck", "Windows"],
  ["paper is jammed in the printer", "paper-jam", "Other"],
  ["prints come out streaky and faded", "poor-print-quality", "Windows"],
  ["it prints to the wrong printer", "wrong-default-printer", "Windows"],
  ["outlook is not syncing", "email-not-syncing", "Windows"],
  ["can't send emails", "cannot-send-email", "Windows"],
  ["emails are stuck in outbox", "cannot-send-email", "Windows"],
  ["I'm not receiving any emails", "not-receiving-email", "Mac"],
  ["can't open the attachment in my email", "attachment-problem", "Windows"],
  ["outlook keeps asking for my password", "email-sign-in", "Windows"],
  ["forgot my email password", "email-sign-in", "Windows"],
  ["the app won't open", "app-wont-open", "Windows"],
  ["can't install the software", "install-problem", "Windows"],
  ["excel is frozen and not responding", "app-frozen", "Windows"],
  ["windows update keeps failing", "update-failure", "Windows"],
  ["pdfs open in the wrong program", "wrong-default-app", "Windows"],
  ["no sound coming from my speakers", "no-sound", "Windows"],
  ["my camera is not working", "camera-mic-not-working", "Windows"],
  ["nobody can hear me, microphone not working", "mic-not-working", "Windows"],
  ["bluetooth headset won't connect", "bluetooth-headset", "Windows"],
  ["I forgot my password", "forgot-password", "Windows"],
  ["my account is locked", "account-locked", "Windows"],
  ["not getting the 2fa code", "2fa-not-working", "iOS"],
  ["it says my password expired", "password-expired", "Windows"],
  [
    "got an alert about a suspicious sign in",
    "suspicious-signin-alert",
    "Windows",
  ],
  ["can't reset my password", "cannot-reset-password", "Windows"],
  ["single sign on login fails", "sso-login-failure", "Windows"],
  ["it keeps logging me out", "session-keeps-logging-out", "Windows"],
  ["can't access the shared drive", "shared-drive-access", "Windows"],
  ["onedrive sync error", "file-sync-error", "Windows"],
  ["file won't upload", "file-wont-upload", "Windows"],
  [
    "permission denied when opening a shared file",
    "permission-denied-file",
    "Windows",
  ],
  ["I accidentally deleted a file", "lost-deleted-file", "Windows"],
  [
    "can't share a file with someone outside the company",
    "cannot-share-file",
    "Windows",
  ],
  ["cloud storage quota exceeded", "storage-quota-exceeded", "Windows"],
  [
    "duplicate files appearing after sync",
    "duplicate-files-syncing",
    "Windows",
  ],
  ["can't join the zoom meeting", "cant-join-meeting", "Windows"],
  ["no video in teams meeting", "no-video-in-meeting", "Windows"],
  ["there is an echo in my calls", "echo-audio-feedback", "Windows"],
  [
    "screen share not showing in the meeting",
    "meeting-screen-share-issue",
    "Windows",
  ],
  ["meeting recording didn't save", "meeting-recording-issue", "Windows"],
  ["can't hear anyone in the meeting", "meeting-audio-not-working", "Windows"],
  [
    "virtual background not working",
    "virtual-background-not-working",
    "Windows",
  ],
  ["never got the meeting invite", "meeting-invite-not-received", "Windows"],
  ["breakout rooms not working", "breakout-rooms-not-working", "Windows"],
  ["teams keeps crashing", "meeting-app-crashing", "Windows"],
  [
    "work email not syncing on my phone",
    "work-email-not-syncing-mobile",
    "iOS",
  ],
  ["the app keeps crashing on my phone", "mobile-app-crashing", "Android"],
  [
    "push notifications not working",
    "push-notifications-not-working",
    "Android",
  ],
  ["mobile hotspot not working", "mobile-hotspot-not-working", "Android"],
  ["app won't update on my phone", "mobile-app-wont-update", "iOS"],
  ["phone battery draining quickly", "mobile-battery-draining-fast", "Android"],
  ["phone storage is full", "mobile-storage-full", "iOS"],
  ["find my device not working", "find-my-device-not-working", "iOS"],
  ["external monitor not detected", "external-monitor-not-detected", "Windows"],
  ["second screen not detected", "external-monitor-not-detected", "Windows"],
  ["usb drive not showing up", "usb-device-not-recognized", "Windows"],
  ["keyboard not working", "keyboard-mouse-not-working", "Windows"],
  ["mouse stopped working", "keyboard-mouse-not-working", "Windows"],
  [
    "docking station not charging my laptop",
    "docking-station-not-charging",
    "Windows",
  ],
  ["laptop battery drains fast", "laptop-battery-draining-fast", "Windows"],
  ["external webcam not detected", "external-webcam-not-detected", "Windows"],
  ["touchpad not working", "touchpad-not-working", "Windows"],
  [
    "external hard drive not recognized",
    "external-drive-not-recognized",
    "Mac",
  ],
  [
    "everything on my monitor looks tiny",
    "monitor-resolution-wrong",
    "Windows",
  ],
  ["laptop is overheating", "laptop-overheating", "Windows"],
  [
    "slack notifications not working",
    "chat-notifications-not-working",
    "Windows",
  ],
  ["calendar invites not syncing", "calendar-invites-not-syncing", "Windows"],
  ["shared calendar not updating", "shared-calendar-not-updating", "Windows"],
  ["can't create a meeting invite", "cannot-create-meeting-invite", "Windows"],
  ["teams keeps signing me out", "app-keeps-signing-out", "Windows"],
  [
    "can't tag or mention a colleague in chat",
    "cannot-tag-mention-colleague",
    "Windows",
  ],
  [
    "my status shows as away when I'm active",
    "workspace-status-stuck",
    "Windows",
  ],
  ["file preview not loading in chat", "file-preview-not-loading", "Windows"],
  ["team channel is missing", "group-channel-missing", "Windows"],
  ["antivirus alert popped up", "antivirus-alert", "Windows"],
  ["suspicious pop-ups keep appearing", "suspicious-popups", "Windows"],
  ["ransomware warning on my screen", "ransomware-warning", "Windows"],
  ["firewall is blocking an application", "firewall-blocking-app", "Windows"],
  [
    "unknown device signed in to my account",
    "unknown-device-on-account",
    "Windows",
  ],
  ["I think I received a phishing email", "phishing-email-received", "Windows"],
  ["browser homepage got hijacked", "browser-hijacked", "Windows"],
  ["is my device encrypted", "encryption-status-unknown", "Windows"],
  ["my laptop was stolen", "lost-stolen-device", "Windows"],
  [
    "usb drive blocked by security policy",
    "usb-drive-security-warning",
    "Windows",
  ],
];

// Ambiguous or unsupported inputs must NOT produce a confident wrong match.
const mustNotMatch: [string, Platform][] = [
  ["my office chair is broken", "Windows"],
  ["something is wrong", "Windows"],
  ["help", "Windows"],
  ["the coffee machine is out of order", "Windows"],
  ["not working", "Windows"],
];

describe("MockAiProvider accuracy", () => {
  test.each(mustRoute)(
    "routes %j to %s",
    async (message, expectedSlug, platform) => {
      const result = await provider.classify({ message, platform });
      expect(result.decision).not.toBe("escalate");
      if (result.decision === "match") {
        expect(result.matchedIssueSlug).toBe(expectedSlug);
      }
    }
  );

  test("matches confidently for at least 90% of realistic phrasings", async () => {
    let matched = 0;
    for (const [message, expectedSlug, platform] of mustRoute) {
      const result = await provider.classify({ message, platform });
      if (
        result.decision === "match" &&
        result.matchedIssueSlug === expectedSlug
      ) {
        matched += 1;
      }
    }
    expect(matched / mustRoute.length).toBeGreaterThanOrEqual(0.9);
  });

  test.each(mustNotMatch)(
    "does not confidently match %j",
    async (message, platform) => {
      const result = await provider.classify({ message, platform });
      expect(result.decision).not.toBe("match");
    }
  );
});
