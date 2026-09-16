import { createSign } from "node:crypto";
import { z } from "zod";
import { connectorFetch } from "./http";
import type {
  AccountStatus,
  ConnectorConfig,
  ConnectorResult,
  IdentityDirectory,
} from "./types";

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

export class GoogleWorkspaceDirectory implements IdentityDirectory {
  readonly provider = "google" as const;
  private token: { value: string; expiresAt: number } | null = null;
  private readonly credentials: { client_email: string; private_key: string };

  constructor(private readonly config: ConnectorConfig) {
    this.credentials = z
      .object({
        client_email: z.string().email(),
        private_key: z.string().min(1),
      })
      .parse(JSON.parse(config.secret) as unknown);
  }

  private async accessToken(
    signal: AbortSignal
  ): Promise<ConnectorResult<string>> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000)
      return { ok: true, value: this.token.value };
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64Url(
      JSON.stringify({
        iss: this.credentials.client_email,
        scope:
          "https://www.googleapis.com/auth/admin.directory.user.readonly https://www.googleapis.com/auth/admin.directory.user.security https://www.googleapis.com/auth/admin.directory.group.member",
        aud: "https://oauth2.googleapis.com/token",
        sub: this.config.config.adminSubject,
        iat: now,
        exp: now + 3600,
      })
    );
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    const assertion = `${header}.${payload}.${signer.sign(this.credentials.private_key, "base64url")}`;
    const token = await connectorFetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        signal,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }),
      },
      (value) =>
        z
          .object({ access_token: z.string(), expires_in: z.number() })
          .parse(value)
    );
    if (!token.ok) return token;
    this.token = {
      value: token.value.access_token,
      expiresAt: Date.now() + token.value.expires_in * 1000,
    };
    return { ok: true, value: this.token.value };
  }

  private async api<T>(
    url: string,
    signal: AbortSignal,
    parse: (value: unknown) => T,
    init: RequestInit = {},
    read = true
  ) {
    const token = await this.accessToken(signal);
    if (!token.ok) return token;
    return connectorFetch(
      url,
      {
        ...init,
        signal,
        headers: {
          authorization: `Bearer ${token.value}`,
          ...(init.headers ?? {}),
        },
      },
      parse,
      read
    );
  }

  async lookupUserByEmail(
    email: string,
    signal: AbortSignal
  ): Promise<ConnectorResult<AccountStatus>> {
    const result = await this.api(
      `https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(email)}?projection=full`,
      signal,
      (raw) =>
        z
          .object({
            id: z.string(),
            primaryEmail: z.string().email(),
            suspended: z.boolean(),
            lastLoginTime: z.string().nullable().optional(),
            isEnrolledIn2Sv: z.boolean().nullable().optional(),
            changePasswordAtNextLogin: z.boolean().nullable().optional(),
          })
          .parse(raw)
    );
    if (!result.ok) return result;
    return {
      ok: true,
      value: {
        directoryUserId: result.value.id,
        primaryEmail: result.value.primaryEmail,
        enabled: !result.value.suspended,
        suspended: result.value.suspended,
        passwordExpired: result.value.changePasswordAtNextLogin ?? null,
        lastSignInAt: result.value.lastLoginTime ?? null,
        recentSignInErrors: [],
        mfaRegistered: result.value.isEnrolledIn2Sv ?? null,
        groups: [],
      },
    };
  }

  async getUserById(
    directoryUserId: string,
    signal: AbortSignal
  ): Promise<ConnectorResult<AccountStatus>> {
    const result = await this.api(
      `https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(directoryUserId)}?projection=full`,
      signal,
      (raw) =>
        z
          .object({
            id: z.string(),
            primaryEmail: z.string().email(),
            suspended: z.boolean(),
            lastLoginTime: z.string().nullable().optional(),
            isEnrolledIn2Sv: z.boolean().nullable().optional(),
            changePasswordAtNextLogin: z.boolean().nullable().optional(),
          })
          .parse(raw)
    );
    if (!result.ok) return result;
    return {
      ok: true,
      value: {
        directoryUserId: result.value.id,
        primaryEmail: result.value.primaryEmail,
        enabled: !result.value.suspended,
        suspended: result.value.suspended,
        passwordExpired: result.value.changePasswordAtNextLogin ?? null,
        lastSignInAt: result.value.lastLoginTime ?? null,
        recentSignInErrors: [],
        mfaRegistered: result.value.isEnrolledIn2Sv ?? null,
        groups: [],
      },
    };
  }

  async revokeSessions(directoryUserId: string, signal: AbortSignal) {
    return this.api(
      `https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(directoryUserId)}/signOut`,
      signal,
      () => ({ revokedAt: new Date().toISOString() }),
      { method: "POST" },
      false
    );
  }
  async isMemberOfGroup(
    directoryUserId: string,
    groupId: string,
    signal: AbortSignal
  ) {
    const result = await this.api(
      `https://admin.googleapis.com/admin/directory/v1/groups/${encodeURIComponent(groupId)}/hasMember/${encodeURIComponent(directoryUserId)}`,
      signal,
      (raw) => z.object({ isMember: z.boolean() }).parse(raw)
    );
    return result.ok
      ? { ok: true as const, value: result.value.isMember }
      : result;
  }
  async addToGroup(
    directoryUserId: string,
    groupId: string,
    signal: AbortSignal
  ) {
    return this.api(
      `https://admin.googleapis.com/admin/directory/v1/groups/${encodeURIComponent(groupId)}/members`,
      signal,
      () => ({ addedAt: new Date().toISOString() }),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: directoryUserId, role: "MEMBER" }),
      },
      false
    );
  }
  async removeFromGroup(
    directoryUserId: string,
    groupId: string,
    signal: AbortSignal
  ) {
    return this.api(
      `https://admin.googleapis.com/admin/directory/v1/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(directoryUserId)}`,
      signal,
      () => ({ removedAt: new Date().toISOString() }),
      { method: "DELETE" },
      false
    );
  }
  async health(signal: AbortSignal) {
    const started = Date.now();
    const token = await this.accessToken(signal);
    return token.ok
      ? {
          ok: true as const,
          value: { tokenAcquired: true, latencyMs: Date.now() - started },
        }
      : token;
  }
}
