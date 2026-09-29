-- Per-user limits for free actions (dictation, prompt enhance) that don't spend credits.
create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);

create index usage_events_user_action_idx on public.usage_events (user_id, action, created_at desc);

-- No policies: only the server (service role) reads or writes it.
alter table public.usage_events enable row level security;

-- Records one use of p_action and returns true, or returns false if the user already
-- used it p_limit times within p_window.
create function public.consume_rate_limit(p_user_id uuid, p_action text, p_limit integer, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
begin
  -- Serialise per user so parallel requests can't both squeeze under the limit.
  perform 1 from public.profiles where id = p_user_id for update;

  select count(*) into used
    from public.usage_events
   where user_id = p_user_id and action = p_action and created_at > now() - p_window;
  if used >= p_limit then
    return false;
  end if;

  insert into public.usage_events (user_id, action) values (p_user_id, p_action);
  return true;
end;
$$;

revoke execute on function public.consume_rate_limit(uuid, text, integer, interval) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(uuid, text, integer, interval) to service_role;

-- Keep the table small: drop events older than a day.
select cron.schedule(
  'prune-usage-events',
  '17 * * * *',
  $$delete from public.usage_events where created_at < now() - interval '1 day'$$
);
