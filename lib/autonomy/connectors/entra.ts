import { z } from "zod";
import { connectorFetch } from "./http";
import type {
  AccountStatus,
  ConnectorConfig,
  ConnectorResult,
  IdentityDirectory,
} from "./types";

const graphId = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const email = z.string().email();

const userSchema = z.object({
  id: graphId,
  mail: z.string().nullable().optional(),
  userPrincipalName: z.string().email().nullable().optional(),
  accountEnabled: z.boolean().optional(),
  signInActivity: z
    .object({ lastSignInDateTime: z.string().nullable().optional() })
    .nullable()
    .optional(),
  lastPasswordChangeDateTime: z.string().nullable().optional(),
});

function escapeFilter(value: string): string {
  return value.replace(/'/g, "''");
}

export class EntraDirectory implements IdentityDirectory {
  readonly provider = "entra" as const;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConnectorConfig) {}

  private async accessToken(
    signal: AbortSignal
  ): Promise<ConnectorResult<string>> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000)
      return { ok: true, value: this.token.value };
    const tenant = z
      .string()
      .regex(/^[A-Za-z0-9.-]{1,128}$/)
      .safeParse(this.config.config.tenantId);
    const client = z
      .string()
      .regex(/^[A-Za-z0-9-]{1,128}$/)
      .safeParse(this.config.config.clientId);
    if (!tenant.success || !client.success)
      return {
        ok: false,
        error: {
          kind: "invalid_response",
          message: "Invalid Entra configuration",
        },
      };
    const body = new URLSearchParams({
      client_id: client.data,
      client_secret: this.config.secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });
    const result = await connectorFetch(
      `https://login.microsoftonline.com/${tenant.data}/oauth2/v2.0/token`,
      {
        method: "POST",
        body,
        signal,
        headers: { "content-type": "application/x-www-form-urlencoded" },
      },
      (value) =>
        z
          .object({ access_token: z.string(), expires_in: z.number() })
          .parse(value)
    );
    if (!result.ok) return result;
    this.token = {
      value: result.value.access_token,
      expiresAt: Date.now() + result.value.expires_in * 1000,
    };
    return { ok: true, value: this.token.value };
  }

  private async graph<T>(
    path: string,
    signal: AbortSignal,
    parse: (value: unknown) => T,
    init: RequestInit = {},
    read = true
  ): Promise<ConnectorResult<T>> {
    const token = await this.accessToken(signal);
    if (!token.ok) return token;
    return connectorFetch(
      `https://graph.microsoft.com/v1.0${path}`,
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
    value: string,
    signal: AbortSignal
  ): Promise<ConnectorResult<AccountStatus>> {
    const parsed = email.safeParse(value);
    if (!parsed.success)
      return {
        ok: false,
        error: { kind: "invalid_response", message: "Invalid email" },
      };
    const filter = encodeURIComponent(
      `mail eq '${escapeFilter(parsed.data)}' or userPrincipalName eq '${escapeFilter(parsed.data)}'`
    );
    const user = await this.graph(
      `/users?$filter=${filter}&$select=id,mail,userPrincipalName,accountEnabled,signInActivity,lastPasswordChangeDateTime`,
      signal,
      (raw) => z.object({ value: z.array(userSchema) }).parse(raw)
    );
    if (!user.ok) return user;
    const row = user.value.value[0];
    if (!row)
      return {
        ok: false,
        error: { kind: "not_found", message: "Directory user not found" },
      };
    const signIns = await this.graph(
      `/auditLogs/signIns?$filter=userId eq '${escapeFilter(row.id)}'&$top=5`,
      signal,
      (raw) =>
        z
          .object({
            value: z.array(
              z.object({
                createdDateTime: z.string(),
                status: z.object({ errorCode: z.number() }),
              })
            ),
          })
          .parse(raw)
    );
    const methods = await this.graph(
      `/users/${encodeURIComponent(row.id)}/authentication/methods`,
      signal,
      (raw) => z.object({ value: z.array(z.unknown()) }).parse(raw)
    );
    const groups = await this.graph(
      `/users/${encodeURIComponent(row.id)}/memberOf?$select=id`,
      signal,
      (raw) =>
        z.object({ value: z.array(z.object({ id: graphId })) }).parse(raw)
    );
    return {
      ok: true,
      value: {
        directoryUserId: row.id,
        primaryEmail: row.mail ?? row.userPrincipalName ?? parsed.data,
        enabled: row.accountEnabled !== false,
        suspended: false,
        passwordExpired: row.lastPasswordChangeDateTime ? false : null,
        lastSignInAt: row.signInActivity?.lastSignInDateTime ?? null,
        recentSignInErrors: signIns.ok
          ? signIns.value.value.map((item) => ({
              at: item.createdDateTime,
              code: String(item.status.errorCode),
            }))
          : [],
        mfaRegistered: methods.ok ? methods.value.value.length > 0 : null,
        groups: groups.ok ? groups.value.value.map((item) => item.id) : [],
      },
    };
  }

  async revokeSessions(directoryUserId: string, signal: AbortSignal) {
    return this.graph(
      `/users/${encodeURIComponent(graphId.parse(directoryUserId))}/revokeSignInSessions`,
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
    const user = graphId.parse(directoryUserId);
    const group = graphId.parse(groupId);
    const result = await this.graph(
      `/users/${encodeURIComponent(user)}/memberOf?$select=id`,
      signal,
      (raw) =>
        z.object({ value: z.array(z.object({ id: graphId })) }).parse(raw)
    );
    return result.ok
      ? {
          ok: true as const,
          value: result.value.value.some((entry) => entry.id === group),
        }
      : result;
  }

  async addToGroup(
    directoryUserId: string,
    groupId: string,
    signal: AbortSignal
  ) {
    const user = graphId.parse(directoryUserId);
    const group = graphId.parse(groupId);
    return this.graph(
      `/groups/${encodeURIComponent(group)}/members/$ref`,
      signal,
      () => ({ addedAt: new Date().toISOString() }),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${user}`,
        }),
      },
      false
    );
  }

  async removeFromGroup(
    directoryUserId: string,
    groupId: string,
    signal: AbortSignal
  ) {
    const user = graphId.parse(directoryUserId);
    const group = graphId.parse(groupId);
    return this.graph(
      `/groups/${encodeURIComponent(group)}/members/${encodeURIComponent(user)}/$ref`,
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
