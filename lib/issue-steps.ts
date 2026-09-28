export type IssueStepMeta = {
  steps: string[];
  safetyWarning?: string;
  reviewedAt: string;
  sources?: { title: string; url: string }[];
};

export const ISSUE_STEPS: Record<string, IssueStepMeta> = {
  "lost-stolen-device": {
    reviewedAt: "2026-09-24",
    steps: [
      "Report the loss to your IT or security team right away from another device or phone. Include when and where the device was last seen.",
      "From another trusted device, change your work account password and sign out of all sessions where your account settings allow it.",
      "If your organization gives you a device-location or remote-lock tool (Find My, Find My Device, or your MDM portal), lock the device — do not erase it unless IT tells you to.",
      "If the device may hold personal payment or identity details, watch those accounts for unexpected activity and report anything suspicious to IT.",
    ],
    safetyWarning:
      "Do not try to recover a stolen device in person. Remote wipe is destructive and cannot be undone — leave it to IT.",
    sources: [
      {
        title: "If your iPhone is lost or stolen",
        url: "https://support.apple.com/en-us/HT201472",
      },
      {
        title: "Find, secure, or erase a lost Android device",
        url: "https://support.google.com/android/answer/6160491",
      },
      {
        title: "Remote actions in Intune",
        url: "https://learn.microsoft.com/mem/intune/remote-actions/device-management",
      },
    ],
  },
  "account-wrong-details": {
    reviewedAt: "2026-09-24",
    steps: [
      "Sign out and back in, then check whether the details update — profile changes can take time to sync.",
      "Look for a profile or account settings page in the app where you can correct the field yourself (display name, phone, photo).",
      "If the field is locked or greyed out, it is managed by your organization's directory. Note exactly what is wrong and what it should say.",
      "Ask IT or HR to correct the directory record; most apps refresh the details within a few hours.",
    ],
  },
  "cannot-reset-password": {
    reviewedAt: "2026-09-24",
    steps: [
      "Confirm you are using the correct username or email for the account, and check your spam or junk folder for the reset message.",
      "Wait a few minutes and request the reset once more — many systems send only one link every 10–15 minutes and older links expire.",
      "Make sure the new password meets the stated rules (length, mix of characters, not recently used).",
      "If the reset page says the account is locked or the recovery method is unavailable, stop and contact IT — only they can fix recovery options.",
    ],
  },
  "lost-deleted-file": {
    reviewedAt: "2026-09-24",
    steps: [
      "Check the Recycle Bin or Trash on your computer, and the Deleted files view in your cloud storage app (OneDrive, Google Drive, SharePoint).",
      "Search by file name or a phrase from the content — the file may have been moved rather than deleted.",
      "If the file lived in a shared folder, ask a colleague to check their view of the folder or its version history.",
      "Stop saving new files to that location and contact IT with the file name, location, and approximate deletion time — restore windows are limited.",
    ],
  },
  "meeting-invite-not-received": {
    reviewedAt: "2026-09-24",
    steps: [
      "Search your inbox, spam or junk folder, and calendar for the meeting title or the organizer's name.",
      "Ask the organizer to confirm which address the invite went to and to re-send or forward it.",
      "Check that your calendar app is syncing and that no mail rule or filter moves invites automatically.",
      "If invites from one organization are consistently missing, report it to IT with an example — it may be blocked by mail filtering.",
    ],
  },
  "touchpad-not-working": {
    reviewedAt: "2026-09-24",
    steps: [
      "Look for a touchpad toggle key (an F-key with a touchpad icon) or a corner double-tap that disables the pad, and press it once.",
      "Open the touchpad settings and confirm the touchpad is enabled and not set to turn off when a mouse is connected.",
      "Restart the laptop with no external mouse or dock attached.",
      "If it still does not respond, contact IT — the driver may need reinstalling or the touchpad may be a hardware fault.",
    ],
  },
  "mobile-storage-full": {
    reviewedAt: "2026-09-24",
    steps: [
      "Open the storage settings on your phone to see what is using space (photos, video, messages, app caches).",
      "Delete downloads and app caches you no longer need, and remove apps you do not use — you can reinstall them from the app store.",
      "Confirm photos and videos are backed up to your organization-approved cloud storage before removing them from the device.",
      "If a work app is using most of the space, contact IT before clearing its data — it may hold unsynced work.",
    ],
  },
  "firewall-blocking-app": {
    reviewedAt: "2026-09-24",
    steps: [
      "Note the exact app name and the message shown when it is blocked.",
      "Try the app on another network (for example a phone hotspot) to tell a firewall block from an app fault.",
      "Do not disable the firewall or antivirus yourself — it is a managed security control.",
      "Ask IT to review the block; include the app, the message, and when it started.",
    ],
  },
  "encryption-status-unknown": {
    reviewedAt: "2026-09-24",
    steps: [
      "Open the device security settings and find the disk encryption status (BitLocker on Windows, FileVault on Mac).",
      "Do not turn encryption on or off yourself on a managed device.",
      "Note what the status screen shows, or take a screenshot.",
      "Send the status to IT so they can confirm the device is protected and that the recovery key is stored.",
    ],
  },
};
