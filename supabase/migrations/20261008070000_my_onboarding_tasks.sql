-- 20261008070000_my_onboarding_tasks.sql
-- Employee-side "My Tasks" (mobile tab id 'tasks').
--   * Employees now only read onboarding tasks aimed at their department +
--     role (empty array = all), or tasks where they are a point of contact.
--     Admins keep full access via onboarding_tasks_admin_all.
--   * Training docs attached to a task the employee can see become readable
--     too (row + file), even if the doc itself targets another dept/role.
--   * my_onboarding_tasks() returns the caller's tasks with due date
--     (date_of_joining + due_days), POC names and attached docs.
-- Run after 20261007090000_onboarding_tasks_assign_dept_role.sql.

drop policy if exists onboarding_tasks_read on public.onboarding_tasks;
create policy onboarding_tasks_read on public.onboarding_tasks
  for select to authenticated
  using (exists (
    select 1 from public.employees e
    where e.id = auth.uid() and e.active
      and (
        auth.uid() = any (onboarding_tasks.poc_ids)
        or (
          (cardinality(onboarding_tasks.department_ids) = 0 or e.department_id = any (onboarding_tasks.department_ids))
          and (cardinality(onboarding_tasks.roles) = 0 or e.role = any (onboarding_tasks.roles))
        )
      )
  ));

drop policy if exists training_docs_read_own on public.training_docs;
create policy training_docs_read_own on public.training_docs
  for select to authenticated
  using (
    exists (
      select 1 from public.employees e
      where e.id = auth.uid() and e.active
        and (training_docs.department_id is null or training_docs.department_id = e.department_id)
        and (training_docs.role is null or training_docs.role = e.role)
    )
    -- onboarding_tasks is itself filtered by onboarding_tasks_read above.
    or exists (
      select 1 from public.onboarding_tasks t
      where training_docs.id = any (t.training_doc_ids)
    )
  );

create or replace function public.my_onboarding_tasks()
returns table (
  id          bigint,
  name        text,
  description text,
  due_days    integer,
  due_date    date,
  poc_names   text[],
  docs        jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name, t.description, t.due_days,
         case when me.date_of_joining is null then null
              else me.date_of_joining + t.due_days end,
         coalesce((select array_agg(p.name order by p.name)
                   from employees p where p.id = any (t.poc_ids)), '{}'),
         coalesce((select jsonb_agg(jsonb_build_object(
                            'id', d.id, 'title', d.title,
                            'file_path', d.file_path, 'file_type', d.file_type)
                          order by d.title)
                   from training_docs d where d.id = any (t.training_doc_ids)), '[]'::jsonb)
  from employees me
  join onboarding_tasks t
    on (cardinality(t.department_ids) = 0 or me.department_id = any (t.department_ids))
   and (cardinality(t.roles) = 0 or me.role = any (t.roles))
  where me.id = auth.uid() and me.active
  order by 5 nulls last, t.created_at;
$$;

revoke all on function public.my_onboarding_tasks() from public, anon;
grant execute on function public.my_onboarding_tasks() to authenticated;
