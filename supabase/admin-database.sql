-- Service-role-only projection used by the admin Database page.
-- Run after the auth schema is available; this migration is re-runnable.

create or replace view public.admin_auth_users
with (security_invoker = false) as
select
  id,
  email,
  created_at,
  last_sign_in_at,
  confirmed_at,
  coalesce(raw_app_meta_data->>'provider', 'email') as provider,
  raw_user_meta_data->>'avatar' as avatar
from auth.users;

revoke all on public.admin_auth_users from public, anon, authenticated;
grant select on public.admin_auth_users to service_role;

comment on view public.admin_auth_users is
  'Service-role-only projection of auth.users for the admin Database page.';
