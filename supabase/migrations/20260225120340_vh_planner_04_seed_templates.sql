
-- Trajecttemplates seed data

-- Traject A: 11 taken
INSERT INTO planner.trajectory_templates (id, name, code, description) VALUES
  ('a1111111-0000-0000-0000-000000000001', 'Traject A – 11 taken', 'traject_a', 'Standaard engineeringstraject met 11 taken'),
  ('b2222222-0000-0000-0000-000000000002', 'Traject B – 12 taken', 'traject_b', 'Engineeringstraject met 12 taken incl. berekenen isokorven'),
  ('c3333333-0000-0000-0000-000000000003', 'Stekkenplan', 'stekkenplan', 'Apart traject voor het stekkenplan')
ON CONFLICT (code) DO NOTHING;

-- Traject A taken (11 stappen)
INSERT INTO planner.template_tasks (template_id, order_index, name, responsible_role, default_duration_days, hours_pct, color) VALUES
  ('a1111111-0000-0000-0000-000000000001', 1,  'Opzetten 3D-model, principe details, overzichten',     'vh_intern',             10, 20, '#3B82F6'),
  ('a1111111-0000-0000-0000-000000000001', 2,  'Controle opzet principe details',                       'opdrachtgever',          5,  0,  '#F59E0B'),
  ('a1111111-0000-0000-0000-000000000001', 3,  'Uitwerken vormtekeningen + overzichten',                 'vh_intern',             15, 40, '#3B82F6'),
  ('a1111111-0000-0000-0000-000000000001', 4,  'Goedkeuring vorm + opgave instortvoorzieningen',         'opdrachtgever',          5,  0,  '#F59E0B'),
  ('a1111111-0000-0000-0000-000000000001', 5,  'Opgave belastingen op elementen',                        'opdrachtgever',          5,  0,  '#F59E0B'),
  ('a1111111-0000-0000-0000-000000000001', 6,  'Verwerken opmerkingen + toevoegen instortvoorzieningen', 'vh_intern',              8, 20, '#3B82F6'),
  ('a1111111-0000-0000-0000-000000000001', 7,  'Verstrekken vorm definitief',                            'vh_intern',              2,  0,  '#3B82F6'),
  ('a1111111-0000-0000-0000-000000000001', 8,  'Berekenen elementen',                                    'extern_constructeur',    15,  0,  '#8B5CF6'),
  ('a1111111-0000-0000-0000-000000000001', 9,  'Uitwerken wapening',                                     'extern_wapening',        15, 20, '#EC4899'),
  ('a1111111-0000-0000-0000-000000000001', 10, 'Controle wapening',                                      'opdrachtgever',          5,  0,  '#F59E0B'),
  ('a1111111-0000-0000-0000-000000000001', 11, 'Verstrekken wapening definitief',                        'extern_wapening',         2,  0,  '#EC4899')
ON CONFLICT DO NOTHING;

-- Traject B taken (12 stappen — extra 'Berekenen isokorven' na stap 7)
INSERT INTO planner.template_tasks (template_id, order_index, name, responsible_role, default_duration_days, hours_pct, color) VALUES
  ('b2222222-0000-0000-0000-000000000002', 1,  'Opzetten 3D-model, principe details, overzichten',     'vh_intern',             10, 20, '#3B82F6'),
  ('b2222222-0000-0000-0000-000000000002', 2,  'Controle opzet principe details',                       'opdrachtgever',          5,  0,  '#F59E0B'),
  ('b2222222-0000-0000-0000-000000000002', 3,  'Uitwerken vormtekeningen + overzichten',                 'vh_intern',             15, 40, '#3B82F6'),
  ('b2222222-0000-0000-0000-000000000002', 4,  'Goedkeuring vorm + opgave instortvoorzieningen',         'opdrachtgever',          5,  0,  '#F59E0B'),
  ('b2222222-0000-0000-0000-000000000002', 5,  'Opgave belastingen op elementen',                        'opdrachtgever',          5,  0,  '#F59E0B'),
  ('b2222222-0000-0000-0000-000000000002', 6,  'Verwerken opmerkingen + toevoegen instortvoorzieningen', 'vh_intern',              8, 20, '#3B82F6'),
  ('b2222222-0000-0000-0000-000000000002', 7,  'Verstrekken vorm definitief',                            'vh_intern',              2,  0,  '#3B82F6'),
  ('b2222222-0000-0000-0000-000000000002', 8,  'Berekenen isokorven',                                    'leverancier',           10,  0,  '#10B981'),
  ('b2222222-0000-0000-0000-000000000002', 9,  'Berekenen elementen',                                    'extern_constructeur',    15,  0,  '#8B5CF6'),
  ('b2222222-0000-0000-0000-000000000002', 10, 'Uitwerken wapening',                                     'extern_wapening',        15, 20, '#EC4899'),
  ('b2222222-0000-0000-0000-000000000002', 11, 'Controle wapening',                                      'opdrachtgever',          5,  0,  '#F59E0B'),
  ('b2222222-0000-0000-0000-000000000002', 12, 'Verstrekken wapening definitief',                        'extern_wapening',         2,  0,  '#EC4899')
ON CONFLICT DO NOTHING;

-- Stekkenplan taken (4 stappen)
INSERT INTO planner.template_tasks (template_id, order_index, name, responsible_role, default_duration_days, hours_pct, color) VALUES
  ('c3333333-0000-0000-0000-000000000003', 1, 'Berekenen stekken',              'extern_constructeur', 10, 0, '#8B5CF6'),
  ('c3333333-0000-0000-0000-000000000003', 2, 'Uitwerken stekkenplan',          'vh_intern',            8, 0, '#3B82F6'),
  ('c3333333-0000-0000-0000-000000000003', 3, 'Controleren stekkenplan',        'opdrachtgever',        5, 0, '#F59E0B'),
  ('c3333333-0000-0000-0000-000000000003', 4, 'Verstrekken definitief stekkenplan', 'vh_intern',         2, 0, '#3B82F6')
ON CONFLICT DO NOTHING;

-- Nederlandse feestdagen 2026
INSERT INTO planner.calendar_exceptions (date, name, type) VALUES
  ('2026-01-01', 'Nieuwjaarsdag', 'feestdag'),
  ('2026-04-03', 'Goede Vrijdag', 'feestdag'),
  ('2026-04-05', 'Eerste Paasdag', 'feestdag'),
  ('2026-04-06', 'Tweede Paasdag', 'feestdag'),
  ('2026-04-27', 'Koningsdag', 'feestdag'),
  ('2026-05-05', 'Bevrijdingsdag', 'feestdag'),
  ('2026-05-14', 'Hemelvaartsdag', 'feestdag'),
  ('2026-05-24', 'Eerste Pinksterdag', 'feestdag'),
  ('2026-05-25', 'Tweede Pinksterdag', 'feestdag'),
  ('2026-12-25', 'Eerste Kerstdag', 'feestdag'),
  ('2026-12-26', 'Tweede Kerstdag', 'feestdag')
ON CONFLICT (date) DO NOTHING;

-- Component types standaard (met urenverdeling)
INSERT INTO planner.component_types (name, description, default_hours, hour_distribution) VALUES
  ('Gevelelement',    'Prefab betonnen gevelelement', 40, '{"vh_opzetten":20,"vh_uitwerken":40,"vh_verwerken":20,"extern_wapening":20}'),
  ('Vloerplaat',      'Prefab betonnen vloerplaat',   30, '{"vh_opzetten":20,"vh_uitwerken":40,"vh_verwerken":20,"extern_wapening":20}'),
  ('Trap/Bordes',     'Prefab betonnen trap of bordes', 25, '{"vh_opzetten":20,"vh_uitwerken":40,"vh_verwerken":20,"extern_wapening":20}'),
  ('Kolom/Ligger',    'Prefab betonnen kolom of ligger', 20, '{"vh_opzetten":20,"vh_uitwerken":40,"vh_verwerken":20,"extern_wapening":20}'),
  ('Galerij/Balkon',  'Prefab betonnen galerij of balkon', 35, '{"vh_opzetten":20,"vh_uitwerken":40,"vh_verwerken":20,"extern_wapening":20}'),
  ('Custom onderdeel','Aangepast onderdeel',            20, '{"vh_opzetten":20,"vh_uitwerken":40,"vh_verwerken":20,"extern_wapening":20}')
ON CONFLICT DO NOTHING;
;
