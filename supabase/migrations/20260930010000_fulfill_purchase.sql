-- OneShot M7: record a Stripe purchase and add its credits exactly once.
-- Called from both the webhook and the billing page's return check, so it must be idempotent:
-- the unique stripe_session_id means only the first call inserts, and only that call grants credits.
create function public.fulfill_purchase(
  p_user_id uuid,
  p_stripe_session_id text,
  p_pack text,
  p_credits integer,
  p_amount_cents integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.purchases (user_id, stripe_session_id, pack, credits, amount_cents)
  values (p_user_id, p_stripe_session_id, p_pack, p_credits, p_amount_cents)
  on conflict (stripe_session_id) do nothing;

  if not found then
    return false; -- already fulfilled
  end if;

  perform public.grant_credits(p_user_id, p_credits, 'purchase', p_stripe_session_id);
  return true;
end;
$$;

revoke execute on function public.fulfill_purchase(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.fulfill_purchase(uuid, text, text, integer, integer) to service_role;
