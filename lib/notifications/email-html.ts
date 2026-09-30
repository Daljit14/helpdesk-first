import type { NotificationAudience } from "./templates";

/**
 * Branded, email-client-safe HTML (tables + inline styles, 600px max) and a
 * matching plain-text alternative for notification emails.
 *
 * All user-provided text is HTML-escaped; URLs are only used when they are
 * absolute http(s) URLs.
 */

export type EmailTicketSummary = {
  id: string;
  title?: string | null;
  status?: string | null;
};

export type NotificationEmailInput = {
  eventType?: string | null;
  audience: NotificationAudience;
  subject: string;
  /** Plain message body as stored in the outbox (paragraphs split by blank lines, `> ` quotes). */
  body: string;
  url?: string | null;
  siteUrl: string;
  recipientFirstName?: string | null;
  ticket?: EmailTicketSummary | null;
};

export type NotificationEmail = { html: string; text: string };

const BRAND = {
  name: "HelpDesk First",
  primary: "#6d4ae0",
  primaryDark: "#4b2fb8",
  gradient: "linear-gradient(120deg,#4b2fb8,#7c5cff 45%,#d946ef)",
  page: "#f3f0fb",
  card: "#ffffff",
  ink: "#1f1640",
  muted: "#5f5a78",
  border: "#e4ddf7",
  soft: "#f7f4ff",
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape text and keep line breaks. */
function escapeMultiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function shortTicketRef(id: string): string {
  return `#${id
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase()}`;
}

type Pill = { bg: string; fg: string };

export function statusPillColors(status: string): Pill {
  const value = status.toLowerCase();
  if (/(resolved|closed|done|fixed)/.test(value))
    return { bg: "#dcfce7", fg: "#166534" };
  if (/(needs human|reopen|overdue|risk|escalat)/.test(value))
    return { bg: "#fef3c7", fg: "#92400e" };
  if (/waiting/.test(value)) return { bg: "#ede9fe", fg: "#5b21b6" };
  if (/(progress|review|new|assigned|open)/.test(value))
    return { bg: "#dbeafe", fg: "#1e40af" };
  return { bg: "#eef0f4", fg: "#374151" };
}

type EventCopy = {
  emoji: string;
  headline: string;
  cta: string;
  tips: string[];
};

const REOPEN_WINDOW_DAYS = 14;

function eventCopy(
  eventType: string | null | undefined,
  audience: NotificationAudience
): EventCopy {
  const staff = audience === "staff";
  const cta = staff ? "Open in admin" : "View your ticket";
  switch (eventType) {
    case "account.created":
      return {
        emoji: "👋",
        headline: "Welcome to HelpDesk First",
        cta: "Go to my tickets",
        tips: [
          "Browse step-by-step guides for the most common IT issues.",
          "Can't fix it yourself? Submit a ticket and we'll email you at every step.",
        ],
      };
    case "ticket.created":
      return staff
        ? {
            emoji: "🎫",
            headline: "A new ticket came in",
            cta,
            tips: ["Claim the ticket so the requester knows who's on it."],
          }
        : {
            emoji: "🎫",
            headline: "We got your ticket",
            cta,
            tips: [
              "Our assistant reviews it first and may suggest a quick fix.",
              "If it needs a person, a support specialist takes over. You'll get an email either way.",
            ],
          };
    case "ticket.handoff":
      return staff
        ? {
            emoji: "🙋",
            headline: "A ticket needs a human",
            cta,
            tips: [
              "Claim it to stop the first-response clock from running out.",
              "Check the escalation notes before replying so the requester doesn't repeat themselves.",
            ],
          }
        : {
            emoji: "🙋",
            headline: "A person is picking this up",
            cta,
            tips: [
              "You don't need to do anything right now. We'll email you when someone replies.",
              "Add details or screenshots on the ticket page if anything changes.",
            ],
          };
    case "ticket.assigned":
      return staff
        ? {
            emoji: "👤",
            headline: "Ticket assigned",
            cta,
            tips: ["Send the requester a first reply to set expectations."],
          }
        : {
            emoji: "👤",
            headline: "Your ticket has an owner",
            cta,
            tips: [
              "Your support specialist may ask a few questions. Replies arrive by email.",
            ],
          };
    case "reply.public":
      return staff
        ? {
            emoji: "💬",
            headline: "New reply on a ticket",
            cta,
            tips: [
              "Reply from the admin ticket page so the whole conversation stays in one place.",
            ],
          }
        : {
            emoji: "💬",
            headline: "You have a new reply",
            cta,
            tips: [
              "Reply on the ticket page to keep the conversation in one place.",
              "Screenshots or error messages help us fix things faster.",
            ],
          };
    case "info.requested":
      return {
        emoji: "❓",
        headline: "We need a bit more information",
        cta: staff ? cta : "Answer on your ticket",
        tips: [
          "Answer on the ticket page. Your ticket stays paused until you reply.",
          "Include exact error messages and what you tried, if you can.",
        ],
      };
    case "verification.requested":
      return {
        emoji: "🧪",
        headline: "Can you confirm the fix?",
        cta: staff ? cta : "Confirm the fix",
        tips: [
          "Confirm it works, or tell us it doesn't. Either takes one click on the ticket page.",
          "If it's still broken, say what you see and we'll keep going.",
        ],
      };
    case "ticket.resolved":
      return staff
        ? {
            emoji: "✅",
            headline: "Ticket resolved",
            cta,
            tips: [
              "Consider turning the fix into a knowledge article so the next person can self-serve.",
            ],
          }
        : {
            emoji: "✅",
            headline: "Your ticket is resolved",
            cta,
            tips: [
              `Still broken? Reopen the ticket within ${REOPEN_WINDOW_DAYS} days and we'll pick it back up.`,
              "Rate your experience on the ticket page. It helps us improve.",
            ],
          };
    case "ticket.reopened":
      return staff
        ? {
            emoji: "🔁",
            headline: "A ticket was reopened",
            cta,
            tips: ["Read the reopen reason before replying."],
          }
        : {
            emoji: "🔁",
            headline: "Your ticket was reopened",
            cta,
            tips: ["We'll email you as soon as someone replies."],
          };
    case "ticket.status_changed":
      return {
        emoji: "🔄",
        headline: staff
          ? "Ticket status changed"
          : "Your ticket status changed",
        cta,
        tips: staff
          ? []
          : ["Check the ticket page for the latest details and next steps."],
      };
    case "identity.recovery_link":
      return {
        emoji: "🔐",
        headline: "Recover your account",
        cta: "Start account recovery",
        tips: [
          "This link is personal. Don't forward it.",
          "Didn't ask for this? Ignore this email and tell your IT team.",
        ],
      };
    case "org.role_changed":
      return {
        emoji: "🛡️",
        headline: "Your role changed",
        cta: "Open admin",
        tips: [
          "Your new permissions apply the next time you load the admin area.",
        ],
      };
    case "sla.first_response_at_risk":
      return {
        emoji: "⏰",
        headline: "First-response deadline is close",
        cta,
        tips: ["A short first reply is enough to meet the SLA."],
      };
    case "sla.first_response_overdue":
      return {
        emoji: "🚨",
        headline: "First response is overdue",
        cta,
        tips: ["Claim the ticket and reply as soon as you can."],
      };
    case "sla.resolution_overdue":
      return {
        emoji: "🚨",
        headline: "Resolution is overdue",
        cta,
        tips: [
          "Update the requester with progress, or escalate if you're blocked.",
        ],
      };
    case "security.autonomy_alert":
      return {
        emoji: "🛡️",
        headline: "AI autonomy security alert",
        cta,
        tips: [
          "Review the run in the admin area before re-enabling automation.",
        ],
      };
    default:
      return {
        emoji: "🔔",
        headline: staff ? "Ticket update" : "Your ticket has an update",
        cta,
        tips: [],
      };
  }
}

type ParsedBody = {
  lead: string;
  quote: string | null;
  quoteAuthor: string | null;
  extra: string[];
  status: string | null;
};

/** Split an outbox body into lead line, quoted reply and extra paragraphs. */
export function parseNotificationBody(body: string): ParsedBody {
  const paragraphs = body
    .split(/\r?\n\s*\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  let lead = "";
  let quote: string | null = null;
  let status: string | null = null;
  const extra: string[] = [];
  for (const paragraph of paragraphs) {
    const lines = paragraph.split(/\r?\n/);
    const statusMatch = paragraph.match(/^Current status: (.+?)\.?$/);
    if (statusMatch && lines.length === 1) {
      status = statusMatch[1];
    } else if (lines.every((line) => line.startsWith(">"))) {
      const text = lines.map((line) => line.replace(/^> ?/, "")).join("\n");
      quote = quote ? `${quote}\n\n${text}` : text;
    } else if (!lead) {
      lead = paragraph;
    } else {
      extra.push(paragraph);
    }
  }
  const authorMatch = lead.match(/^(.+?) (?:replied|asked)\b/);
  let quoteAuthor: string | null = authorMatch ? authorMatch[1] : null;
  if (quoteAuthor && /^the requester$/i.test(quoteAuthor))
    quoteAuthor = "Requester";
  return {
    lead: lead.replace(/:$/, "."),
    quote,
    quoteAuthor,
    extra,
    status,
  };
}

function ctaUrl(input: NotificationEmailInput): string {
  const site = input.siteUrl.replace(/\/$/, "");
  const direct = safeHttpUrl(input.url);
  if (direct) return direct;
  if (input.ticket?.id) {
    const id = encodeURIComponent(input.ticket.id);
    return input.audience === "staff"
      ? `${site}/admin/tickets/${id}`
      : `${site}/tickets/${id}`;
  }
  if (input.eventType === "org.role_changed") return `${site}/admin`;
  return safeHttpUrl(site) ?? site;
}

function whyText(input: NotificationEmailInput): string {
  if (input.eventType === "account.created")
    return `You're receiving this because you just created a ${BRAND.name} account.`;
  return input.audience === "staff"
    ? `You're receiving this because you're on the support team for this ${BRAND.name} workspace.`
    : `You're receiving this because you have a ticket with ${BRAND.name} and email updates are turned on.`;
}

export function renderNotificationEmail(
  input: NotificationEmailInput
): NotificationEmail {
  const copy = eventCopy(input.eventType, input.audience);
  const parsed = parseNotificationBody(input.body);
  const site = input.siteUrl.replace(/\/$/, "");
  const siteHref = safeHttpUrl(site) ?? "";
  const preferencesUrl = siteHref ? `${site}/tickets` : "";
  const cta = ctaUrl(input);
  const firstName = input.recipientFirstName?.trim();
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
  const status = input.ticket?.status?.trim() || parsed.status;
  const ticketTitle = input.ticket?.title?.trim() || null;
  const ticketRef = input.ticket?.id ? shortTicketRef(input.ticket.id) : null;
  const quoteLabel =
    parsed.quoteAuthor ??
    (input.audience === "staff" ? "Message" : "Your support team");
  const preheader = (parsed.lead || input.subject).slice(0, 140);

  // ---------- plain text ----------
  const textParts: string[] = [greeting, `${copy.emoji} ${copy.headline}`];
  if (parsed.lead) textParts.push(parsed.lead);
  if (parsed.quote)
    textParts.push(
      `${quoteLabel} wrote:\n${parsed.quote
        .split("\n")
        .map((line) => `> ${line}`.trimEnd())
        .join("\n")}`
    );
  textParts.push(...parsed.extra);
  if (ticketTitle || ticketRef || status) {
    textParts.push(
      [
        ticketTitle ? `Ticket: “${ticketTitle}”` : "Ticket",
        ticketRef,
        status ? `Status: ${status}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    );
  }
  textParts.push(`${copy.cta}: ${cta}`);
  if (copy.tips.length)
    textParts.push(
      `What happens next:\n${copy.tips.map((tip) => `- ${tip}`).join("\n")}`
    );
  textParts.push(
    [
      "--",
      whyText(input),
      preferencesUrl
        ? `Manage notification preferences: ${preferencesUrl}`
        : null,
      `${BRAND.name}${siteHref ? ` · ${site}` : ""}`,
    ]
      .filter(Boolean)
      .join("\n")
  );
  const text = textParts.join("\n\n");

  // ---------- HTML ----------
  const e = escapeHtml;
  const p = (content: string, style = "") =>
    `<p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.ink};${style}">${content}</p>`;

  const quoteHtml = parsed.quote
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 16px;">
<tr><td style="padding:0 0 6px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${BRAND.muted};">${e(quoteLabel)}</td></tr>
<tr><td class="hf-quote" bgcolor="${BRAND.soft}" style="background-color:${BRAND.soft};border:1px solid ${BRAND.border};border-left:4px solid ${BRAND.primary};border-radius:4px 16px 16px 16px;padding:14px 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${BRAND.ink};">${escapeMultiline(parsed.quote)}</td></tr>
</table>`
    : "";

  const pill = status
    ? (() => {
        const colors = statusPillColors(status);
        return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background-color:${colors.bg};color:${colors.fg};font-family:${FONT};font-size:12px;font-weight:700;line-height:18px;white-space:nowrap;">${e(status)}</span>`;
      })()
    : "";

  const summaryHtml =
    ticketTitle || ticketRef || pill
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px;">
<tr><td class="hf-summary" bgcolor="${BRAND.soft}" style="background-color:${BRAND.soft};border:1px solid ${BRAND.border};border-radius:14px;padding:14px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${BRAND.muted};padding-bottom:4px;">Ticket${ticketRef ? ` ${e(ticketRef)}` : ""}</td></tr>
${ticketTitle ? `<tr><td style="font-family:${FONT};font-size:16px;font-weight:700;line-height:1.4;color:${BRAND.ink};padding-bottom:${pill ? "8px" : "0"};">${e(ticketTitle)}</td></tr>` : ""}
${pill ? `<tr><td style="font-family:${FONT};font-size:13px;color:${BRAND.muted};">Status&nbsp; ${pill}</td></tr>` : ""}
</table>
</td></tr>
</table>`
      : "";

  const buttonHtml = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 24px;">
<tr><td align="center" bgcolor="${BRAND.primary}" style="border-radius:999px;background-color:${BRAND.primary};">
<a href="${e(cta)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none;border-radius:999px;">${e(copy.cta)} &rarr;</a>
</td></tr>
</table>`;

  const tipsHtml = copy.tips.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${BRAND.border};">
<tr><td style="padding:18px 0 6px;font-family:${FONT};font-size:14px;font-weight:800;color:${BRAND.ink};">💡 What happens next</td></tr>
${copy.tips
  .map(
    (tip) =>
      `<tr><td style="padding:4px 0;font-family:${FONT};font-size:14px;line-height:1.55;color:${BRAND.muted};">&bull;&nbsp; ${e(tip)}</td></tr>`
  )
  .join("\n")}
</table>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${e(input.subject)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .hf-page { background-color:#15101f !important; }
  .hf-card { background-color:#1f1830 !important; }
  .hf-card p, .hf-card td { color:#ece8f8 !important; }
  .hf-quote, .hf-summary { background-color:#2a2140 !important; border-color:#3b2f5c !important; }
  .hf-foot, .hf-foot a { color:#b8b0d4 !important; }
}
@media only screen and (max-width:620px) {
  .hf-pad { padding-left:20px !important; padding-right:20px !important; }
}
</style>
</head>
<body class="hf-page" style="margin:0;padding:0;background-color:${BRAND.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${e(preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" class="hf-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.page}" style="background-color:${BRAND.page};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td bgcolor="${BRAND.primary}" style="background-color:${BRAND.primary};background-image:${BRAND.gradient};border-radius:20px 20px 0 0;padding:22px 32px;" class="hf-pad">
<span style="font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-.01em;color:#ffffff;">🛟 ${BRAND.name}</span>
</td></tr>
<tr><td class="hf-card hf-pad" bgcolor="${BRAND.card}" style="background-color:${BRAND.card};border-radius:0 0 20px 20px;padding:30px 32px 28px;">
${p(e(greeting), `color:${BRAND.muted};`)}
<h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:800;color:${BRAND.ink};"><span style="font-size:28px;">${copy.emoji}</span>&nbsp; ${e(copy.headline)}</h1>
${parsed.lead ? p(escapeMultiline(parsed.lead)) : ""}
${quoteHtml}
${parsed.extra.map((paragraph) => p(escapeMultiline(paragraph), `font-size:15px;color:${BRAND.muted};`)).join("\n")}
${summaryHtml}
${buttonHtml}
${tipsHtml}
</td></tr>
<tr><td class="hf-foot" style="padding:20px 24px 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.muted};text-align:center;">
${e(whyText(input))}<br>
${preferencesUrl ? `<a href="${e(preferencesUrl)}" style="color:${BRAND.primaryDark};text-decoration:underline;">Manage notification preferences</a> &middot; ` : ""}${siteHref ? `<a href="${e(siteHref)}" style="color:${BRAND.primaryDark};text-decoration:underline;">${e(site.replace(/^https?:\/\//, ""))}</a>` : e(BRAND.name)}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { html, text };
}
