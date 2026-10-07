-- kunde_dokumente: Kunde darf seinen eigenen Dokumentenbaum lesen
--
-- Befund: Die Policy "kunde_dokumente_select" (Migration 20260709084542)
-- nutzt public.can_manage_kunde_dokumente(kontakt_id). Dieser Helper prueft nur
-- is_admin_role(auth.uid()) oder is_vp_owner_of_kontakt(...) und kennt die
-- Kundenrolle nicht. Folge: Der Kunde kann die Zeilen seines eigenen
-- Dokumentenbaums nicht lesen, obwohl die Dateien im Storage-Bucket
-- "unterlagen" fuer ihn lesbar sind. Im Portal bleibt der Ordner leer.
--
-- Loesung: zusaetzliche SELECT-Policy nach dem Muster der anderen
-- Kunden-Policies (siehe 20260416101620 fuer kontakte und 20260517094425 fuer
-- investments). Person 1 und Person 2 werden beide beruecksichtigt.
-- Bewusst NUR SELECT, kein INSERT/UPDATE/DELETE fuer Kunden.
-- kunde_dokumente.kontakt_id ist UUID NOT NULL und referenziert kontakte.id.

DROP POLICY IF EXISTS "kunde_dokumente_select_kunde" ON public.kunde_dokumente;

CREATE POLICY "kunde_dokumente_select_kunde" ON public.kunde_dokumente
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id = kunde_dokumente.kontakt_id
      AND (
        (k.meta ->> 'authUserId') = auth.uid()::text
        OR ((k.meta -> 'person2') ->> 'authUserId') = auth.uid()::text
      )
  ));
