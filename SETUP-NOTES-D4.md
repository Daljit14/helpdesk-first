# D4 setup notes: model routing, prompt caching, and cost controls

D4 is implemented behind default-off flags. Keep model routing disabled until
the live comparison promotion rule below is satisfied. The migration
`supabase/model-routing.sql` is required before enabling cost tracking; it has
not been applied to any database.

## Configuration

| Variable                                | Default | Purpose                                                                                                                                                                 |
| --------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HELP_DESK_AGENT_MODEL_ROUTING_ENABLED` | `false` | Enables planner routing when a trigger is present and a planner model is configured.                                                                                    |
| `HELP_DESK_AGENT_PLANNER_MODEL`         | empty   | Anthropic planner model ID. There is no code default; set this explicitly to select a planner.                                                                          |
| `HELP_DESK_AGENT_PROMPT_CACHE_ENABLED`  | `false` | Adds Anthropic's top-level ephemeral prompt-cache breakpoint to requester-agent Messages requests.                                                                      |
| `HELP_DESK_AGENT_COST_TRACKING_ENABLED` | `false` | Records requester-agent token/cost usage, activates the existing per-session token budget, and checks the organization cost cap. Requires `supabase/model-routing.sql`. |
| `HELP_DESK_AI_ORG_DAILY_COST_CAP_USD`   | `10`    | Environment-wide daily cap applied independently to each organization. Set to `0` to disable the cap.                                                                   |

Review `HELP_DESK_REQUESTER_AGENT_MAX_TOKENS_PER_SESSION` before enabling cost
tracking. The existing per-session token budget becomes active as model usage
is counted.

## Routing

When routing is enabled, a configured planner is selected if at least one of
these signals is present:

- Two or more independent evidence entries have been collected.
- Verification failed and the agent is re-entering for another hypothesis.
- A screenshot was attached to the request.

Guide-search results are excluded from the evidence count. The repository does
not maintain a separate hypothesis list, so independent evidence sources are a
proxy for the “multiple hypotheses” routing trigger. When routing is disabled,
the same reasons are computed, but every model call uses `HELP_DESK_AI_MODEL`.
Routing changes only the model ID; system prompts, tools, token limits, and
post-processing remain identical across tiers.

## Prompt caching

With prompt caching enabled, requests include an ephemeral cache breakpoint.
Anthropic only caches prompts that meet the model-specific minimum length;
shorter prompts are processed normally without an error. The default Haiku 4.5
model requires at least 4,096 tokens, so current requester-agent prompts are
unlikely to trigger caching. Sonnet 4.5, 4.6, and 5 require at least 1,024
tokens.

## Pricing and accounting

The current pricing table is in dollars per million tokens (numerically equal
to micro-USD per token):

| Model family            | Input | 5-minute cache write | Cache read | Output |
| ----------------------- | ----: | -------------------: | ---------: | -----: |
| Haiku 4.5               |     1 |                 1.25 |       0.10 |      5 |
| Sonnet 4.5 and 4.6      |     3 |                 3.75 |       0.30 |     15 |
| Sonnet 5                |     2 |                 2.50 |       0.20 |     10 |
| Opus 4.5–4.8 and Opus 5 |     5 |                 6.25 |       0.50 |     25 |

Unknown model IDs use the conservative fallback `{ input: 10, cacheWrite:
12.5, cacheRead: 1, output: 50 }`. Each model response contributes its input,
output, cache-write, and cache-read tokens and estimated micro-USD cost to the
session and `ai_provider_calls`.

The configured cap is applied separately per organization. Session cost is
accounted by the UTC calendar day containing the session's `started_at`
timestamp. Before each model call, the agent checks the organization's spend
through `agent_org_cost_today`; a spent amount at or above the cap blocks the
call and escalates the session. The check fails closed when the RPC errors,
throws, or returns a non-number. The RPC is service-role-only.

## Promotion and rollback

Keep `HELP_DESK_AGENT_MODEL_ROUTING_ENABLED=false` until a live comparison
report under `docs/eval` shows the planner performs at least as well as Haiku
with zero safety regressions. That comparison report is produced separately.

### Live comparison

TODO: Add the live comparison report link and results before enabling routing.

To roll back the database helper, drop
`public.agent_org_cost_today(uuid)`. The added columns may remain. Do not apply
the SQL migration until the owner explicitly approves its application.
