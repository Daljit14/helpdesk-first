import { createAdminClient } from "@/lib/supabase/admin";
import {
  decryptJson,
  decryptText,
  encryptJson,
  encryptText,
} from "@/lib/security/field-crypto";

type Admin = ReturnType<typeof createAdminClient>;

export async function decryptTicketRow<
  T extends {
    organization_id: string | null;
    message: string | null;
  },
>(admin: Admin, row: T): Promise<T> {
  return {
    ...row,
    message: row.organization_id
      ? await decryptText(
          admin,
          row.organization_id,
          {
            table: "tickets",
            column: "message",
          },
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
        ? await decryptText(
            admin,
            row.organization_id,
            {
              table: "ticket_comments",
              column: "message",
            },
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
    decryptJson(
      admin,
      row.organization_id,
      {
        table: "ticket_investigations",
        column: "evidence",
      },
      row.evidence
    ),
    decryptJson(
      admin,
      row.organization_id,
      {
        table: "ticket_investigations",
        column: "escalation_package",
      },
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
      ? await decryptText(
          admin,
          row.organization_id,
          {
            table: "ticket_attachments",
            column: "scan_detail",
          },
          row.scan_detail
        )
      : row.scan_detail,
  };
}

export async function encryptTicketForWrite(
  admin: Admin,
  organizationId: string,
  message: string
): Promise<string> {
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
  organizationId: string,
  message: string
): Promise<string> {
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
