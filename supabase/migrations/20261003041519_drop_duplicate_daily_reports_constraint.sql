-- ============================================================
-- Drop a duplicate unique constraint on daily_reports. Both
-- daily_reports_emp_code_report_date_key and daily_reports_emp_date_unique
-- are identical UNIQUE(emp_code, report_date) constraints -- every insert/
-- upsert into daily_reports (dar-consolidate runs daily, plus manual
-- backfills) was maintaining two btree indexes for the same
-- constraint, for no benefit. dar-consolidate's
-- onConflict: 'emp_code,report_date' only needs one matching unique
-- index to keep working.
-- ============================================================

ALTER TABLE public.daily_reports DROP CONSTRAINT daily_reports_emp_code_report_date_key;
