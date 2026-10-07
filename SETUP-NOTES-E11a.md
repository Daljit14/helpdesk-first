# E11a — answer-engine backend

E11a adds a default-off, citation-enforced answer-engine backend. It searches
configured Brave/Tavily providers, Wikimedia, and accepted Stack Exchange
answers; optionally fetches allowed source pages; screens untrusted text; and
returns only source-backed, safe answer items. It is not connected to
AgentChat, AssistantWorkspace, agent tools, or a feedback route. Those belong
to E11b. It adds no community-tip or “Did this help?” UI.

## Flags and configuration

All feature flags default to `false`:

- `HELP_DESK_ANSWER_ENGINE_ENABLED` enables the backend.
- `HELP_DESK_ANSWER_ENGINE_PUBLIC_ENABLED` separately permits public calls.
- `HELP_DESK_SOURCE_WIKIPEDIA_ENABLED` and
  `HELP_DESK_SOURCE_STACKEXCHANGE_ENABLED` enable those providers.
- `HELP_DESK_PAGE_FETCH_ENABLED` enables optional page fetching.

Provider order and bounds are configured with
`HELP_DESK_ANSWER_ENGINE_WEB_PROVIDERS`,
`HELP_DESK_ANSWER_ENGINE_PROVIDER_TIMEOUT_MS`,
`HELP_DESK_ANSWER_ENGINE_DEADLINE_MS`,
`HELP_DESK_ANSWER_ENGINE_GLOBAL_DAILY_CAP`,
`HELP_DESK_ANSWER_ENGINE_MIN_CONFIDENCE`, and
`HELP_DESK_ANSWER_ENGINE_CACHE_TTL_HOURS`. Stack Exchange uses optional
`STACKEXCHANGE_KEY` and `HELP_DESK_STACKEXCHANGE_SITES` (at most three sites).
Set `HELP_DESK_ANSWER_ENGINE_CONTACT` to a monitored contact URL for the
Wikimedia User-Agent. No `HELP_DESK_COMMUNITY_TIPS_ENABLED` flag is introduced.

## Schema and budget

Review and apply `supabase/answer-engine.sql` only after the prerequisite
organization, ticket, requester-agent, research, and staff-membership schemas.
The migration is authored but **has not been applied**. It enables RLS,
restricts source-cache and usage access to `service_role`, limits answer-cache
reads to staff in the owning organization, and makes run and feedback rows
append-only. Its rollback statements are included at the end of the file.

Before each uncached paid Brave/Tavily attempt, the backend reserves one unit
through `answer_engine_consume_budget`. Each failover attempt costs one unit.
The organization limit is shared with uncached staff `research_queries`;
the global cap applies across organizations. Reservation errors and exhausted
limits fail closed for paid web providers. Wikipedia and Stack Exchange are
not paid web attempts and remain available when the paid budget is exhausted.
The source cache is keyed by provider and SHA-256 query/URL, and the answer
cache stores only the answer and public source projections, never source text.

## Fetch safety and source handling

Page fetching is opt-in, restricted to fetchable trusted tiers, and checks
`robots.txt` before each host. Robots rules are cached for 24 hours; a robots
failure or 5xx blocks the page request. Redirects are limited to two and each
destination is revalidated. Response bodies are capped at 1 MiB and page
requests time out after 5 seconds. Only HTML/plain text is extracted; scripts,
navigation, and other non-content elements are removed. Instruction-shaped
paragraphs are withheld from synthesis.

Reddit is never queried through its API and is never fetched directly. Search
results that point to Reddit may be identified as community sources but are
not page-fetched. The URL checks reject IP literals and local/internal hosts,
but they do not pin DNS answers to public IPs. This leaves a DNS-rebinding
limitation; do not enable page fetching for public traffic until a
DNS-pinning/egress-control review is complete.

## Provider terms and attribution review

Review each provider's current terms before enabling its flag. The
“Reviewed by” and “Date” fields intentionally remain blank for the rollout
owner to complete.

| Provider              | Official terms / docs and usage notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Reviewed by                                                                                                          | Date |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---- |
| Brave Search API      | [API documentation](https://api-dashboard.search.brave.com/documentation) and [Search API Terms of Use](https://api-dashboard.search.brave.com/app/documentation/general/terms-of-service). Requires an API subscription/key; check that the selected plan permits the configured result-cache retention.                                                                                                                                                                                                                                                                                    |                                                                                                                      |      |
| Tavily                | [Search endpoint](https://docs.tavily.com/documentation/api-reference/endpoint/search), [Terms](https://www.tavily.com/terms), and [Acceptable Use Policy](https://www.tavily.com/acceptable-use-policy). Requires an API key; review plan limits and data-retention terms.                                                                                                                                                                                                                                                                                                                  |                                                                                                                      |      |
| Wikimedia / Wikipedia | [MediaWiki search](https://www.mediawiki.org/wiki/API:Search), [query extracts](https://www.mediawiki.org/wiki/API:Query), [User-Agent policy](https://www.mediawiki.org/wiki/API:Etiquette), and [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Uses `generator=search`, `gsrsearch`, `prop=extracts                                                                                                                                                                                                                                                                      | info`, and `explaintext=1`; requests identify the application and contact, and displayed extracts carry attribution. |      |     |
| Stack Exchange        | [Advanced search](https://api.stackexchange.com/docs/advanced-search), [answers by ID](https://api.stackexchange.com/docs/answers-by-ids), [API authentication and keys](https://stackapps.com/help/api-authentication), [API terms](https://stackoverflow.com/legal/api-terms-of-use), and [attribution guidance](https://stackoverflow.com/help/licensing). `accepted=true` limits search to questions with accepted answers; answer bodies use `filter=withbody`; without `STACKEXCHANGE_KEY` the provider is skipped. Returned answers include author/site attribution and CC BY-SA 4.0. |                                                                                                                      |      |
| Reddit                | [Data API terms](https://www.redditinc.com/policies/data-api-terms). No Reddit API and no direct Reddit page fetch are used.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |                                                                                                                      |      |
| Google Custom Search  | [Custom Search JSON API overview](https://developers.google.com/custom-search/v1/overview). Not used; Google has closed onboarding to new customers and states the service is scheduled to shut down on January 1, 2027.                                                                                                                                                                                                                                                                                                                                                                     |                                                                                                                      |      |
