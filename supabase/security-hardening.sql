-- Idempotent baseline: service-role access is explicit while client access
-- remains governed by the table-specific policies in the owning migrations.
alter table public.ticket_step_outcomes enable row level security;
alter table public.organization_policies enable row level security;
alter table public.knowledge_guides enable row level security;
alter table public.knowledge_guide_revisions enable row level security;
alter table public.ai_provider_calls enable row level security;
alter table public.shadow_decisions enable row level security;
alter table public.knowledge_learning_events enable row level security;
alter table public.capabilities enable row level security;
alter table public.capability_versions enable row level security;
alter table public.organization_capabilities enable row level security;
alter table public.knowledge_drafts enable row level security;
alter table public.analytics_events enable row level security;
alter table public.capability_breakers enable row level security;
alter table public.attachment_policies enable row level security;
alter table public.ticket_attachments enable row level security;
alter table public.attachment_events enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.ticket_events enable row level security;
alter table public.active_sessions enable row level security;
alter table public.analytics_daily_totals enable row level security;
alter table public.operations_audit enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.ticket_investigations enable row level security;
alter table public.ticket_investigation_turns enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.ticket_actions enable row level security;
alter table public.ticket_system_events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.bookmarks enable row level security;
alter table public.guide_progress enable row level security;
alter table public.tickets enable row level security;
alter table public.guide_ratings enable row level security;
alter table public.guide_rating_totals enable row level security;
alter table public.resolution_runs enable row level security;
alter table public.resolution_steps enable row level security;
alter table public.resolution_events enable row level security;
alter table public.policy_decisions enable row level security;
alter table public.capability_executions enable row level security;
alter table public.verification_results enable row level security;
alter table public.approval_requests enable row level security;
alter table public.rollback_runs enable row level security;
alter table public.ai_kill_switches enable row level security;
alter table public.organization_autonomy_policies enable row level security;
alter table public.platform_admins enable row level security;
alter table public.organization_domains enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.pilot_reviews enable row level security;
alter table public.knowledge_health_findings enable row level security;

-- The service role bypasses RLS in Supabase; these policies document the
-- intended administrative boundary for static and metadata checks.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ticket_step_outcomes', 'organization_policies', 'knowledge_guides',
    'knowledge_guide_revisions', 'ai_provider_calls', 'shadow_decisions',
    'knowledge_learning_events', 'capabilities', 'capability_versions',
    'organization_capabilities', 'knowledge_drafts', 'analytics_events',
    'capability_breakers', 'attachment_policies', 'ticket_attachments',
    'attachment_events', 'organizations', 'organization_members',
    'admin_profiles', 'ticket_events', 'active_sessions',
    'analytics_daily_totals', 'operations_audit', 'notification_outbox',
    'notification_preferences', 'ticket_investigations',
    'ticket_investigation_turns', 'ticket_comments', 'ticket_actions',
    'ticket_system_events', 'push_subscriptions', 'bookmarks',
    'guide_progress', 'tickets', 'guide_ratings', 'guide_rating_totals',
    'resolution_runs', 'resolution_steps', 'resolution_events',
    'policy_decisions', 'capability_executions', 'verification_results',
    'approval_requests', 'rollback_runs', 'ai_kill_switches',
    'organization_autonomy_policies', 'platform_admins',
    'organization_domains', 'organization_invitations', 'pilot_reviews',
    'knowledge_health_findings'
  ] loop
    execute format(
      'drop policy if exists security_hardening_service_role on public.%I',
      table_name
    );
  end loop;
end $$;
create policy security_hardening_service_role on public.ticket_step_outcomes for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.organization_policies for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.knowledge_guides for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.knowledge_guide_revisions for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.ai_provider_calls for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.shadow_decisions for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.knowledge_learning_events for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.capabilities for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.capability_versions for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.organization_capabilities for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.knowledge_drafts for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.analytics_events for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.capability_breakers for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.attachment_policies for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.ticket_attachments for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.attachment_events for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.organizations for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.organization_members for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.admin_profiles for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.ticket_events for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.active_sessions for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.analytics_daily_totals for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.operations_audit for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.notification_outbox for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.notification_preferences for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.ticket_investigations for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.ticket_investigation_turns for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.ticket_comments for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.ticket_actions for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.ticket_system_events for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.push_subscriptions for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.bookmarks for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.guide_progress for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.tickets for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.guide_ratings for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.guide_rating_totals for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.resolution_runs for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.resolution_steps for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.resolution_events for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.policy_decisions for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.capability_executions for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.verification_results for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.approval_requests for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.rollback_runs for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.ai_kill_switches for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.organization_autonomy_policies for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.platform_admins for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.organization_domains for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.organization_invitations for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.pilot_reviews for all to service_role using (true) with check (true);
create policy security_hardening_service_role on public.knowledge_health_findings for all to service_role using (true) with check (true);
