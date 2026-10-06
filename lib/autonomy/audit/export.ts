import {
  AUDIT_CHAIN_TABLES,
  computeRowHash,
  type AuditChainTable,
} from "./chain";

type ExportRow = {
  type: "row";
  table: AuditChainTable;
  chain_seq: number;
  id: string;
  prev_hash: string | null;
  row_hash: string;
  payload: unknown;
};

type ExcludedRow = {
  type: "excluded";
  table: AuditChainTable;
  chain_seq: number;
  id: string;
  prev_hash: string | null;
  row_hash: string;
};

type VerifyRow = {
  type: "verify";
  table: AuditChainTable;
  from_seq: number | null;
  to_seq: number | null;
  head_hash: string | null;
  rows: number;
  excluded: number;
};

type AuditExportLine = ExportRow | ExcludedRow | VerifyRow;

export type ExportVerification = {
  ok: boolean;
  checked: number;
  firstBreak?: { table: string; id: string; reason: string };
};

function firstBreak(
  table: string,
  id: string,
  reason: string,
  checked: number
): ExportVerification {
  return { ok: false, checked, firstBreak: { table, id, reason } };
}

export function verifyExport(
  lines: string | readonly string[]
): ExportVerification {
  const parsedLines = (typeof lines === "string" ? lines.split(/\r?\n/) : lines)
    .map((line) => line.trim())
    .filter(Boolean);
  const records = new Map<
    AuditChainTable,
    {
      firstSeq: number | null;
      lastSeq: number | null;
      lastHash: string | null;
      rows: number;
      excluded: number;
    }
  >(
    AUDIT_CHAIN_TABLES.map(
      (table) =>
        [
          table,
          {
            firstSeq: null,
            lastSeq: null,
            lastHash: null,
            rows: 0,
            excluded: 0,
          },
        ] as const
    )
  );
  const verifyLines = new Map<AuditChainTable, VerifyRow>();
  let checked = 0;
  let sawVerify = false;

  for (const line of parsedLines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return firstBreak(
        "unknown",
        String(checked + 1),
        "invalid_json",
        checked
      );
    }
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return firstBreak(
        "unknown",
        String(checked + 1),
        "invalid_line",
        checked
      );
    }
    const item = parsed as Partial<AuditExportLine>;
    if (
      item.type === "verify" &&
      typeof item.table === "string" &&
      AUDIT_CHAIN_TABLES.includes(item.table as AuditChainTable)
    ) {
      sawVerify = true;
      const table = item.table as AuditChainTable;
      if (verifyLines.has(table)) {
        return firstBreak(table, "", "duplicate_verify", checked);
      }
      verifyLines.set(table, item as VerifyRow);
      continue;
    }
    if (
      (item.type !== "row" && item.type !== "excluded") ||
      typeof item.table !== "string" ||
      !AUDIT_CHAIN_TABLES.includes(item.table as AuditChainTable) ||
      typeof item.id !== "string" ||
      typeof item.chain_seq !== "number" ||
      !Number.isSafeInteger(item.chain_seq) ||
      typeof item.row_hash !== "string" ||
      !(item.prev_hash === null || typeof item.prev_hash === "string")
    ) {
      return firstBreak(
        "unknown",
        String(checked + 1),
        "invalid_line",
        checked
      );
    }
    if (sawVerify) {
      return firstBreak(item.table, item.id, "record_after_verify", checked);
    }

    const table = item.table as AuditChainTable;
    const state = records.get(table)!;
    checked += 1;
    if (state.lastSeq !== null) {
      if (item.chain_seq !== state.lastSeq + 1) {
        return firstBreak(table, item.id, "seq_gap", checked);
      }
      if (item.prev_hash !== state.lastHash) {
        return firstBreak(table, item.id, "prev_mismatch", checked);
      }
    }
    if (item.type === "row") {
      if (!("payload" in item)) {
        return firstBreak(table, item.id, "missing_payload", checked);
      }
      if (
        !item.payload ||
        typeof item.payload !== "object" ||
        Array.isArray(item.payload) ||
        (item.payload as Record<string, unknown>).id !== item.id ||
        (item.payload as Record<string, unknown>).chain_seq !== item.chain_seq
      ) {
        return firstBreak(table, item.id, "payload_mismatch", checked);
      }
      const expected = computeRowHash(item.prev_hash ?? null, item.payload);
      if (expected !== item.row_hash) {
        return firstBreak(table, item.id, "hash_mismatch", checked);
      }
      state.rows += 1;
    } else {
      if ("payload" in item) {
        return firstBreak(table, item.id, "excluded_payload", checked);
      }
      state.excluded += 1;
    }
    state.firstSeq ??= item.chain_seq;
    state.lastSeq = item.chain_seq;
    state.lastHash = item.row_hash;
  }

  for (const table of AUDIT_CHAIN_TABLES) {
    const state = records.get(table)!;
    const summary = verifyLines.get(table);
    if (!summary) return firstBreak(table, "", "missing_verify", checked);
    if (
      summary.from_seq !== state.firstSeq ||
      summary.to_seq !== state.lastSeq ||
      summary.head_hash !== state.lastHash ||
      summary.rows !== state.rows ||
      summary.excluded !== state.excluded
    ) {
      return firstBreak(table, "", "verify_mismatch", checked);
    }
  }
  return { ok: true, checked };
}
