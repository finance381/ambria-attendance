-- 20261007070000_onboarding_tasks.sql
-- New Joiners → onboarding tasks. Each task applies to every new joiner and
-- is due `due_days` (fixed at 7) after the joiner's employees.date_of_joining.
-- Points of contact are employee ids; attached docs are training_docs ids
-- (see 20261007060000_training_docs.sql — run that one first).

create table if not exists public.onboarding_tasks (
  id               bigint generated always as identity primary key,
  name             text not null check (length(trim(name)) > 0),
  description      text,
  poc_ids          uuid[] not null default '{}',
  training_doc_ids bigint[] not null default '{}',
  due_days         integer not null default 7 check (due_days = 7),
  created_by       uuid references public.employees(id) on delete set null,
  created_at       timestamptz not null default now()
);

alter table public.onboarding_tasks enable row level security;

-- Admins: full access.
drop policy if exists onboarding_tasks_admin_all on public.onboarding_tasks;
create policy onboarding_tasks_admin_all on public.onboarding_tasks
  for all to authenticated
  using (exists (select 1 from public.employees e where e.id = auth.uid() and e.role = 'admin' and e.active))
  with check (exists (select 1 from public.employees e where e.id = auth.uid() and e.role = 'admin' and e.active));

-- Any active employee can read tasks (new joiners + their points of contact).
drop policy if exists onboarding_tasks_read on public.onboarding_tasks;
create policy onboarding_tasks_read on public.onboarding_tasks
  for select to authenticated
  using (exists (select 1 from public.employees e where e.id = auth.uid() and e.active));
