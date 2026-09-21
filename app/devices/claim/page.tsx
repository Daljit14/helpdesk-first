import { notFound } from "next/navigation";
import { isDeviceAgentEnabled } from "@/lib/admin/flags";
import { DeviceClaimForm } from "@/components/device-claim-form";

export default function DeviceClaimPage() {
  if (!isDeviceAgentEnabled()) notFound();
  return (
    <section className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-3xl font-bold">Claim a device</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the short ID and code printed by the device agent.
      </p>
      <DeviceClaimForm />
    </section>
  );
}
