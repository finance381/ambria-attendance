-- ============================================================
-- monthly_summary_range() marked "today" as an Incomplete day
-- the instant someone was still punched in with no punch-out yet,
-- and counted that day into effective_days (the attendance %
-- denominator) immediately -- dragging the % down mid-shift, before
-- the day was even over. Fix: when today's shift is still open
-- (classify_day would return 'Incomplete' for the current date),
-- exclude that day entirely from today's stats instead of counting
-- it as a negative mark. A past day left incomplete (forgot to
-- punch out) still correctly counts as Incomplete once it's no
-- longer "today".
-- ============================================================

CREATE OR REPLACE FUNCTION public.monthly_summary_range(p_from_date date, p_to_date date, p_department_id integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_role text;
  v_dept_ids int[];
  v_today date;
  v_start date;
  v_end date;
  v_half_threshold numeric;
  v_absent_threshold numeric;
  v_claim_limit int;
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
  v_start := p_from_date;
  v_end := LEAST(p_to_date, v_today);

  BEGIN
    v_half_threshold := trim(both '"' from (SELECT value::text FROM app_config WHERE key = 'half_day_threshold_hours'))::numeric;
  EXCEPTION WHEN OTHERS THEN v_half_threshold := 6;
  END;
  BEGIN
    v_absent_threshold := trim(both '"' from (SELECT value::text FROM app_config WHERE key = 'absent_threshold_hours'))::numeric;
  EXCEPTION WHEN OTHERS THEN v_absent_threshold := 4;
  END;
  BEGIN
    v_claim_limit := trim(both '"' from (SELECT value::text FROM app_config WHERE key = 'claim_limit'))::int;
  EXCEPTION WHEN OTHERS THEN v_claim_limit := 4;
  END;

  WITH emp_list AS (
    SELECT e.id, e.emp_code, e.name, e.department_id, e.designation,
           e.is_casual, e.date_of_joining, e.active,
           d.name AS department_name,
           GREATEST(v_start, COALESCE(e.date_of_joining, v_start)) AS eff_start,
           LEAST(v_end, v_today) AS eff_end
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    WHERE (v_dept_ids IS NULL OR e.department_id = ANY(v_dept_ids))
      AND (COALESCE(e.date_of_joining, e.created_at)::date <= v_end
           OR EXISTS (SELECT 1 FROM punches p2 WHERE p2.employee_id = e.id AND p2.attendance_date BETWEEN v_start AND v_end))
      AND (e.active = true OR EXISTS (
        SELECT 1 FROM punches p WHERE p.employee_id = e.id AND p.attendance_date BETWEEN v_start AND v_end
      ))
  ),
  punch_ordered AS (
    SELECT employee_id, attendance_date, punch_type, punched_at,
      ROW_NUMBER() OVER (PARTITION BY employee_id, attendance_date, punch_type ORDER BY punched_at) AS rn
    FROM punches
    WHERE attendance_date BETWEEN v_start AND v_end
      AND employee_id IN (SELECT id FROM emp_list)
  ),
  punch_pairs AS (
    SELECT pin.employee_id, pin.attendance_date,
      pin.punched_at AS in_time, pout.punched_at AS out_time
    FROM punch_ordered pin
    LEFT JOIN punch_ordered pout
      ON pout.employee_id = pin.employee_id
      AND pout.attendance_date = pin.attendance_date
      AND pout.punch_type = 'out' AND pout.rn = pin.rn
    WHERE pin.punch_type = 'in'
  ),
  daily_hours AS (
    SELECT employee_id, attendance_date,
      SUM(CASE WHEN out_time IS NOT NULL THEN EXTRACT(EPOCH FROM out_time - in_time) / 3600.0 ELSE 0 END) AS total_hours,
      bool_or(out_time IS NULL) AS has_incomplete
    FROM punch_pairs
    GROUP BY employee_id, attendance_date
  ),
  daily_overrides AS (
    SELECT DISTINCT ON (employee_id, attendance_date, override_type)
      employee_id, attendance_date, override_type, override_value
    FROM attendance_overrides
    WHERE attendance_date BETWEEN v_start AND v_end
    ORDER BY employee_id, attendance_date, override_type, created_at DESC
  ),
  status_override AS (
    SELECT employee_id, attendance_date, override_value
    FROM daily_overrides
    WHERE override_type IN ('status', 'full_day_override')
  ),
  daily_status AS (
    SELECT el.id AS employee_id, el.is_casual, d.dt AS attendance_date,
      CASE
        WHEN d.dt::date = v_today AND so.override_value IS NULL AND classify_day(
          dh.total_hours,
          COALESCE(dh.has_incomplete, CASE WHEN dh.attendance_date IS NULL AND EXISTS (
            SELECT 1 FROM punches px WHERE px.employee_id = el.id AND px.attendance_date = d.dt::date
          ) THEN true ELSE false END),
          el.is_casual,
          so.override_value,
          v_half_threshold,
          v_absent_threshold
        ) = 'Incomplete' THEN NULL
        ELSE classify_day(
          dh.total_hours,
          COALESCE(dh.has_incomplete, CASE WHEN dh.attendance_date IS NULL AND EXISTS (
            SELECT 1 FROM punches px WHERE px.employee_id = el.id AND px.attendance_date = d.dt::date
          ) THEN true ELSE false END),
          el.is_casual,
          so.override_value,
          v_half_threshold,
          v_absent_threshold
        )
      END AS status,
      COALESCE(dh.total_hours, 0) AS hours
    FROM emp_list el
    CROSS JOIN generate_series(el.eff_start, el.eff_end, '1 day'::interval) AS d(dt)
    LEFT JOIN daily_hours dh ON dh.employee_id = el.id AND dh.attendance_date = d.dt::date
    LEFT JOIN status_override so ON so.employee_id = el.id AND so.attendance_date = d.dt::date
    WHERE d.dt::date <= v_today
  ),
  emp_summary AS (
    SELECT employee_id,
      COUNT(*) FILTER (WHERE status IS NOT NULL) AS effective_days,
      COUNT(*) FILTER (WHERE status = 'Present') AS days_present,
      COUNT(*) FILTER (WHERE status = 'Half Day') AS days_half,
      COUNT(*) FILTER (WHERE status = 'Absent') AS days_absent,
      COUNT(*) FILTER (WHERE status = 'Incomplete') AS days_incomplete,
      ROUND(SUM(hours)::numeric, 1) AS total_hours
    FROM daily_status
    GROUP BY employee_id
  ),
  claims_count AS (
    SELECT employee_id, COUNT(*) AS claims_used
    FROM missed_claims
    WHERE date_trunc('month', created_at AT TIME ZONE 'Asia/Kolkata')
          BETWEEN date_trunc('month', v_start::timestamp)
          AND date_trunc('month', v_end::timestamp)
    GROUP BY employee_id
  ),
  continue_count AS (
    SELECT employee_id, COALESCE(SUM(credit_days), 0)::int AS continue_credits
    FROM continue_credits
    WHERE attendance_date BETWEEN v_start AND v_end
    GROUP BY employee_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'employee_id', el.id, 'emp_code', el.emp_code, 'name', el.name,
      'department_id', el.department_id, 'department_name', el.department_name,
      'designation', el.designation, 'is_casual', el.is_casual,
      'effective_days', COALESCE(es.effective_days, 0),
      'days_present', COALESCE(es.days_present, 0),
      'days_half', COALESCE(es.days_half, 0),
      'days_absent', COALESCE(es.days_absent, 0),
      'days_incomplete', COALESCE(es.days_incomplete, 0),
      'total_hours', COALESCE(es.total_hours, 0),
      'claims_used', COALESCE(cc.claims_used, 0),
      'claims_limit', v_claim_limit,
      'claims_over_limit', COALESCE(cc.claims_used, 0) > v_claim_limit,
      'continue_credits', COALESCE(ct.continue_credits, 0),
      'attendance_pct', CASE
        WHEN COALESCE(es.effective_days, 0) = 0 THEN 0
        ELSE ROUND(((COALESCE(es.days_present,0) + COALESCE(es.days_half,0) * 0.5)::numeric / es.effective_days) * 100)
      END
    ) ORDER BY el.department_name, el.name
  )
  INTO v_result
  FROM emp_list el
  LEFT JOIN emp_summary es ON es.employee_id = el.id
  LEFT JOIN claims_count cc ON cc.employee_id = el.id
  LEFT JOIN continue_count ct ON ct.employee_id = el.id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;
