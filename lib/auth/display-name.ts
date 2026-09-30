export type DisplayNameUser =
  | {
      email?: string | null;
      user_metadata?: Record<string, unknown> | null;
    }
  | null
  | undefined;

function metadataName(user: DisplayNameUser): string | null {
  const raw = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 80) : null;
}

/**
 * Best human-readable name for a Supabase user: `full_name` from the
 * sign-up metadata, else the local part of their email, else "Account".
 */
export function getDisplayName(user: DisplayNameUser): string {
  const name = metadataName(user);
  if (name) return name;
  const local = (user?.email ?? "").split("@")[0]?.trim();
  return local ? local : "Account";
}

/** First name from `full_name` metadata only (never guessed from email). */
export function getFirstName(user: DisplayNameUser): string | null {
  const name = metadataName(user);
  return name ? name.split(" ")[0] : null;
}
