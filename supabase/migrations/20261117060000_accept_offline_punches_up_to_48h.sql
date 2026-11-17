-- ============================================================
-- Offline punches: accept them up to 48 hours late
--
-- A punch saved on the phone (no / slow network) is sent later with the
-- time it was really made (p_client_timestamp). punch() refused any punch
-- more than 2 hours old, so an evening punch-out that only reached the
-- server the next morning was lost (e.g. Krrish Chandwani, 16 Nov 2026).
--
-- Changes, everything else is unchanged:
--  1. A client timestamp may be up to 48 hours in the past (was 2 hours
--     either way). Up to 10 minutes in the future is allowed for phone
--     clock drift. Such punches stay marked is_offline = true, and
--     server_received_at keeps the real arrival time for review.
--  2. A late punch-out is matched to the open punch-in from BEFORE its own
--     time. Before, it took the newest open punch-in, so yesterday's
--     punch-out arriving after today's punch-in landed on today.
-- ============================================================

CREATE OR REPLACE FUNCTION public.punch(p_punch_type text, p_selfie_path text, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric, p_gps_accuracy numeric DEFAULT NULL::numeric, p_device_info text DEFAULT NULL::text, p_client_timestamp timestamp with time zone DEFAULT NULL::timestamp with time zone, p_client_punch_id text DEFAULT NULL::text, p_location_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_emp_id uuid;
  v_emp_role text;
  v_now timestamptz;
  v_today date;
  v_attendance_date date;
  v_cooldown_minutes int;
  v_last_punch timestamptz;
  v_open_punch record;
  v_stale_punch record;
  v_venue_id int;
  v_venue_name text;
  v_venue_dist numeric;
  v_punch_id bigint;
  v_existing record;
BEGIN
  v_emp_id := auth.uid();
  IF v_emp_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;
  SELECT role INTO v_emp_role
  FROM employees WHERE id = v_emp_id AND active = true;
  IF v_emp_role IS NULL THEN
    RETURN jsonb_build_object('error', 'Employee not found or inactive');
  END IF;
  IF p_punch_type NOT IN ('in', 'out') THEN
    RETURN jsonb_build_object('error', 'Invalid punch type');
  END IF;
  IF p_selfie_path IS NULL OR p_selfie_path = '' THEN
    RETURN jsonb_build_object('error', 'Selfie is required');
  END IF;
  IF p_selfie_path NOT LIKE v_emp_id::text || '/%' THEN
    RETURN jsonb_build_object('error', 'Invalid selfie path');
  END IF;
  IF p_client_punch_id IS NOT NULL AND p_client_punch_id <> '' THEN
    SELECT id, punch_type, punched_at, attendance_date, nearest_venue_id
    INTO v_existing
    FROM punches
    WHERE employee_id = v_emp_id AND client_punch_id = p_client_punch_id
    LIMIT 1;
    IF v_existing.id IS NOT NULL THEN
      SELECT name INTO v_venue_name FROM venues WHERE id = v_existing.nearest_venue_id;
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'punch_id', v_existing.id,
        'punch_type', v_existing.punch_type,
        'punched_at', v_existing.punched_at,
        'attendance_date', v_existing.attendance_date,
        'nearest_venue', COALESCE(v_venue_name, 'Not near any venue')
      );
    END IF;
  END IF;
  -- Offline punches arrive late: up to 48 hours old is fine; a little in
  -- the future only for phone clock drift
  IF p_client_timestamp IS NOT NULL AND (
       p_client_timestamp < now() - interval '48 hours' OR
       p_client_timestamp > now() + interval '10 minutes'
     ) THEN
    RETURN jsonb_build_object('error', 'Punch time is more than 48 hours old — please submit a claim');
  END IF;
  v_now := COALESCE(p_client_timestamp, now());
  v_today := (v_now AT TIME ZONE 'Asia/Kolkata')::date;
  SELECT trim(both '"' from value::text)::int INTO v_cooldown_minutes
  FROM app_config WHERE key = 'duplicate_punch_cooldown_minutes';
  v_cooldown_minutes := COALESCE(v_cooldown_minutes, 5);
  SELECT punched_at INTO v_last_punch
  FROM punches
  WHERE employee_id = v_emp_id
    AND punch_type = p_punch_type
    AND punched_at > v_now - (v_cooldown_minutes || ' minutes')::interval
    AND punched_at <= v_now + (v_cooldown_minutes || ' minutes')::interval
  ORDER BY punched_at DESC
  LIMIT 1;
  IF v_last_punch IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error', 'Duplicate punch — wait ' || v_cooldown_minutes || ' minutes',
      'last_punch', v_last_punch
    );
  END IF;
  IF p_punch_type = 'in' THEN
    v_attendance_date := v_today;
    SELECT p.id, p.attendance_date INTO v_stale_punch
    FROM punches p
    WHERE p.employee_id = v_emp_id
      AND p.punch_type = 'in'
      AND p.attendance_date < v_today
      AND p.punched_at <= v_now - interval '18 hours'
      AND NOT EXISTS (
        SELECT 1 FROM punches p2
        WHERE p2.employee_id = v_emp_id
          AND p2.punch_type = 'out'
          AND p2.attendance_date = p.attendance_date
          AND p2.punched_at > p.punched_at
      )
    ORDER BY p.punched_at DESC
    LIMIT 1;
  ELSIF p_punch_type = 'out' THEN
    -- The open punch-in made before this punch-out's own time
    SELECT p.attendance_date, p.punched_at INTO v_open_punch
    FROM punches p
    WHERE p.employee_id = v_emp_id
      AND p.punch_type = 'in'
      AND p.punched_at < v_now
      AND NOT EXISTS (
        SELECT 1 FROM punches p2
        WHERE p2.employee_id = v_emp_id
          AND p2.punch_type = 'out'
          AND p2.punched_at > p.punched_at
          AND p2.attendance_date = p.attendance_date
      )
    ORDER BY p.punched_at DESC
    LIMIT 1;
    IF v_open_punch IS NULL THEN
      RETURN jsonb_build_object('error', 'No active punch-in found');
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
          v_venue_name := NULL;
          v_venue_id := NULL;
        END IF;
      END;
    END IF;
  END IF;
  INSERT INTO punches (
    employee_id, punch_type, punched_at, attendance_date,
    selfie_path, latitude, longitude, gps_accuracy_meters,
    nearest_venue_id, is_proxy, proxy_by, device_info,
    is_late_entry, late_entry_reason, is_offline, client_punch_id,
    server_received_at, location_name
  ) VALUES (
    v_emp_id, p_punch_type, v_now, v_attendance_date,
    p_selfie_path, p_latitude, p_longitude, p_gps_accuracy,
    v_venue_id, false, NULL, p_device_info,
    false, NULL, (p_client_timestamp IS NOT NULL),
    NULLIF(p_client_punch_id, ''),
    now(), p_location_name
  )
  RETURNING id INTO v_punch_id;
  RETURN jsonb_build_object(
    'success', true,
    'punch_id', v_punch_id,
    'punch_type', p_punch_type,
    'punched_at', v_now,
    'attendance_date', v_attendance_date,
    'nearest_venue', COALESCE(v_venue_name, 'Not near any venue')
  );
END;
$function$;
