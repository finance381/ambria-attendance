-- ============================================================
-- Guard punch for salaried staff (Punch for Team → Salaried Staff
-- mode, Direction A from the agreed mockup).
--
-- Security guards (role = 'supervisor') can already proxy-punch
-- casual workers via proxy_punch(). This extends that to salaried
-- (non-casual) staff, but ONLY for employees in a department the
-- admin has explicitly tagged via the new Departments "Guard Punch"
-- toggle — everything else about proxy_punch is unchanged.
-- ============================================================

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS guard_punch_enabled boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------
-- proxy_punch(): same signature as before, only the supervisor
-- gate changes. Casuals, and managers/admins punching anyone,
-- are completely unaffected.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proxy_punch(p_target_employee_id uuid, p_punch_type text, p_selfie_path text, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric, p_gps_accuracy numeric DEFAULT NULL::numeric, p_device_info text DEFAULT NULL::text, p_location_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_actor uuid;
  v_role text;
  v_target record;
  v_now timestamptz;
  v_today date;
  v_attendance_date date;
  v_cooldown_minutes int;
  v_last_punch timestamptz;
  v_open_punch record;
  v_venue_id int;
  v_venue_name text;
  v_venue_dist numeric;
  v_punch_id bigint;
BEGIN
  v_actor := auth.uid();
  v_role := public.user_role();

  IF v_role IS NULL OR v_role NOT IN ('supervisor', 'manager', 'admin') THEN
    RETURN jsonb_build_object('error', 'Only supervisors, managers, and admins can proxy punch');
  END IF;
  IF p_punch_type NOT IN ('in', 'out') THEN
    RETURN jsonb_build_object('error', 'Invalid punch type');
  END IF;
  IF p_selfie_path IS NULL OR trim(p_selfie_path) = '' THEN
    RETURN jsonb_build_object('error', 'Photo of worker is required for proxy punch');
  END IF;

  SELECT id, name, is_casual, department_id INTO v_target
  FROM employees WHERE id = p_target_employee_id AND active = true;

  IF v_target IS NULL THEN
    RETURN jsonb_build_object('error', 'Employee not found or inactive');
  END IF;
  IF v_role = 'supervisor' AND NOT v_target.is_casual THEN
    IF p_target_employee_id = v_actor THEN
      RETURN jsonb_build_object('error', 'You cannot proxy punch yourself');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM departments d
      WHERE d.id = v_target.department_id
        AND d.active = true
        AND d.guard_punch_enabled = true
    ) THEN
      RETURN jsonb_build_object('error', 'This employee''s department is not enabled for guard punch');
    END IF;
  END IF;

  v_now := now();
  v_today := (v_now AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT trim(both '"' from value::text)::int INTO v_cooldown_minutes
  FROM app_config WHERE key = 'duplicate_punch_cooldown_minutes';
  v_cooldown_minutes := COALESCE(v_cooldown_minutes, 5);

  SELECT punched_at INTO v_last_punch
  FROM punches
  WHERE employee_id = p_target_employee_id
    AND punch_type = p_punch_type
    AND punched_at > v_now - (v_cooldown_minutes || ' minutes')::interval
  ORDER BY punched_at DESC
  LIMIT 1;

  IF v_last_punch IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Duplicate punch — wait ' || v_cooldown_minutes || ' minutes');
  END IF;

  IF p_punch_type = 'in' THEN
    v_attendance_date := v_today;
  ELSIF p_punch_type = 'out' THEN
    SELECT p.attendance_date INTO v_open_punch
    FROM punches p
    WHERE p.employee_id = p_target_employee_id
      AND p.punch_type = 'in'
      AND NOT EXISTS (
        SELECT 1 FROM punches p2
        WHERE p2.employee_id = p_target_employee_id
          AND p2.punch_type = 'out'
          AND p2.punched_at > p.punched_at
          AND p2.attendance_date = p.attendance_date
      )
    ORDER BY p.punched_at DESC
    LIMIT 1;

    IF v_open_punch IS NULL THEN
      RETURN jsonb_build_object('error', 'No active punch-in found for ' || v_target.name);
    END IF;
    v_attendance_date := v_open_punch.attendance_date;
  END IF;

  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    SELECT nv.venue_id, nv.venue_name, nv.distance_meters
    INTO v_venue_id, v_venue_name, v_venue_dist
    FROM nearest_venue(p_latitude, p_longitude) nv;

    IF v_venue_dist IS NOT NULL THEN
      DECLARE v_radius int;
      BEGIN
        SELECT radius_meters INTO v_radius FROM venues WHERE id = v_venue_id;
        IF v_venue_dist > v_radius THEN
          v_venue_id := NULL;
          v_venue_name := NULL;
        END IF;
      END;
    END IF;
  END IF;

  INSERT INTO punches (
    employee_id, punch_type, punched_at, attendance_date,
    selfie_path, latitude, longitude, gps_accuracy_meters,
    nearest_venue_id, is_proxy, proxy_by, device_info,
    is_late_entry, late_entry_reason, location_name
  ) VALUES (
    p_target_employee_id, p_punch_type, v_now, v_attendance_date,
    p_selfie_path, p_latitude, p_longitude, p_gps_accuracy,
    v_venue_id, true, v_actor, p_device_info,
    false, NULL, p_location_name
  )
  RETURNING id INTO v_punch_id;

  INSERT INTO activity_log (actor_id, action, target_employee_id, target_date, details)
  VALUES (v_actor, 'PROXY_PUNCH_' || upper(p_punch_type), p_target_employee_id, v_attendance_date,
    jsonb_build_object('punch_id', v_punch_id, 'target_name', v_target.name));

  RETURN jsonb_build_object(
    'success', true,
    'punch_id', v_punch_id,
    'punch_type', p_punch_type,
    'punched_at', v_now,
    'attendance_date', v_attendance_date,
    'target_name', v_target.name,
    'nearest_venue', COALESCE(v_venue_name, '')
  );
END;
$function$;

-- ------------------------------------------------------------
-- guard_punch_departments(): guard-eligible departments with
-- staff/in counts, for the department-grid screen.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_punch_departments()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_actor uuid;
  v_role text;
  v_window_hours int;
  v_result jsonb;
BEGIN
  v_actor := auth.uid();
  v_role := public.user_role();
  IF v_role IS NULL OR v_role NOT IN ('supervisor', 'manager', 'admin') THEN
    RETURN jsonb_build_object('error', 'Access denied');
  END IF;

  SELECT trim(both '"' from value::text)::int INTO v_window_hours
  FROM app_config WHERE key = 'retroactive_punch_window_hours';
  v_window_hours := COALESCE(v_window_hours, 48);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'name', d.name,
      'staff_count', (
        SELECT count(*) FROM employees e
        WHERE e.department_id = d.id AND e.active = true AND e.is_casual = false AND e.id != v_actor
      ),
      'in_count', (
        SELECT count(*) FROM employees e
        WHERE e.department_id = d.id AND e.active = true AND e.is_casual = false AND e.id != v_actor
          AND EXISTS (
            SELECT 1 FROM punches p
            WHERE p.employee_id = e.id AND p.punch_type = 'in'
              AND p.punched_at > now() - (v_window_hours || ' hours')::interval
              AND NOT EXISTS (
                SELECT 1 FROM punches p2
                WHERE p2.employee_id = p.employee_id AND p2.punch_type = 'out'
                  AND p2.attendance_date = p.attendance_date AND p2.punched_at > p.punched_at
              )
          )
      )
    ) ORDER BY d.name
  ), '[]'::jsonb)
  INTO v_result
  FROM departments d
  WHERE d.active = true AND d.guard_punch_enabled = true;

  RETURN v_result;
END;
$function$;

-- ------------------------------------------------------------
-- guard_punch_roster(): active salaried staff of one guard-eligible
-- department, with today's open-punch state computed the same way
-- open_punches() does, so the IN/OUT button always agrees with what
-- proxy_punch will accept.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_punch_roster(p_department_id int)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_actor uuid;
  v_role text;
  v_window_hours int;
  v_result jsonb;
BEGIN
  v_actor := auth.uid();
  v_role := public.user_role();
  IF v_role IS NULL OR v_role NOT IN ('supervisor', 'manager', 'admin') THEN
    RETURN jsonb_build_object('error', 'Access denied');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM departments d
    WHERE d.id = p_department_id AND d.active = true AND d.guard_punch_enabled = true
  ) THEN
    RETURN jsonb_build_object('error', 'Department not enabled for guard punch');
  END IF;

  SELECT trim(both '"' from value::text)::int INTO v_window_hours
  FROM app_config WHERE key = 'retroactive_punch_window_hours';
  v_window_hours := COALESCE(v_window_hours, 48);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'emp_code', e.emp_code,
      'name', e.name,
      'designation', e.designation,
      'is_in', op.punch_id IS NOT NULL,
      'in_since', op.punched_at
    ) ORDER BY e.name
  ), '[]'::jsonb)
  INTO v_result
  FROM employees e
  LEFT JOIN LATERAL (
    SELECT p.id AS punch_id, p.punched_at
    FROM punches p
    WHERE p.employee_id = e.id
      AND p.punch_type = 'in'
      AND p.punched_at > now() - (v_window_hours || ' hours')::interval
      AND NOT EXISTS (
        SELECT 1 FROM punches p2
        WHERE p2.employee_id = p.employee_id
          AND p2.punch_type = 'out'
          AND p2.attendance_date = p.attendance_date
          AND p2.punched_at > p.punched_at
      )
    ORDER BY p.punched_at DESC
    LIMIT 1
  ) op ON true
  WHERE e.department_id = p_department_id
    AND e.active = true
    AND e.is_casual = false
    AND e.id != v_actor;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

-- ------------------------------------------------------------
-- guard_punch_search(): cross-department search by name/code, for
-- the "not sure which department" search on the dept-grid screen.
-- Only searches within guard-eligible departments.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_punch_search(p_query text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_actor uuid;
  v_role text;
  v_window_hours int;
  v_result jsonb;
BEGIN
  v_actor := auth.uid();
  v_role := public.user_role();
  IF v_role IS NULL OR v_role NOT IN ('supervisor', 'manager', 'admin') THEN
    RETURN jsonb_build_object('error', 'Access denied');
  END IF;

  IF p_query IS NULL OR length(trim(p_query)) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT trim(both '"' from value::text)::int INTO v_window_hours
  FROM app_config WHERE key = 'retroactive_punch_window_hours';
  v_window_hours := COALESCE(v_window_hours, 48);

  -- Escape % and _ so a literal search like "a_b" or a stray "%" can't act
  -- as a wildcard, and LIMIT inside the subquery (not after the single-row
  -- jsonb_agg, which a LIMIT after the aggregate can't actually cap).
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'emp_code', s.emp_code,
      'name', s.name,
      'designation', s.designation,
      'department_id', s.department_id,
      'department_name', s.department_name,
      'is_in', s.punch_id IS NOT NULL,
      'in_since', s.punched_at
    ) ORDER BY s.name
  ), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT e.id, e.emp_code, e.name, e.designation, e.department_id, d.name AS department_name,
      op.punch_id, op.punched_at
    FROM employees e
    JOIN departments d ON d.id = e.department_id AND d.active = true AND d.guard_punch_enabled = true
    LEFT JOIN LATERAL (
      SELECT p.id AS punch_id, p.punched_at
      FROM punches p
      WHERE p.employee_id = e.id
        AND p.punch_type = 'in'
        AND p.punched_at > now() - (v_window_hours || ' hours')::interval
        AND NOT EXISTS (
          SELECT 1 FROM punches p2
          WHERE p2.employee_id = p.employee_id
            AND p2.punch_type = 'out'
            AND p2.attendance_date = p.attendance_date
            AND p2.punched_at > p.punched_at
        )
      ORDER BY p.punched_at DESC
      LIMIT 1
    ) op ON true
    WHERE e.active = true
      AND e.is_casual = false
      AND e.id != v_actor
      AND (
        e.name ILIKE '%' || replace(replace(p_query, '%', '\%'), '_', '\_') || '%' ESCAPE '\'
        OR e.emp_code ILIKE '%' || replace(replace(p_query, '%', '\%'), '_', '\_') || '%' ESCAPE '\'
      )
    ORDER BY e.name
    LIMIT 25
  ) s;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.guard_punch_departments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_punch_roster(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_punch_search(text) TO authenticated;
