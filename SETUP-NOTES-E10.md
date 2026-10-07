# E10 — conversation quality

E10 adds opt-in structured requester replies, clearer hand-off summaries, and
a reply-quality benchmark. The style-v2 behavior is disabled by default:

- `HELP_DESK_AGENT_STYLE_V2_ENABLED=false` keeps the legacy reply path.
- Set it to `true` only for an explicitly reviewed pilot.
- The `## Reply quality` report compares v1/v2 grades and checks passed out of
  seven for each fixture, plus mean grades and total checks. It records the
  active `STYLE_RULES_VERSION`; run `npm run eval:autonomy` to regenerate it.

The unflagged research change adds a `reference` tier for Wikipedia and MDN.
Reference pages may explain concepts, but cannot support steps or actions.
Requester web search keeps the current all-family behavior even when
`HELP_DESK_RESEARCH_FAMILIES` is set to `identity,network`; that setting
continues to constrain the staff research path, while requester web search is
bounded by its existing per-session cap of three queries.

`supabase/research-reference-tier.sql` widens the research-source trust
constraint. It is authored but has **not** been applied to production; follow
the SQL run order in `docs/PRODUCTION-ROADMAP-STATUS.md` before rollout.

E10 changes reply presentation and research trust labeling only. It does not
change safety policy, action permissions, or execution gates. No production
SQL or hosted settings were changed.
