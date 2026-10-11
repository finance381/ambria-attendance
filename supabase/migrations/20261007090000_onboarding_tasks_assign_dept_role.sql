-- 20261007090000_onboarding_tasks_assign_dept_role.sql
-- Target onboarding tasks at specific departments and roles.
-- Empty array = all departments / all roles.

alter table public.onboarding_tasks
  add column if not exists department_ids integer[] not null default '{}',
  add column if not exists roles text[] not null default '{}';

alter table public.onboarding_tasks
  drop constraint if exists onboarding_tasks_roles_check;

alter table public.onboarding_tasks
  add constraint onboarding_tasks_roles_check
  check (roles <@ array['staff', 'supervisor', 'manager', 'admin']::text[]);
