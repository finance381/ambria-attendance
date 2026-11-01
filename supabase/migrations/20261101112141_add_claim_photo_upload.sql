-- ============================================================
-- Mandatory photo evidence on missed-punch claims: a new storage
-- bucket (mirrors the "selfies" bucket's public + path-scoped RLS
-- pattern), a photo_path column on missed_claims, and the RPCs that
-- write/read it.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('claim-photos', 'claim-photos', true, 5242880, ARRAY['image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "claim_photos_insert" ON storage.objects;
CREATE POLICY "claim_photos_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'claim-photos'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR user_role() = ANY (ARRAY['admin', 'manager', 'supervisor'])
    )
  );

DROP POLICY IF EXISTS "claim_photos_select" ON storage.objects;
CREATE POLICY "claim_photos_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'claim-photos'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR user_role() = ANY (ARRAY['admin', 'manager'])
    )
  );

ALTER TABLE public.missed_claims ADD COLUMN IF NOT EXISTS photo_path text;

CREATE OR REPLACE FUNCTION public.submit_claim(p_attendance_date date, p_claim_type text, p_claimed_time time without time zone, p_reason text, p_claimed_out_time time without time zone DEFAULT NULL::time without time zone, p_photo_path text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_emp_id uuid;
  v_claim_id bigint;
  v_used int;
  v_limit int;
  v_now_ist timestamptz;
  v_cutoff_date date;
  v_admin_ids uuid[];
  v_emp_name text;
  v_function_url text;
  v_service_key text;
BEGIN
  SELECT id INTO v_emp_id FROM employees WHERE id = auth.uid();
  IF v_emp_id IS NULL THEN
    RETURN json_build_object('error', 'Employee not found');
  END IF;

  IF p_claim_type NOT IN ('missed_in', 'missed_out', 'missed_both') THEN
    RETURN json_build_object('error', 'Invalid claim type');
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN json_build_object('error', 'Reason is required');
  END IF;

  IF p_claimed_time IS NULL THEN
    RETURN json_build_object('error', 'Claimed time is required');
  END IF;

  IF p_claim_type = 'missed_both' AND p_claimed_out_time IS NULL THEN
    RETURN json_build_object('error', 'Out time required for missed_both');
  END IF;

  IF p_photo_path IS NULL OR trim(p_photo_path) = '' THEN
    RETURN json_build_object('error', 'A photo is required to submit a claim');
  END IF;

  IF p_attendance_date > current_date THEN
    RETURN json_build_object('error', 'Cannot claim for a future date');
  END IF;

  -- TEMPORARY: current month, or previous month too if today is the 1st.
  v_now_ist := now() AT TIME ZONE 'Asia/Kolkata';
  IF EXTRACT(DAY FROM v_now_ist) = 1 THEN
    v_cutoff_date := date_trunc('month', v_now_ist - interval '1 month')::date;
  ELSE
    v_cutoff_date := date_trunc('month', v_now_ist)::date;
  END IF;

  IF p_attendance_date < v_cutoff_date THEN
    RETURN json_build_object('error', 'Claims can only be submitted for the current month.');
  END IF;

  IF p_claim_type = 'missed_both' THEN
    IF EXISTS(SELECT 1 FROM missed_claims WHERE employee_id = v_emp_id
        AND attendance_date = p_attendance_date AND status = 'pending'
        AND claim_type IN ('missed_in', 'missed_out', 'missed_both')) THEN
      RETURN json_build_object('error', 'A pending claim already exists for this date');
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM missed_claims WHERE employee_id = v_emp_id
        AND attendance_date = p_attendance_date AND status = 'pending'
        AND (claim_type = p_claim_type OR claim_type = 'missed_both')) THEN
      RETURN json_build_object('error', 'A pending claim already exists for this date and type');
    END IF;
  END IF;

  INSERT INTO missed_claims (employee_id, attendance_date, claim_type, claimed_time, claimed_out_time, reason, photo_path)
  VALUES (v_emp_id, p_attendance_date, p_claim_type, p_claimed_time, p_claimed_out_time, LEFT(trim(p_reason), 500), p_photo_path)
  RETURNING id INTO v_claim_id;

  SELECT trim(both '"' from value::text)::int INTO v_limit FROM app_config WHERE key = 'claim_limit';
  v_limit := COALESCE(v_limit, 4);

  SELECT count(*) INTO v_used FROM missed_claims
  WHERE employee_id = v_emp_id
    AND date_trunc('month', created_at AT TIME ZONE 'Asia/Kolkata') = date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')
    AND status != 'rejected';

  -- Notify admins that a claim needs review
  BEGIN
    SELECT array_agg(id) INTO v_admin_ids
    FROM employees WHERE role = 'admin' AND active = true AND id != v_emp_id;

    IF v_admin_ids IS NOT NULL AND array_length(v_admin_ids, 1) > 0 THEN
      SELECT name INTO v_emp_name FROM employees WHERE id = v_emp_id;

      SELECT trim(both '"' from value::text) INTO v_function_url
      FROM app_config WHERE key = 'supabase_url';
      v_function_url := v_function_url || '/functions/v1/send-notification';

      SELECT trim(both '"' from value::text) INTO v_service_key
      FROM app_config WHERE key = 'service_role_key';

      IF v_function_url IS NOT NULL AND v_service_key IS NOT NULL THEN
        PERFORM net.http_post(
          url := v_function_url,
          body := jsonb_build_object(
            'employee_ids', to_jsonb(v_admin_ids),
            'title', 'New Claim Submitted',
            'body', coalesce(v_emp_name, 'An employee') || ' submitted a ' ||
              replace(p_claim_type, '_', ' ') || ' claim for ' || to_char(p_attendance_date, 'DD Mon'),
            'tag', 'claim-new-' || v_claim_id,
            'url', '/ambria-attendance/claims-approval'
          ),
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key)
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN json_build_object('ok', true, 'claim_id', v_claim_id, 'used', v_used, 'limit', v_limit,
    'over_limit', v_used > v_limit);
END;
$function$;

CREATE OR REPLACE FUNCTION public.all_claims(p_department_id integer DEFAULT NULL::integer, p_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_role text;
  v_dept int;
  v_limit int;
  v_result jsonb;
BEGIN
  v_role := public.user_role();
  IF v_role NOT IN ('admin', 'manager') THEN
    RETURN jsonb_build_object('error', 'Access denied');
  END IF;
  IF v_role = 'manager' THEN
    v_dept := public.user_department();
  ELSE
    v_dept := p_department_id;
  END IF;
  SELECT coalesce(trim(both '"' from value::text)::int, 4) INTO v_limit
  FROM app_config WHERE key = 'claim_limit';
  v_limit := coalesce(v_limit, 4);

  WITH non_rejected_rank AS (
    SELECT mc.id,
      ROW_NUMBER() OVER (
        PARTITION BY mc.employee_id, date_trunc('month', mc.created_at AT TIME ZONE 'Asia/Kolkata')
        ORDER BY mc.created_at ASC
      ) AS month_rank
    FROM missed_claims mc
    WHERE mc.status != 'rejected'
  ),
  ranked AS (
    SELECT
      mc.id,
      mc.employee_id,
      mc.attendance_date,
      mc.claim_type,
      mc.claimed_time,
      mc.claimed_out_time,
      mc.reason,
      mc.status,
      mc.photo_path,
      mc.created_at,
      mc.reviewed_at,
      mc.reviewed_by,
      nr.month_rank
    FROM missed_claims mc
    LEFT JOIN non_rejected_rank nr ON nr.id = mc.id
  )
  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      r.id AS claim_id,
      r.employee_id,
      e.name AS employee_name,
      e.emp_code,
      d.name AS department_name,
      e.department_id,
      r.attendance_date,
      r.claim_type,
      r.claimed_time::text AS claimed_time,
      r.claimed_out_time::text AS claimed_out_time,
      r.reason,
      r.status,
      r.photo_path,
      r.created_at,
      r.reviewed_at,
      rev.name AS reviewed_by_name,
      (r.month_rank > v_limit) AS is_over_limit,
      r.month_rank AS claim_number_in_month
    FROM ranked r
    JOIN employees e ON e.id = r.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN employees rev ON rev.id = r.reviewed_by
    WHERE (v_dept IS NULL OR e.department_id = v_dept)
      AND (p_status IS NULL OR r.status = p_status)
    ORDER BY r.created_at DESC
  ) t;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_claims()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_limit int;
  v_used int;
  v_claims jsonb;
BEGIN
  SELECT coalesce(trim(both '"' from value::text)::int, 4) INTO v_limit
  FROM app_config WHERE key = 'claim_limit';
  v_limit := coalesce(v_limit, 4);

  SELECT count(*) INTO v_used
  FROM missed_claims
  WHERE employee_id = v_user_id
    AND date_trunc('month', created_at) = date_trunc('month', now())
    AND status != 'rejected';

  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_claims
  FROM (
    SELECT
      mc.id,
      mc.attendance_date,
      mc.claim_type,
      mc.claimed_time::text AS claimed_time,
      mc.claimed_out_time::text AS claimed_out_time,
      mc.reason,
      mc.status,
      mc.photo_path,
      mc.created_at,
      mc.reviewed_at,
      e.name AS reviewed_by
    FROM missed_claims mc
    LEFT JOIN employees e ON e.id = mc.reviewed_by
    WHERE mc.employee_id = v_user_id
    ORDER BY mc.created_at DESC
  ) t;

  RETURN jsonb_build_object(
    'claims', v_claims,
    'used', v_used,
    'limit', v_limit
  );
END;
$function$;
