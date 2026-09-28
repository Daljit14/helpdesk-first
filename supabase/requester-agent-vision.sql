alter table public.agent_steps
  add column if not exists attachment_id uuid references public.ticket_attachments(id) on delete set null;

alter table public.agent_steps drop constraint if exists agent_steps_kind_check;
alter table public.agent_steps add constraint agent_steps_kind_check check (kind in (
  'user_message','thinking_summary','tool_started','tool_result','tool_rejected','final',
  'claim_stripped','escalated','halted','error','action_proposed','consent_required',
  'consent_decided','consent_declined','action_executing','verification_result',
  'rollback_result','confirm_required','user_feedback','resolved','security_incident',
  'action_rejected','session_consent_offered','session_consent_granted',
  'session_consent_revoked','action_autorun','action_shadowed','tier_demoted',
  'screenshot_received','screenshot_rejected'
));
