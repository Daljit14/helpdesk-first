import { describe, expect, test } from "vitest";
import { listCapabilities } from "@/lib/autonomy/capabilities/registry";
import { DEVICE_ACTIONS } from "@/lib/device-agent/catalog";
import { isDenylisted } from "./denylist";

describe("requester agent denylist", () => {
  test("keeps password reset and read-only catalog entries allowed", () => {
    expect(isDenylisted("send_password_reset_link")).toBe(false);
    expect(
      isDenylisted("send_password_reset_link", {
        rollback: "none",
        sideEffects: "external_write",
      })
    ).toBe(false);
    expect(isDenylisted("verify_group_access")).toBe(false);
    expect(
      listCapabilities()
        .filter((capability) => isDenylisted(capability.id))
        .map((capability) => capability.id)
    ).toEqual(["grant_group_access"]);
    expect(
      DEVICE_ACTIONS.filter((action) => isDenylisted(action.id)).map(
        (action) => action.id
      )
    ).toEqual([]);
  });

  test("denies required unsafe capability concepts", () => {
    for (const id of [
      "account_unlock",
      "mfa_reset",
      "mfa_enrollment",
      "recovery_method_change",
      "grant_group_access",
      "admin_role_change",
      "security_disable",
      "realtime_off",
      "firewall_off",
      "vpn_bypass",
      "edr_remove",
      "defender_disable",
      "delete_user",
      "software_install",
      "display_reset",
    ])
      expect(isDenylisted(id), id).toBe(true);
  });
});
