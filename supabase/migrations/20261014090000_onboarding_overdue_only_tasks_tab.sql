-- 20261014090000_onboarding_overdue_only_tasks_tab.sql
-- Fix: overdue reminders were counting every employee who joined in the last
-- 60 days, so a task for "All departments" listed ~100 regular staff who were
-- never given onboarding. Only employees whose Tasks tab is switched on
-- (visible_tabs contains 'tasks', set in Admin → Employees) are new joiners
-- for due dates now. Same columns as 20261014070000, so my_poc_overdue_tasks()
-- and process_onboarding_overdue() pick this up unchanged.
-- Run after 20261014080000_onboarding_overdue_notify_joiner.sql.

create or replace function public.onboarding_overdue_tasks()
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
      -- to_jsonb works whether visible_tabs is text[] or jsonb
      and coalesce(to_jsonb(e.visible_tabs), '[]'::jsonb) ? 'tasks'
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

notify pgrst, 'reload schema';
