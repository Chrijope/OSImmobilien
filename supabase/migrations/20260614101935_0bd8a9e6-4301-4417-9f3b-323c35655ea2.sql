INSERT INTO public.role_permissions (role, url)
VALUES
  ('admin', '/teamcalls'),
  ('inhaber', '/teamcalls'),
  ('vertriebsleiter', '/teamcalls'),
  ('vertriebspartner', '/teamcalls'),
  ('setterin', '/teamcalls')
ON CONFLICT DO NOTHING;