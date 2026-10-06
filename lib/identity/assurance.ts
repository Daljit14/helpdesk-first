export type AssuranceLevel = "A0" | "A1" | "A2" | "A3";
export type AssuranceChannel = "web" | "email" | "api" | "ticket_owner_web";

export type AssuranceFacts = {
  level: AssuranceLevel;
  method: string;
  authAt: string | null;
  expiresAt: string | null;
};

type AssuranceInput = {
  channel: AssuranceChannel;
  hasVerifiedSession: boolean;
  aal: "aal1" | "aal2" | null;
  amr: unknown;
  providers: string[];
  org: {
    idpEnforcesMfa: boolean;
    ssoProvider: "entra" | "google" | "okta" | "none" | "other" | null;
    profileConfirmed: boolean;
  };
  freshMinutes: number;
  now: Date;
};

type AmrEntry = {
  method: string;
  timestamp?: number;
};

const LEVEL_RANK: Record<AssuranceLevel, number> = {
  A0: 0,
  A1: 1,
  A2: 2,
  A3: 3,
};

const FIRST_FACTOR_METHODS = new Set([
  "password",
  "otp",
  "magiclink",
  "oauth",
  "sso/saml",
]);

const IDP_ATTESTED_PROVIDERS = new Set(["azure", "entra"]);

export function compareAssurance(a: AssuranceLevel, b: AssuranceLevel): number {
  return LEVEL_RANK[a] - LEVEL_RANK[b];
}

function parseAmr(value: unknown): {
  entries: AmrEntry[];
  anonymous: boolean;
} {
  const raw = Array.isArray(value)
    ? value
    : value &&
        typeof value === "object" &&
        "amr" in value &&
        Array.isArray((value as { amr?: unknown }).amr)
      ? (value as { amr: unknown[] }).amr
      : [];
  const anonymous =
    Boolean(
      value &&
      typeof value === "object" &&
      "is_anonymous" in value &&
      (value as { is_anonymous?: unknown }).is_anonymous === true
    ) ||
    raw.some(
      (entry) =>
        typeof entry === "string" && entry.toLowerCase() === "anonymous"
    );
  const entries = raw.flatMap((entry): AmrEntry[] => {
    if (typeof entry === "string") {
      return [{ method: entry }];
    }
    if (!entry || typeof entry !== "object") return [];
    const method = (entry as { method?: unknown }).method;
    const timestamp = (entry as { timestamp?: unknown }).timestamp;
    if (typeof method !== "string") return [];
    return [
      {
        method,
        ...(typeof timestamp === "number" ? { timestamp } : {}),
      },
    ];
  });
  return {
    entries,
    anonymous:
      anonymous ||
      entries.some((entry) => entry.method.toLowerCase() === "anonymous"),
  };
}

function timestampMs(entry: AmrEntry, nowMs: number): number | null {
  if (!Number.isFinite(entry.timestamp)) return null;
  const timestamp = (entry.timestamp as number) * 1_000;
  if (timestamp > nowMs + 60_000) return null;
  return timestamp;
}

function unauthenticated(): AssuranceFacts {
  return {
    level: "A0",
    method: "unauthenticated",
    authAt: null,
    expiresAt: null,
  };
}

export function computeAssurance(input: AssuranceInput): AssuranceFacts {
  if (input.channel === "email" || input.channel === "api") {
    return {
      level: "A0",
      method: `channel_${input.channel}`,
      authAt: null,
      expiresAt: null,
    };
  }
  if (input.channel === "ticket_owner_web") {
    return {
      level: "A1",
      method: "ticket_owner_web",
      authAt: null,
      expiresAt: null,
    };
  }
  if (!input.hasVerifiedSession) return unauthenticated();

  const { entries, anonymous } = parseAmr(input.amr);
  if (anonymous) {
    return {
      level: "A0",
      method: "anonymous",
      authAt: null,
      expiresAt: null,
    };
  }

  const nowMs = input.now.getTime();
  const firstFactors = entries
    .filter((entry) => FIRST_FACTOR_METHODS.has(entry.method.toLowerCase()))
    .flatMap((entry) => {
      const timestamp = timestampMs(entry, nowMs);
      return timestamp === null ? [] : [{ entry, timestamp }];
    })
    .sort((a, b) => b.timestamp - a.timestamp);
  const newest = firstFactors[0];
  const authAt = newest ? new Date(newest.timestamp).toISOString() : null;
  const freshMs =
    Math.min(
      60,
      Math.max(
        1,
        Math.trunc(
          Number.isFinite(input.freshMinutes) ? input.freshMinutes : 10
        )
      )
    ) * 60_000;
  const fresh = newest !== undefined && nowMs - newest.timestamp <= freshMs;
  if (!fresh) {
    return {
      level: "A1",
      method: "session",
      authAt,
      expiresAt: null,
    };
  }

  const expiresAt = new Date(newest.timestamp + freshMs).toISOString();
  const recentMfa = entries.some((entry) => {
    const method = entry.method.toLowerCase();
    const timestamp = timestampMs(entry, nowMs);
    return (
      timestamp !== null &&
      nowMs - timestamp <= freshMs &&
      (method.startsWith("mfa/") || method === "totp")
    );
  });
  if (input.aal === "aal2" && recentMfa) {
    return {
      level: "A3",
      method: "supabase_mfa",
      authAt,
      expiresAt,
    };
  }

  const oauthProviders = [
    ...new Set(
      input.providers
        .map((provider) => provider.toLowerCase())
        .filter((provider) => provider !== "email" && provider !== "phone")
    ),
  ];
  const mappedProvider =
    oauthProviders.length === 1 && IDP_ATTESTED_PROVIDERS.has(oauthProviders[0])
      ? oauthProviders[0] === "azure" || oauthProviders[0] === "entra"
        ? "entra"
        : null
      : null;
  if (
    input.org.idpEnforcesMfa &&
    input.org.profileConfirmed &&
    newest.entry.method.toLowerCase() === "oauth" &&
    oauthProviders.length === 1 &&
    mappedProvider === input.org.ssoProvider
  ) {
    return {
      level: "A3",
      method: "idp_mfa_attested",
      authAt,
      expiresAt,
    };
  }
  return {
    level: "A2",
    method: newest.entry.method.toLowerCase(),
    authAt,
    expiresAt,
  };
}
