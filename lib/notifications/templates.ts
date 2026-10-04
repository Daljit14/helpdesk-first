import type { NotificationEventType } from "./types";

export type NotificationAudience = "requester" | "staff";

export type NotificationContext = {
  ticketTitle: string;
  ticketId: string;
  status?: string;
  actorLabel?: string;
  publicReplyExcerpt?: string;
  recoveryLink?: string;
  /** Who receives this message. Defaults to "requester". */
  audience?: NotificationAudience;
  /** Who performed the action (e.g. who wrote a reply). */
  actorRole?: NotificationAudience;
};

/** Events that are only ever sent to support staff / admins. */
export const STAFF_ONLY_EVENTS: ReadonlySet<string> = new Set([
  "sla.first_response_at_risk",
  "sla.first_response_overdue",
  "sla.resolution_overdue",
  "security.autonomy_alert",
  "org.role_changed",
]);

function excerpt(value: string | undefined): string {
  return (value ?? "").trim().slice(0, 240);
}

/** Title shortened for subject lines. */
function shortTitle(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 59).trimEnd()}…` : clean;
}

/** Quote a reply excerpt in the conventional plain-text email style. */
export function quoteReply(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
}

function withQuote(lead: string, reply: string): string {
  return reply ? `${lead}:\n\n${quoteReply(reply)}` : `${lead}.`;
}

export function buildNotification(
  eventType: NotificationEventType,
  context: NotificationContext
): { subject: string; body: string } {
  const title = context.ticketTitle;
  const quoted = `“${title}”`;
  const short = `“${shortTitle(title)}”`;
  const staff = context.audience === "staff";
  const actor = context.actorLabel?.trim() || undefined;
  const reply = excerpt(context.publicReplyExcerpt);
  let subject = `🔔 Update on ${short}`;
  let message = `${quoted} has an update.`;
  let appendStatus = true;

  switch (eventType) {
    case "account.created":
      subject = "👋 Welcome to HelpDesk First";
      message =
        "Your account is ready. Submit a ticket any time and you'll get an email the moment there's an update.";
      appendStatus = false;
      break;
    case "ticket.created":
      if (staff) {
        subject = `🎫 New ticket: ${short}`;
        message = `A new ticket ${quoted} was submitted.`;
      } else {
        subject = `🎫 We got your ticket: ${short}`;
        message = `We received ${quoted} and we're on it. You'll get an email the moment there's an update.`;
      }
      break;
    case "ticket.handoff":
      if (staff) {
        subject = `🙋 Needs a human: ${short}`;
        message = `${quoted} was handed off and needs a human response.`;
      } else {
        subject = `🙋 A person is on it: ${short}`;
        message = `${quoted} has been passed to ${actor ?? "our support team"}. A person will pick it up soon.`;
      }
      break;
    case "ticket.assigned":
      if (staff) {
        subject = `👤 Assigned: ${short}`;
        message = `${quoted} was assigned to ${actor ?? "a teammate"}.`;
      } else {
        subject = `👤 Your ticket has an owner: ${short}`;
        message = `${actor ?? "A support specialist"} is now working on ${quoted}.`;
      }
      break;
    case "reply.public":
      subject = `💬 New reply on ${short}`;
      if (staff && context.actorRole !== "staff") {
        message = withQuote(`The requester replied on ${quoted}`, reply);
      } else if (staff) {
        message = withQuote(
          `${actor ?? "A teammate"} replied to the requester on ${quoted}`,
          reply
        );
      } else {
        message = withQuote(
          `${actor ?? "Your support team"} replied on ${quoted}`,
          reply
        );
      }
      break;
    case "info.requested":
      subject = `❓ We need a bit more info: ${short}`;
      message = withQuote(
        `${actor ?? "Your support team"} asked for more information on ${quoted}`,
        reply
      );
      break;
    case "verification.requested":
      subject = `🧪 Can you confirm the fix? ${short}`;
      message = reply
        ? `We think ${quoted} is fixed. Please confirm it works for you:\n\n${quoteReply(reply)}`
        : `We think ${quoted} is fixed. Please confirm it works for you.`;
      break;
    case "ticket.resolved":
      subject = `✅ Resolved: ${short}`;
      if (staff && context.actorRole === "requester") {
        message = `The requester confirmed ${quoted} is fixed.`;
      } else if (!staff && context.actorRole === "requester") {
        message = `Thanks for confirming. ${quoted} is now resolved.`;
      } else {
        message = reply
          ? `${quoted} was marked resolved:\n\n${quoteReply(reply)}`
          : `${quoted} was marked resolved.`;
      }
      break;
    case "ticket.reopened":
      subject = `🔁 Reopened: ${short}`;
      message = staff
        ? `${quoted} was reopened and needs attention.`
        : `${quoted} was reopened and is back with our support team.`;
      break;
    case "ticket.status_changed":
      subject = `🔄 ${short} is now ${context.status ?? "updated"}`;
      message = `${quoted} is now ${context.status ?? "updated"}.`;
      appendStatus = false;
      break;
    case "identity.recovery_link":
      subject = "🔐 Self-service account recovery";
      message = context.recoveryLink
        ? `Use this self-service account recovery link: ${context.recoveryLink}`
        : `Self-service account recovery is available for ${title}.`;
      break;
    case "org.role_changed":
      subject = `🛡️ Your role in ${title} is now ${context.status ?? "updated"}`;
      message = `Your role in ${title} is now ${context.status ?? "updated"}.`;
      appendStatus = false;
      break;
    case "sla.first_response_at_risk":
      subject = `⏰ Response SLA at risk: ${short}`;
      message = `${quoted} is approaching its first-response deadline.`;
      break;
    case "sla.first_response_overdue":
      subject = `🚨 Response SLA overdue: ${short}`;
      message = `${quoted} is overdue for a first response.`;
      break;
    case "sla.resolution_overdue":
      subject = `🚨 Resolution SLA overdue: ${short}`;
      message = `${quoted} is overdue for resolution.`;
      break;
    case "security.autonomy_alert":
      subject = `🛡️ AI autonomy security alert: ${short}`;
      message = `${quoted} triggered the autonomy security event ${context.status ?? "unknown"}.`;
      appendStatus = false;
      break;
    case "service.restored":
      subject = `✅ ${title} is back`;
      message = `${title} is back to normal. The service incident has cleared.`;
      appendStatus = false;
      break;
  }

  if (context.status && appendStatus)
    message += `\n\nCurrent status: ${context.status}.`;
  return { subject, body: message };
}
