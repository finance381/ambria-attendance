-- 20261008060000_onboarding_test_results.sql
-- Scoring flow for New Joiners → Tests.
--   * A "new joiner" for a test = active employee in one of the test's
--     departments (empty = all) whose date_of_joining is within the last
--     60 days. Keep NEW_JOINER_DAYS in src/pages/admin/onboardingUtils.js
--     in sync with the 60 used below.
--   * Only the test's marked_by employee can score it, through
--     submit_test_score(); nobody inserts into the table directly.
-- Run after 20261007100000_onboarding_tests.sql.

create table if not exists public.onboarding_test_results (
  id          bigint generated always as identity primary key,
  test_id     bigint not null references public.onboarding_tests(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  score       integer not null check (score >= 0),
  remarks     text,
  marked_by   uuid references public.employees(id) on delete set null,
  marked_at   timestamptz not null default now(),
  unique (test_id, employee_id)
);

alter table public.onboarding_test_results enable row level security;

-- Admins: full access.
drop policy if exists onboarding_test_results_admin_all on public.onboarding_test_results;
create policy onboarding_test_results_admin_all on public.onboarding_test_results
  for all to authenticated
  using (exists (select 1 from public.employees e where e.id = auth.uid() and e.role = 'admin' and e.active))
  with check (exists (select 1 from public.employees e where e.id = auth.uid() and e.role = 'admin' and e.active));

-- The joiner can see their own result; the marker can see results of their tests.
drop policy if exists onboarding_test_results_read on public.onboarding_test_results;
create policy onboarding_test_results_read on public.onboarding_test_results
  for select to authenticated
  using (
    employee_id = auth.uid()
    or exists (select 1 from public.onboarding_tests t
               where t.id = onboarding_test_results.test_id and t.marked_by = auth.uid())
  );

-- Every (test, new joiner) pair the caller has to mark, with any score given so far.
create or replace function public.tests_to_mark()
returns table (
  test_id          bigint,
  title            text,
  description      text,
  max_score        integer,
  employee_id      uuid,
  employee_name    text,
  emp_code         text,
  department_name  text,
  date_of_joining  date,
  score            integer,
  remarks          text,
  marked_at        timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.title, t.description, t.max_score,
         e.id, e.name, e.emp_code, d.name, e.date_of_joining,
         r.score, r.remarks, r.marked_at
  from onboarding_tests t
  join employees e
    on e.active
   and e.id <> t.marked_by
   and e.date_of_joining >= current_date - 60
   and (cardinality(t.department_ids) = 0 or e.department_id = any (t.department_ids))
  left join departments d on d.id = e.department_id
  left join onboarding_test_results r on r.test_id = t.id and r.employee_id = e.id
  where t.marked_by = auth.uid()
  order by t.created_at desc, e.date_of_joining desc, e.name;
$$;

-- Save (or update) one joiner's score. Only the test's marker may call it.
create or replace function public.submit_test_score(
  p_test_id     bigint,
  p_employee_id uuid,
  p_score       integer,
  p_remarks     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test onboarding_tests%rowtype;
begin
  select * into v_test from onboarding_tests where id = p_test_id;
  if not found then
    raise exception 'Test not found';
  end if;
  if v_test.marked_by is distinct from auth.uid() then
    raise exception 'You are not the marker for this test';
  end if;
  if p_score is null or p_score < 0 or p_score > v_test.max_score then
    raise exception 'Score must be between 0 and %', v_test.max_score;
  end if;
  if not exists (
    select 1 from employees e
    where e.id = p_employee_id and e.active
      and e.id <> v_test.marked_by
      and e.date_of_joining >= current_date - 60
      and (cardinality(v_test.department_ids) = 0 or e.department_id = any (v_test.department_ids))
  ) then
    raise exception 'This employee is not a new joiner for this test';
  end if;

  insert into onboarding_test_results (test_id, employee_id, score, remarks, marked_by, marked_at)
  values (p_test_id, p_employee_id, p_score, nullif(trim(p_remarks), ''), auth.uid(), now())
  on conflict (test_id, employee_id) do update
    set score = excluded.score,
        remarks = excluded.remarks,
        marked_by = excluded.marked_by,
        marked_at = now();
end;
$$;

revoke all on function public.tests_to_mark() from public, anon;
revoke all on function public.submit_test_score(bigint, uuid, integer, text) from public, anon;
grant execute on function public.tests_to_mark() to authenticated;
grant execute on function public.submit_test_score(bigint, uuid, integer, text) to authenticated;
