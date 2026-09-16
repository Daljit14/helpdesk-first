export type DirectoryProvider = "entra" | "google";

export type AccountStatus = {
  directoryUserId: string;
  primaryEmail: string;
  enabled: boolean;
  suspended: boolean;
  passwordExpired: boolean | null;
  lastSignInAt: string | null;
  recentSignInErrors: { at: string; code: string }[];
  mfaRegistered: boolean | null;
  groups: string[];
};

export type ConnectorError = {
  kind:
    | "not_found"
    | "unauthorized"
    | "rate_limited"
    | "unavailable"
    | "unsupported"
    | "invalid_response";
  message: string;
};

export type ConnectorResult<T> =
  { ok: true; value: T } | { ok: false; error: ConnectorError };

export interface IdentityDirectory {
  readonly provider: DirectoryProvider;
  lookupUserByEmail(
    email: string,
    signal: AbortSignal
  ): Promise<ConnectorResult<AccountStatus>>;
  revokeSessions(
    directoryUserId: string,
    signal: AbortSignal
  ): Promise<ConnectorResult<{ revokedAt: string }>>;
  isMemberOfGroup(
    directoryUserId: string,
    groupId: string,
    signal: AbortSignal
  ): Promise<ConnectorResult<boolean>>;
  addToGroup(
    directoryUserId: string,
    groupId: string,
    signal: AbortSignal
  ): Promise<ConnectorResult<{ addedAt: string }>>;
  removeFromGroup(
    directoryUserId: string,
    groupId: string,
    signal: AbortSignal
  ): Promise<ConnectorResult<{ removedAt: string }>>;
  health(
    signal: AbortSignal
  ): Promise<ConnectorResult<{ tokenAcquired: boolean; latencyMs: number }>>;
}

export type ConnectorConfig = {
  provider: DirectoryProvider;
  organizationId: string;
  config: Record<string, string>;
  secret: string;
  allowedGroupIds: string[];
  resetUrl: string | null;
};

export type IdentityBinding = {
  runId: string;
  ticketId: string;
  organizationId: string;
  userId: string;
  provider: DirectoryProvider;
  directoryUserId: string;
  matchedEmailHash: string;
  boundAt: string;
};
