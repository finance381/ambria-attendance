-- 20261014060000_onboarding_due_reminders.sql
-- Onboarding task due dates: reminders and overdue alerts.
--   * Joiner's Home shows tasks due within 2 days / overdue. That needs no DB
--     change: it reads my_onboarding_flow() (due_date, done, locked).
--   * my_poc_overdue_tasks(): for a point of contact's Home — joiners whose
--     task (one the caller is a POC on) is past its due date and not done.
--   * process_onboarding_overdue(): daily cron (10:00 IST). For every task
--     that has gone overdue, pushes the task's points of contact once;
--     onboarding_overdue_notices remembers who was already told.
-- "Overdue" everywhere: due_date (date_of_joining + due_days) before today
-- (IST), not ticked, and not locked behind an unmarked test (the joiner
-- can't do a locked task yet, so it isn't their delay). Joiners count for
-- 60 days after joining, same window as tests_to_mark().
-- Run after 20261011070000_onboarding_test_after_count.sql.

create table if not exists public.onboarding_overdue_notices (
  task_id     bigint not null references public.onboarding_tasks(id) on delete cascade,
  employee_id uuid   not null references public.employees(id) on delete cascade,
  notified_at timestamptz not null default now(),
  primary key (task_id, employee_id)
);

alter table public.onboarding_overdue_notices enable row level security;

-- Only the cron function writes it; admins may read it.
drop policy if exists onboarding_overdue_notices_admin_read on public.onboarding_overdue_notices;
create policy onboarding_overdue_notices_admin_read on public.onboarding_overdue_notices
  for select to authenticated
  using (exists (select 1 from public.employees e where e.id = auth.uid() and e.role = 'admin' and e.active));

-- ── Every overdue (task, joiner) pair ───────────────────────────────────────
create or replace function public.onboarding_overdue_tasks()
returns table (
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
  select t.id, t.name, t.poc_ids,
         e.id, e.name, e.emp_code, d.name,
         e.date_of_joining + t.due_days
  from employees e
  join onboarding_tasks t
    on (cardinality(t.department_ids) = 0 or e.department_id = any (t.department_ids))
   and (cardinality(t.roles) = 0 or e.role = any (t.roles))
  join lateral onboarding_flow(e.id) f
    on f.kind = 'task' and f.item_id = t.id and not f.done and not f.locked
  left join departments d on d.id = e.department_id
  where e.active
    and e.date_of_joining is not null
    and e.date_of_joining >= (now() at time zone 'Asia/Kolkata')::date - 60
    and e.date_of_joining + t.due_days < (now() at time zone 'Asia/Kolkata')::date;
$$;

-- Only the functions below use it.
revoke all on function public.onboarding_overdue_tasks() from public, anon, authenticated;

-- ── Point of contact's Home: overdue tasks they're a contact on ────────────
create or replace function public.my_poc_overdue_tasks()
returns table (
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
  select o.task_id, o.task_title, o.employee_id, o.employee_name,
         o.emp_code, o.department_name, o.due_date
  from onboarding_overdue_tasks() o
  where auth.uid() = any (o.poc_ids)
    and o.employee_id <> auth.uid()
  order by o.due_date, o.employee_name;
$$;

revoke all on function public.my_poc_overdue_tasks() from public, anon;
grant execute on function public.my_poc_overdue_tasks() to authenticated;

-- ── Daily push to points of contact, once per overdue task ─────────────────
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
    where not exists (
      select 1 from onboarding_overdue_notices n
      where n.task_id = o.task_id and n.employee_id = o.employee_id
    )
  loop
    insert into onboarding_overdue_notices (task_id, employee_id)
    values (v_rec.task_id, v_rec.employee_id)
    on conflict do nothing;

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
            'title', 'Onboarding task overdue',
            'body', v_rec.employee_name || ' has not completed "' || v_rec.task_title
                    || '" (due ' || to_char(v_rec.due_date, 'DD Mon') || ')',
            'tag', 'onboarding-overdue-' || v_rec.task_id || '-' || v_rec.employee_id,
            'url', '/ambria-attendance/'
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

-- Every day at 10:00 IST (04:30 UTC). Re-running this file replaces the job.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'onboarding-overdue') then
    perform cron.unschedule('onboarding-overdue');
  end if;
end $$;

select cron.schedule('onboarding-overdue', '30 4 * * *', 'select public.process_onboarding_overdue()');

notify pgrst, 'reload schema';
