import type { Metadata } from "next";
import { Suspense } from "react";
import { AiAssistant } from "@/components/ai-assistant";
import { AssistantWorkspace } from "@/components/v2/assistant-workspace";
import { getCurrentUser } from "@/lib/supabase/user";
import {
  isRequesterAgentEnabled,
  isRequesterAgentEnabledForOrg,
  isResolutionTrackingEnabled,
  isStepPolicyEnabled,
  isTicketWorkflowEnabled,
} from "@/lib/admin/flags";
import { isUiV2Enabled } from "@/lib/ui-v2";
import { AgentChat } from "@/components/v2/agent-chat";
import { resolveOrganizationForUser } from "@/lib/org/membership";
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

export function parseAssistantParams(params: SearchParams) {
  const initialProblem = first(params.q);
  const platformParam = first(params.platform);
  const initialPlatform = platforms.includes(platformParam as Platform)
    ? (platformParam as Platform)
    : null;
  const intent = first(params.intent);
  return {
    initialProblem,
    initialPlatform,
    intent,
    attach: first(params.attach) === "1",
    autoStart: Boolean(initialProblem) && intent === "solve",
  };
}

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const { initialProblem, initialPlatform, intent, attach, autoStart } =
    parseAssistantParams(params);
  const flags = {
    resolutionTrackingEnabled:
      isResolutionTrackingEnabled() || isTicketWorkflowEnabled(),
    workflowEnabled: isTicketWorkflowEnabled(),
    signedIn: Boolean(user),
    stepPolicyEnabled: isStepPolicyEnabled(),
  };
  const agentEnabled =
    isUiV2Enabled() &&
    Boolean(user) &&
    isRequesterAgentEnabled() &&
    isRequesterAgentEnabledForOrg(
      user ? (await resolveOrganizationForUser(user.id)).organizationId : ""
    );
  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-2xl">
            <p className="text-muted-foreground">Loading support assistant…</p>
          </div>
        }
      >
        {agentEnabled ? (
          <AgentChat
            initialProblem={initialProblem}
            initialPlatform={initialPlatform}
          />
        ) : isUiV2Enabled() ? (
          <AssistantWorkspace
            {...flags}
            initialProblem={initialProblem}
            initialPlatform={initialPlatform}
            intent={intent}
            attach={attach}
            autoStart={autoStart}
          />
        ) : (
          <AiAssistant {...flags} />
        )}
      </Suspense>
    </section>
  );
}
