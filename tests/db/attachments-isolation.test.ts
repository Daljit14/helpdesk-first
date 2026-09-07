import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    }
  } catch {
    // The database test is skipped when local credentials are unavailable.
  }
}

loadLocalEnv();

const canRun = Boolean(
  process.env.RUN_ATTACHMENTS_ISOLATION_TEST === "true" &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

describe.skipIf(!canRun)("secure attachment isolation", () => {
  test("keeps attachment rows and storage private", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const organizationId = randomUUID();
    const email = `attachment-${randomUUID()}@example.invalid`;
    const password = `${randomUUID()}-Aa1!`;
    let userId: string | null = null;
    let attachmentId: string | null = null;
    let ticketId: string | null = null;
    const quarantinePath = `service-test/${randomUUID()}.png`;
    const privatePath = `service-test/${randomUUID()}.png`;
    try {
      expect(
        (
          await service
            .from("organizations")
            .insert({ id: organizationId, name: "Attachment isolation test" })
        ).error
      ).toBeNull();
      const created = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      expect(created.error).toBeNull();
      userId = created.data.user?.id ?? null;
      expect(userId).toBeTruthy();
      const ticket = await service
        .from("tickets")
        .insert({
          organization_id: organizationId,
          user_id: userId,
          issue_id: "attachment-test",
          issue_title: "Attachment isolation",
          message: "Attachment isolation test",
        })
        .select("id")
        .single();
      expect(ticket.error).toBeNull();
      ticketId = ticket.data?.id ?? null;
      expect(ticketId).toBeTruthy();
      const inserted = await service
        .from("ticket_attachments")
        .insert({
          organization_id: organizationId,
          ticket_id: ticketId,
          uploader_id: userId,
          status: "ready",
          original_name: "test.png",
          declared_mime: "image/png",
          detected_mime: "image/png",
          byte_size: 8,
          storage_path: privatePath,
        })
        .select("id")
        .single();
      expect(inserted.error).toBeNull();
      attachmentId = inserted.data?.id ?? null;
      expect(attachmentId).toBeTruthy();
      expect(
        (
          await service.storage
            .from("ticket-attachments-quarantine")
            .upload(quarantinePath, new Uint8Array([1, 2, 3]), {
              contentType: "image/png",
            })
        ).error
      ).toBeNull();
      expect(
        (
          await service.storage
            .from("ticket-attachments-private")
            .upload(privatePath, new Uint8Array([1, 2, 3]), {
              contentType: "image/png",
            })
        ).error
      ).toBeNull();
      const signIn = await anon.auth.signInWithPassword({ email, password });
      expect(signIn.error).toBeNull();
      const foreign = await anon
        .from("ticket_attachments")
        .select("id")
        .eq("id", attachmentId);
      expect(foreign.error).toBeNull();
      expect(foreign.data).toHaveLength(1);
      const quarantineRead = await anon.storage
        .from("ticket-attachments-quarantine")
        .download(quarantinePath);
      expect(quarantineRead.error).toBeTruthy();
      const privateRead = await anon.storage
        .from("ticket-attachments-private")
        .download(privatePath);
      expect(privateRead.error).toBeTruthy();
      const event = await service
        .from("attachment_events")
        .insert({
          attachment_id: attachmentId,
          organization_id: organizationId,
          actor_type: "system",
          event_type: "uploaded",
        })
        .select("id")
        .single();
      expect(event.error).toBeNull();
      const immutable = await service
        .from("attachment_events")
        .update({ detail: { changed: true } })
        .eq("id", event.data?.id);
      expect(immutable.error).toBeTruthy();
    } finally {
      await anon.auth.signOut();
      await service.storage
        .from("ticket-attachments-quarantine")
        .remove([quarantinePath]);
      await service.storage
        .from("ticket-attachments-private")
        .remove([privatePath]);
      if (attachmentId)
        await service
          .from("ticket_attachments")
          .delete()
          .eq("id", attachmentId);
      if (ticketId) await service.from("tickets").delete().eq("id", ticketId);
      if (userId) await service.auth.admin.deleteUser(userId);
      await service.from("organizations").delete().eq("id", organizationId);
    }
  }, 30_000);
});
