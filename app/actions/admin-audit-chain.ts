"use server";

import { z } from "zod";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { getAdminSession } from "@/lib/admin/auth";
import { getExcludedRecordIds } from "@/lib/admin/record-exclusions";
import {
  AUDIT_CHAIN_TABLES,
  findAuditChainStartSeq,
  fetchAuditChainRows,
  type AuditChainTable,
  type AuditChainRow,
} from "@/lib/autonomy/audit/chain";
import { createAdminClient } from "@/lib/supabase/admin";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const inputSchema = z
  .object({ from: dateSchema, to: dateSchema })
  .strict()
  .refine(
    ({ from, to }) => from <= to,
    "The start date must not follow the end date."
  );
const exportLimiter = createRateLimiter(
  { windowMs: 60_000, maxRequests: 5 },
  "admin-audit-export"
);

type ExportLine =
  | {
      type: "row";
      table: AuditChainTable;
      chain_seq: number;
      id: string;
      prev_hash: string | null;
      row_hash: string;
      payload: unknown;
    }
  | {
      type: "excluded";
      table: AuditChainTable;
      chain_seq: number;
      id: string;
      prev_hash: string | null;
      row_hash: string;
    }
  | {
      type: "verify";
      table: AuditChainTable;
      from_seq: number | null;
      to_seq: number | null;
      head_hash: string | null;
      rows: number;
      excluded: number;
    };

function missingRpc(error: unknown): boolean {
  const value = (error && typeof error === "object" ? error : {}) as {
    code?: string;
    message?: string;
  };
  return (
    value.code === "PGRST202" ||
    value.code === "42883" ||
    (/audit_chain_rows/i.test(value.message ?? "") &&
      /does not exist|not found|schema cache/i.test(value.message ?? ""))
  );
}

export async function exportAuditChain(input: {
  from: string;
  to: string;
}): Promise<
  { ok: true; filename: string; content: string } | { ok: false; error: string }
> {
  const session = await getAdminSession();
  if (!session || session.role !== "org_admin") {
    return { ok: false, error: "Organization admin access required." };
  }
  if (!(await exportLimiter.check(session.userId)).allowed) {
    return {
      ok: false,
      error: "Too many audit exports. Try again in a minute.",
    };
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Choose a valid date range." };
  }
  const from = new Date(`${parsed.data.from}T00:00:00.000Z`);
  const toStart = new Date(`${parsed.data.to}T00:00:00.000Z`);
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(toStart.getTime()) ||
    from.toISOString().slice(0, 10) !== parsed.data.from ||
    toStart.toISOString().slice(0, 10) !== parsed.data.to
  ) {
    return { ok: false, error: "Choose a valid date range." };
  }
  const to = new Date(toStart);
  to.setUTCDate(to.getUTCDate() + 1);

  const admin = createAdminClient();
  try {
    const [excludedRuns, excludedTickets] = await Promise.all([
      getExcludedRecordIds(admin, session.organizationId, "resolution_runs"),
      getExcludedRecordIds(admin, session.organizationId, "tickets"),
    ]);
    const rowsByTable = new Map<AuditChainTable, AuditChainRow[]>();
    for (const table of AUDIT_CHAIN_TABLES) {
      const startSeq = await findAuditChainStartSeq(
        admin,
        session.organizationId,
        table,
        from
      );
      if (startSeq === null) {
        rowsByTable.set(table, []);
        continue;
      }
      const tail: AuditChainRow[] = [];
      let afterSeq = startSeq - 1;
      let endSeq: number | null = null;
      while (true) {
        const page = await fetchAuditChainRows(
          admin,
          session.organizationId,
          table,
          { afterSeq }
        );
        tail.push(...page);
        for (const row of page) {
          if (new Date(row.created_at).getTime() < to.getTime()) {
            endSeq = Math.max(endSeq ?? row.chain_seq, row.chain_seq);
          }
        }
        if (page.length < 500) break;
        afterSeq = page[page.length - 1].chain_seq;
      }
      rowsByTable.set(
        table,
        endSeq === null
          ? []
          : tail.filter(
              (row) => row.chain_seq >= startSeq && row.chain_seq <= endSeq!
            )
      );
    }

    const agentStepRows = rowsByTable.get("agent_steps") ?? [];
    const sessionIds = [
      ...new Set(
        agentStepRows
          .map((row) => (row.payload as { session_id?: unknown }).session_id)
          .filter((id): id is string => typeof id === "string")
      ),
    ];
    const excludedSessions = new Set<string>();
    for (let offset = 0; offset < sessionIds.length; offset += 200) {
      const sessions = await admin
        .from("agent_sessions")
        .select("id,backing_ticket_id,resolution_run_id")
        .eq("organization_id", session.organizationId)
        .in("id", sessionIds.slice(offset, offset + 200));
      if (sessions.error) throw sessions.error;
      for (const record of (sessions.data ?? []) as Array<{
        id: string;
        backing_ticket_id: string | null;
        resolution_run_id: string | null;
      }>) {
        if (
          (record.backing_ticket_id &&
            excludedTickets.has(record.backing_ticket_id)) ||
          (record.resolution_run_id &&
            excludedRuns.has(record.resolution_run_id))
        ) {
          excludedSessions.add(record.id);
        }
      }
    }

    const lines: ExportLine[] = [];
    const summaries: Extract<ExportLine, { type: "verify" }>[] = [];
    for (const table of AUDIT_CHAIN_TABLES) {
      const rows = rowsByTable.get(table) ?? [];
      const emitted: Array<Extract<ExportLine, { type: "row" | "excluded" }>> =
        [];
      for (const row of rows) {
        const payload = row.payload as Record<string, unknown>;
        const excluded =
          table === "resolution_events"
            ? (typeof payload.run_id === "string" &&
                excludedRuns.has(payload.run_id)) ||
              (typeof payload.ticket_id === "string" &&
                excludedTickets.has(payload.ticket_id))
            : table === "agent_steps" &&
              typeof payload.session_id === "string" &&
              excludedSessions.has(payload.session_id);
        emitted.push(
          excluded
            ? {
                type: "excluded",
                table,
                chain_seq: row.chain_seq,
                id: row.id,
                prev_hash: row.prev_hash,
                row_hash: row.row_hash,
              }
            : {
                type: "row",
                table,
                chain_seq: row.chain_seq,
                id: row.id,
                prev_hash: row.prev_hash,
                row_hash: row.row_hash,
                payload: row.payload,
              }
        );
      }
      lines.push(...emitted);
      const sequences = emitted.map((row) => row.chain_seq);
      summaries.push({
        type: "verify",
        table,
        from_seq: sequences[0] ?? null,
        to_seq: sequences.at(-1) ?? null,
        head_hash: emitted.at(-1)?.row_hash ?? null,
        rows: emitted.filter((row) => row.type === "row").length,
        excluded: emitted.filter((row) => row.type === "excluded").length,
      });
    }
    lines.push(...summaries);
    return {
      ok: true,
      filename: `audit-record-${parsed.data.from}-to-${parsed.data.to}.jsonl`,
      content: `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
    };
  } catch (error) {
    return {
      ok: false,
      error: missingRpc(error)
        ? "Audit chain SQL not applied yet."
        : "Audit chain export failed.",
    };
  }
}
