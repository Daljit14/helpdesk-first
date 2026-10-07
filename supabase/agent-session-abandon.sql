alter table public.agent_steps
  drop constraint if exists agent_steps_kind_check;

alter table public.agent_steps
  add constraint agent_steps_kind_check check (kind in (
    'user_message','thinking_summary','tool_started','tool_result','tool_rejected','final',
    'claim_stripped','escalated','halted','error','action_proposed','consent_required',
    'consent_decided','consent_declined','action_executing','verification_result',
    'rollback_result','confirm_required','user_feedback','resolved','security_incident',
    'action_rejected','session_consent_offered','session_consent_granted',
    'session_consent_revoked','action_autorun','action_shadowed','tier_demoted',
    'screenshot_received','screenshot_rejected','service_incident',
    'user_step_offered','user_step_outcome','user_step_saved','reply_redacted',
    'identity_assurance','step_up_required','tripwire_instruction_content',
    'abandoned'
  ));

create index if not exists agent_sessions_active_updated_idx
  on public.agent_sessions(updated_at)
  where status = 'active';

-- Rollback:
-- alter table public.agent_steps drop constraint if exists agent_steps_kind_check;
-- alter table public.agent_steps add constraint agent_steps_kind_check check (kind in (
--   'user_message','thinking_summary','tool_started','tool_result','tool_rejected','final',
--   'claim_stripped','escalated','halted','error','action_proposed','consent_required',
--   'consent_decided','consent_declined','action_executing','verification_result',
--   'rollback_result','confirm_required','user_feedback','resolved','security_incident',
--   'action_rejected','session_consent_offered','session_consent_granted',
--   'session_consent_revoked','action_autorun','action_shadowed','tier_demoted',
--   'screenshot_received','screenshot_rejected','service_incident',
--   'user_step_offered','user_step_outcome','user_step_saved','reply_redacted',
--   'identity_assurance','step_up_required','tripwire_instruction_content'
-- ));
-- drop index if exists public.agent_sessions_active_updated_idx;
