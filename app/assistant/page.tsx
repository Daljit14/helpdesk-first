import type { Metadata } from "next";
import { Suspense } from "react";
import { AiAssistant } from "@/components/ai-assistant";
import { getCurrentUser } from "@/lib/supabase/user";
import { isResolutionTrackingEnabled } from "@/lib/admin/flags";

export const metadata: Metadata = {
  title: "Ask the Support Assistant · HelpDesk First",
  description:
    "Describe your IT problem conversationally and the HelpDesk First support assistant will match you to an approved Level-1 troubleshooting guide.",
};

export default async function AssistantPage() {
  const user = await getCurrentUser();
  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-2xl">
            <p className="text-muted-foreground">Loading support assistant…</p>
          </div>
        }
      >
        <AiAssistant
          resolutionTrackingEnabled={isResolutionTrackingEnabled()}
          signedIn={Boolean(user)}
        />
      </Suspense>
    </section>
  );
}
