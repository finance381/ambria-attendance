-- ============================================================
-- my_punch_status() treated an overnight open punch (no punch-out
-- yet) as "still punched in" for up to 16 hours after punch-in, and
-- flagged it as a stale punch needing a claim beyond that. Extend
-- that window to 20 hours.
-- ============================================================

CREATE OR REPLACE FUNCTION public.my_punch_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date;
  v_now timestamptz;
  v_last_in timestamptz;
  v_last_out timestamptz;
  v_is_punched_in boolean;
  v_total_sessions int;
  v_has_stale boolean;
  v_overnight_open record;
BEGIN
  v_now := now();
  v_today := (v_now AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT p.punched_at, p.attendance_date
  INTO v_overnight_open
  FROM punches p
  WHERE p.employee_id = auth.uid()
    AND p.punch_type = 'in'
    AND p.attendance_date = v_today - 1
    AND p.punched_at > v_now - interval '20 hours'
    AND NOT EXISTS (
      SELECT 1 FROM punches p2
      WHERE p2.employee_id = auth.uid()
        AND p2.punch_type = 'out'
        AND p2.attendance_date = p.attendance_date
        AND p2.punched_at > p.punched_at
    )
  ORDER BY p.punched_at DESC
  LIMIT 1;

  IF v_overnight_open IS NOT NULL THEN
    SELECT
      MAX(CASE WHEN punch_type = 'in' THEN punched_at END),
      MAX(CASE WHEN punch_type = 'out' THEN punched_at END)
    INTO v_last_in, v_last_out
    FROM punches
    WHERE employee_id = auth.uid()
      AND attendance_date IN (v_today, v_today - 1);

    RETURN jsonb_build_object(
      'is_punched_in', true,
      'last_in', v_overnight_open.punched_at,
      'last_out', v_last_out,
      'sessions_today', 1,
      'attendance_date', v_today,
      'has_stale_punch', false,
      'night_shift', true,
      'night_shift_date', v_overnight_open.attendance_date
    );
  END IF;

  SELECT
    MAX(CASE WHEN punch_type = 'in' THEN punched_at END),
    MAX(CASE WHEN punch_type = 'out' THEN punched_at END)
  INTO v_last_in, v_last_out
  FROM punches
  WHERE employee_id = auth.uid()
    AND attendance_date = v_today;

  SELECT EXISTS(
    SELECT 1 FROM punches p
    WHERE p.employee_id = auth.uid()
      AND p.punch_type = 'in'
      AND p.attendance_date = v_today
      AND NOT EXISTS (
        SELECT 1 FROM punches p2
        WHERE p2.employee_id = auth.uid()
          AND p2.punch_type = 'out'
          AND p2.attendance_date = v_today
          AND p2.punched_at > p.punched_at
      )
  ) INTO v_is_punched_in;

  SELECT EXISTS(
    SELECT 1 FROM punches p
    WHERE p.employee_id = auth.uid()
      AND p.punch_type = 'in'
      AND p.attendance_date < v_today
      AND p.punched_at <= v_now - interval '20 hours'
      AND NOT EXISTS (
        SELECT 1 FROM punches p2
        WHERE p2.employee_id = auth.uid()
          AND p2.punch_type = 'out'
          AND p2.attendance_date = p.attendance_date
          AND p2.punched_at > p.punched_at
      )
  ) INTO v_has_stale;

  SELECT count(*) INTO v_total_sessions
  FROM punches
  WHERE employee_id = auth.uid()
    AND attendance_date = v_today
    AND punch_type = 'in';

  RETURN jsonb_build_object(
    'is_punched_in', v_is_punched_in,
    'last_in', v_last_in,
    'last_out', v_last_out,
    'sessions_today', v_total_sessions,
    'attendance_date', v_today,
    'has_stale_punch', v_has_stale,
    'night_shift', false
  );
END;
$function$;
