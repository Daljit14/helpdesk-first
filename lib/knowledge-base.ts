import { categories, type Platform } from "./helpdesk-data";

export type Difficulty = "Easy" | "Medium" | "Hard";
export type RiskLevel = "Low" | "Medium" | "High";

export type Category = (typeof categories)[number];

export type Issue = {
  slug: string;
  title: string;
  categoryId: Category["id"];
  platforms: Platform[];
  symptoms: string[];
  keywords: string[];
  difficulty: Difficulty;
  estimatedTimeMinutes: number;
  riskLevel: RiskLevel;
  safetyWarning?: string;
  escalationWarning?: string;
  steps: string[];
};

export const issues: Issue[] = [
  {
    slug: "slow-computer",
    title: "Slow computer",
    categoryId: "computer",
    platforms: ["Windows", "Mac", "Other"],
    symptoms: [
      "Programs take a long time to open",
      "Mouse or keyboard input feels delayed",
      "Fan is loud and the device is warm",
    ],
    keywords: ["slow", "lag", "freezing", "performance", "speed", "stutter"],
    difficulty: "Medium",
    estimatedTimeMinutes: 20,
    riskLevel: "Low",
    steps: [
      "Save your work and close programs you are not using.",
      "Restart the computer to clear temporary files and refresh memory.",
      "Check available storage space and free up at least 10–15% of the drive.",
      "Review startup programs and disable items you do not need on boot.",
      "Run a trusted antivirus or system scan if the slowness is sudden.",
    ],
  },
  {
    slug: "computer-will-not-start",
    title: "Computer will not start",
    categoryId: "computer",
    platforms: ["Windows", "Mac", "Other"],
    symptoms: [
      "Pressing the power button does nothing",
      "Screen remains black",
      "Lights or fans do not turn on",
    ],
    keywords: [
      "won't start",
      "will not start",
      "boot",
      "power",
      "black screen",
      "dead",
      "no power",
    ],
    difficulty: "Hard",
    estimatedTimeMinutes: 30,
    riskLevel: "Medium",
    safetyWarning:
      "Do not open the computer case unless you are authorized to perform hardware work.",
    escalationWarning:
      "Escalate to your IT team if you suspect a hardware fault or power supply failure.",
    steps: [
      "Make sure the power cable is firmly connected to the computer and outlet.",
      "Try a different wall outlet or power strip.",
      "Press and hold the power button for 10–15 seconds, then press it again.",
      "Disconnect all non-essential devices such as USB drives, docks, and external monitors.",
      "If the device still does not start, contact your IT support team.",
    ],
  },
  {
    slug: "no-internet-connection",
    title: "No internet connection",
    categoryId: "internet",
    platforms: ["Windows", "Mac", "Mobile", "Other"],
    symptoms: [
      "Web pages will not load",
      "Apps show a connection error",
      "Network icon shows no connection",
    ],
    keywords: [
      "no internet",
      "offline",
      "connection",
      "network",
      "cannot browse",
      "no web",
    ],
    difficulty: "Medium",
    estimatedTimeMinutes: 20,
    riskLevel: "Low",
    safetyWarning:
      "Only restart a router, modem or access point if you own it or your organization has authorized you to do so. On a workplace, school or shared network, contact IT before restarting any network equipment.",
    escalationWarning:
      "If other devices are also offline, the problem may be with the ISP or building network; contact IT.",
    steps: [
      "Check whether Wi-Fi is turned on or the Ethernet cable is securely connected.",
      "Try loading a website on another device to see if the problem is widespread.",
      "If you own the equipment or have authorization, restart the router or modem by unplugging it for 10 seconds, then plug it back in. On workplace, school or shared networks, contact IT instead of restarting it yourself.",
      "Reconnect to the network and test again.",
      "If wired and you are authorized, try a different Ethernet cable or wall jack. Escalate managed wiring to IT.",
    ],
  },
  {
    slug: "wi-fi-keeps-disconnecting",
    title: "Wi-Fi keeps disconnecting",
    categoryId: "internet",
    platforms: ["Windows", "Mac", "Mobile", "Other"],
    symptoms: [
      "Wi-Fi drops every few minutes",
      "Network connection is unstable",
      "Video calls freeze or buffer",
    ],
    keywords: [
      "wifi disconnect",
      "wi-fi dropping",
      "unstable wifi",
      "losing connection",
      "wireless",
    ],
    difficulty: "Medium",
    estimatedTimeMinutes: 20,
    riskLevel: "Low",
    safetyWarning:
      "Only restart a router or access point if you own it or are authorized by your organization. On workplace, school or shared networks, ask IT before restarting network equipment.",
    steps: [
      "Move closer to the wireless access point.",
      "If you own or are authorized to restart the access point, restart it. On a shared or managed network, contact IT instead.",
      "Forget the network on your device and reconnect with the correct password.",
      "Remove sources of interference such as microwaves, baby monitors, or large metal objects.",
      "Check for software or driver updates for your wireless adapter.",
    ],
  },
  {
    slug: "printer-showing-offline",
    title: "Printer showing offline",
    categoryId: "printer",
    platforms: ["Windows", "Mac", "Other"],
    symptoms: [
      "Printer status says Offline",
      "Print jobs are not reaching the printer",
      "Printer icon has a warning symbol",
    ],
    keywords: [
      "printer offline",
      "printer not connected",
      "cannot print",
      "printer status",
    ],
    difficulty: "Easy",
    estimatedTimeMinutes: 10,
    riskLevel: "Low",
    steps: [
      "Make sure the printer is powered on and has no error lights.",
      "Check that the printer is connected to the same network as your computer, or that the USB cable is secure.",
      "Restart the printer and wait for it to fully start up.",
      "In your computer's printer settings, set the printer to Online if it shows Offline.",
      "Try printing a test page.",
    ],
  },
  {
    slug: "print-job-stuck",
    title: "Print job stuck",
    categoryId: "printer",
    platforms: ["Windows", "Mac", "Other"],
    symptoms: [
      "A document shows as printing but nothing happens",
      "Print queue has multiple pending jobs",
      "Printer is not responding to new jobs",
    ],
    keywords: [
      "print job stuck",
      "printer queue",
      "printing queue",
      "document not printing",
      "print spooler",
    ],
    difficulty: "Easy",
    estimatedTimeMinutes: 10,
    riskLevel: "Low",
    steps: [
      "Open the print queue on your computer.",
      "Cancel or delete the stuck print job.",
      "Restart the printer.",
      "Restart your computer to clear the print queue.",
      "Resend the document you want to print.",
    ],
  },
  {
    slug: "email-not-syncing",
    title: "Email not syncing",
    categoryId: "email",
    platforms: ["Windows", "Mac", "Mobile", "Other"],
    symptoms: [
      "New emails do not appear",
      "Sent folder is not up to date",
      "Calendar or contacts are missing changes",
    ],
    keywords: [
      "email not syncing",
      "emails not updating",
      "inbox not loading",
      "sync problem",
      "missing emails",
    ],
    difficulty: "Easy",
    estimatedTimeMinutes: 10,
    riskLevel: "Low",
    safetyWarning:
      "Do not remove or re-add an email account without guidance from your IT team. Re-adding an account can delete local emails, calendar events or contacts that have not synced yet.",
    escalationWarning:
      "If your email is managed by your organization, or if you are unsure whether the account is managed, contact IT instead of changing settings.",
    steps: [
      "Check that you have an active internet connection.",
      "Refresh the inbox by pulling down or clicking the refresh button.",
      "Close the email app completely, then reopen it.",
      "Check that your account server settings, such as incoming and outgoing mail addresses, are correct. Do not enter your password into this tool.",
      "If the problem continues on a managed or uncertain account, contact your IT team before removing or re-adding the account.",
    ],
  },
  {
    slug: "cannot-send-email",
    title: "Cannot send email",
    categoryId: "email",
    platforms: ["Windows", "Mac", "Mobile", "Other"],
    symptoms: [
      "Emails stay in the Outbox",
      "Send button returns an error",
      "Recipients report they did not receive the message",
    ],
    keywords: [
      "cannot send email",
      "email not sending",
      "outbox error",
      "send failed",
      "bounce",
    ],
    difficulty: "Medium",
    estimatedTimeMinutes: 15,
    riskLevel: "Low",
    steps: [
      "Check your Outbox for any stuck messages and clear them if needed.",
      "Verify the recipient's email address is typed correctly.",
      "Confirm the attachment size is within your organization's limits.",
      "Check whether your mailbox is full or your account is blocked.",
      "Try sending a simple message without attachments.",
    ],
  },
  {
    slug: "application-will-not-open",
    title: "Application will not open",
    categoryId: "software",
    platforms: ["Windows", "Mac", "Other"],
    symptoms: [
      "Double-clicking the app does nothing",
      "App opens and immediately closes",
      "An error appears at launch",
    ],
    keywords: [
      "app won't open",
      "application crash",
      "program not starting",
      "launch error",
      "software error",
    ],
    difficulty: "Easy",
    estimatedTimeMinutes: 10,
    riskLevel: "Low",
    steps: [
      "Restart the application.",
      "Restart your computer and try again.",
      "Check for pending updates for the application.",
      "If the issue persists, reinstall the application from an approved source.",
      "Contact IT if the app is required for work and still will not open.",
    ],
  },
  {
    slug: "software-installation-problem",
    title: "Software installation problem",
    categoryId: "software",
    platforms: ["Windows", "Mac", "Other"],
    symptoms: [
      "Installer fails before completing",
      "Error message appears during setup",
      "Installed app is missing features",
    ],
    keywords: [
      "install failed",
      "software installation",
      "setup error",
      "installer",
      "cannot install",
    ],
    difficulty: "Medium",
    estimatedTimeMinutes: 20,
    riskLevel: "Medium",
    safetyWarning:
      "Only install software approved by your organization. Do not disable antivirus or security tools unless instructed by IT.",
    escalationWarning:
      "If the installer requires registry or system-level changes, escalate to IT instead of proceeding.",
    steps: [
      "Make sure your computer meets the minimum system requirements.",
      "Check that you have enough free disk space for the installation.",
      "Download the installer again in case the file is corrupted.",
      "Run the installer from an administrator account if prompted.",
      "If the installation still fails, contact IT with the exact error message.",
    ],
  },
  {
    slug: "no-sound",
    title: "No sound",
    categoryId: "audio-camera",
    platforms: ["Windows", "Mac", "Other"],
    symptoms: [
      "No audio from speakers or headphones",
      "Volume icon shows a red cross or mute symbol",
      "Apps do not play sound",
    ],
    keywords: [
      "no sound",
      "no audio",
      "speaker not working",
      "volume muted",
      "headphones no sound",
    ],
    difficulty: "Easy",
    estimatedTimeMinutes: 15,
    riskLevel: "Low",
    steps: [
      "Check that the volume is turned up and not muted.",
      "Make sure the correct playback device is selected.",
      "Test with a different set of headphones or speakers.",
      "Check for operating system audio driver updates.",
      "Restart the computer if the problem started recently.",
    ],
  },
  {
    slug: "camera-or-microphone-not-working",
    title: "Camera or microphone not working",
    categoryId: "audio-camera",
    platforms: ["Windows", "Mac", "Mobile", "Other"],
    symptoms: [
      "Video call camera is black",
      "Microphone does not pick up sound",
      "Apps cannot access the camera or mic",
    ],
    keywords: [
      "camera not working",
      "microphone not working",
      "cam not detected",
      "mic not working",
      "video call",
    ],
    difficulty: "Medium",
    estimatedTimeMinutes: 15,
    riskLevel: "Low",
    steps: [
      "Check that no physical camera cover or mute switch is enabled.",
      "Allow the app to access the camera and microphone in your system privacy settings.",
      "Select the correct camera and microphone in the app's settings.",
      "Close other apps that may be using the camera.",
      "Restart the app and, if needed, your computer.",
    ],
  },
];
