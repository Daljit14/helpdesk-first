import type { Metadata } from "next";
import { Suspense } from "react";
import { AiAssistant } from "@/components/ai-assistant";
import { AssistantWorkspace } from "@/components/v2/assistant-workspace";
import { getCurrentUser } from "@/lib/supabase/user";
import {
  isResolutionTrackingEnabled,
  isStepPolicyEnabled,
  isTicketWorkflowEnabled,
} from "@/lib/admin/flags";
import { isUiV2Enabled } from "@/lib/ui-v2";
import { platforms, type Platform } from "@/lib/helpdesk-data";

export const metadata: Metadata = {
  title: "Ask the Support Assistant · HelpDesk First",
  description:
    "Describe your IT problem conversationally and the HelpDesk First support assistant will match you to an approved Level-1 troubleshooting guide.",
};

type SearchParams = {
  [key: string]: string | string[] | undefined;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const initialProblem = first(params.q);
  const platformParam = first(params.platform);
  const initialPlatform = platforms.includes(platformParam as Platform)
    ? (platformParam as Platform)
    : null;
  const intent = first(params.intent);
  const attach = first(params.attach) === "1";
  const flags = {
    resolutionTrackingEnabled:
      isResolutionTrackingEnabled() || isTicketWorkflowEnabled(),
    workflowEnabled: isTicketWorkflowEnabled(),
    signedIn: Boolean(user),
    stepPolicyEnabled: isStepPolicyEnabled(),
  };
  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-2xl">
            <p className="text-muted-foreground">Loading support assistant…</p>
          </div>
        }
      >
        {isUiV2Enabled() ? (
          <AssistantWorkspace
            {...flags}
            initialProblem={initialProblem}
            initialPlatform={initialPlatform}
            intent={intent}
            attach={attach}
            autoStart={Boolean(initialProblem) && intent === "solve"}
          />
        ) : (
          <AiAssistant {...flags} />
        )}
      </Suspense>
    </section>
  );
}
