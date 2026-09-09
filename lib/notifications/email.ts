type EmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailResult = { ok: boolean; error?: string };

const DEFAULT_FROM = "HelpDesk First <onboarding@example.com>";

function parseSender(): { name: string; email: string } {
  const raw = process.env.NOTIFICATIONS_FROM_EMAIL ?? DEFAULT_FROM;
  const match = raw.match(/^(.*)<(.+)>$/);
  if (match) {
    const name = match[1].trim();
    const email = match[2].trim();
    return { name: name.length > 0 ? name : "HelpDesk First", email };
  }
  return { name: "HelpDesk First", email: raw.trim() };
}

// Uses Brevo (https://www.brevo.com) rather than a domain-verified provider
// like Resend: Brevo lets a single sender email address be verified via a
// confirmation link (no DNS/domain ownership required) and its free tier
// (300 emails/day, no expiry) delivers to any real recipient, not just the
// account owner. See NOTIFICATIONS_FROM_EMAIL in .env.example.
export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  const key = process.env.BREVO_API_KEY;
  if (!key)
    return { ok: false, error: "permanent:email provider is not configured" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": key,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: parseSender(),
        to: [{ email: input.to }],
        subject: input.subject,
        textContent: input.text,
        ...(input.html ? { htmlContent: input.html } : {}),
      }),
      signal: controller.signal,
    });
    if (response.ok) return { ok: true };
    const retryable = response.status === 429 || response.status >= 500;
    return {
      ok: false,
      error: `${retryable ? "retryable" : "permanent"}:brevo ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: `retryable:${error instanceof Error ? error.message : "email request failed"}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
