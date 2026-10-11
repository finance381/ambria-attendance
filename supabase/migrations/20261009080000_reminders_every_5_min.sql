-- 20261009080000_reminders_every_5_min.sql
-- Punch reminders: run every 5 minutes instead of 15, and look back instead
-- of around "now".
--   * Old: cron */15, window now-7min .. now+8min. A reminder could fire up
--     to 8 minutes early, and one saved just after its window's run (e.g. set
--     at 5:19 for 5:20, after the 5:15 run) was never sent at all.
--   * New: cron */5, window (now-5min, now] with now cut to the minute. Each
--     run picks up reminder times since the previous run, so a reminder fires
--     at its time or up to 5 minutes after, exactly once.
-- Everything else (who gets a reminder, punch-in / punch-out checks, push
-- text) is the same as the version that was live before this.
-- Run after 20261009070000_onboarding_task_completion.sql.

create or replace function public.process_reminders()
returns void
language plpgsql
as $$
declare
  v_now_ist        time;
  v_today          date;
  v_window_start   time;
  v_window_end     time;
  v_wraps_midnight boolean;
  v_rec            record;
  v_function_url   text;
  v_service_key    text;
begin
  v_now_ist := date_trunc('minute', now() at time zone 'Asia/Kolkata')::time;
  v_today   := (now() at time zone 'Asia/Kolkata')::date;

  -- (start, end]: start excluded, end included, so back-to-back runs never
  -- overlap or leave a gap.
  v_window_start   := v_now_ist - interval '5 minutes';
  v_window_end     := v_now_ist;
  v_wraps_midnight := v_window_start > v_window_end;

  select trim(both '"' from value::text) into v_function_url
  from app_config where key = 'supabase_url';
  v_function_url := v_function_url || '/functions/v1/send-notification';

  select trim(both '"' from value::text) into v_service_key
  from app_config where key = 'service_role_key';

  if v_function_url is null or v_service_key is null then
    return;
  end if;

  -- Punch-in reminders: only if not punched in yet today.
  for v_rec in
    select rp.employee_id, rp.punch_in_time
    from reminder_preferences rp
    join employees e on e.id = rp.employee_id and e.active = true
    where rp.enabled = true
      and rp.punch_in_time is not null
      and (
        case when v_wraps_midnight
          then rp.punch_in_time > v_window_start or rp.punch_in_time <= v_window_end
          else rp.punch_in_time > v_window_start and rp.punch_in_time <= v_window_end
        end
      )
      and not exists (
        select 1 from punches p
        where p.employee_id = rp.employee_id
          and p.attendance_date = v_today
          and p.punch_type = 'in'
      )
  loop
    perform net.http_post(
      url := v_function_url,
      body := jsonb_build_object(
        'employee_id', v_rec.employee_id,
        'title', 'Punch In Reminder',
        'body', 'Don''t forget to punch in! Your shift reminder is set for ' ||
          to_char(v_rec.punch_in_time, 'HH12:MI AM'),
        'tag', 'reminder-in',
        'url', '/ambria-attendance/'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      timeout_milliseconds := 30000
    );
  end loop;

  -- Punch-out reminders: only if punched in today and not punched out since.
  for v_rec in
    select rp.employee_id, rp.punch_out_time
    from reminder_preferences rp
    join employees e on e.id = rp.employee_id and e.active = true
    where rp.enabled = true
      and rp.punch_out_time is not null
      and (
        case when v_wraps_midnight
          then rp.punch_out_time > v_window_start or rp.punch_out_time <= v_window_end
          else rp.punch_out_time > v_window_start and rp.punch_out_time <= v_window_end
        end
      )
      and exists (
        select 1 from punches p
        where p.employee_id = rp.employee_id
          and p.attendance_date = v_today
          and p.punch_type = 'in'
          and not exists (
            select 1 from punches p2
            where p2.employee_id = p.employee_id
              and p2.attendance_date = v_today
              and p2.punch_type = 'out'
              and p2.punched_at > p.punched_at
          )
      )
  loop
    perform net.http_post(
      url := v_function_url,
      body := jsonb_build_object(
        'employee_id', v_rec.employee_id,
        'title', 'Punch Out Reminder',
        'body', 'You''re still punched in! Don''t forget to punch out.',
        'tag', 'reminder-out',
        'url', '/ambria-attendance/'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      timeout_milliseconds := 30000
    );
  end loop;
end;
$$;

-- Cron: every 15 min -> every 5 min.
select cron.alter_job(
  job_id   := (select jobid from cron.job where jobname = 'process-reminders'),
  schedule := '*/5 * * * *'
);
