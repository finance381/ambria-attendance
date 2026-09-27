-- ============================================================
-- Nikita Kapoor (AMB111, Venue Sales) — replace her alt DAR
-- WhatsApp number. 9971985840 (added 2026-09-24) was wrong/no
-- longer used; +91 87966 47444 is the correct one. Her primary
-- auto-managed number (9311401038) is untouched.
-- ============================================================

DELETE FROM public.dar_phone_map WHERE phone = '919971985840';

INSERT INTO public.dar_phone_map (phone, emp_code, name)
VALUES ('918796647444', 'AMB111', 'Nikita Kapoor')
ON CONFLICT (phone) DO UPDATE SET emp_code = EXCLUDED.emp_code, name = EXCLUDED.name;
