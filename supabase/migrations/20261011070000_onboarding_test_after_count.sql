-- 20261011070000_onboarding_test_after_count.sql
-- New Joiners → Tests: a test can also be placed by number — "after task N"
-- (place = 'count', after_count = N). N counts tasks in each department's
-- own sequence, so the test lands after that department's Nth task (at the
-- end if it has fewer). Like the other places, the admin app turns this
-- into onboarding_test_order rows; the DB functions only read those.
-- Run after 20261011060000_onboarding_test_sequence.sql.

alter table public.onboarding_tests
  add column if not exists after_count integer check (after_count >= 0);

alter table public.onboarding_tests drop constraint if exists onboarding_tests_place_check;
alter table public.onboarding_tests
  add constraint onboarding_tests_place_check check (place in ('start', 'after', 'count', 'end'));
