alter table public.agent_sessions
  add column if not exists assurance_level text,
  add column if not exists assurance_method text,
  add column if not exists assurance_auth_at timestamptz,
  add column if not exists assurance_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agent_sessions_assurance_level_check'
      and conrelid = 'public.agent_sessions'::regclass
  ) then
    alter table public.agent_sessions
      add constraint agent_sessions_assurance_level_check
      check (assurance_level is null or assurance_level in ('A0', 'A1', 'A2', 'A3'));
  end if;
end;
$$;

alter table public.org_environment_profile
  add column if not exists idp_enforces_mfa boolean not null default false;

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
    'identity_assurance','step_up_required'
  ));

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
--   'user_step_offered','user_step_outcome','user_step_saved','reply_redacted'
-- ));
-- alter table public.agent_sessions drop constraint if exists agent_sessions_assurance_level_check;
-- alter table public.agent_sessions drop column if exists assurance_level;
-- alter table public.agent_sessions drop column if exists assurance_method;
-- alter table public.agent_sessions drop column if exists assurance_auth_at;
-- alter table public.agent_sessions drop column if exists assurance_expires_at;
-- alter table public.org_environment_profile drop column if exists idp_enforces_mfa;
