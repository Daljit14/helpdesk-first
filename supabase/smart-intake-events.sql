-- E6 ticket system event types. Additive, idempotent migration.
-- Apply manually after wave-1-2-remediation.sql. Adds the E6a ping-pong alert
-- and the E6c smart-intake question event to the allowed event types; until it
-- runs, those inserts are rejected (E6c then hands off instead of asking).

alter table public.ticket_system_events
  drop constraint if exists ticket_system_events_event_type_check;
alter table public.ticket_system_events
  add constraint ticket_system_events_event_type_check
  check (event_type in (
    'ticket.created', 'ai.assigned', 'ai.solution_offered', 'ai.escalated',
    'employee.assigned', 'employee.claimed', 'comment.created',
    'internal_note.created', 'tool.used', 'status.changed',
    'verification.requested', 'verification.exception', 'ticket.resolved',
    'ticket.closed', 'ticket.reopened', 'ticket.rated', 'solution.rejected',
    'step.worked', 'step.failed', 'step.could_not_perform',
    'routing.ping_pong', 'ai.clarify_requested'
  ));

-- Rollback (fails if rows with the new types exist; delete them first):
-- alter table public.ticket_system_events
--   drop constraint if exists ticket_system_events_event_type_check;
-- then re-add the list from wave-1-2-remediation.sql.
