export type StepOutcome = "completed" | "did-not-work" | "cannot-complete";

export type TroubleshootingSession = {
  issueSlug: string;
  issueTitle: string;
  platform: string;
  currentStepIndex: number;
  attemptedSteps: { step: string; outcome: StepOutcome }[];
  status: "in-progress" | "resolved" | "escalated";
  solvingStep?: string;
  rating?: "helpful" | "not-helpful";
  escalationReason?: string;
  updatedAt: number;
};

const STORAGE_KEY = "helpdesk-sessions";

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function readSessions(): Record<string, TroubleshootingSession> {
  if (!isBrowser()) return {};
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, TroubleshootingSession>;
    }
  } catch {
    // fall through
  }
  return {};
}

function writeSessions(sessions: Record<string, TroubleshootingSession>): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function sessionKey(issueSlug: string, platform: string): string {
  return `${issueSlug}:${platform}`;
}

export function getSession(
  issueSlug: string,
  platform: string
): TroubleshootingSession | undefined {
  return readSessions()[sessionKey(issueSlug, platform)];
}

export function saveSession(session: TroubleshootingSession): void {
  const sessions = readSessions();
  sessions[sessionKey(session.issueSlug, session.platform)] = session;
  writeSessions(sessions);
}

export function clearSession(issueSlug: string, platform: string): void {
  const sessions = readSessions();
  delete sessions[sessionKey(issueSlug, platform)];
  writeSessions(sessions);
}

export function clearAllSessions(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function getActiveSessions(): TroubleshootingSession[] {
  return Object.values(readSessions()).filter(
    (session) => session.status === "in-progress"
  );
}

export function getAllSessions(): TroubleshootingSession[] {
  return Object.values(readSessions()).sort(
    (a, b) => b.updatedAt - a.updatedAt
  );
}
