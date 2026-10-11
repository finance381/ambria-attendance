-- 20261007080000_onboarding_tasks_custom_due_days.sql
-- Let admins choose how many days after date_of_joining a task is due
-- (was fixed at 7). Default stays 7; allowed range 1–365.

alter table public.onboarding_tasks
  drop constraint if exists onboarding_tasks_due_days_check;

alter table public.onboarding_tasks
  add constraint onboarding_tasks_due_days_check check (due_days between 1 and 365);
