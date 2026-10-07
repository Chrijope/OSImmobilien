-- ===========================================================================
-- Exposé für Kunden: Versand, Ablage im Kundenprofil, Aufrufe, Rückzug
-- ===========================================================================
--
-- „Exposé für Kunden“ ist seit dem 23.09.2026 ein einziger Weg: Das Exposé
-- geht per Mail mit einem Knopf zum persönlichen Link hinaus oder der Link
-- wird kopiert (etwa für WhatsApp). Beides legt es im Kundenprofil ab, beim
-- Investment unter der Objektauswahl. Gesendet wird ausschließlich über die
-- Edge Function `send-kunden-expose`, die Kontaktzugriff, Empfänger und Frist
-- selbst bestimmt.
--
-- Entscheidungen von GL:
--   - Der Kundenlink rechnet mit NEUTRALEN Annahmen, nie mit Werten aus der
--     Selbstauskunft. Der Link kann weitergeleitet werden. Die Spalte
--     `annahmen` wird deshalb für den Link gar nicht gelesen.
--   - Der Link ist persönlich, 60 Tage gültig und jederzeit zurückziehbar.
--   - Gezählt werden nur Anzahl und Zeitpunkt der Aufrufe. Kein Cookie,
--     keine IP.
--   - Beim ersten Aufruf bekommt der Partner eine Glocke.
--
-- Neue Spalten:
--   investment_id           zu welchem Investment das Exposé gehört. Wird das
--                           Investment gelöscht, bleibt die Zeile, der Verweis
--                           wird leer.
--   gesendet_am             wann es zuletzt hinausging (Mail oder Link). Leer
--                           heißt: nur intern gespeichert, nie gesendet. Nur
--                           gesendete Zeilen erscheinen im Kundenprofil.
--   gesendet_von            wer es zuletzt gesendet hat.
--   versandweg              'mail' oder 'link', der letzte Weg.
--   zurueckgezogen_am       gesetzt heißt: Der Link gilt nicht mehr, die
--                           Seite zeigt nur noch einen Hinweis mit den
--                           Kontaktdaten des Partners, wie bei Ablauf.
--   erstmals_aufgerufen_am  erster Aufruf durch den Kunden. Wird genau einmal
--                           gesetzt; daran hängt die einmalige Glocke.
--   zuletzt_aufgerufen_am   stand schon in 20260902200000, hier nur zur
--                           Sicherheit mit IF NOT EXISTS.
--
-- `wohnung_id` wird optional: Ohne Einheit ist es das Exposé des ganzen
-- Objekts (Globalobjekt), der Kundenlink lautet dann /expose/<objektId>.
--
-- Zeilensicherheit bleibt unverändert (Regeln aus 20260902200000): lesen und
-- ändern dürfen Admin und Inhaber, der Ersteller und der für den Kunden
-- zuständige Partner; kein Zugriff für anon. Der Kundenlink liest über
-- `get-expose` mit dem Service-Schlüssel und gibt nur die Positivliste heraus.

ALTER TABLE public.objekt_exposes
  ADD COLUMN IF NOT EXISTS investment_id uuid REFERENCES public.investments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gesendet_am timestamptz,
  ADD COLUMN IF NOT EXISTS gesendet_von uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS versandweg text,
  ADD COLUMN IF NOT EXISTS zurueckgezogen_am timestamptz,
  ADD COLUMN IF NOT EXISTS erstmals_aufgerufen_am timestamptz,
  ADD COLUMN IF NOT EXISTS zuletzt_aufgerufen_am timestamptz;

-- Exposé des ganzen Objekts: ohne Einheit.
ALTER TABLE public.objekt_exposes ALTER COLUMN wohnung_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'objekt_exposes_versandweg_check'
  ) THEN
    ALTER TABLE public.objekt_exposes
      ADD CONSTRAINT objekt_exposes_versandweg_check
      CHECK (versandweg IS NULL OR versandweg IN ('mail', 'link'));
  END IF;
END $$;

-- Die Liste im Kundenprofil: je Kunde und Investment, nur gesendete, neueste zuerst.
CREATE INDEX IF NOT EXISTS objekt_exposes_versand_idx
  ON public.objekt_exposes (kontakt_id, investment_id, gesendet_am DESC)
  WHERE gesendet_am IS NOT NULL;

CREATE INDEX IF NOT EXISTS objekt_exposes_investment_idx
  ON public.objekt_exposes (investment_id);

COMMENT ON COLUMN public.objekt_exposes.gesendet_am IS
  'Zuletzt an den Kunden gesendet (Mail oder Link). Leer: nur intern gespeichert.';
COMMENT ON COLUMN public.objekt_exposes.zurueckgezogen_am IS
  'Gesetzt: Der Kundenlink gilt nicht mehr und wird wie ein abgelaufener behandelt.';
COMMENT ON COLUMN public.objekt_exposes.erstmals_aufgerufen_am IS
  'Erster Aufruf durch den Kunden. Wird genau einmal gesetzt, daran hängt die Glocke für den Partner.';
