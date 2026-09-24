import { describe, expect, test } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "device job reclaim idempotency",
  () => {
    test("reclaiming twice only changes rows once", async () => {
      const admin = createAdminClient();
      const first = await admin.rpc("reclaim_expired_device_jobs", {
        p_organization_id: null,
        p_device_id: null,
        p_actor: null,
      });
      expect(first.error).toBeNull();
      const second = await admin.rpc("reclaim_expired_device_jobs", {
        p_organization_id: null,
        p_device_id: null,
        p_actor: null,
      });
      expect(second.error).toBeNull();
      expect(second.data ?? []).toHaveLength(0);
    });
  }
);
