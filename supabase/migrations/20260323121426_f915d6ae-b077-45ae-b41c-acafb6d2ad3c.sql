UPDATE public.kontakte
SET meta = '{
  "hpoId": 1,
  "geburtstag": "02.01.1990",
  "pipelineStufe": "bonitaetsunterlagen",
  "leadTyp": "manuell",
  "setter": "Test Setterin",
  "setterCloser": "Test Vertriebspartner",
  "setterChecklisteDone": true,
  "setterTerminGebucht": true,
  "setterTerminDatum": "2026-03-24",
  "setterTerminUhrzeit": "12:12",
  "setterSkriptNotizen": "adf safsd fds dsfsfs d fds",
  "nichtErreichtCount": 0,
  "portalFreigeschalten": true,
  "portalActivatedAt": "2026-03-23T12:02:45.775Z",
  "portalGesperrt": false,
  "authUserId": "ed8d7e7e-5604-44cd-ad25-9d816af7f19e",
  "unterlagenFreigeschaltet": true,
  "unterlagenFreigeschaltetAt": "2026-03-23T12:05:36.685Z",
  "einkuenfte": {"gehalt":3000,"kindergeld":0,"mieteinnahmen":0,"renten":0,"selbstaendig":0,"sonstige":0,"zinsen":0},
  "ausgaben": {"autokredite":0,"lebenshaltung":900,"miete":800,"privateKV":0,"privatkredite":0,"sonstige":0,"sonstigeKredite":0,"unterhalt":0,"zinsTilgung":0}
}'::jsonb
WHERE id = 'eee925e2-6bee-403b-921c-8a74166445cd';