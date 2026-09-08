alter table public.ai_provider_calls
  drop constraint if exists ai_provider_calls_outcome_check;

alter table public.ai_provider_calls
  add constraint ai_provider_calls_outcome_check
  check (outcome in ('ok', 'timeout', 'invalid', 'unsafe', 'error', 'budget', 'fallback'));
