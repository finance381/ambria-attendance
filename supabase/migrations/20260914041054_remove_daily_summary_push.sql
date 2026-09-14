-- ============================================================
-- Remove the daily-summary push notification (job id 6, "30 15 * * *"
-- -> notify_daily_summary()). Redundant with the WhatsApp DAR/
-- attendance bot report already sent via dar-consolidate.
--
-- The function itself is left in place (dormant) so it can be
-- re-scheduled later without redefining it, if ever wanted back.
-- ============================================================

SELECT cron.unschedule(6);
