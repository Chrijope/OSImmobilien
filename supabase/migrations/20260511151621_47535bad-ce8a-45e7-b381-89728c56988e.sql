
-- Demo investment 1: Mustermann
UPDATE public.investments
SET meta = meta || jsonb_build_object(
  'pipelineStufe', 'abgeschlossen',
  'rvSigned', true,
  'rvSignedAt', '2026-03-15T10:00:00Z',
  'kaufvertragPdf', 'https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/public/unterlagen/demo/kaufvertrag.pdf',
  'finanzierungsStatus', 'bestaetigt',
  'finanzierungsBank', 'Münchener Hypothekenbank',
  'finanzierungsSumme', 388000,
  'finanzierungsZins', '3,45 % p.a.',
  'finanzierungsTilgung', '2,00 % anfänglich',
  'notarTerminPortalFreigabe', true,
  'notarTerminModus', 'gesetzt',
  'notarTerminBestaetigt', jsonb_build_object(
    'datum', '2026-06-12',
    'uhrzeit', '10:30',
    'bestaetigtAm', '2026-04-20T08:00:00Z'
  ),
  'notarData', jsonb_build_object(
    'datum', '2026-06-12',
    'uhrzeit', '10:30',
    'name', 'Notariat Dr. Schreiber',
    'adresse', 'Maximilianstraße 28, 80539 München',
    'verkaeufer', 'MOREImmo Bogenhausen GmbH',
    'vertretung', 'Herr Dr. Stefan Berger'
  ),
  'kaufpreisfaelligkeitDatum', '2026-07-15',
  'kaufpreisEingegangen', true,
  'kaufpreisEingegangenDatum', '2026-07-14',
  'grundbuchDatum', '2026-09-02',
  'saSigned', true,
  'saSignedAt', '2026-02-10T09:00:00Z'
)
WHERE id = '36a9fb2f-5de2-4f86-8c5e-70ba4c6a79e6';

-- Demo investment 2: Huber
UPDATE public.investments
SET meta = meta || jsonb_build_object(
  'pipelineStufe', 'abgeschlossen',
  'objekt', 'MOREImmo Stadthaus München-Schwabing',
  'rvSigned', true,
  'rvSignedAt', '2026-03-20T11:00:00Z',
  'kaufvertragPdf', 'https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/public/unterlagen/demo/kaufvertrag.pdf',
  'finanzierungsStatus', 'bestaetigt',
  'finanzierungsBank', 'DKB Deutsche Kreditbank',
  'finanzierungsSumme', 412000,
  'finanzierungsZins', '3,55 % p.a.',
  'finanzierungsTilgung', '2,50 % anfänglich',
  'notarTerminPortalFreigabe', true,
  'notarTerminModus', 'gesetzt',
  'notarTerminBestaetigt', jsonb_build_object(
    'datum', '2026-06-25',
    'uhrzeit', '14:00',
    'bestaetigtAm', '2026-04-22T09:00:00Z'
  ),
  'notarData', jsonb_build_object(
    'datum', '2026-06-25',
    'uhrzeit', '14:00',
    'name', 'Notariat Dr. Hoffmann & Partner',
    'adresse', 'Leopoldstraße 14, 80802 München',
    'verkaeufer', 'MOREImmo Schwabing GmbH',
    'vertretung', 'Frau Dr. Anja Krüger'
  ),
  'kaufpreisfaelligkeitDatum', '2026-07-30',
  'kaufpreisEingegangen', true,
  'kaufpreisEingegangenDatum', '2026-07-28',
  'grundbuchDatum', '2026-09-15',
  'saSigned', true,
  'saSignedAt', '2026-02-15T10:00:00Z',
  'docFileUrls', COALESCE(meta->'docFileUrls', '{}'::jsonb) || jsonb_build_object(
    'Reservierungsvertrag', 'https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/public/unterlagen/demo/reservierung.pdf',
    'Kaufvertrag', 'https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/public/unterlagen/demo/kaufvertrag.pdf',
    'Grundschuld', 'https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/public/unterlagen/demo/grundschuld.pdf',
    'Darlehensvertrag', 'https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/public/unterlagen/demo/darlehen.pdf'
  ),
  'docStatuses', COALESCE(meta->'docStatuses', '{}'::jsonb) || jsonb_build_object(
    'Personalausweis', 'approved',
    'Letzter Gehaltsnachweis', 'approved',
    'Vorletzter Gehaltsnachweis', 'approved',
    'Vorvorletzter Gehaltsnachweis', 'approved',
    'SCHUFA-Selbstauskunft', 'approved',
    'Steuerbescheid', 'approved',
    'Reservierungsvertrag', 'approved',
    'Kaufvertragsentwurf', 'approved',
    'Kaufvertrag', 'approved',
    'Grundschuld', 'approved',
    'Darlehensvertrag', 'approved',
    'IBAN Immobilienkonto', 'approved',
    'GBA Erwerbvormerkung', 'approved'
  )
)
WHERE id = '7990bb88-9c0f-4a30-9c4d-de628921b3aa';

-- Insert demo financing rows with signed loan and grundschuld documents
INSERT INTO public.finanzierungen (kunde_id, phase, akzeptiertes_angebot_id, angebote)
VALUES
  ('36a9fb2f-5de2-4f86-8c5e-70ba4c6a79e6', 'angenommen', 'angebot-1',
   jsonb_build_array(
     jsonb_build_object(
       'id', 'angebot-1',
       'bank', 'Münchener Hypothekenbank',
       'darlehenssumme', 388000,
       'zinssatz', 3.45,
       'tilgung', 2.0,
       'zinsbindung', '15 Jahre',
       'monatsrate', 1761,
       'akzeptiert', true,
       'dokumente', jsonb_build_array(
         jsonb_build_object('name', 'Finanzierungsangebot', 'status', 'signed', 'fileUrl', 'https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/public/unterlagen/demo/finanzierungsangebot.pdf'),
         jsonb_build_object('name', 'Darlehensvertrag', 'status', 'signed', 'fileUrl', 'https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/public/unterlagen/demo/darlehen.pdf'),
         jsonb_build_object('name', 'Grundschuld', 'status', 'signed', 'fileUrl', 'https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/public/unterlagen/demo/grundschuld.pdf')
       )
     )
   )),
  ('7990bb88-9c0f-4a30-9c4d-de628921b3aa', 'angenommen', 'angebot-1',
   jsonb_build_array(
     jsonb_build_object(
       'id', 'angebot-1',
       'bank', 'DKB Deutsche Kreditbank',
       'darlehenssumme', 412000,
       'zinssatz', 3.55,
       'tilgung', 2.5,
       'zinsbindung', '20 Jahre',
       'monatsrate', 2079,
       'akzeptiert', true,
       'dokumente', jsonb_build_array(
         jsonb_build_object('name', 'Finanzierungsangebot', 'status', 'signed', 'fileUrl', 'https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/public/unterlagen/demo/finanzierungsangebot.pdf'),
         jsonb_build_object('name', 'Darlehensvertrag', 'status', 'signed', 'fileUrl', 'https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/public/unterlagen/demo/darlehen.pdf'),
         jsonb_build_object('name', 'Grundschuld', 'status', 'signed', 'fileUrl', 'https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/public/unterlagen/demo/grundschuld.pdf')
       )
     )
   ));
