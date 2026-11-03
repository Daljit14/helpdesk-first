# E6a — ticket route events, reroute rate and ping-pong alert

E6a records every ownership change on a ticket so reroutes can be measured. It
is off by default and changes nothing for requesters.

## What it does

- `claimTicket` and `assignTicket` (`app/actions/admin-workflow.ts`) write one
  row to `ticket_route_events` per ownership change: source (`claim` or
  `assign`), previous owner, new owner and the staff member who made it.
- A **reroute** is a change of owner on a ticket that already had one
  (`isReroute` in `lib/tickets/route-events.ts`). A first claim is not a reroute.
- **Ping-pong alert:** when a ticket reaches 3 reroutes
  (`PING_PONG_THRESHOLD`), a `routing.ping_pong` ticket system event is written
  once.
- `computeRerouteStats(rows)` returns routed tickets, rerouted tickets, the
  reroute rate and the ping-pong ticket IDs, for a later admin metric.
- Recording never blocks the claim/assign action: errors are logged as
  `tickets.route_event.error` and the action still succeeds.

## Release gate

`reroute_events_recorded` (benchmark `2026-11-01.1`, suite `route_events`)
fails unless a claim and a reassignment are both recorded, the third reroute
raises the ping-pong alert exactly once, and nothing is recorded with the flag
off.

## Flag

```env
HELP_DESK_TICKET_ROUTE_EVENTS_ENABLED=false
```

## SQL

`supabase/ticket-route-events.sql` is additive and idempotent. Apply it manually
after `ticket-workflow.sql` and `wave-3-organizations.sql`, and turn the flag on
only after it is applied. Org members can read; writes go through the service
role. Rollback is in the file's comments and drops routing history.

## Not in E6a (planned for E6b)

Up to 2 clarifying questions when triage confidence is low (using the org
profile), the admin reroute-rate card, and turning staff reroutes into triage
eval cases.
