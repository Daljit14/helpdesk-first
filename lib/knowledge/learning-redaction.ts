export type RedactionCategory =
  | "email"
  | "name"
  | "identifier"
  | "hostname"
  | "ip_address"
  | "credential"
  | "link";

export type RedactionSummary = Partial<Record<RedactionCategory, number>>;

export type Redacted = { text: string; summary: RedactionSummary };

const rules: { category: RedactionCategory; pattern: RegExp; token: string }[] =
  [
    {
      category: "credential",
      pattern:
        /\b(?:password|passwd|passcode|pin|token|api[- ]?key|secret|otp|mfa code|auth(?:entication)? code|recovery key)\b\s*(?:is|was|[:=])\s*\S+/gi,
      token: "[credential removed]",
    },
    {
      category: "credential",
      pattern:
        /\bbearer\s+[a-z0-9._-]{8,}\b|-----begin [a-z ]*private key-----[\s\S]*?-----end [a-z ]*private key-----/gi,
      token: "[credential removed]",
    },
    {
      category: "email",
      pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g,
      token: "[email removed]",
    },
    {
      category: "ip_address",
      pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      token: "[ip removed]",
    },
    {
      category: "hostname",
      pattern:
        /\b(?:[a-z0-9-]+\.)+(?:local|internal|corp|lan|intra|ad)\b|\\\\[a-z0-9._-]+/gi,
      token: "[hostname removed]",
    },
    {
      category: "identifier",
      pattern:
        /\b(?:student|employee|staff|badge|payroll|user)\s*(?:id|number|no\.?)\s*[:#]?\s*[a-z0-9-]{3,}/gi,
      token: "[identifier removed]",
    },
    {
      category: "name",
      pattern:
        /\b(?:my name is|i am|i'm|this is|contact|call|ask for)\s+(?:mr\.?|mrs\.?|ms\.?|dr\.?\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/gi,
      token: "[name removed]",
    },
    {
      category: "link",
      pattern: /https?:\/\/[^\s)]+/gi,
      token: "[link removed]",
    },
  ];

export function redactForLearning(value: string, max = 1000): Redacted {
  const summary: RedactionSummary = {};
  let text = value.trim().replace(/\s+/g, " ").slice(0, max);
  for (const rule of rules) {
    text = text.replace(rule.pattern, (match) => {
      if (
        rule.category === "link" &&
        match.startsWith("https://helpdesk-first.vercel.app/")
      ) {
        return match;
      }
      summary[rule.category] = (summary[rule.category] ?? 0) + 1;
      return rule.token;
    });
  }
  return { text, summary };
}

export function mergeRedactionSummaries(
  ...summaries: RedactionSummary[]
): RedactionSummary {
  const merged: RedactionSummary = {};
  for (const summary of summaries) {
    for (const [category, count] of Object.entries(summary)) {
      const key = category as RedactionCategory;
      merged[key] = (merged[key] ?? 0) + (count ?? 0);
    }
  }
  return merged;
}

export function describeRedactions(summary: RedactionSummary): string {
  const labels: Record<RedactionCategory, string> = {
    email: "email addresses",
    name: "names",
    identifier: "personal identifiers",
    hostname: "hostnames",
    ip_address: "IP addresses",
    credential: "credentials",
    link: "links",
  };
  const parts = Object.entries(summary)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(
      ([category, count]) => `${count} ${labels[category as RedactionCategory]}`
    );
  return parts.length ? `Removed ${parts.join(", ")}.` : "Nothing removed.";
}
