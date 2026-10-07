export type ReplyQualityTrust = "vendor" | "community" | "reference";

export type ReplyQualityFixture = {
  id: string;
  scenario: string;
  message: string;
  toolsRan: string[];
  webSources: Array<{
    sourceId: string;
    title: string;
    url: string;
    trust: ReplyQualityTrust;
  }>;
  v1: string;
  v2: {
    summary: string;
    checked: string[];
    nextStep: { action: string; why?: string } | null;
    sourceIds: string[];
  };
};

export const REPLY_QUALITY_FIXTURES: readonly ReplyQualityFixture[] = [
  {
    id: "locked-out-password",
    scenario: "locked out",
    message: "I'm locked out of my account and I have a meeting in 10 minutes.",
    toolsRan: ["get_recent_sign_in_failures"],
    webSources: [],
    v1: "Based on the authentication telemetry available to me, your account appears to have experienced multiple consecutive sign-in failures, which typically triggers the organization's lockout policy; consequently, you should simply wait for the lockout duration to elapse or contact your administrator for remediation.",
    v2: {
      summary:
        "I know this is stressful before a meeting. Your account is locked after a few wrong passwords.",
      checked: [
        "I checked your recent sign-ins. There were 5 failed tries in the last hour.",
      ],
      nextStep: {
        action: "Wait 15 minutes, then sign in once with care.",
        why: "The lock clears on its own after 15 minutes.",
      },
      sourceIds: [],
    },
  },
  {
    id: "locked-out-mfa",
    scenario: "locked out",
    message:
      "My authenticator app stopped giving codes and now I can't log in.",
    toolsRan: ["search_guides"],
    webSources: [],
    v1: "Multi-factor authentication failures of this nature generally stem from time synchronization drift on the device hosting the authenticator application, so it is advisable to verify that automatic date and time configuration is enabled before attempting re-registration of the authentication method.",
    v2: {
      summary: "Codes often stop working when the phone clock is a little off.",
      checked: ["I looked at our guide for sign-in code problems."],
      nextStep: {
        action: "On your phone, turn on Set time automatically in Settings.",
        why: "The codes depend on the phone having the right time.",
      },
      sourceIds: [],
    },
  },
  {
    id: "wifi-drops",
    scenario: "wifi",
    message: "Wi-Fi keeps dropping every few minutes on my laptop.",
    toolsRan: ["get_device_diagnostics", "search_guides"],
    webSources: [],
    v1: "Diagnostic telemetry indicates intermittent association failures with the wireless access point, and the adapter's power management configuration may be aggressively suspending the interface; therefore, consider modifying the adapter's advanced power settings or forgetting and re-establishing the network profile.",
    v2: {
      summary: "Your laptop keeps losing its link to the Wi-Fi.",
      checked: [
        "I checked your laptop's network. The signal is good, but the link drops often.",
        "I looked at our Wi-Fi guide for this.",
      ],
      nextStep: {
        action: "Forget the Wi-Fi network, then join it again.",
        why: "This clears saved settings that may be out of date.",
      },
      sourceIds: [],
    },
  },
  {
    id: "wifi-one-site",
    scenario: "wifi",
    message: "Internet doesn't work.",
    toolsRan: ["get_device_diagnostics"],
    webSources: [],
    v1: "Could you please elaborate on the specific symptoms you are experiencing, including whether the connectivity degradation affects all destinations or only particular hosts, what error messages are presented, which network you are connected to, and when the issue first manifested?",
    v2: {
      summary: "Your laptop is online, so the problem may be one site or app.",
      checked: [
        "I checked your network. You are connected and the internet answers.",
      ],
      nextStep: {
        action: "Tell me: is it every website, or only one?",
        why: "That tells me where to look next.",
      },
      sourceIds: [],
    },
  },
  {
    id: "dns-explained",
    scenario: "wifi",
    message: "The last person said it was a DNS problem. What is that?",
    toolsRan: ["search_web"],
    webSources: [
      {
        sourceId: "src-dns-ref",
        title: "Domain Name System",
        url: "https://en.wikipedia.org/wiki/Domain_Name_System",
        trust: "reference",
      },
    ],
    v1: "The Domain Name System is a hierarchical and distributed naming infrastructure that translates human-readable domain names into numerical Internet Protocol addresses required for locating and identifying computer services and devices with the underlying network protocols.",
    v2: {
      summary:
        "DNS works like a phone book for the internet. It turns a site name into the number your computer needs to reach it.",
      checked: ["I looked up a reference page that explains DNS."],
      nextStep: null,
      sourceIds: ["src-dns-ref"],
    },
  },
  {
    id: "printer-offline",
    scenario: "printer",
    message: "The office printer says offline.",
    toolsRan: ["get_org_environment", "search_guides"],
    webSources: [],
    v1: "The printer status indicates an offline condition, which can result from spooler service interruptions, stale port configurations, or network discovery failures; it would be prudent to restart the print spooler service and verify the printer's IP configuration.",
    v2: {
      summary: "Your computer can't reach the office printer right now.",
      checked: [
        "I checked your office setup. You use the shared printer on floor 2.",
        "I looked at our printer guide.",
      ],
      nextStep: {
        action: "Turn the printer off, wait 30 seconds, and turn it back on.",
        why: "This lets it rejoin the network.",
      },
      sourceIds: [],
    },
  },
  {
    id: "printer-driver",
    scenario: "printer",
    message: "Printing comes out as garbage characters.",
    toolsRan: ["search_guides", "search_web"],
    webSources: [
      {
        sourceId: "src-hp-docs",
        title: "Printer prints random characters",
        url: "https://support.hp.com/us-en/document/ish_1234",
        trust: "vendor",
      },
    ],
    v1: "Garbled output is symptomatic of a driver mismatch between the installed printer driver and the device's page description language; reinstalling the manufacturer's PCL6 or PostScript driver from the vendor portal should remediate the issue.",
    v2: {
      summary:
        "Strange letters on the page usually mean the wrong printer driver.",
      checked: ["I checked our guides and HP's support page."],
      nextStep: {
        action: "Remove the printer from your computer, then add it again.",
        why: "HP's support page says this installs the right driver.",
      },
      sourceIds: ["src-hp-docs"],
    },
  },
  {
    id: "outlook-not-syncing",
    scenario: "outlook",
    message: "Outlook isn't getting new emails.",
    toolsRan: ["get_service_health", "get_device_diagnostics"],
    webSources: [],
    v1: "Having evaluated the service health dashboard and local diagnostics, there is no active incident affecting Exchange Online, and network connectivity appears nominal; consequently, the synchronization failure is likely attributable to a corrupted OST cache, which can be resolved by rebuilding the profile.",
    v2: {
      summary:
        "Email service is working and your internet is fine, so this is likely Outlook itself.",
      checked: [
        "I checked Microsoft's service status. There are no problems right now.",
        "I checked your network. It looks fine.",
      ],
      nextStep: {
        action: "Close Outlook fully, then open it again.",
        why: "This makes Outlook reconnect to your mailbox.",
      },
      sourceIds: [],
    },
  },
  {
    id: "outlook-community-tip",
    scenario: "outlook",
    message: "Outlook search shows no results since yesterday.",
    toolsRan: ["search_guides", "search_web"],
    webSources: [
      {
        sourceId: "src-ms-search",
        title: "Fix Outlook search issues",
        url: "https://support.microsoft.com/en-us/office/fix-outlook-search-issues-1234",
        trust: "vendor",
      },
      {
        sourceId: "src-reddit-search",
        title: "Outlook search broken after update",
        url: "https://www.reddit.com/r/Outlook/comments/abc123/search_broken/",
        trust: "community",
      },
    ],
    v1: "This is a known issue. Users on reddit.com/r/Outlook report that rebuilding the Windows Search index resolves it, and Microsoft documentation also recommends running the search troubleshooter. You should simply rebuild the index!",
    v2: {
      summary:
        "Outlook search can stop working when its search list needs to rebuild.",
      checked: [
        "I checked our guides, Microsoft's support page, and a community post.",
      ],
      nextStep: {
        action: "In Outlook, open Search Tools and choose Rebuild.",
        why: "Microsoft's support page says this fixes most search problems.",
      },
      sourceIds: ["src-ms-search", "src-reddit-search"],
    },
  },
  {
    id: "vague-ticket",
    scenario: "vague",
    message: "Computer broken.",
    toolsRan: [],
    webSources: [],
    v1: "In order to effectively diagnose your issue, I require additional information. Could you describe the symptoms? What operating system are you using? When did the problem begin? Have you made any recent changes? Are any error messages displayed?",
    v2: {
      summary: "I'm sorry it's not working. Let's find out what's wrong.",
      checked: [],
      nextStep: {
        action:
          "Tell me what happens: it won't turn on, it's slow, or an app won't open?",
        why: "Each one has a different fix.",
      },
      sourceIds: [],
    },
  },
  {
    id: "vague-slow",
    scenario: "vague",
    message: "Everything is slow.",
    toolsRan: ["get_device_diagnostics"],
    webSources: [],
    v1: "Performance degradation can originate from numerous sources including CPU saturation, memory pressure, disk I/O contention, or network latency; diagnostics show elevated memory utilization, so terminating resource-intensive processes is recommended.",
    v2: {
      summary:
        "Your laptop is low on free memory, which slows everything down.",
      checked: ["I checked your laptop. Memory use is at 94 percent."],
      nextStep: {
        action: "Save your work and restart the laptop.",
        why: "A restart frees up memory that apps are holding.",
      },
      sourceIds: [],
    },
  },
  {
    id: "angry-user",
    scenario: "angry",
    message: "This is the third time this week. Nothing you people do works!!",
    toolsRan: ["get_ticket_history"],
    webSources: [],
    v1: "I understand your frustration! Unfortunately, based on your ticket history, the previous remediation attempts were unsuccessful, and you should just try the same steps again or escalate to a technician for further investigation.",
    v2: {
      summary:
        "I'm sorry this keeps happening. You should not have to deal with it three times.",
      checked: [
        "I checked your past tickets. The same VPN problem came back twice.",
      ],
      nextStep: {
        action: "I can pass this to a person now so they can find the cause.",
        why: "A problem that keeps coming back needs a closer look.",
      },
      sourceIds: [],
    },
  },
  {
    id: "angry-locked",
    scenario: "angry",
    message: "I've been locked out all morning and nobody is helping.",
    toolsRan: ["get_recent_sign_in_failures"],
    webSources: [],
    v1: "Your sign-in attempts indicate repeated authentication failures since 08:12, which have triggered the smart lockout threshold; obviously, further attempts will extend the lockout period, so you should cease attempting authentication immediately.",
    v2: {
      summary:
        "I'm sorry you've lost your morning to this. Let's get you back in.",
      checked: [
        "I checked your sign-ins. Each new try restarts the lock timer.",
      ],
      nextStep: {
        action: "Stop trying for 15 minutes, then try once.",
        why: "This lets the lock clear.",
      },
      sourceIds: [],
    },
  },
  {
    id: "vpn-connect",
    scenario: "vpn",
    message: "VPN won't connect from home.",
    toolsRan: ["get_org_environment", "get_device_diagnostics"],
    webSources: [],
    v1: "The organization's VPN client configuration requires outbound UDP connectivity, and diagnostics suggest your residential network may be restricting the requisite ports, necessitating either router reconfiguration or fallback to the TCP-based tunnel profile.",
    v2: {
      summary: "Your home network may be blocking the VPN.",
      checked: [
        "I checked your company setup. You use GlobalProtect.",
        "I checked your network. Home internet works fine.",
      ],
      nextStep: {
        action: "Restart your home router, then try the VPN again.",
        why: "Routers sometimes block VPNs until they restart.",
      },
      sourceIds: [],
    },
  },
  {
    id: "teams-mic",
    scenario: "audio",
    message: "People can't hear me in Teams.",
    toolsRan: ["get_device_diagnostics", "search_guides"],
    webSources: [],
    v1: "Audio input failures in Microsoft Teams are frequently caused by incorrect device selection or operating system privacy permissions denying microphone access to the application; reviewing these configurations is recommended.",
    v2: {
      summary: "Teams may not have permission to use your microphone.",
      checked: [
        "I checked your laptop. Your microphone works.",
        "I looked at our Teams audio guide.",
      ],
      nextStep: {
        action:
          "In Teams, open Settings, then Devices, and pick your microphone.",
        why: "Teams sometimes picks the wrong one.",
      },
      sourceIds: [],
    },
  },
  {
    id: "disk-full",
    scenario: "storage",
    message: "It says my disk is full.",
    toolsRan: ["get_device_diagnostics"],
    webSources: [],
    v1: "Storage utilization on the system volume is at 98% capacity, which can severely impact system stability; utilize Storage Sense or Disk Cleanup to purge temporary files and consider relocating large user files to OneDrive.",
    v2: {
      summary: "Your laptop is almost out of space.",
      checked: ["I checked your laptop. Only 2 GB of space is left."],
      nextStep: {
        action: "Empty the Recycle Bin and your Downloads folder.",
        why: "These often hold large files you no longer need.",
      },
      sourceIds: [],
    },
  },
  {
    id: "known-outage",
    scenario: "outage",
    message: "Teams won't load at all.",
    toolsRan: ["get_service_health"],
    webSources: [],
    v1: "There is currently an active service incident (TM123456) affecting Microsoft Teams, as reported by the Microsoft 365 service health dashboard; no remediation is required on your end, and service restoration is anticipated.",
    v2: {
      summary:
        "Teams is down for many people right now. This is not your computer.",
      checked: [
        "I checked Microsoft's service status. There is a known Teams outage.",
      ],
      nextStep: {
        action: "Use Outlook or phone for now. I can tell you when it's fixed.",
        why: "Microsoft is working on it.",
      },
      sourceIds: [],
    },
  },
  {
    id: "community-only-wifi",
    scenario: "wifi",
    message: "Wi-Fi drops only during video calls.",
    toolsRan: ["search_guides", "search_web"],
    webSources: [
      {
        sourceId: "src-reddit-wifi",
        title: "Wi-Fi drops during video calls",
        url: "https://www.reddit.com/r/techsupport/comments/abc124/wifi_video/",
        trust: "community",
      },
    ],
    v1: "According to reddit.com, this is caused by the latest driver update, so you should roll back the network adapter driver using Device Manager.",
    v2: {
      summary:
        "Other users on Reddit report this after a recent driver update. That is a community post, not an official fix.",
      checked: ["I checked our guides and found a community post."],
      nextStep: {
        action: "Move closer to the Wi-Fi router for your next call.",
        why: "A stronger signal helps while we look into it.",
      },
      sourceIds: ["src-reddit-wifi"],
    },
  },
  {
    id: "simple-question",
    scenario: "simple",
    message: "How do I take a screenshot on a Mac?",
    toolsRan: ["search_guides"],
    webSources: [],
    v1: "On macOS, you can capture a screenshot by pressing Shift-Command-3 for the entire screen, Shift-Command-4 to select a region, or Shift-Command-5 to access the Screenshot utility with additional capture and recording options.",
    v2: {
      summary:
        "Press Shift, Command, and 4 together, then drag over the part you want.",
      checked: ["I looked at our Mac guide."],
      nextStep: null,
      sourceIds: [],
    },
  },
  {
    id: "handoff-explained",
    scenario: "escalation",
    message: "Can I talk to a real person?",
    toolsRan: ["search_guides"],
    webSources: [],
    v1: "Certainly! I am escalating your request to the appropriate support tier, and a technician will be assigned to your ticket in accordance with the service-level agreement applicable to your priority classification.",
    v2: {
      summary: "Yes. I'm passing this to a support person now.",
      checked: ["I looked at our guides first, so they know what was tried."],
      nextStep: {
        action: "Watch for an email from the support team within 4 work hours.",
        why: "They will have all the details, so you won't need to repeat yourself.",
      },
      sourceIds: [],
    },
  },
];
