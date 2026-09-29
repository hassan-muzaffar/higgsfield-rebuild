-- Set completed_at from the database clock when a job finishes, so durations are
-- measured on one clock (the app server's clock can drift from the database's).
create function public.set_generation_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('succeeded', 'failed') and old.status is distinct from new.status then
    new.completed_at := now();
  end if;
  return new;
end;
$$;

create trigger generations_completed_at
  before update of status on public.generations
  for each row execute function public.set_generation_completed_at();
