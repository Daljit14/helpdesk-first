-- G3 tamper-evident audit chain. Run after requester-agent.sql,
-- autonomy-ladder.sql, autonomy-audit.sql, agent-reply-guard.sql, and
-- agent-user-steps.sql and requester-agent-vision.sql. The fixed payload lists
-- deliberately exclude future columns; update this migration and
-- AUDIT_CHAIN_COLUMNS explicitly when the covered records' schemas change.

alter table public.resolution_events
  add column if not exists chain_seq bigint,
  add column if not exists prev_hash text,
  add column if not exists row_hash text;
alter table public.agent_steps
  add column if not exists chain_seq bigint,
  add column if not exists prev_hash text,
  add column if not exists row_hash text;
alter table public.capability_autonomy_transitions
  add column if not exists chain_seq bigint,
  add column if not exists prev_hash text,
  add column if not exists row_hash text;

create unique index if not exists resolution_events_audit_chain_seq_idx
  on public.resolution_events(organization_id, chain_seq);
create unique index if not exists agent_steps_audit_chain_seq_idx
  on public.agent_steps(organization_id, chain_seq);
create unique index if not exists capability_autonomy_transitions_audit_chain_seq_idx
  on public.capability_autonomy_transitions(organization_id, chain_seq);

create or replace function public.audit_canonical(v jsonb)
returns text
language plpgsql
immutable
set search_path = public, extensions
set extra_float_digits = 1
as $$
declare
  value_type text;
  result text;
  part record;
  number_value double precision;
  number_text text;
  mantissa text;
  digit_text text;
  significant_digits text;
  exponent_value integer;
  exponent_index integer;
  decimal_position integer;
  first_significant integer;
  decimal_place integer;
  sign_prefix text;
begin
  value_type := jsonb_typeof(v);
  if v is null or value_type = 'null' then
    return 'null';
  elsif value_type = 'string' then
    return to_json(v #>> '{}')::text;
  elsif value_type = 'boolean' then
    return v::text;
  elsif value_type = 'number' then
    begin
      number_value := (v #>> '{}')::double precision;
    exception
      when numeric_value_out_of_range then
        return 'null';
    end;
    if number_value = 0 then
      return '0';
    end if;
    if number_value = 'Infinity'::double precision
      or number_value = '-Infinity'::double precision then
      return 'null';
    end if;

    sign_prefix := case when number_value < 0 then '-' else '' end;
    number_text := abs(number_value)::text;
    exponent_index := position('e' in lower(number_text));
    if exponent_index > 0 then
      mantissa := substring(number_text from 1 for exponent_index - 1);
      exponent_value := substring(number_text from exponent_index + 1)::integer;
    else
      mantissa := number_text;
      exponent_value := 0;
    end if;

    decimal_position := position('.' in mantissa);
    if decimal_position = 0 then
      decimal_position := length(mantissa);
    else
      decimal_position := decimal_position - 1;
    end if;
    digit_text := replace(mantissa, '.', '');
    first_significant := position(regexp_replace(digit_text, '^0+', '') in digit_text);
    significant_digits := substring(digit_text from first_significant);
    significant_digits := regexp_replace(significant_digits, '0+$', '');
    exponent_value := decimal_position + exponent_value - first_significant;

    if abs(number_value) >= 0.000001 and abs(number_value) < 1e21 then
      decimal_place := decimal_position
        + case
            when position('e' in lower(number_text)) > 0
              then substring(number_text from position('e' in lower(number_text)) + 1)::integer
            else 0
          end
        - first_significant + 1;
      if decimal_place <= 0 then
        result := '0.' || repeat('0', -decimal_place) || significant_digits;
      elsif decimal_place >= length(significant_digits) then
        result := significant_digits ||
          repeat('0', decimal_place - length(significant_digits));
      else
        result := substring(significant_digits from 1 for decimal_place) || '.' ||
          substring(significant_digits from decimal_place + 1);
      end if;
      return sign_prefix || result;
    end if;

    result := substring(significant_digits from 1 for 1);
    if length(significant_digits) > 1 then
      result := result || '.' || substring(significant_digits from 2);
    end if;
    return sign_prefix || result || 'e' ||
      case when exponent_value >= 0 then '+' else '' end ||
      exponent_value::text;
  end if;

  if value_type = 'array' then
    select '[' || coalesce(string_agg(public.audit_canonical(item), ',' order by ordinal), '') || ']'
      into result
      from jsonb_array_elements(v) with ordinality as elements(item, ordinal);
    return result;
  end if;

  select '{' || coalesce(
      string_agg(to_json(key)::text || ':' || public.audit_canonical(value), ',' order by key collate "C"),
      ''
    ) || '}'
    into result
    from jsonb_each(v) as entries(key, value);
  return result;
end;
$$;

create or replace function public.audit_chain_payload(p_table text, r jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  columns text[];
  column_name text;
  column_value jsonb;
  result jsonb := '{}'::jsonb;
begin
  case p_table
    when 'resolution_events' then
      columns := array[
        'id','organization_id','run_id','ticket_id','kind','actor',
        'from_status','to_status','detail','initiated_by','versions',
        'created_at','chain_seq'
      ];
    when 'agent_steps' then
      columns := array[
        'id','session_id','organization_id','seq','kind','tool_name',
        'capability_id','params_hash','policy_decision','consent_id',
        'result_summary','verification_status','attachment_id','created_at',
        'chain_seq'
      ];
    when 'capability_autonomy_transitions' then
      columns := array[
        'id','organization_id','capability_id','from_tier','to_tier','kind',
        'reason','actor','actor_user_id','created_at','chain_seq'
      ];
    else
      raise exception 'unsupported audit chain table: %', p_table;
  end case;

  foreach column_name in array columns loop
    if column_name = 'created_at' and r ? column_name then
      column_value := to_jsonb(to_char(
        (r ->> column_name)::timestamptz at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ));
    else
      column_value := r -> column_name;
    end if;
    result := result || jsonb_build_object(column_name, column_value);
  end loop;
  return result;
end;
$$;

create or replace function public.audit_chain_hash(p_prev_hash text, p_payload jsonb)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(
    digest(coalesce(p_prev_hash, '') || public.audit_canonical(p_payload), 'sha256'),
    'hex'
  );
$$;

create table if not exists public.audit_chain_anchors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  table_name text not null check (table_name in (
    'resolution_events', 'agent_steps', 'capability_autonomy_transitions'
  )),
  chain_seq bigint not null,
  row_hash text not null,
  checked_at timestamptz not null default now()
);
create index if not exists audit_chain_anchors_latest_idx
  on public.audit_chain_anchors(organization_id, table_name, checked_at desc);
alter table public.audit_chain_anchors enable row level security;
revoke all on public.audit_chain_anchors
  from public, anon, authenticated, service_role;
grant select, insert on public.audit_chain_anchors to service_role;
drop policy if exists audit_chain_anchors_service_role on public.audit_chain_anchors;
create policy audit_chain_anchors_service_role on public.audit_chain_anchors
  for all to service_role using (true) with check (true);

create or replace function public.audit_chain_anchors_immutable()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  raise exception 'audit chain anchors are append-only';
end;
$$;
drop trigger if exists audit_chain_anchors_immutable on public.audit_chain_anchors;
create trigger audit_chain_anchors_immutable
before update or delete on public.audit_chain_anchors
for each row execute function public.audit_chain_anchors_immutable();

do $$
declare
  target_table text;
  immutable_trigger text;
  organization_row record;
  row_data jsonb;
  has_unhashed_rows boolean;
  head_seq bigint;
  head_hash text;
  next_hash text;
  next_seq bigint;
  payload jsonb;
begin
  foreach target_table in array array[
    'resolution_events', 'agent_steps', 'capability_autonomy_transitions'
  ] loop
    immutable_trigger := case target_table
      when 'agent_steps' then 'agent_steps_immutable'
      when 'capability_autonomy_transitions' then 'capability_autonomy_transitions_immutable'
      else 'resolution_events_immutable_trigger'
    end;

    execute format(
      'select exists (select 1 from public.%I where row_hash is null)',
      target_table
    ) into has_unhashed_rows;
    if has_unhashed_rows then
      execute format('alter table public.%I disable trigger %I', target_table, immutable_trigger);
      begin
        for organization_row in execute format(
          'select distinct organization_id from public.%I where row_hash is null',
          target_table
        ) loop
          head_seq := null;
          head_hash := null;
          execute format(
            'select chain_seq, row_hash from public.%I where organization_id = $1 and row_hash is not null order by chain_seq desc limit 1',
            target_table
          ) into head_seq, head_hash using organization_row.organization_id;

          for row_data in execute format(
            'select to_jsonb(event_row) from public.%I as event_row where organization_id = $1 and row_hash is null order by created_at, id',
            target_table
          ) using organization_row.organization_id loop
            next_seq := coalesce(head_seq, 0) + 1;
            row_data := row_data || jsonb_build_object('chain_seq', next_seq);
            payload := public.audit_chain_payload(target_table, row_data);
            next_hash := public.audit_chain_hash(head_hash, payload);
            execute format(
              'update public.%I set chain_seq = $1, prev_hash = $2, row_hash = $3 where id = $4',
              target_table
            ) using next_seq, head_hash, next_hash, (row_data ->> 'id')::uuid;
            head_seq := next_seq;
            head_hash := next_hash;
          end loop;
        end loop;
      exception when others then
        execute format('alter table public.%I enable trigger %I', target_table, immutable_trigger);
        raise;
      end;
      execute format('alter table public.%I enable trigger %I', target_table, immutable_trigger);
    end if;
  end loop;
end;
$$;

alter table public.resolution_events
  alter column chain_seq set not null,
  alter column row_hash set not null;
alter table public.agent_steps
  alter column chain_seq set not null,
  alter column row_hash set not null;
alter table public.capability_autonomy_transitions
  alter column chain_seq set not null,
  alter column row_hash set not null;

create or replace function public.audit_chain_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  head_seq bigint;
  head_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'audit_chain:' || tg_table_name || ':' || new.organization_id::text,
    0
  ));
  execute format(
    'select chain_seq, row_hash from public.%I where organization_id = $1 and chain_seq is not null order by chain_seq desc limit 1',
    tg_table_name
  ) into head_seq, head_hash using new.organization_id;

  new.chain_seq := coalesce(head_seq, 0) + 1;
  new.prev_hash := head_hash;
  new.row_hash := public.audit_chain_hash(
    new.prev_hash,
    public.audit_chain_payload(tg_table_name, to_jsonb(new))
  );
  return new;
end;
$$;

drop trigger if exists resolution_events_audit_chain_insert on public.resolution_events;
create trigger resolution_events_audit_chain_insert
before insert on public.resolution_events
for each row execute function public.audit_chain_before_insert();
drop trigger if exists agent_steps_audit_chain_insert on public.agent_steps;
create trigger agent_steps_audit_chain_insert
before insert on public.agent_steps
for each row execute function public.audit_chain_before_insert();
drop trigger if exists capability_autonomy_transitions_audit_chain_insert
  on public.capability_autonomy_transitions;
create trigger capability_autonomy_transitions_audit_chain_insert
before insert on public.capability_autonomy_transitions
for each row execute function public.audit_chain_before_insert();

create or replace function public.audit_chain_rows(
  p_table text,
  p_organization_id uuid,
  p_since timestamptz,
  p_after_seq bigint,
  p_limit integer
)
returns table (
  id uuid,
  chain_seq bigint,
  prev_hash text,
  row_hash text,
  created_at timestamptz,
  payload jsonb
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_table is null or p_table not in (
    'resolution_events', 'agent_steps', 'capability_autonomy_transitions'
  ) then
    raise exception 'unsupported audit chain table: %', p_table;
  end if;
  return query execute format(
    'select audit_row.id, audit_row.chain_seq, audit_row.prev_hash, audit_row.row_hash, audit_row.created_at, public.audit_chain_payload($1, to_jsonb(audit_row)) from public.%I as audit_row where audit_row.organization_id = $2 and ($3 is null or audit_row.created_at >= $3) and audit_row.chain_seq > coalesce($4, 0) order by audit_row.chain_seq limit $5',
    p_table
  ) using p_table, p_organization_id, p_since, p_after_seq, greatest(1, least(coalesce(p_limit, 500), 1000));
end;
$$;
revoke all on function public.audit_chain_rows(text, uuid, timestamptz, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.audit_chain_rows(text, uuid, timestamptz, bigint, integer)
  to service_role;

-- Rollback (manual, only when reverting this migration):
-- drop trigger if exists resolution_events_audit_chain_insert on public.resolution_events;
-- drop trigger if exists agent_steps_audit_chain_insert on public.agent_steps;
-- drop trigger if exists capability_autonomy_transitions_audit_chain_insert on public.capability_autonomy_transitions;
-- drop trigger if exists audit_chain_anchors_immutable on public.audit_chain_anchors;
-- drop function if exists public.audit_chain_rows(text, uuid, timestamptz, bigint, integer);
-- drop function if exists public.audit_chain_before_insert();
-- drop function if exists public.audit_chain_anchors_immutable();
-- drop function if exists public.audit_chain_hash(text, jsonb);
-- drop function if exists public.audit_chain_payload(text, jsonb);
-- drop function if exists public.audit_canonical(jsonb);
-- drop table if exists public.audit_chain_anchors;
-- alter table public.resolution_events drop column if exists chain_seq, drop column if exists prev_hash, drop column if exists row_hash;
-- alter table public.agent_steps drop column if exists chain_seq, drop column if exists prev_hash, drop column if exists row_hash;
-- alter table public.capability_autonomy_transitions drop column if exists chain_seq, drop column if exists prev_hash, drop column if exists row_hash;
