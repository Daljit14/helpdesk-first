# External research grounding

The external research layer is an optional, disabled-by-default aid for low-confidence
identity and network investigations. It searches provider documentation and community
pages using deterministic queries that contain only category, platform, hypotheses, and
guide titles.

Search results are untrusted input. URLs are restricted to HTTPS, vendor trust is
assigned only to exact allowlisted domains or their subdomains, and snippets are
sanitized for prompt injection and executable content before they are persisted or
shown to staff. Research can adjust evidence confidence and require consent when it
contradicts the leading hypothesis; it cannot create a plan step, capability,
parameter, instruction, or approval.

Providers are selected with `HELP_DESK_RESEARCH_PROVIDER` (`tavily` or `brave`).
Enable the feature with `HELP_DESK_RESEARCH_ENABLED=true`, configure the matching
provider key, and explicitly select families with
`HELP_DESK_RESEARCH_FAMILIES=identity,network`. Organization budgets count uncached
queries, while organization-scoped cache entries expire according to
`HELP_DESK_RESEARCH_CACHE_TTL_HOURS`. Provider and judge failures skip research and
leave the autonomy run on its existing fail-safe path.

## Org-approved vendor domains

Organizations can approve up to 25 exact vendor documentation domains with
`HELP_DESK_ORG_VENDOR_DOMAINS_ENABLED=true`; the flag defaults to false and the
additive `supabase/org-research-vendor-domains.sql` migration must be applied
first. Stored rows are revalidated before use, including HTTPS-only URL parsing,
IP, wildcard, public-suffix, blocked-host, and fixed-official-domain checks.
Organization-specific trust is assigned after cached provider output is read,
so changes to an organization's list take effect on cache hits without storing
tenant-specific trust in `research_cache`. These sources remain citations only:
they do not authorize actions, and user steps must still come from approved
guide content.

## Requester-agent web search

PR15 adds a separately gated requester-agent search tool. It requires both
`HELP_DESK_AGENT_WEB_SEARCH_ENABLED=true` and
`HELP_DESK_RESEARCH_ENABLED=true`, plus a configured provider. Searches reuse
the research cache and organization budget, are capped at three per agent
session, and persist sources with session ownership. Queries are sanitized
before provider calls. Vendor sources are ordered first and may be cited only
when they agree with an approved guide step; community sources are untrusted
context and cannot authorize actions or user steps. Requesters see safe source
titles, domains, and HTTPS links, never snippets. The feature remains off by
default; see `SETUP-NOTES-PR15.md`.
