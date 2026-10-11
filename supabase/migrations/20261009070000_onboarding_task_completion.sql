-- 20261009070000_onboarding_task_completion.sql
-- My Tasks → "Mark as complete". One row per (task, employee) the employee
-- has ticked. When the last of the caller's tasks gets ticked, the points of
-- contact (poc_ids) of their tasks get a push. my_onboarding_tasks() now also
-- returns completed_at.
-- Run after 20261009060000_onboarding_task_order.sql.

create table if not exists public.onboarding_task_completions (
  task_id      bigint not null references public.onboarding_tasks(id) on delete cascade,
  employee_id  uuid   not null references public.employees(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (task_id, employee_id)
);

alter table public.onboarding_task_completions enable row level security;

-- Admins: full access.
drop policy if exists onboarding_task_completions_admin_all on public.onboarding_task_completions;
create policy onboarding_task_completions_admin_all on public.onboarding_task_completions
  for all to authenticated
  using (exists (select 1 from public.employees e where e.id = auth.uid() and e.role = 'admin' and e.active))
  with check (exists (select 1 from public.employees e where e.id = auth.uid() and e.role = 'admin' and e.active));

-- Employees read their own ticks; writes only go through set_task_complete().
drop policy if exists onboarding_task_completions_read_own on public.onboarding_task_completions;
create policy onboarding_task_completions_read_own on public.onboarding_task_completions
  for select to authenticated
  using (employee_id = auth.uid());

-- Return type changes (new completed_at column), so drop first.
drop function if exists public.my_onboarding_tasks();
create function public.my_onboarding_tasks()
returns table (
  id           bigint,
  name         text,
  description  text,
  due_days     integer,
  due_date     date,
  poc_names    text[],
  docs         jsonb,
  completed_at timestamptz
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
                   from training_docs d where d.id = any (t.training_doc_ids)), '[]'::jsonb),
         c.completed_at
  from employees me
  join onboarding_tasks t
    on (cardinality(t.department_ids) = 0 or me.department_id = any (t.department_ids))
   and (cardinality(t.roles) = 0 or me.role = any (t.roles))
  left join onboarding_task_order o
    on o.department_id = me.department_id and o.task_id = t.id
  left join onboarding_task_completions c
    on c.task_id = t.id and c.employee_id = me.id
  where me.id = auth.uid() and me.active
  order by o.position nulls last, 5 nulls last, t.created_at;
$$;

revoke all on function public.my_onboarding_tasks() from public, anon;
grant execute on function public.my_onboarding_tasks() to authenticated;

-- Tick / untick one of the caller's tasks. Returns { ok, all_done }.
-- all_done is true only on the tick that completes the last task; that tick
-- also pushes the tasks' points of contact. Untick + re-tick of the last task pushes again.
create or replace function public.set_task_complete(p_task_id bigint, p_done boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me         employees%rowtype;
  v_total      int;
  v_done       int;
  v_notify_ids uuid[];
  v_url        text;
  v_key        text;
begin
  select * into v_me from employees where id = auth.uid() and active;
  if not found then
    raise exception 'Employee not found';
  end if;

  if not exists (
    select 1 from onboarding_tasks t
    where t.id = p_task_id
      and (cardinality(t.department_ids) = 0 or v_me.department_id = any (t.department_ids))
      and (cardinality(t.roles) = 0 or v_me.role = any (t.roles))
  ) then
    raise exception 'This task is not assigned to you';
  end if;

  if not p_done then
    delete from onboarding_task_completions where task_id = p_task_id and employee_id = v_me.id;
    return json_build_object('ok', true, 'all_done', false);
  end if;

  insert into onboarding_task_completions (task_id, employee_id)
  values (p_task_id, v_me.id)
  on conflict do nothing;
  if not found then
    -- Already ticked: no second push.
    return json_build_object('ok', true, 'all_done', false);
  end if;

  select count(*), count(c.task_id) into v_total, v_done
  from onboarding_tasks t
  left join onboarding_task_completions c on c.task_id = t.id and c.employee_id = v_me.id
  where (cardinality(t.department_ids) = 0 or v_me.department_id = any (t.department_ids))
    and (cardinality(t.roles) = 0 or v_me.role = any (t.roles));

  if v_done < v_total then
    return json_build_object('ok', true, 'all_done', false);
  end if;

  -- Same push pattern as submit_claim(); a push failure never undoes the tick.
  begin
    -- Points of contact of the caller's tasks.
    select array_agg(distinct p.id) into v_notify_ids
    from onboarding_tasks t
    join employees p on p.id = any (t.poc_ids) and p.active
    where p.id <> v_me.id
      and (cardinality(t.department_ids) = 0 or v_me.department_id = any (t.department_ids))
      and (cardinality(t.roles) = 0 or v_me.role = any (t.roles));

    select trim(both '"' from value::text) into v_url from app_config where key = 'supabase_url';
    select trim(both '"' from value::text) into v_key from app_config where key = 'service_role_key';

    if v_notify_ids is not null and v_url is not null and v_key is not null then
      perform net.http_post(
        url := v_url || '/functions/v1/send-notification',
        body := jsonb_build_object(
          'employee_ids', to_jsonb(v_notify_ids),
          'title', 'Onboarding tasks complete',
          'body', v_me.name || ' has completed all onboarding tasks and is ready for the test',
          'tag', 'onboarding-done-' || v_me.id,
          'url', '/ambria-attendance/mark-tests'
        ),
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
        timeout_milliseconds := 30000
      );
    end if;
  exception when others then null;
  end;

  return json_build_object('ok', true, 'all_done', true);
end;
$$;

revoke all on function public.set_task_complete(bigint, boolean) from public, anon;
grant execute on function public.set_task_complete(bigint, boolean) to authenticated;
