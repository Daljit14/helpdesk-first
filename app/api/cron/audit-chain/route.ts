import { timingSafeEqual } from "node:crypto";
import {
  AUDIT_CHAIN_TABLES,
  verifyChain,
  type AuditChainTable,
} from "@/lib/autonomy/audit/chain";
import { alertSecurityEvent } from "@/lib/autonomy/alerts";
import { isAuditChainCheckEnabled } from "@/lib/admin/flags";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function matchesSecret(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  if (!matchesSecret(supplied, process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isAuditChainCheckEnabled()) {
    return Response.json(
      { skipped: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const admin = createAdminClient();
    const organizations: Array<{ id: string }> = [];
    let organizationOffset = 0;
    while (true) {
      const page = await admin
        .from("organizations")
        .select("id")
        .order("id")
        .range(organizationOffset, organizationOffset + 499);
      if (page.error) throw page.error;
      organizations.push(...((page.data ?? []) as Array<{ id: string }>));
      if ((page.data ?? []).length < 500) break;
      organizationOffset += 500;
    }

    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const results: Array<{
      organizationId: string;
      table: AuditChainTable;
      checked: number;
      break: { id: string; reason: string } | null;
      anchored: boolean;
    }> = [];
    for (const organization of organizations) {
      for (const table of AUDIT_CHAIN_TABLES) {
        const verification = await verifyChain(admin, organization.id, table, {
          since,
        });
        let firstBreak = verification.firstBreak
          ? {
              id: verification.firstBreak.id,
              reason: verification.firstBreak.reason,
            }
          : null;
        const latestAnchor = await admin
          .from("audit_chain_anchors")
          .select("chain_seq,row_hash")
          .eq("organization_id", organization.id)
          .eq("table_name", table)
          .order("checked_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestAnchor.error) throw latestAnchor.error;

        if (latestAnchor.data) {
          const anchoredRow = await admin
            .from(table)
            .select("chain_seq,row_hash")
            .eq("organization_id", organization.id)
            .eq("chain_seq", latestAnchor.data.chain_seq)
            .maybeSingle();
          if (anchoredRow.error) throw anchoredRow.error;
          if (
            !anchoredRow.data ||
            anchoredRow.data.row_hash !== latestAnchor.data.row_hash
          ) {
            firstBreak ??= {
              id: `chain_seq:${latestAnchor.data.chain_seq}`,
              reason: anchoredRow.data
                ? "anchor_hash_mismatch"
                : "anchor_missing",
            };
          }
        }

        if (firstBreak) {
          await alertSecurityEvent(admin, {
            organizationId: organization.id,
            ticketId: null,
            runId: null,
            kind: "audit_chain_broken",
            detail: {
              table,
              id: firstBreak.id,
              reason: firstBreak.reason,
            },
            dedupeKey: `audit-chain:${organization.id}:${table}:${firstBreak.id}:${firstBreak.reason}`,
          });
        }

        const head = await admin
          .from(table)
          .select("chain_seq,row_hash")
          .eq("organization_id", organization.id)
          .order("chain_seq", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (head.error) throw head.error;
        if (head.data) {
          const anchorInsert = await admin.from("audit_chain_anchors").insert({
            organization_id: organization.id,
            table_name: table,
            chain_seq: head.data.chain_seq,
            row_hash: head.data.row_hash,
          });
          if (anchorInsert.error) throw anchorInsert.error;
        }
        results.push({
          organizationId: organization.id,
          table,
          checked: verification.checked,
          break: firstBreak,
          anchored: Boolean(head.data),
        });
      }
    }
    return Response.json(
      { results },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("audit chain check failed", error);
    return Response.json(
      { error: "Audit chain check failed." },
      { status: 500 }
    );
  }
}
