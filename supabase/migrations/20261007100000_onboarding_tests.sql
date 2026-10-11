-- 20261007100000_onboarding_tests.sql
-- New Joiners → Tests. Each test has a total score, one employee who marks
-- it, and the departments it applies to (empty array = all departments).

create table if not exists public.onboarding_tests (
  id             bigint generated always as identity primary key,
  title          text not null check (length(trim(title)) > 0),
  description    text,
  max_score      integer not null check (max_score between 1 and 1000),
  marked_by      uuid references public.employees(id) on delete set null,
  department_ids integer[] not null default '{}',
  created_by     uuid references public.employees(id) on delete set null,
  created_at     timestamptz not null default now()
);

alter table public.onboarding_tests enable row level security;

-- Admins: full access.
drop policy if exists onboarding_tests_admin_all on public.onboarding_tests;
create policy onboarding_tests_admin_all on public.onboarding_tests
  for all to authenticated
  using (exists (select 1 from public.employees e where e.id = auth.uid() and e.role = 'admin' and e.active))
  with check (exists (select 1 from public.employees e where e.id = auth.uid() and e.role = 'admin' and e.active));

-- Any active employee can read tests (new joiners + markers).
drop policy if exists onboarding_tests_read on public.onboarding_tests;
create policy onboarding_tests_read on public.onboarding_tests
  for select to authenticated
  using (exists (select 1 from public.employees e where e.id = auth.uid() and e.active));
