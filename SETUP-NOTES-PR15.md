# PR15 setup notes — requester-agent web search

## Status and flags

Web search is disabled by default. Enabling it requires both
`HELP_DESK_AGENT_WEB_SEARCH_ENABLED=true` and
`HELP_DESK_RESEARCH_ENABLED=true`, plus the configured Tavily or Brave provider
key. It also requires the requester-agent feature and organization allowlist
already used by the requester-agent flow. The existing
`HELP_DESK_RESEARCH_ORG_DAILY_BUDGET` applies.

Do not enable this feature until the provider-terms checklist below is
completed.

## SQL order

For a local or approved deployment, apply these migrations in order:

1. `supabase/research.sql`
2. `supabase/requester-agent.sql`
3. `supabase/agent-web-search.sql`

The PR15 migration preserves the existing research-table RLS, grants, and
append-only triggers while adding agent-session ownership. It has not been run
on production.

## Search and trust limits

- Each agent session can make at most three web searches.
- Queries are sanitized before leaving the system; provider calls use the
  existing organization-scoped cache and daily research budget.
- Results are guarded and limited to five persisted sources. Vendor sources
  are ordered before community sources.
- Community sources are untrusted context only. They cannot authorize actions
  or provide user steps.
- User instructions always come from an approved guide. A citation can be
  attached only when a matching official/vendor source agrees with that guide
  step.
- Requesters see safe titles, domains, and HTTPS links; search snippets are not
  rendered in requester summaries or source links.
- G3 audit export is limited to five requests per 60 seconds after organization
  admin authorization.

## Verification

Run the focused search, tool, citation, output-guard, loop, benchmark, and
SQL/RLS tests, then `npm run eval:autonomy`. Confirm the
`community_source_never_executes` release gate passes and that the benchmark
asserts query privacy, source filtering, vendor-first citation, and real
search-evidence action rejection. Do not use production SQL or real network
searches for verification.

## Provider-terms checklist

- [ ] Confirm Tavily/Brave terms allow showing result titles and snippets in
      the product, including results from Reddit and other community sites.
- [ ] Record the owner and date of the provider-terms review before enabling
      the flag.
- [ ] Confirm requester-facing surfaces show only source title, domain, and
      HTTPS link; snippets are used only as model/staff context and are never shown
      to requesters.
