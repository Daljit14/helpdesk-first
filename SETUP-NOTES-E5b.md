# E5b — requester guide hold

E5b keeps guides with serious open problems away from requesters. It filters
the organization's approved guide list (`getApprovedSlugs`), which feeds ticket
triage and the requester agent.

## Flags

- `HELP_DESK_KNOWLEDGE_GUIDE_HOLD_MODE=off` (default). Needs
  `HELP_DESK_KNOWLEDGE_HEALTH_ENABLED=true`; any value other than exactly
  `watch` or `enforce` means off.
- `watch`: nothing is hidden. Each time a guide would be held, the server logs
  `{"event":"knowledge.guide_hold.watch","organizationId":…,"slugs":[…]}`.
- `enforce`: those guides are removed from the list and logged as
  `knowledge.guide_hold.enforce`.
- Recommended rollout: run `watch` for a week, compare the logged slugs with
  the Knowledge health panel, then switch to `enforce`.
- Do not change hosted or production flags as part of this code change.

## What gets held

An open (not acknowledged or dismissed) `knowledge_health_findings` row for the
guide in that organization with severity `critical` (for example expired, a
404/410 source, or very low success), or of kind `guide_reported_wrong`.
Acknowledging or dismissing the finding in `/admin/knowledge` releases the guide
on the next request.

## Safety

- Organization-scoped only. Calls without an organization (anonymous intake)
  are unchanged.
- If the findings lookup fails, nothing is hidden and
  `knowledge.guide_hold.error` is logged.
- No SQL. It uses the existing `knowledge_health_findings` table, which is
  already in production.
