-- 20261011060000_onboarding_test_sequence.sql
-- Tests take their place in the onboarding sequence.
--   * Per department, tests are ordered alongside tasks: onboarding_test_order
--     shares its position numbers with onboarding_task_order, so one list
--     (Task Order tab) interleaves both.
--   * onboarding_tests.place / after_count: where a test goes when it is
--     added — at the start, after the first N tasks, or at the end. The admin
--     app applies it to each department's order; Task Order fine-tunes it.
--   * A test gates what comes after it: until the test is marked, the steps
--     after it are locked. onboarding_flow(emp) works this out; it backs
--     my_onboarding_flow() (employee's My Tasks), tests_to_mark() (a joiner
--     shows up for marking only once they have reached the test),
--     submit_test_score() and set_task_complete().
--   * Ticking the last step before a test pushes the test's point of contact
--     (marked_by) that the joiner is ready for it.
-- Run after 20261009080000_reminders_every_5_min.sql.

create table if not exists public.onboarding_test_order (
  department_id integer not null references public.departments(id) on delete cascade,
  test_id       bigint  not null references public.onboarding_tests(id) on delete cascade,
  position      integer not null check (position >= 0),
  primary key (department_id, test_id)
);

alter table public.onboarding_test_order enable row level security;

drop policy if exists onboarding_test_order_admin_all on public.onboarding_test_order;
create policy onboarding_test_order_admin_all on public.onboarding_test_order
  for all to authenticated
  using (exists (select 1 from public.employees e where e.id = auth.uid() and e.role = 'admin' and e.active))
  with check (exists (select 1 from public.employees e where e.id = auth.uid() and e.role = 'admin' and e.active));

drop policy if exists onboarding_test_order_read on public.onboarding_test_order;
create policy onboarding_test_order_read on public.onboarding_test_order
  for select to authenticated
  using (exists (select 1 from public.employees e where e.id = auth.uid() and e.active));

alter table public.onboarding_tests
  add column if not exists place text not null default 'end',
  add column if not exists after_count integer check (after_count >= 1);

alter table public.onboarding_tests drop constraint if exists onboarding_tests_place_check;
alter table public.onboarding_tests
  add constraint onboarding_tests_place_check check (place in ('start', 'count', 'end'));

-- ── The sequence for one employee ──────────────────────────────────────────
-- Their tasks (department + role) and tests (department), in the
-- department's order; unordered items after the ordered ones (tasks before
-- tests, then by due day and age). locked = an unmarked test comes earlier;
-- ready = everything earlier is done.
create or replace function public.onboarding_flow(p_emp uuid)
returns table (seq bigint, kind text, item_id bigint, done boolean, locked boolean, ready boolean)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id, department_id, role from employees where id = p_emp
  ),
  items as (
    select 'task'::text as kind, t.id as item_id, o.position as pos, 0 as kr,
           t.due_days as dd, t.created_at as ca,
           exists (select 1 from onboarding_task_completions c
                   where c.task_id = t.id and c.employee_id = p_emp) as done
    from me
    join onboarding_tasks t
      on (cardinality(t.department_ids) = 0 or me.department_id = any (t.department_ids))
     and (cardinality(t.roles) = 0 or me.role = any (t.roles))
    left join onboarding_task_order o on o.department_id = me.department_id and o.task_id = t.id
    union all
    select 'test'::text, s.id, q.position, 1, null::integer, s.created_at,
           exists (select 1 from onboarding_test_results r
                   where r.test_id = s.id and r.employee_id = p_emp)
    from me
    join onboarding_tests s
      on (cardinality(s.department_ids) = 0 or me.department_id = any (s.department_ids))
     and s.marked_by is distinct from me.id
    left join onboarding_test_order q on q.department_id = me.department_id and q.test_id = s.id
  ),
  ordered as (
    select i.*, row_number() over (order by i.pos nulls last, i.kr, i.dd nulls last, i.ca, i.item_id) as seq
    from items i
  )
  select o.seq, o.kind, o.item_id, o.done,
         exists (select 1 from ordered p where p.kind = 'test' and not p.done and p.seq < o.seq) as locked,
         not exists (select 1 from ordered p where not p.done and p.seq < o.seq) as ready
  from ordered o
  order by o.seq;
$$;

-- Only the functions below use it.
revoke all on function public.onboarding_flow(uuid) from public, anon, authenticated;

-- ── My Tasks: the caller's whole sequence ──────────────────────────────────
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
         t.due_days,
         case when f.kind = 'task' and me.date_of_joining is not null
              then me.date_of_joining + t.due_days end,
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

revoke all on function public.my_onboarding_flow() from public, anon;
grant execute on function public.my_onboarding_flow() to authenticated;

-- ── Marking: only joiners who have reached the test ────────────────────────
-- Same columns as 20261008060000; a joiner is listed once every step before
-- the test is done (or once already scored).
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
  join lateral onboarding_flow(e.id) f
    on f.kind = 'test' and f.item_id = t.id and (f.ready or f.done)
  left join departments d on d.id = e.department_id
  left join onboarding_test_results r on r.test_id = t.id and r.employee_id = e.id
  where t.marked_by = auth.uid()
  order by t.created_at desc, e.date_of_joining desc, e.name;
$$;

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
  if not exists (
    select 1 from onboarding_flow(p_employee_id) f
    where f.kind = 'test' and f.item_id = p_test_id and (f.ready or f.done)
  ) then
    raise exception 'This joiner has not finished the steps before this test yet';
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

-- ── Ticking a task: locked steps refused; a test that becomes ready pushes
--    its point of contact. Otherwise as 20261009070000. ────────────────────
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
  v_test       record;
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

  if exists (
    select 1 from onboarding_flow(v_me.id) f
    where f.kind = 'task' and f.item_id = p_task_id and f.locked
  ) then
    raise exception 'Finish the test before this task first';
  end if;

  insert into onboarding_task_completions (task_id, employee_id)
  values (p_task_id, v_me.id)
  on conflict do nothing;
  if not found then
    -- Already ticked: no second push.
    return json_build_object('ok', true, 'all_done', false);
  end if;

  select trim(both '"' from value::text) into v_url from app_config where key = 'supabase_url';
  select trim(both '"' from value::text) into v_key from app_config where key = 'service_role_key';

  -- Tests this tick has made ready (everything before them done, not yet
  -- marked): tell each test's point of contact. A push failure never undoes
  -- the tick.
  begin
    if v_url is not null and v_key is not null then
      for v_test in
        select s.id, s.title, s.marked_by
        from onboarding_flow(v_me.id) f
        join onboarding_tests s on s.id = f.item_id
        join employees p on p.id = s.marked_by and p.active
        where f.kind = 'test' and f.ready and not f.done
          and s.marked_by is distinct from v_me.id
      loop
        perform net.http_post(
          url := v_url || '/functions/v1/send-notification',
          body := jsonb_build_object(
            'employee_ids', to_jsonb(array[v_test.marked_by]),
            'title', 'Ready for a test',
            'body', v_me.name || ' is ready for the test: ' || v_test.title,
            'tag', 'onboarding-test-' || v_test.id || '-' || v_me.id,
            'url', '/ambria-attendance/mark-tests'
          ),
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
          timeout_milliseconds := 30000
        );
      end loop;
    end if;
  exception when others then null;
  end;

  select count(*), count(c.task_id) into v_total, v_done
  from onboarding_tasks t
  left join onboarding_task_completions c on c.task_id = t.id and c.employee_id = v_me.id
  where (cardinality(t.department_ids) = 0 or v_me.department_id = any (t.department_ids))
    and (cardinality(t.roles) = 0 or v_me.role = any (t.roles));

  if v_done < v_total then
    return json_build_object('ok', true, 'all_done', false);
  end if;

  begin
    select array_agg(distinct p.id) into v_notify_ids
    from onboarding_tasks t
    join employees p on p.id = any (t.poc_ids) and p.active
    where p.id <> v_me.id
      and (cardinality(t.department_ids) = 0 or v_me.department_id = any (t.department_ids))
      and (cardinality(t.roles) = 0 or v_me.role = any (t.roles));

    if v_notify_ids is not null and v_url is not null and v_key is not null then
      perform net.http_post(
        url := v_url || '/functions/v1/send-notification',
        body := jsonb_build_object(
          'employee_ids', to_jsonb(v_notify_ids),
          'title', 'Onboarding tasks complete',
          'body', v_me.name || ' has completed all onboarding tasks',
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

notify pgrst, 'reload schema';
