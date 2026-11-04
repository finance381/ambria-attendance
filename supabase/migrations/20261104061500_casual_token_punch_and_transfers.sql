-- Replaces the vendor/department-based casual-worker flow in PunchForTeam
-- (Punch/Incoming/Open/+Add Casual tabs) with a lighter, day-wise token
-- system: guard writes a name (optional) + a physical token number, punches
-- the token in/out, and can send it between venues with a destination-guard
-- accept/decline handoff. Old is_casual employees, vendors, casual_list(),
-- initiate_transfer() etc. are untouched — they still back CasualReports,
-- Vendors, MonthlyReport and payroll for historical/vendor-billed casuals.

CREATE TABLE public.casual_punches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  punch_date date NOT NULL,
  token text NOT NULL,
  name text,
  department_id integer NOT NULL REFERENCES departments(id),
  venue_id integer REFERENCES venues(id),
  status text NOT NULL DEFAULT 'in' CHECK (status IN ('in', 'out', 'transit')),
  added_by uuid NOT NULL REFERENCES employees(id),
  punched_in_at timestamptz NOT NULL DEFAULT now(),
  punched_in_selfie_path text NOT NULL,
  punched_in_latitude numeric,
  punched_in_longitude numeric,
  punched_in_gps_accuracy_meters numeric,
  punched_out_at timestamptz,
  punched_out_by uuid REFERENCES employees(id),
  punched_out_selfie_path text,
  punched_out_latitude numeric,
  punched_out_longitude numeric,
  punched_out_gps_accuracy_meters numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (punch_date, token)
);

CREATE INDEX casual_punches_date_status_idx ON casual_punches (punch_date, status);

CREATE TABLE public.casual_transfers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  casual_punch_id bigint NOT NULL REFERENCES casual_punches(id),
  from_venue_id integer REFERENCES venues(id),
  to_venue_id integer NOT NULL REFERENCES venues(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  sent_by uuid NOT NULL REFERENCES employees(id),
  sent_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES employees(id),
  resolved_at timestamptz,
  resolve_selfie_path text,
  resolve_latitude numeric,
  resolve_longitude numeric,
  resolve_gps_accuracy_meters numeric
);

-- Only one active transfer per token at a time.
CREATE UNIQUE INDEX casual_transfers_one_pending_idx ON casual_transfers (casual_punch_id) WHERE status = 'pending';
CREATE INDEX casual_transfers_incoming_idx ON casual_transfers (to_venue_id) WHERE status = 'pending';

ALTER TABLE public.casual_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casual_transfers ENABLE ROW LEVEL SECURITY;

-- All writes go through the SECURITY DEFINER functions below (same pattern
-- as punches_insert); admin/manager can read directly for P&L reporting.
CREATE POLICY casual_punches_no_write ON casual_punches FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY casual_punches_select_admin ON casual_punches FOR SELECT TO authenticated USING (user_role() IN ('admin', 'manager'));

CREATE POLICY casual_transfers_no_write ON casual_transfers FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY casual_transfers_select_admin ON casual_transfers FOR SELECT TO authenticated USING (user_role() IN ('admin', 'manager'));

-- Resolves which venue a guard's device is currently at (same nearest_venue
-- + radius check proxy_punch already uses — a NULL radius is treated as "no
-- limit", matching proxy_punch exactly, not as "out of range"), for the
-- venue picker and for scoping the Send/Incoming tabs.
CREATE OR REPLACE FUNCTION public.casual_token_my_venue(p_latitude numeric, p_longitude numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text := user_role();
  v_venue_id integer;
  v_venue_name text;
  v_dist numeric;
  v_radius integer;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('supervisor', 'manager', 'admin') THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  IF p_latitude IS NULL OR p_longitude IS NULL THEN
    RETURN jsonb_build_object('venue_id', NULL, 'venue_name', NULL);
  END IF;

  SELECT nv.venue_id, nv.venue_name, nv.distance_meters INTO v_venue_id, v_venue_name, v_dist
  FROM nearest_venue(p_latitude, p_longitude) nv;

  IF v_dist IS NOT NULL THEN
    SELECT radius_meters INTO v_radius FROM venues WHERE id = v_venue_id;
    IF v_dist > v_radius THEN
      v_venue_id := NULL;
      v_venue_name := NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object('venue_id', v_venue_id, 'venue_name', v_venue_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.casual_token_my_venue(numeric, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.casual_token_add_punch_in(
  p_department_id integer,
  p_token text,
  p_name text,
  p_selfie_path text,
  p_latitude numeric,
  p_longitude numeric,
  p_gps_accuracy numeric,
  p_device_info text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text := user_role();
  v_token text := trim(p_token);
  v_name text := nullif(trim(p_name), '');
  v_date date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_venue_id integer;
  v_venue_name text;
  v_dist numeric;
  v_radius integer;
  v_id bigint;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('supervisor', 'manager', 'admin') THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  IF v_token IS NULL OR v_token = '' THEN
    RETURN jsonb_build_object('error', 'Token number is required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM departments WHERE id = p_department_id AND active = true) THEN
    RETURN jsonb_build_object('error', 'Invalid department');
  END IF;

  IF EXISTS (SELECT 1 FROM casual_punches WHERE punch_date = v_date AND token = v_token) THEN
    RETURN jsonb_build_object('error', 'Token ' || v_token || ' is already in use today');
  END IF;

  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    SELECT nv.venue_id, nv.venue_name, nv.distance_meters INTO v_venue_id, v_venue_name, v_dist
    FROM nearest_venue(p_latitude, p_longitude) nv;

    IF v_dist IS NOT NULL THEN
      SELECT radius_meters INTO v_radius FROM venues WHERE id = v_venue_id;
      IF v_dist > v_radius THEN
        v_venue_id := NULL;
        v_venue_name := NULL;
      END IF;
    END IF;
  END IF;

  BEGIN
    INSERT INTO casual_punches (
      punch_date, token, name, department_id, venue_id, status, added_by,
      punched_in_selfie_path, punched_in_latitude, punched_in_longitude, punched_in_gps_accuracy_meters
    ) VALUES (
      v_date, v_token, v_name, p_department_id, v_venue_id, 'in', v_actor,
      p_selfie_path, p_latitude, p_longitude, p_gps_accuracy
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'Token ' || v_token || ' is already in use today');
  END;

  INSERT INTO activity_log (actor_id, action, target_date, details)
  VALUES (v_actor, 'CASUAL_TOKEN_PUNCH_IN', v_date,
    jsonb_build_object('casual_punch_id', v_id, 'token', v_token, 'name', v_name, 'department_id', p_department_id, 'device_info', p_device_info));

  RETURN jsonb_build_object('success', true, 'id', v_id, 'token', v_token, 'name', coalesce(v_name, ''), 'venue_name', v_venue_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.casual_token_add_punch_in(integer, text, text, text, numeric, numeric, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.casual_token_punch_out(
  p_token text,
  p_selfie_path text,
  p_latitude numeric,
  p_longitude numeric,
  p_gps_accuracy numeric,
  p_device_info text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text := user_role();
  v_token text := trim(p_token);
  v_date date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_row casual_punches%ROWTYPE;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('supervisor', 'manager', 'admin') THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT * INTO v_row FROM casual_punches
  WHERE punch_date = v_date AND token = v_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'No worker found for token ' || coalesce(v_token, '') || ' today');
  END IF;

  IF v_row.status = 'out' THEN
    RETURN jsonb_build_object('error', coalesce(v_row.name, 'This token') || ' is already punched out');
  END IF;

  IF v_row.status = 'transit' THEN
    RETURN jsonb_build_object('error', 'This token is mid-transfer — accept, decline or cancel it first');
  END IF;

  UPDATE casual_punches
  SET status = 'out', punched_out_at = now(), punched_out_by = v_actor,
      punched_out_selfie_path = p_selfie_path, punched_out_latitude = p_latitude,
      punched_out_longitude = p_longitude, punched_out_gps_accuracy_meters = p_gps_accuracy
  WHERE id = v_row.id;

  INSERT INTO activity_log (actor_id, action, target_date, details)
  VALUES (v_actor, 'CASUAL_TOKEN_PUNCH_OUT', v_row.punch_date,
    jsonb_build_object('casual_punch_id', v_row.id, 'token', v_token, 'device_info', p_device_info));

  RETURN jsonb_build_object('success', true, 'token', v_token, 'name', coalesce(v_row.name, ''));
END;
$$;

GRANT EXECUTE ON FUNCTION public.casual_token_punch_out(text, text, numeric, numeric, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.casual_token_list(p_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text := user_role();
  v_date date := coalesce(p_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('supervisor', 'manager', 'admin') THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
    FROM (
      SELECT
        cp.id, cp.token, cp.name,
        d.name AS department_name,
        cp.venue_id,
        v.name AS venue_name,
        cp.status,
        cp.punched_in_at,
        ct.id AS pending_transfer_id,
        ct.to_venue_id AS pending_to_venue_id,
        vt.name AS pending_to_venue_name,
        ct.sent_at AS pending_sent_at
      FROM casual_punches cp
      JOIN departments d ON d.id = cp.department_id
      LEFT JOIN venues v ON v.id = cp.venue_id
      LEFT JOIN casual_transfers ct ON ct.casual_punch_id = cp.id AND ct.status = 'pending'
      LEFT JOIN venues vt ON vt.id = ct.to_venue_id
      WHERE cp.punch_date = v_date
      ORDER BY cp.punched_in_at DESC
    ) row_data
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.casual_token_list(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.casual_token_send_transfer(p_tokens text[], p_to_venue_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text := user_role();
  v_date date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_to_venue_name text;
  v_tokens text[];
  v_row record;
  v_count integer := 0;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('supervisor', 'manager', 'admin') THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT name INTO v_to_venue_name FROM venues WHERE id = p_to_venue_id AND active = true;
  IF v_to_venue_name IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid destination venue');
  END IF;

  SELECT array_agg(DISTINCT trim(x)) INTO v_tokens FROM unnest(p_tokens) x WHERE trim(x) <> '';
  IF v_tokens IS NULL THEN
    RETURN jsonb_build_object('error', 'No workers selected');
  END IF;

  -- Lock every matching row in one ordered pass — avoids the per-token-loop
  -- deadlock risk when two concurrent sends share tokens in opposite order.
  FOR v_row IN
    SELECT * FROM casual_punches
    WHERE punch_date = v_date AND token = ANY(v_tokens) AND status = 'in'
    ORDER BY id
    FOR UPDATE
  LOOP
    UPDATE casual_punches SET status = 'transit' WHERE id = v_row.id;
    INSERT INTO casual_transfers (casual_punch_id, from_venue_id, to_venue_id, sent_by)
    VALUES (v_row.id, v_row.venue_id, p_to_venue_id, v_actor);
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('error', 'None of the selected workers could be moved (already out or mid-transfer)');
  END IF;

  INSERT INTO activity_log (actor_id, action, target_date, details)
  VALUES (v_actor, 'CASUAL_TOKEN_TRANSFER_SENT', v_date,
    jsonb_build_object('tokens', v_tokens, 'to_venue_id', p_to_venue_id, 'transferred_count', v_count));

  RETURN jsonb_build_object('success', true, 'transferred_count', v_count, 'to_venue_name', v_to_venue_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.casual_token_send_transfer(text[], integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.casual_token_incoming(p_venue_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text := user_role();
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('supervisor', 'manager', 'admin') THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  IF p_venue_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
    FROM (
      SELECT
        ct.id AS transfer_id,
        cp.token, cp.name,
        d.name AS department_name,
        fv.name AS from_venue_name,
        ct.sent_at
      FROM casual_transfers ct
      JOIN casual_punches cp ON cp.id = ct.casual_punch_id
      JOIN departments d ON d.id = cp.department_id
      LEFT JOIN venues fv ON fv.id = ct.from_venue_id
      WHERE ct.status = 'pending' AND ct.to_venue_id = p_venue_id
      ORDER BY ct.sent_at ASC
    ) row_data
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.casual_token_incoming(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.casual_token_accept_transfer(
  p_transfer_id bigint,
  p_selfie_path text,
  p_latitude numeric,
  p_longitude numeric,
  p_gps_accuracy numeric,
  p_device_info text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text := user_role();
  v_transfer casual_transfers%ROWTYPE;
  v_punch casual_punches%ROWTYPE;
  v_venue_name text;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('supervisor', 'manager', 'admin') THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT * INTO v_transfer FROM casual_transfers WHERE id = p_transfer_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Transfer not found or already resolved');
  END IF;

  SELECT * INTO v_punch FROM casual_punches WHERE id = v_transfer.casual_punch_id FOR UPDATE;

  UPDATE casual_punches SET status = 'in', venue_id = v_transfer.to_venue_id WHERE id = v_punch.id;

  UPDATE casual_transfers
  SET status = 'accepted', resolved_by = v_actor, resolved_at = now(),
      resolve_selfie_path = p_selfie_path, resolve_latitude = p_latitude,
      resolve_longitude = p_longitude, resolve_gps_accuracy_meters = p_gps_accuracy
  WHERE id = p_transfer_id;

  SELECT name INTO v_venue_name FROM venues WHERE id = v_transfer.to_venue_id;

  INSERT INTO activity_log (actor_id, action, target_date, details)
  VALUES (v_actor, 'CASUAL_TOKEN_TRANSFER_ACCEPTED', v_punch.punch_date,
    jsonb_build_object('transfer_id', p_transfer_id, 'casual_punch_id', v_punch.id, 'token', v_punch.token, 'device_info', p_device_info));

  RETURN jsonb_build_object('success', true, 'name', coalesce(v_punch.name, ''), 'token', v_punch.token, 'venue_name', v_venue_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.casual_token_accept_transfer(bigint, text, numeric, numeric, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.casual_token_decline_transfer(p_transfer_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text := user_role();
  v_transfer casual_transfers%ROWTYPE;
  v_punch casual_punches%ROWTYPE;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('supervisor', 'manager', 'admin') THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT * INTO v_transfer FROM casual_transfers WHERE id = p_transfer_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Transfer not found or already resolved');
  END IF;

  SELECT * INTO v_punch FROM casual_punches WHERE id = v_transfer.casual_punch_id FOR UPDATE;

  UPDATE casual_punches SET status = 'in' WHERE id = v_punch.id;
  UPDATE casual_transfers SET status = 'declined', resolved_by = v_actor, resolved_at = now() WHERE id = p_transfer_id;

  INSERT INTO activity_log (actor_id, action, target_date, details)
  VALUES (v_actor, 'CASUAL_TOKEN_TRANSFER_DECLINED', v_punch.punch_date,
    jsonb_build_object('transfer_id', p_transfer_id, 'casual_punch_id', v_punch.id, 'token', v_punch.token));

  RETURN jsonb_build_object('success', true, 'name', coalesce(v_punch.name, ''), 'token', v_punch.token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.casual_token_decline_transfer(bigint) TO authenticated;

-- Lets the SENDING guard undo their own pending transfer (a mistaken venue,
-- a worker who never went) without needing the destination guard to act.
-- Any admin/manager can also cancel, as a cleanup path for a stuck token.
CREATE OR REPLACE FUNCTION public.casual_token_cancel_transfer(p_transfer_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text := user_role();
  v_transfer casual_transfers%ROWTYPE;
  v_punch casual_punches%ROWTYPE;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('supervisor', 'manager', 'admin') THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT * INTO v_transfer FROM casual_transfers WHERE id = p_transfer_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Transfer not found or already resolved');
  END IF;

  IF v_transfer.sent_by <> v_actor AND v_role NOT IN ('manager', 'admin') THEN
    RETURN jsonb_build_object('error', 'Only the guard who sent this transfer can cancel it');
  END IF;

  SELECT * INTO v_punch FROM casual_punches WHERE id = v_transfer.casual_punch_id FOR UPDATE;

  UPDATE casual_punches SET status = 'in' WHERE id = v_punch.id;
  UPDATE casual_transfers SET status = 'cancelled', resolved_by = v_actor, resolved_at = now() WHERE id = p_transfer_id;

  INSERT INTO activity_log (actor_id, action, target_date, details)
  VALUES (v_actor, 'CASUAL_TOKEN_TRANSFER_CANCELLED', v_punch.punch_date,
    jsonb_build_object('transfer_id', p_transfer_id, 'casual_punch_id', v_punch.id, 'token', v_punch.token));

  RETURN jsonb_build_object('success', true, 'name', coalesce(v_punch.name, ''), 'token', v_punch.token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.casual_token_cancel_transfer(bigint) TO authenticated;
