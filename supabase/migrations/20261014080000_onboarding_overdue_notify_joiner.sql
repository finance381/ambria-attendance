-- 20261014080000_onboarding_overdue_notify_joiner.sql
-- When an onboarding task / test goes overdue, the joiner now gets a push
-- too (once, in the same run as the points of contact), pointing them to
-- My Tasks. Everything else is as 20261014070000_onboarding_test_due_days.sql:
-- the onboarding_*overdue_notices rows still make it once per (step, joiner),
-- so neither side is told twice. Due-soon stays a Home-screen reminder only.
-- Run after 20261014070000_onboarding_test_due_days.sql.

create or replace function public.process_onboarding_overdue()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec  record;
  v_ids  uuid[];
  v_url  text;
  v_key  text;
  v_due  text;
  v_what text;
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

    v_due  := ' (due ' || to_char(v_rec.due_date, 'DD Mon') || ')';
    v_what := case when v_rec.kind = 'test' then 'test' else 'task' end;

    select array_agg(p.id) into v_ids
    from employees p
    where p.id = any (v_rec.poc_ids) and p.active and p.id <> v_rec.employee_id;

    -- A failed push never stops the rest of the run.
    begin
      -- Points of contact
      if v_ids is not null then
        perform net.http_post(
          url := v_url || '/functions/v1/send-notification',
          body := jsonb_build_object(
            'employee_ids', to_jsonb(v_ids),
            'title', 'Onboarding ' || v_what || ' overdue',
            'body', case when v_rec.kind = 'test'
                      then v_rec.employee_name || '''s test "' || v_rec.task_title || '" is overdue'
                      else v_rec.employee_name || ' has not completed "' || v_rec.task_title || '"' end
                    || v_due,
            'tag', 'onboarding-overdue-' || v_rec.kind || '-' || v_rec.task_id || '-' || v_rec.employee_id,
            'url', case when v_rec.kind = 'test' then '/ambria-attendance/mark-tests' else '/ambria-attendance/' end
          ),
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
          timeout_milliseconds := 30000
        );
      end if;

      -- The joiner
      perform net.http_post(
        url := v_url || '/functions/v1/send-notification',
        body := jsonb_build_object(
          'employee_id', v_rec.employee_id,
          'title', 'Your ' || v_what || ' is overdue',
          'body', '"' || v_rec.task_title || '" was due ' || to_char(v_rec.due_date, 'DD Mon')
                  || case when v_rec.kind = 'test' then '. Contact your point of contact for the test.'
                          else '. Please complete it.' end,
          'tag', 'onboarding-overdue-me-' || v_rec.kind || '-' || v_rec.task_id,
          'url', '/ambria-attendance/my-tasks'
        ),
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
        timeout_milliseconds := 30000
      );
    exception when others then null;
    end;
  end loop;
end;
$$;

revoke all on function public.process_onboarding_overdue() from public, anon, authenticated;
