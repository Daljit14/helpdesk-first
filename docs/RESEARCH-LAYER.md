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
