-- OneShot M2: create generation jobs atomically, and sweep stuck jobs.

-- Creates p_count generations and charges p_cost_each for each one, in a single
-- transaction: either every job is created and paid for, or nothing happens.
-- Raises 'rate_limited' (more than 10 jobs per minute) or 'insufficient_credits'.
create function public.create_generations(
  p_user_id uuid,
  p_count integer,
  p_kind public.generation_kind,
  p_mode public.generation_mode,
  p_model text,
  p_prompt text,
  p_final_prompt text,
  p_preset_id uuid,
  p_params jsonb,
  p_input_paths text[],
  p_cost_each integer,
  p_parent_id uuid
)
returns setof public.generations
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
  g public.generations;
begin
  if p_count < 1 or p_count > 4 then
    raise exception 'count must be between 1 and 4';
  end if;

  -- Serialise job creation per user so the rate limit and balance checks can't race.
  perform 1 from public.profiles where id = p_user_id for update;

  select count(*) into recent
    from public.generations
   where user_id = p_user_id and created_at > now() - interval '1 minute';
  if recent + p_count > 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  for i in 1..p_count loop
    insert into public.generations (
      user_id, kind, mode, model, prompt, final_prompt, preset_id,
      params, input_paths, cost, parent_id
    )
    values (
      p_user_id, p_kind, p_mode, p_model, p_prompt, p_final_prompt, p_preset_id,
      p_params, coalesce(p_input_paths, '{}'), p_cost_each, p_parent_id
    )
    returning * into g;

    if p_cost_each > 0 then
      perform public.spend_credits(p_user_id, p_cost_each, g.id::text);
    end if;

    return next g;
  end loop;
end;
$$;

revoke execute on function public.create_generations(
  uuid, integer, public.generation_kind, public.generation_mode, text, text, text, uuid, jsonb, text[], integer, uuid
) from public, anon, authenticated;
grant execute on function public.create_generations(
  uuid, integer, public.generation_kind, public.generation_mode, text, text, text, uuid, jsonb, text[], integer, uuid
) to service_role;

-- Marks jobs that have been stuck too long as failed and refunds them.
-- Images and voice finish in seconds, so 5 minutes means the worker died; video gets 15.
create function public.fail_stale_generations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  stale record;
  n integer := 0;
begin
  for stale in
    update public.generations
       set status = 'failed',
           error = 'This took too long and was stopped. Your credits were refunded.',
           completed_at = now()
     where status in ('queued', 'running')
       and created_at < now() - case when kind = 'video' then interval '15 minutes' else interval '5 minutes' end
    returning id
  loop
    perform public.refund_generation(stale.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.fail_stale_generations() from public, anon, authenticated;
grant execute on function public.fail_stale_generations() to service_role;

-- Run the sweeper every 5 minutes inside the database (no external scheduler needed).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

select cron.schedule(
  'fail-stale-generations',
  '*/5 * * * *',
  $$select public.fail_stale_generations()$$
);
