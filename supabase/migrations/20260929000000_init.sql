-- OneShot: initial schema (M1)
-- Tables, row-level security, credit functions, new-user trigger, storage buckets, realtime.

-- ─────────────────────────────────────────────────────────────
-- Types
-- ─────────────────────────────────────────────────────────────
create type public.generation_kind as enum ('image', 'video', 'voice');
create type public.generation_mode as enum ('text', 'edit', 'image_to_video', 'tts');
create type public.generation_status as enum ('queued', 'running', 'succeeded', 'failed');
create type public.ledger_reason as enum ('signup', 'generation', 'refund', 'purchase');

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  credits integer not null default 0 check (credits >= 0),
  stripe_customer_id text unique,
  created_at timestamptz not null default now()
);

create table public.presets (
  id uuid primary key default gen_random_uuid(),
  kind public.generation_kind not null,
  slug text not null unique,
  name text not null,
  description text,
  thumbnail_path text,
  prompt_template text not null check (prompt_template like '%{prompt}%'),
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.generation_kind not null,
  mode public.generation_mode not null,
  model text not null,
  prompt text not null,
  final_prompt text not null,
  preset_id uuid references public.presets (id) on delete set null,
  params jsonb not null default '{}'::jsonb,
  input_paths text[] not null default '{}',
  output_paths text[] not null default '{}',
  status public.generation_status not null default 'queued',
  provider_op_id text,
  error text,
  cost integer not null check (cost >= 0),
  refunded boolean not null default false,
  is_public boolean not null default false,
  share_slug text unique,
  parent_id uuid references public.generations (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint public_needs_slug check (not is_public or share_slug is not null)
);

create index generations_user_created_idx on public.generations (user_id, created_at desc);
create index generations_public_created_idx on public.generations (created_at desc) where is_public;
create index generations_active_idx on public.generations (created_at) where status in ('queued', 'running');

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  generation_id uuid not null references public.generations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, generation_id)
);

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason public.ledger_reason not null,
  ref_id text,
  created_at timestamptz not null default now()
);

create index credit_ledger_user_created_idx on public.credit_ledger (user_id, created_at desc);
-- A generation is refunded at most once, and a Stripe session is credited at most once.
create unique index credit_ledger_once_idx on public.credit_ledger (reason, ref_id)
  where reason in ('refund', 'purchase');

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  stripe_session_id text not null unique,
  pack text not null,
  credits integer not null check (credits > 0),
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'paid',
  created_at timestamptz not null default now()
);

create index purchases_user_created_idx on public.purchases (user_id, created_at desc);

create table public.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Row-level security
-- Users read their own rows. Credits, generations and purchases are
-- written only by the server (service role) or the functions below.
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.presets enable row level security;
alter table public.generations enable row level security;
alter table public.favorites enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.purchases enable row level security;
alter table public.stripe_events enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- Only these columns are user-editable; credits and stripe_customer_id are not.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

create policy "presets: readable by everyone" on public.presets
  for select to anon, authenticated using (true);

create policy "generations: read own" on public.generations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "generations: delete own" on public.generations
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "favorites: read own" on public.favorites
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "favorites: add own" on public.favorites
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.generations g where g.id = generation_id and g.user_id = (select auth.uid()))
  );
create policy "favorites: remove own" on public.favorites
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "credit_ledger: read own" on public.credit_ledger
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "purchases: read own" on public.purchases
  for select to authenticated using ((select auth.uid()) = user_id);

-- stripe_events: no policies, so only the service role can touch it.

-- Public feed: only safe columns of generations marked public.
-- Runs with the view owner's rights on purpose, so anonymous visitors can read
-- public rows without a policy that would expose every column of generations.
create view public.public_generations
with (security_invoker = false) as
select
  g.id,
  g.kind,
  g.mode,
  g.prompt,
  g.final_prompt,
  g.preset_id,
  g.params,
  g.output_paths,
  g.share_slug,
  g.created_at,
  p.display_name as creator_name,
  p.avatar_url as creator_avatar_url
from public.generations g
join public.profiles p on p.id = g.user_id
where g.is_public and g.status = 'succeeded';

revoke all on public.public_generations from anon, authenticated;
grant select on public.public_generations to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Credit functions (the only way credits change)
-- ─────────────────────────────────────────────────────────────

-- Atomically spend credits. Fails with 'insufficient_credits' instead of going negative,
-- even under concurrent calls (the UPDATE takes a row lock).
create function public.spend_credits(p_user_id uuid, p_amount integer, p_ref_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  update public.profiles
     set credits = credits - p_amount
   where id = p_user_id and credits >= p_amount
  returning credits into new_balance;

  if new_balance is null then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  insert into public.credit_ledger (user_id, delta, reason, ref_id)
  values (p_user_id, -p_amount, 'generation', p_ref_id);

  return new_balance;
end;
$$;

-- Add credits (signup grant, Stripe purchase). Purchases are idempotent per ref_id.
create function public.grant_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason public.ledger_reason,
  p_ref_id text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  begin
    insert into public.credit_ledger (user_id, delta, reason, ref_id)
    values (p_user_id, p_amount, p_reason, p_ref_id);
  exception when unique_violation then
    -- Already granted for this ref: return the current balance unchanged.
    select credits into new_balance from public.profiles where id = p_user_id;
    return new_balance;
  end;

  update public.profiles set credits = credits + p_amount
   where id = p_user_id
  returning credits into new_balance;

  return new_balance;
end;
$$;

-- Refund a generation's cost exactly once. Returns true if a refund happened.
create function public.refund_generation(p_generation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record;
begin
  update public.generations
     set refunded = true
   where id = p_generation_id and not refunded and cost > 0
  returning user_id, cost into g;

  if not found then
    return false;
  end if;

  insert into public.credit_ledger (user_id, delta, reason, ref_id)
  values (g.user_id, g.cost, 'refund', p_generation_id::text);

  update public.profiles set credits = credits + g.cost where id = g.user_id;
  return true;
end;
$$;

-- Server-only: users must never call these directly.
revoke execute on function public.spend_credits(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.grant_credits(uuid, integer, public.ledger_reason, text) from public, anon, authenticated;
revoke execute on function public.refund_generation(uuid) from public, anon, authenticated;
grant execute on function public.spend_credits(uuid, integer, text) to service_role;
grant execute on function public.grant_credits(uuid, integer, public.ledger_reason, text) to service_role;
grant execute on function public.refund_generation(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────
-- New users: create a profile and grant 50 signup credits
-- ─────────────────────────────────────────────────────────────
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );

  perform public.grant_credits(new.id, 50, 'signup', new.id::text);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Storage: private buckets, one folder per user (<user_id>/...)
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('inputs', 'inputs', false, 10485760, array['image/png', 'image/jpeg', 'image/webp']),
  ('outputs', 'outputs', false, 104857600, array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'audio/mpeg']);

create policy "inputs: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'inputs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "inputs: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'inputs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "inputs: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'inputs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Outputs are written by the server; users can read their own.
create policy "outputs: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'outputs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ─────────────────────────────────────────────────────────────
-- Realtime: live generation status and credit balance
-- ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.generations, public.profiles;
