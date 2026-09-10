import { z } from "zod";
import type { Issue } from "@/lib/issues";
import { classifyStep, type StepRisk } from "@/lib/investigation/policy";

export const LEARNING_PROMPT_VERSION = "learned-article-v1";

const shortText = z.string().trim().min(1).max(300);

export const learnedArticleSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    problemSummary: z.string().trim().min(1).max(600),
    symptoms: z.array(shortText).min(1).max(8),
    platforms: z.array(z.string().trim().min(1).max(30)).max(8),
    rootCause: z.string().trim().min(1).max(600),
    preconditions: z.array(shortText).max(6),
    steps: z
      .array(
        z.object({
          text: z.string().trim().min(1).max(400),
          risk: z.enum(["safe", "caution", "approval", "specialist", "denied"]),
        })
      )
      .min(1)
      .max(12),
    verification: z.array(shortText).min(1).max(5),
    escalationConditions: z.array(shortText).max(5),
    prevention: z.array(shortText).max(5),
    sources: z
      .array(
        z.object({
          type: z.enum(["ticket", "guide", "url"]),
          reference: z.string().trim().min(1).max(300),
        })
      )
      .max(6),
    confidence: z.number().min(0).max(1),
    securityReviewRequired: z.boolean(),
  })
  .strict();

export type LearnedArticle = z.infer<typeof learnedArticleSchema>;

const forbiddenContent: { label: string; matches: RegExp }[] = [
  {
    label: "shell or terminal command",
    matches:
      /\b(?:cmd\.exe|powershell|terminal|command prompt|command line|bash|sudo|chmod|rm -rf|del \/|format [a-z]:|netsh|ipconfig|sfc \/|dism)\b|^\s*[$>#]\s*\w+/im,
  },
  {
    label: "password or MFA bypass",
    matches:
      /\b(?:bypass|circumvent|skip|reset without)\b.*\b(?:password|mfa|2fa|authentication|login|lock)\b/i,
  },
  { label: "registry change", matches: /\b(?:regedit|registry)\b/i },
  {
    label: "BIOS or firmware instruction",
    matches: /\b(?:bios|uefi|firmware)\b/i,
  },
  {
    label: "security control disablement",
    matches:
      /\b(?:disable|turn off|stop|remove)\b.*\b(?:antivirus|firewall|defender|security|protection|encryption|bitlocker|mdm|intune|policy)\b/i,
  },
  {
    label: "remote-control instruction",
    matches:
      /\b(?:teamviewer|anydesk|remote desktop|rdp|quick assist|screen share|take control|remote(?:ly)? (?:access|control))\b/i,
  },
  {
    label: "destructive action",
    matches:
      /\b(?:wipe|reformat|factory reset|delete all|erase|reinstall (?:windows|macos|the os)|shift\s*\+\s*delete)\b/i,
  },
];

export type ArticleValidation = {
  ok: boolean;
  errors: string[];
  securityReviewRequired: boolean;
};

export function validateLearnedArticle(
  input: unknown,
  approvedSlugs: string[]
): ArticleValidation & { article?: LearnedArticle } {
  const parsed = learnedArticleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "article"}: ${issue.message}`
      ),
      securityReviewRequired: false,
    };
  }
  const article = parsed.data;
  const errors: string[] = [];
  let securityReviewRequired = article.securityReviewRequired;

  for (const [index, step] of article.steps.entries()) {
    const forbidden = forbiddenContent.find((rule) =>
      rule.matches.test(step.text)
    );
    if (forbidden) {
      errors.push(`steps.${index}: ${forbidden.label}`);
      continue;
    }
    const policy = classifyStep(step.text);
    if (policy.risk === "denied") {
      errors.push(`steps.${index}: ${policy.reason}`);
    } else if (policy.risk !== step.risk) {
      step.risk = policy.risk;
    }
    if (policy.risk === "approval" || policy.risk === "specialist") {
      securityReviewRequired = true;
    }
  }

  for (const [index, source] of article.sources.entries()) {
    if (source.type === "url") {
      if (!source.reference.startsWith("https://helpdesk-first.vercel.app/")) {
        errors.push(`sources.${index}: unapproved URL`);
      }
    } else if (
      source.type === "guide" &&
      !approvedSlugs.includes(source.reference)
    ) {
      errors.push(`sources.${index}: unknown guide slug`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    securityReviewRequired,
    article: { ...article, securityReviewRequired },
  };
}

export function riskForStepText(text: string): StepRisk {
  return classifyStep(text).risk;
}

export type SimilarGuide = { slug: string; title: string; score: number };

const stopWords = new Set([
  "the", "a", "an", "and", "or", "to", "of", "is", "not", "my", "on", "in",
  "it", "for", "with", "will", "does", "can", "cannot", "when", "after",
  "before", "but", "no", "at", "be", "was", "are", "this", "that",
]);

export function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((token) => token.replace(/^-+|-+$/g, ""))
      .filter((token) => token.length > 2 && !stopWords.has(token))
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

export function findSimilarGuides(
  article: Pick<LearnedArticle, "title" | "symptoms" | "rootCause" | "platforms">,
  issues: Pick<Issue, "id" | "title" | "symptoms" | "devices">[],
  limit = 3
): SimilarGuide[] {
  const titleTokens = tokenize(article.title);
  const symptomTokens = tokenize(
    [...article.symptoms, article.rootCause].join(" ")
  );
  const platforms = new Set(article.platforms.map((p) => p.toLowerCase()));
  return issues
    .map((issue) => {
      const issueSymptoms = tokenize(
        [issue.title, ...issue.symptoms].join(" ")
      );
      const platformMatch =
        platforms.size === 0 ||
        issue.devices.some((device) =>
          platforms.has(String(device).toLowerCase())
        );
      const score =
        0.5 * overlap(titleTokens, tokenize(issue.title)) +
        0.5 * overlap(symptomTokens, issueSymptoms) +
        (platformMatch ? 0.1 : 0);
      return { slug: issue.id, title: issue.title, score };
    })
    .filter((candidate) => candidate.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
