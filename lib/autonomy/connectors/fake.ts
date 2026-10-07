import type {
  AccountStatus,
  DirectoryRiskFacts,
  DirectoryProvider,
  IdentityDirectory,
} from "./types";

const unknownRiskFacts: DirectoryRiskFacts = {
  privileged: null,
  mfaChangedAt: null,
  signIns: [],
  directoryPhone: null,
  managerName: null,
};

export class FakeDirectory implements IdentityDirectory {
  readonly provider: DirectoryProvider;
  writeCalls = 0;
  constructor(
    private readonly account: AccountStatus,
    provider: DirectoryProvider = "google",
    private readonly riskFacts: DirectoryRiskFacts = unknownRiskFacts
  ) {
    this.provider = provider;
  }
  async lookupUserByEmail() {
    return { ok: true as const, value: this.account };
  }
  async getUserById() {
    return { ok: true as const, value: this.account };
  }
  async getRiskFacts(_directoryUserId: string, _signal: AbortSignal) {
    void _directoryUserId;
    void _signal;
    return { ok: true as const, value: this.riskFacts };
  }
  async revokeSessions() {
    this.writeCalls += 1;
    return {
      ok: true as const,
      value: { revokedAt: new Date().toISOString() },
    };
  }
  async isMemberOfGroup(_userId: string, groupId: string) {
    return { ok: true as const, value: this.account.groups.includes(groupId) };
  }
  async addToGroup(_userId: string, groupId: string) {
    this.writeCalls += 1;
    this.account.groups.push(groupId);
    return { ok: true as const, value: { addedAt: new Date().toISOString() } };
  }
  async removeFromGroup(_userId: string, groupId: string) {
    this.writeCalls += 1;
    this.account.groups.splice(this.account.groups.indexOf(groupId), 1);
    return {
      ok: true as const,
      value: { removedAt: new Date().toISOString() },
    };
  }
  async health() {
    return { ok: true as const, value: { tokenAcquired: true, latencyMs: 1 } };
  }
}
