# E6c — smart intake: clarifying questions before handoff

When triage is unsure, the AI asks the requester up to 2 clarifying questions
on the ticket, one per round, instead of handing it straight to IT. Off by
default.

## Flow

1. `triageWorkflowTicket` routes the ticket as before. If the result is a
   handoff for `low_confidence`, `no_approved_guide` or
   `insufficient_diagnostics`, there are no safety flags, the model asked to
   clarify (or confidence was low), and fewer than 2 questions were asked,
   `shouldClarify` returns true.
2. `pickClarifyingQuestions` prefers the model's `diagnosticQuestionIds`, then
   `error-message` and `when-started`. It skips questions already answered on
   the ticket or answered by the confirmed organization environment profile
   (`profileAnswers`), and respects question categories.
3. The ticket moves to `Waiting for User` (`resolver_type = ai`,
   `ai_question_count` += asked), an AI public comment lists the questions, an
   `ai.clarify_requested` event records the question IDs, and the requester gets
   an `info.requested` notification. No staff handoff yet.
4. When the requester replies (`addUserComment`) on a `Waiting for User`,
   unassigned, AI-owned ticket with smart-intake questions, the ticket returns
   to `AI Reviewing` and triage runs again with
   `clarifyRound = ai_question_count`. Answers are rebuilt each round from the
   requester's (encrypted) comments with `rebuildClarifyAnswers`; they are never
   copied into plaintext ticket fields. This resume path is not gated on the
   flag, so tickets already waiting still hand off after a rollback.
5. After 2 questions, triage hands off normally. Safety flags, explicit human
   requests, repeated failures and high-risk guides are never delayed.

## Flag

```env
HELP_DESK_SMART_INTAKE_ENABLED=false
```

Needs `HELP_DESK_TICKET_WORKFLOW_ENABLED=true` and
`supabase/smart-intake-events.sql`, which adds `ai.clarify_requested` (and the
E6a `routing.ping_pong` alert) to the allowed `ticket_system_events` types.
Without it the clarify event is rejected and triage hands off as before.

## Rollback

Set the flag to `false`. Tickets already waiting re-triage and hand off on
the requester's next reply, or staff can pick them up from the queue.
