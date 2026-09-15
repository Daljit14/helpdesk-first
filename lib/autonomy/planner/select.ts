import { DeterministicPlanner } from "./deterministic-planner";
import { ModelPlanner, type JsonGenerator } from "./model-planner";
import { isProviderDisabledByEnv } from "../config";
import type { Planner } from "./types";

let registeredGenerator: JsonGenerator | null = null;

export function registerPlannerJsonGenerator(
  generator: JsonGenerator | null
): void {
  registeredGenerator = generator;
}

export function selectPlanner(env: NodeJS.ProcessEnv = process.env): Planner {
  if (
    env.HELP_DESK_PLANNER_PROVIDER === "model" &&
    registeredGenerator &&
    !isProviderDisabledByEnv("model")
  ) {
    return new ModelPlanner(registeredGenerator);
  }
  return new DeterministicPlanner();
}
