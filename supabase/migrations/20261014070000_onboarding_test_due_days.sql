-- 20261014070000_onboarding_test_due_days.sql
-- Tests get an optional due date: due_days after date_of_joining (null = no
-- due date). Wherever task due dates count, test due dates now count too:
--   * my_onboarding_flow() returns due_days / due_date for tests as well
--     (joiner's My Tasks + Home reminder).
--   * onboarding_overdue_tasks() / my_poc_overdue_tasks() now return a
--     `kind` column ('task' | 'test') and include tests that are past due and
--     not yet scored; a test's point of contact is its marker (marked_by).
--   * process_onboarding_overdue() pushes once per overdue test too,
--     remembered in onboarding_test_overdue_notices.
-- Run after 20261014060000_onboarding_due_reminders.sql.

alter table public.onboarding_tests
  add column if not exists due_days integer check (due_days between 1 and 365);

create table if not exists public.onboarding_test_overdue_notices (
  test_id     bigint not null references public.onboarding_tests(id) on delete cascade,
  employee_id uuid   not null references public.employees(id) on delete cascade,
  notified_at timestamptz not null default now(),
  primary key (test_id, employee_id)
);

alter table public.onboarding_test_overdue_notices enable row level security;

drop policy if exists onboarding_test_overdue_notices_admin_read on public.onboarding_test_overdue_notices;
create policy onboarding_test_overdue_notices_admin_read on public.onboarding_test_overdue_notices
  for select to authenticated
  using (exists (select 1 from public.employees e where e.id = auth.uid() and e.role = 'admin' and e.active));

-- ── My Tasks: as 20261011060000, plus test due dates ───────────────────────
create or replace function public.my_onboarding_flow()
returns table (
  seq          bigint,
  kind         text,
  id           bigint,
  title        text,
  description  text,
  due_days     integer,
  due_date     date,
  poc_names    text[],
  docs         jsonb,
  completed_at timestamptz,
  max_score    integer,
  score        integer,
  marked_at    timestamptz,
  done         boolean,
  locked       boolean,
  ready        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select f.seq, f.kind, f.item_id,
         coalesce(t.name, s.title),
         coalesce(t.description, s.description),
         coalesce(t.due_days, s.due_days),
         case when me.date_of_joining is not null and coalesce(t.due_days, s.due_days) is not null
              then me.date_of_joining + coalesce(t.due_days, s.due_days) end,
         case when f.kind = 'task'
              then coalesce((select array_agg(p.name order by p.name)
                             from employees p where p.id = any (t.poc_ids)), '{}')
              else coalesce((select array[p.name] from employees p where p.id = s.marked_by), '{}') end,
         case when f.kind = 'task'
              then coalesce((select jsonb_agg(jsonb_build_object(
                                     'id', d.id, 'title', d.title,
                                     'file_path', d.file_path, 'file_type', d.file_type)
                                   order by d.title)
                             from training_docs d where d.id = any (t.training_doc_ids)), '[]'::jsonb)
              else '[]'::jsonb end,
         c.completed_at,
         s.max_score,
         r.score,
         r.marked_at,
         f.done, f.locked, f.ready
  from employees me
  cross join lateral onboarding_flow(me.id) f
  left join onboarding_tasks t on f.kind = 'task' and t.id = f.item_id
  left join onboarding_tests s on f.kind = 'test' and s.id = f.item_id
  left join onboarding_task_completions c on f.kind = 'task' and c.task_id = f.item_id and c.employee_id = me.id
  left join onboarding_test_results r on f.kind = 'test' and r.test_id = f.item_id and r.employee_id = me.id
  where me.id = auth.uid() and me.active
  order by f.seq;
$$;

-- ── Every overdue (step, joiner) pair — tasks and tests ────────────────────
-- Return type changes (kind column), so drop first; my_poc_overdue_tasks
-- depends on it and is recreated below.
drop function if exists public.my_poc_overdue_tasks();
drop function if exists public.onboarding_overdue_tasks();

create function public.onboarding_overdue_tasks()
returns table (
  kind            text,
  task_id         bigint,
  task_title      text,
  poc_ids         uuid[],
  employee_id     uuid,
  employee_name   text,
  emp_code        text,
  department_name text,
  due_date        date
)
language sql
stable
security definer
set search_path = public
as $$
  with joiners as (
    select e.*
    from employees e
    where e.active
      and e.date_of_joining is not null
      and e.date_of_joining >= (now() at time zone 'Asia/Kolkata')::date - 60
  )
  select 'task'::text, t.id, t.name, t.poc_ids,
         e.id, e.name, e.emp_code, d.name,
         e.date_of_joining + t.due_days
  from joiners e
  join onboarding_tasks t
    on (cardinality(t.department_ids) = 0 or e.department_id = any (t.department_ids))
   and (cardinality(t.roles) = 0 or e.role = any (t.roles))
  join lateral onboarding_flow(e.id) f
    on f.kind = 'task' and f.item_id = t.id and not f.done and not f.locked
  left join departments d on d.id = e.department_id
  where e.date_of_joining + t.due_days < (now() at time zone 'Asia/Kolkata')::date
  union all
  select 'test'::text, s.id, s.title,
         case when s.marked_by is null then '{}'::uuid[] else array[s.marked_by] end,
         e.id, e.name, e.emp_code, d.name,
         e.date_of_joining + s.due_days
  from joiners e
  join onboarding_tests s
    on s.due_days is not null
   and s.marked_by is distinct from e.id
   and (cardinality(s.department_ids) = 0 or e.department_id = any (s.department_ids))
  join lateral onboarding_flow(e.id) f
    on f.kind = 'test' and f.item_id = s.id and not f.done and not f.locked
  left join departments d on d.id = e.department_id
  where e.date_of_joining + s.due_days < (now() at time zone 'Asia/Kolkata')::date;
$$;

revoke all on function public.onboarding_overdue_tasks() from public, anon, authenticated;

create function public.my_poc_overdue_tasks()
returns table (
  kind            text,
  task_id         bigint,
  task_title      text,
  employee_id     uuid,
  employee_name   text,
  emp_code        text,
  department_name text,
  due_date        date
)
language sql
stable
security definer
set search_path = public
as $$
  select o.kind, o.task_id, o.task_title, o.employee_id, o.employee_name,
         o.emp_code, o.department_name, o.due_date
  from onboarding_overdue_tasks() o
  where auth.uid() = any (o.poc_ids)
    and o.employee_id <> auth.uid()
  order by o.due_date, o.employee_name;
$$;

revoke all on function public.my_poc_overdue_tasks() from public, anon;
grant execute on function public.my_poc_overdue_tasks() to authenticated;

-- ── Daily push: as 20261014060000, now for overdue tests too ──────────────
create or replace function public.process_onboarding_overdue()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_ids uuid[];
  v_url text;
  v_key text;
begin
  select trim(both '"' from value::text) into v_url from app_config where key = 'supabase_url';
  select trim(both '"' from value::text) into v_key from app_config where key = 'service_role_key';
  if v_url is null or v_key is null then
    return;
  end if;

  for v_rec in
    select o.*
    from onboarding_overdue_tasks() o
    where (o.kind = 'task' and not exists (
             select 1 from onboarding_overdue_notices n
             where n.task_id = o.task_id and n.employee_id = o.employee_id))
       or (o.kind = 'test' and not exists (
             select 1 from onboarding_test_overdue_notices n
             where n.test_id = o.task_id and n.employee_id = o.employee_id))
  loop
    if v_rec.kind = 'task' then
      insert into onboarding_overdue_notices (task_id, employee_id)
      values (v_rec.task_id, v_rec.employee_id)
      on conflict do nothing;
    else
      insert into onboarding_test_overdue_notices (test_id, employee_id)
      values (v_rec.task_id, v_rec.employee_id)
      on conflict do nothing;
    end if;

    select array_agg(p.id) into v_ids
    from employees p
    where p.id = any (v_rec.poc_ids) and p.active and p.id <> v_rec.employee_id;

    -- A failed push never stops the rest of the run.
    begin
      if v_ids is not null then
        perform net.http_post(
          url := v_url || '/functions/v1/send-notification',
          body := jsonb_build_object(
            'employee_ids', to_jsonb(v_ids),
            'title', case when v_rec.kind = 'test' then 'Onboarding test overdue' else 'Onboarding task overdue' end,
            'body', case when v_rec.kind = 'test'
                      then v_rec.employee_name || '''s test "' || v_rec.task_title || '" is overdue'
                      else v_rec.employee_name || ' has not completed "' || v_rec.task_title || '"' end
                    || ' (due ' || to_char(v_rec.due_date, 'DD Mon') || ')',
            'tag', 'onboarding-overdue-' || v_rec.kind || '-' || v_rec.task_id || '-' || v_rec.employee_id,
            'url', case when v_rec.kind = 'test' then '/ambria-attendance/mark-tests' else '/ambria-attendance/' end
          ),
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
          timeout_milliseconds := 30000
        );
      end if;
    exception when others then null;
    end;
  end loop;
end;
$$;

revoke all on function public.process_onboarding_overdue() from public, anon, authenticated;

notify pgrst, 'reload schema';
