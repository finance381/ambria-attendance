-- ============================================================
-- Move the DAR "on-time" cutoff from 2 PM IST to 6 PM IST on
-- report_date + 1. Only the two cutoff intervals changed (14 hours
-- -> 18 hours) — rest of the function is identical to the previous
-- migration (20260918051851_fix_dar_compliance_null_timestamp.sql).
-- ============================================================

CREATE OR REPLACE FUNCTION public.dar_compliance(p_department_id integer DEFAULT NULL::integer, p_year integer DEFAULT NULL::integer, p_month integer DEFAULT NULL::integer, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_role text;
  v_dept_ids int[];
  v_start date;
  v_end date;
  v_today date;
  v_dar_cutoff date;
  v_result jsonb;
BEGIN
  v_role := public.user_role();
  IF v_role IS NULL AND current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    v_role := 'admin';
  END IF;
  IF v_role NOT IN ('admin', 'manager') THEN
    RETURN jsonb_build_object('error', 'Access denied');
  END IF;
  IF v_role = 'manager' THEN
    IF p_department_id IS NOT NULL THEN
      v_dept_ids := ARRAY[p_department_id];
    ELSE
      SELECT array_agg(department_id) INTO v_dept_ids
      FROM manager_departments WHERE employee_id = auth.uid();
      IF v_dept_ids IS NULL OR array_length(v_dept_ids, 1) IS NULL THEN
        v_dept_ids := ARRAY[(SELECT department_id FROM employees WHERE id = auth.uid())];
      END IF;
    END IF;
  ELSE
    IF p_department_id IS NOT NULL THEN
      v_dept_ids := ARRAY[p_department_id];
    END IF;
  END IF;
  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  IF p_from_date IS NOT NULL AND p_to_date IS NOT NULL THEN
    v_start := p_from_date;
    v_end := LEAST(p_to_date, v_today);
  ELSE
    v_start := make_date(COALESCE(p_year, EXTRACT(YEAR FROM v_today)::int), COALESCE(p_month, EXTRACT(MONTH FROM v_today)::int), 1);
    v_end := LEAST((v_start + interval '1 month' - interval '1 day')::date, v_today);
  END IF;
  SELECT COALESCE(
    (SELECT MAX(sub.report_date) FROM (
      SELECT report_date FROM daily_reports
      WHERE report_date BETWEEN v_start AND v_end
      GROUP BY report_date
      HAVING COUNT(DISTINCT emp_code) >= GREATEST(
        (SELECT COUNT(*) FROM employees WHERE active = true AND dar_required = true) * 0.3, 3
      )
    ) sub),
    v_end
  ) INTO v_dar_cutoff;

  WITH dar_employees AS (
    SELECT e.id, e.emp_code, e.name, e.department_id, d.name AS department_name,
           GREATEST(v_start, COALESCE(e.date_of_joining, v_start)) AS eff_start,
           v_dar_cutoff AS eff_end
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    WHERE e.active = true AND e.dar_required = true
      AND (v_dept_ids IS NULL OR e.department_id = ANY(v_dept_ids))
  ),
  present_days AS (
    SELECT employee_id, attendance_date
    FROM (
      SELECT employee_id, attendance_date,
        EXTRACT(EPOCH FROM (MAX(punched_at) - MIN(punched_at))) / 3600.0 AS hours,
        COUNT(*) FILTER (WHERE punch_type = 'in') AS ins,
        COUNT(*) FILTER (WHERE punch_type = 'out') AS outs
      FROM punches
      WHERE attendance_date BETWEEN v_start AND v_dar_cutoff
      GROUP BY employee_id, attendance_date
    ) sub
    WHERE hours >= 4 OR (ins > 0 AND outs = 0)
  ),
  expected_days AS (
    SELECT de.id AS employee_id,
           COUNT(pd.attendance_date) AS days_present
    FROM dar_employees de
    LEFT JOIN present_days pd ON pd.employee_id = de.id
      AND pd.attendance_date BETWEEN de.eff_start AND de.eff_end
    GROUP BY de.id
  ),
  dar_subs AS (
    SELECT dr.emp_code,
      COUNT(DISTINCT dr.report_date) AS days_submitted,
      COUNT(DISTINCT dr.report_date) FILTER (
        WHERE dr.message_sent_at IS NULL
           OR (dr.message_sent_at AT TIME ZONE 'Asia/Kolkata')
              < ((dr.report_date + 1)::timestamp + INTERVAL '18 hours')
      ) AS days_submitted_on_time,
      COUNT(DISTINCT dr.report_date) FILTER (
        WHERE dr.message_sent_at IS NOT NULL
          AND (dr.message_sent_at AT TIME ZONE 'Asia/Kolkata')
              >= ((dr.report_date + 1)::timestamp + INTERVAL '18 hours')
      ) AS days_late
    FROM daily_reports dr
    WHERE dr.report_date BETWEEN v_start AND v_dar_cutoff
    GROUP BY dr.emp_code
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'employee_id', de.id, 'emp_code', de.emp_code, 'name', de.name,
      'department_id', de.department_id, 'department_name', de.department_name,
      'days_present', COALESCE(ed.days_present, 0),
      'days_submitted', COALESCE(ds.days_submitted, 0),
      'days_submitted_on_time', COALESCE(ds.days_submitted_on_time, 0),
      'days_late', COALESCE(ds.days_late, 0),
      'dar_cutoff', v_dar_cutoff,
      'compliance_pct', CASE
        WHEN COALESCE(ed.days_present, 0) = 0 THEN 0
        ELSE LEAST(ROUND(
          ((COALESCE(ds.days_submitted_on_time, 0)::numeric + COALESCE(ds.days_late, 0)::numeric * 0.5)
           / ed.days_present) * 100
        ), 100)
      END
    ) ORDER BY de.department_name, de.name
  ) INTO v_result
  FROM dar_employees de
  LEFT JOIN expected_days ed ON ed.employee_id = de.id
  LEFT JOIN dar_subs ds ON ds.emp_code = de.emp_code;
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;
