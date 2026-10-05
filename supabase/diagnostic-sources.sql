create index if not exists tickets_org_issue_created_idx
  on public.tickets (organization_id, issue_id, created_at desc);
create index if not exists tickets_org_ai_issue_created_idx
  on public.tickets (organization_id, ai_recommended_issue_id, created_at desc);
