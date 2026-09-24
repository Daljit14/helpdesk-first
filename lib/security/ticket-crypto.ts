import { createAdminClient } from "@/lib/supabase/admin";
import { isOrgEncryptionEnabled } from "@/lib/security/data-protection-config";
import {
  DataProtectionError,
  decryptJson,
  decryptText,
  encryptJson,
  encryptText,
} from "@/lib/security/field-crypto";

type Admin = ReturnType<typeof createAdminClient>;
export { DataProtectionError };
const ENCRYPTED_KEY_UNAVAILABLE = "[encrypted — key unavailable]";

function isDecryptFailure(error: unknown): error is DataProtectionError {
  return (
    error instanceof DataProtectionError && error.code === "decrypt_failed"
  );
}

function reportDecryptFailure(table: string, column: string): void {
  console.error("data-protection decrypt_failed", { table, column });
}

async function decryptTextForRead(
  admin: Admin,
  organizationId: string,
  table:
    | "tickets"
    | "ticket_comments"
    | "ticket_attachments"
    | "agent_sessions"
    | "agent_steps",
  column: string,
  stored: string | null
): Promise<string | null> {
  try {
    return await decryptText(admin, organizationId, { table, column }, stored);
  } catch (error) {
    if (!isDecryptFailure(error)) throw error;
    reportDecryptFailure(table, column);
    return ENCRYPTED_KEY_UNAVAILABLE;
  }
}

export async function encryptAgentTextForWrite(
  admin: Admin,
  organizationId: string,
  table: "agent_sessions" | "agent_steps",
  column: string,
  text: string
): Promise<string> {
  return encryptText(admin, organizationId, { table, column }, text);
}

export async function decryptAgentText(
  admin: Admin,
  organizationId: string,
  table: "agent_sessions" | "agent_steps",
  column: string,
  stored: string | null
): Promise<string | null> {
  return decryptTextForRead(admin, organizationId, table, column, stored);
}

async function decryptJsonForRead(
  admin: Admin,
  organizationId: string,
  table: "ticket_investigations",
  column: string,
  stored: unknown
): Promise<unknown> {
  try {
    return await decryptJson(admin, organizationId, { table, column }, stored);
  } catch (error) {
    if (!isDecryptFailure(error)) throw error;
    reportDecryptFailure(table, column);
    return null;
  }
}

export async function decryptTicketRow<
  T extends {
    organization_id: string | null;
    message: string | null;
  },
>(admin: Admin, row: T): Promise<T> {
  return {
    ...row,
    message: row.organization_id
      ? await decryptTextForRead(
          admin,
          row.organization_id,
          "tickets",
          "message",
          row.message
        )
      : row.message,
  };
}

export async function decryptCommentRows<
  T extends {
    organization_id: string | null;
    message: string | null;
  },
>(admin: Admin, rows: T[]): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      message: row.organization_id
        ? await decryptTextForRead(
            admin,
            row.organization_id,
            "ticket_comments",
            "message",
            row.message
          )
        : row.message,
    }))
  );
}

export async function decryptInvestigationRow<
  T extends {
    organization_id: string | null;
    evidence?: unknown;
    escalation_package?: unknown;
  },
>(admin: Admin, row: T): Promise<T> {
  if (!row.organization_id) return row;
  const [evidence, escalationPackage] = await Promise.all([
    decryptJsonForRead(
      admin,
      row.organization_id,
      "ticket_investigations",
      "evidence",
      row.evidence
    ),
    decryptJsonForRead(
      admin,
      row.organization_id,
      "ticket_investigations",
      "escalation_package",
      row.escalation_package
    ),
  ]);
  return { ...row, evidence, escalation_package: escalationPackage } as T;
}

export async function decryptAttachmentRow<
  T extends {
    organization_id: string | null;
    scan_detail: string | null;
  },
>(admin: Admin, row: T): Promise<T> {
  return {
    ...row,
    scan_detail: row.organization_id
      ? await decryptTextForRead(
          admin,
          row.organization_id,
          "ticket_attachments",
          "scan_detail",
          row.scan_detail
        )
      : row.scan_detail,
  };
}

export async function encryptTicketForWrite(
  admin: Admin,
  organizationId: string | null,
  message: string
): Promise<string> {
  if (!organizationId) {
    if (!isOrgEncryptionEnabled()) return message;
    throw new DataProtectionError("organization_missing");
  }
  return encryptText(
    admin,
    organizationId,
    {
      table: "tickets",
      column: "message",
    },
    message
  );
}

export async function encryptCommentForWrite(
  admin: Admin,
  organizationId: string | null,
  message: string
): Promise<string> {
  if (!organizationId) {
    if (!isOrgEncryptionEnabled()) return message;
    throw new DataProtectionError("organization_missing");
  }
  return encryptText(
    admin,
    organizationId,
    {
      table: "ticket_comments",
      column: "message",
    },
    message
  );
}

export async function encryptInvestigationForWrite(
  admin: Admin,
  organizationId: string,
  values: { evidence?: unknown; escalation_package?: unknown }
): Promise<{ evidence?: unknown; escalation_package?: unknown }> {
  const result: { evidence?: unknown; escalation_package?: unknown } = {};
  if ("evidence" in values) {
    result.evidence = await encryptJson(
      admin,
      organizationId,
      { table: "ticket_investigations", column: "evidence" },
      values.evidence
    );
  }
  if ("escalation_package" in values) {
    result.escalation_package = await encryptJson(
      admin,
      organizationId,
      { table: "ticket_investigations", column: "escalation_package" },
      values.escalation_package
    );
  }
  return result;
}

export async function encryptAttachmentScanDetail(
  admin: Admin,
  organizationId: string,
  detail: string | null
): Promise<string | null> {
  return detail === null
    ? null
    : encryptText(
        admin,
        organizationId,
        {
          table: "ticket_attachments",
          column: "scan_detail",
        },
        detail
      );
}
