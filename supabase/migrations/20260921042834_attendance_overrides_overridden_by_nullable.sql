-- ============================================================
-- Fix: delete_employee() failed with
--   null value in column "overridden_by" of relation
--   "attendance_overrides" violates not-null constraint
-- whenever the employee being deleted had ever approved someone
-- else's attendance override (i.e. appeared as overridden_by on a
-- row they don't own).
--
-- delete_employee() already does:
--   UPDATE attendance_overrides SET overridden_by = NULL
--   WHERE overridden_by = p_employee_id;
-- (preserving the override row/audit trail for the OTHER employee,
-- only clearing the reference to the deleted approver) — the same
-- pattern already used for activity_log.actor_id and
-- missed_claims.reviewed_by, both already nullable. overridden_by
-- was the only one of the three left NOT NULL; this just brings it
-- in line with its siblings.
-- ============================================================

ALTER TABLE public.attendance_overrides ALTER COLUMN overridden_by DROP NOT NULL;
