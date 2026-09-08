type EmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailResult = { ok: boolean; error?: string };

export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key)
    return { ok: false, error: "permanent:email provider is not configured" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:
          process.env.NOTIFICATIONS_FROM_EMAIL ??
          "HelpDesk First <onboarding@resend.dev>",
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      }),
      signal: controller.signal,
    });
    if (response.ok) return { ok: true };
    const retryable = response.status === 429 || response.status >= 500;
    return {
      ok: false,
      error: `${retryable ? "retryable" : "permanent"}:resend ${response.status}`,
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
