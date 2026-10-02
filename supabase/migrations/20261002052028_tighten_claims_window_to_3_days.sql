-- ============================================================
-- Tighten the claims submission window from "previous month
-- through the 2nd" to a rolling 3-day window: a claim for date D
-- can be submitted through D+3. On the 7th, the 3rd is no longer
-- selectable (7 - 3 = 4, so the earliest valid date is the 4th).
-- Only the cutoff block changed — rest of the function (including
-- the admin-notify-on-submit addition from 2026-09-13) is
-- unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_claim(p_attendance_date date, p_claim_type text, p_claimed_time time without time zone, p_reason text, p_claimed_out_time time without time zone DEFAULT NULL::time without time zone)
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

  IF p_attendance_date > current_date THEN
    RETURN json_build_object('error', 'Cannot claim for a future date');
  END IF;

  -- Cutoff: claims only allowed within 3 days of the attendance date
  v_now_ist := now() AT TIME ZONE 'Asia/Kolkata';
  v_cutoff_date := v_now_ist::date - 3;

  IF p_attendance_date < v_cutoff_date THEN
    RETURN json_build_object('error', 'Claims must be submitted within 3 days. The deadline for '
      || to_char(p_attendance_date, 'DD Mon') || ' was ' || to_char(p_attendance_date + 3, 'DD Mon') || '.');
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

  INSERT INTO missed_claims (employee_id, attendance_date, claim_type, claimed_time, claimed_out_time, reason)
  VALUES (v_emp_id, p_attendance_date, p_claim_type, p_claimed_time, p_claimed_out_time, LEFT(trim(p_reason), 500))
  RETURNING id INTO v_claim_id;

  SELECT trim(both '""' from value::text)::int INTO v_limit FROM app_config WHERE key = 'claim_limit';
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

      SELECT trim(both '""' from value::text) INTO v_function_url
      FROM app_config WHERE key = 'supabase_url';
      v_function_url := v_function_url || '/functions/v1/send-notification';

      SELECT trim(both '""' from value::text) INTO v_service_key
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
