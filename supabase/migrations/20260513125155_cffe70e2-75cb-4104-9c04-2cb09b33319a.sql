DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'externe_investments','kunden_bewertungen','wohnungen','eigentuemer','mieter',
    'dienstleister','kautionen','versicherungen','zaehlerstaende','kommunikation',
    'fristen','support_tickets','betriebskosten','vermietungen','follow_up_ketten',
    'app_config','objekt_einreichungen','objekt_bilder','objekt_dokumente',
    'wohnungs_bilder','wohnungs_dokumente','aufgaben','pipeline','user_roles',
    'aktivitaeten','finanzierungen','follow_ups'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      BEGIN
        EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      EXCEPTION WHEN duplicate_object THEN NULL;
      WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;
END$$;