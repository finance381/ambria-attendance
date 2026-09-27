-- ============================================================
-- Add alternate WhatsApp numbers for employees whose DAR messages
-- were coming from a number different than the one on file in
-- employees.phone (which auto_dar_phone_map keys off of). Same
-- multi-phone-per-emp_code pattern already used elsewhere (e.g.
-- AMB002 has two rows). Does not touch their primary auto-managed
-- row — this only adds the second number they actually post from.
--
-- - Aman Chibber (AMB110, Venue Sales): posts from 8800435844
-- - Nikita Kapoor (AMB111, Venue Sales): posts from 9971985840
-- ============================================================

INSERT INTO public.dar_phone_map (phone, emp_code, name)
VALUES
  ('918800435844', 'AMB110', 'Aman Chibber'),
  ('919971985840', 'AMB111', 'Nikita Kapoor')
ON CONFLICT (phone) DO UPDATE SET emp_code = EXCLUDED.emp_code, name = EXCLUDED.name;
