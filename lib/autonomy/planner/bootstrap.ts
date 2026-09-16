import { createAnthropicJsonGenerator } from "@/lib/ai/anthropic-json";
import { registerPlannerJsonGenerator } from "./select";

let registered = false;
export function ensurePlannerRegistered(): void {
  if (registered) return;
  registered = true;
  registerPlannerJsonGenerator(createAnthropicJsonGenerator());
}
