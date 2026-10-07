# Autonomy metrics

Metrics are loaded for one organization at a time. `METRICS_DEFINITION_VERSION`
is `2`; the existing v1 fields remain available and unchanged for one release
while consumers move to v2.

## Window and exclusions

The requested window is based on session `started_at`, inclusive of `from` and
`to`. The v2 pending boundary and all repeat/reopen windows use `now` equal to
the requested window's `to`, not the current wall clock.

Sessions with status `active`, an invalid start time, a start outside the
window, or an excluded backing or escalation ticket are not included. The
loader also applies organization-scoped `record_exclusions` to session tickets,
report-ticket candidates, and investigation turns. A report ticket that is
excluded, or is the session's backing or escalation ticket, cannot make an
issue a repeat.

## Metrics v1

V1 is preserved for comparison:

- `sessions` is the count of eligible non-active sessions in the window.
- `aiResolved` counts sessions with status `resolved` and no staff touch on
  the backing ticket. A staff touch is an employee system event or an action
  with a non-null `agentId`.
- `aiResolutionRate` is `aiResolved / sessions`, or zero for an empty window.
- `falseResolved` counts v1 AI-resolved sessions with any outcome feedback, a
  backing ticket currently marked reopened, a `ticket.reopened` event on the
  backing ticket within seven days after resolution, or a same-requester
  session within seven days that shares a `search_guides` result slug.
- `falseResolvedRate` is `falseResolved / aiResolved`, or zero when there are
  no v1 AI-resolved sessions.
- `escalated` counts sessions with status `escalated` or `halted`;
  `escalationRate` is `escalated / sessions`, or zero for an empty window.
- `medianAiResolutionMs` is the median duration of every resolved session with
  an end time. `medianHumanResolutionMs` is the median time from session start
  until the linked escalation ticket's resolution.
- `outcomeFeedback` is the number of distinct in-window sessions with feedback.
  The twenty most recent feedback rows are returned with requester-safe text.
- `escalationReasons` are the five most common normalized summaries for
  escalated or halted sessions.
- `unhandledIntentCount` counts non-resolved sessions with a zero-result
  `search_guides` tool result and no proposed or autorun action;
  `unhandledIntents` returns the twenty most recent, with sanitized queries.
- Cost fields are populated only when cost tracking is enabled.
  `costPerAiResolutionMicros` is total tracked cost divided by v1 `aiResolved`,
  or null if tracking is off or there are no such sessions.
- Clarifying-question fields are populated only when organization-environment
  metrics are enabled. Unique investigation question IDs are counted per
  ticket, excluding excluded tickets.

## Metrics v2

Each non-active session whose start is in the requested window and whose
backing and escalation tickets are not excluded is classified once. Sessions
with other statuses are ignored. Outcome precedence is the following; the
first matching rule wins:

1. `abandoned`: status is `abandoned`.
2. `escalated`: status is `escalated` or `halted`.
3. For status `resolved`:
   1. `unverified`: at least one `action_executing` or `action_autorun` step
      exists and `verifiedExecutionId` is absent.
   2. `staff_touched`: an employee system event or an action with non-null
      `agentId` exists on the backing ticket.
   3. `false_resolved`: the session has any feedback row; its backing ticket is
      currently reopened; it has a `ticket.reopened` event from the resolution
      time through seven days later; or it has a same-issue match within 72
      hours.
   4. `pending`: `userConfirmedAt` is absent and the end time is less than 72
      hours before the window's `to`.
   5. `ai_resolved`: none of the preceding resolved-session rules matched.
4. Any other status is not classified.

### Categories, capabilities, devices, and staff time

- Category is the non-empty category on the backing ticket, then the
  escalation ticket. If neither supplies one, it is the issue category found
  by looking up the slug in the first `search_guides` result; if no category
  is found, it is `uncategorized`. `uncategorized` never matches a repeat.
- Capability is the `capabilityId` from the first `action_executing` or
  `action_autorun` step in sequence order, or `none`.
- Device is the first device-job `deviceId` linked to the backing ticket, or
  null.
- Staff-touch detection uses only the backing ticket and follows the v1 rule:
  an employee system event or an action with non-null `agentId`. A staff touch
  whose timestamp is at or after `endedAt` is also a hidden staff touch.
  Missing timestamps still count as staff touches but are not hidden staff
  touches.

### Same-issue matching

A later session or report ticket is a same-issue match when its category is
the same non-`uncategorized` category and either its user is the same requester
(or ticket user) or its non-null device ID matches. Candidate sessions must be
another session and start strictly after resolution, no later than the end of
the requested repeat window. Report tickets must be created strictly after
resolution and no later than the window end; backing, escalation, and excluded
tickets are ignored.

The false-resolution rule uses a 72-hour same-issue window. `repeatIssues`
counts only `ai_resolved` sessions with a same-issue match in a 30-day window.

### Rates and durations

- `aiResolutionRate` is `aiResolved / sessions`, or zero when there are no
  classified sessions.
- `falseResolvedRate` is `falseResolved / (aiResolved + falseResolved)`, or
  zero when that denominator is zero.
- `deflected` counts sessions with no escalation ticket, an outcome other than
  `escalated`, and no staff touch. Abandoned sessions count as deflected.
  `deflectionRate` is `deflected / sessions`, or zero for no classified
  sessions.
- `abandonmentRate` is `abandoned / sessions`, or zero for no classified
  sessions.
- `medianResolveMs` and `p90ResolveMs` use only `ai_resolved` session
  durations. The median is the middle value (the mean of the two middle values
  for an even count); p90 is nearest-rank, `ceil(0.9 * n)`. Both are zero
  without durations.
- `repeatIssueRate` is `repeatIssues / aiResolved`, or zero when there are no
  AI-resolved sessions.
- `pending` counts `pending` outcomes; `hiddenStaffTouch` counts classified
  sessions with a hidden staff touch.

`outcomes` counts each classified outcome, and `sessionOutcomes` returns each
classified session ID and outcome. Category and capability breakdowns contain
`key`, `sessions`, `aiResolved`, `falseResolved`, `staffTouched`, `abandoned`,
`escalated`, `aiResolutionRate`, and `falseResolvedRate`. In each breakdown,
the two rates use the same denominators as their top-level equivalents;
unverified and pending outcomes contribute to the row's session count. Rows
sort by descending session count, then ascending key.

## Abandoned sessions

The abandonment sweep is disabled by default. With
`HELP_DESK_AGENT_ABANDON_SWEEP_ENABLED=true`, the cron route selects up to 500
active sessions with no pending approval and `updated_at` older than the
configured cutoff. `HELP_DESK_AGENT_ABANDON_MINUTES` defaults to 60 and is
clamped to 15–1440 minutes; non-numeric input uses 60.

Before changing a session, the sweep skips a newer user turn, an unfinished
action without a later verification or rollback result, or the latest consent
or step-up request without a later decision or decline. It conditionally
updates only the session row it read and only if status and `updated_at` are
unchanged. A successful update records `abandoned_no_user_turn` and then
appends an `abandoned` step. It does not change tickets, escalation tickets,
or resolution runs.

## Promotion

Autorun promotion still requires the existing execution-level promotion
criteria. It additionally refuses a capability with any staff-touched
AI-resolved sessions in its honest-metrics row, or a false-resolved rate above
the configured promotion limit. Failure to load honest metrics refuses
promotion.
