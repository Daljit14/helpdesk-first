export const credentialPattern =
  /password\s*[:=]|passwd|\botp\b|\btoken\s*[:=]|bearer\s+[a-z0-9]|begin (rsa |ec )?private key|mfa code/i;

export function scrubLearningText(value: string, max: number): string {
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, max);
  if (credentialPattern.test(normalized)) return "[redacted]";
  return normalized
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email removed]")
    .replace(/https?:\/\/[^\s]+/gi, (url) =>
      url.startsWith("https://helpdesk-first.vercel.app/")
        ? url
        : "[link removed]"
    );
}
