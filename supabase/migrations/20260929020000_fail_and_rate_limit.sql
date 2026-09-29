-- Mark a job failed and refund it in one transaction, so a failed card never shows
-- without its credits back. Returns false if the job had already finished.
create function public.fail_generation(p_generation_id uuid, p_error text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.generations
     set status = 'failed', error = p_error, completed_at = now()
   where id = p_generation_id and status in ('queued', 'running');
  if not found then
    return false;
  end if;
  perform public.refund_generation(p_generation_id);
  return true;
end;
$$;

revoke execute on function public.fail_generation(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_generation(uuid, text) to service_role;

-- Rate limit on the credit ledger instead of generations: users can delete
-- generations, but not ledger rows, so deleting can't dodge the limit.
create or replace function public.create_generations(
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
    from public.credit_ledger
   where user_id = p_user_id and reason = 'generation' and created_at > now() - interval '1 minute';
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

-- The sweeper uses the same atomic path.
create or replace function public.fail_stale_generations()
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
    select id from public.generations
     where status in ('queued', 'running')
       and created_at < now() - case when kind = 'video' then interval '15 minutes' else interval '5 minutes' end
  loop
    if public.fail_generation(stale.id, 'This took too long and was stopped. Your credits were refunded.') then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
