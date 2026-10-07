-- ---------------------------------------------------------------------------
-- Den Standardsatz der vier Terminarten fuer alle nachtragen
-- ---------------------------------------------------------------------------
--
-- Der Befund: 20260827200000_videocall_freigaben.sql hat die vier
-- Standard-Terminarten nur fuer Nutzer angelegt, die in
-- `videocall_freigaben` stehen. Admins und Inhaber brauchen dort keinen
-- Eintrag, `darf_videocall` laesst sie ueber `is_admin_role` durch. Sie
-- wurden deshalb uebersprungen und haben den Satz bis heute nicht.
--
-- Diese Migration traegt nach, was fehlt. Bewusst fuer alle Berechtigten und
-- nicht nur fuer einen einzelnen Nutzer, sonst steht dasselbe Problem beim
-- naechsten Admin wieder da.
--
-- Drei Eigenschaften, die diese Migration erfuellen muss:
--
--   1. Mehrfach ausfuehrbar. Wer eine Terminart schon hat, bekommt keine
--      zweite. Der Eingangskorb wird von Hand abgearbeitet, ein zweiter Lauf
--      ist jederzeit moeglich.
--   2. Nichts ueberschreiben. Wer eine Terminart umbenannt, umgestellt oder
--      abgeschaltet hat, behaelt seine Fassung. Es gibt hier kein UPDATE und
--      kein DELETE auf `buchung_terminarten`, nur INSERT.
--   3. Wortgleich mit dem Standardsatz aus 20260827200000. Bezeichnung,
--      Beschreibung, Dauer, Puffer, Vorlauf, Anlass und Sortierung stehen
--      unveraendert wie dort, damit ueberall dasselbe steht. Bewacht von
--      `src/lib/terminartenStandardsatz.test.ts`.
--
-- Woran erkannt wird, dass jemand die Terminart schon hat: am ANLASS, und
-- zusaetzlich an der Bezeichnung. Der Anlass ist das Sicherere von beiden.
-- Er ist ein fester Wert aus einer Auswahlliste (erstgespraech, beratung,
-- objektvorstellung, finanzierungsgespraech, sonstiges) und durch die
-- CHECK-Bedingung abgesichert. Die Bezeichnung ist freier Text: Wer sein
-- "Beratungsgespräch" in "Erstberatung" umbenannt hat, wuerde bei einer
-- reinen Namenspruefung ein zweites Beratungsgespraech bekommen, und dann
-- stuenden auf seinem Buchungslink zwei fast gleiche Eintraege. Die
-- Bezeichnung kommt trotzdem als zweite Bedingung dazu, fuer den Fall, dass
-- jemand denselben Namen unter einem anderen Anlass fuehrt. Getroffen wird
-- also, wer eines von beidem schon hat.
--
-- Der Preis dieser Wahl ist bekannt und bewusst in Kauf genommen: `anlass`
-- hat den Vorgabewert 'beratung'. Wer sich eine eigene Terminart angelegt und
-- den Anlass nicht umgestellt hat, bekommt kein "Beratungsgespräch"
-- nachgetragen. Er kann es ueber die Oberflaeche selbst anlegen. Das ist die
-- harmlosere Richtung: eine fehlende Terminart faellt auf und ist in einer
-- Minute ergaenzt, eine doppelte steht dem Kunden im Buchungsformular.

-- ---------------------------------------------------------------------------
-- Wer den Standardsatz bekommt
-- ---------------------------------------------------------------------------
--
-- Alle, die heute Zugang zum Buchungskalender haben. Das sind drei Gruppen,
-- und die dritte ist der Grund, warum hier nicht einfach `darf_videocall`
-- steht: Wer die Freigabe einmal hatte und den Kalender benutzt, soll seinen
-- Satz auch dann vollstaendig bekommen, wenn die Freigabe inzwischen anders
-- geregelt ist.
--
--   1. Admins und Inhaber (ueber `is_admin_role`, die uebersehene Gruppe).
--   2. Nutzer mit Eintrag in `videocall_freigaben`.
--   3. Nutzer, die den Buchungskalender schon benutzen, erkennbar an einer
--      Zeile in `buchung_einstellungen`.

INSERT INTO public.buchung_terminarten
  (mitarbeiter_id, bezeichnung, beschreibung, dauer_minuten,
   puffer_vor_minuten, puffer_nach_minuten, vorlauf_minuten,
   vorausschau_tage, raster_minuten, aktiv, oeffentlich, anlass, sortierung)
SELECT
  b.user_id, v.bezeichnung, v.beschreibung, 60, 0, 15, 240, 60, 15, true, false, v.anlass, v.sortierung
FROM (
  SELECT p.id AS user_id
  FROM public.profiles p
  WHERE public.is_admin_role(p.id)
  UNION
  SELECT f.user_id
  FROM public.videocall_freigaben f
  UNION
  SELECT e.mitarbeiter_id
  FROM public.buchung_einstellungen e
) AS b
CROSS JOIN (VALUES
  ('Telefonisches Erstgespräch',
   'Wir lernen uns in 15 bis 30 Minuten kennen und schauen, wie wir Sie bei Ihrem Immobilieninvestment bestmöglich begleiten können.',
   'erstgespraech', 1),
  ('Beratungsgespräch',
   'Wir stellen uns Ihnen im Detail vor und klären ausführlich, was in Ihrer Situation möglich ist.',
   'beratung', 2),
  ('Objektvorstellung',
   'Wir stellen dir deine passende Immobilie im Detail vor: Lage, Objekt, Zahlen und Unterlagen. Am Ende weißt du genau, was du kaufst und wie es weitergeht.',
   'objektvorstellung', 3),
  ('Finanzierungsgespräch',
   'Wir besprechen deine Finanzierung: den Rahmen, die Konditionen und die Unterlagen für die Bank. Danach stehen die nächsten Schritte bis zur Zusage fest.',
   'finanzierungsgespraech', 4)
) AS v(bezeichnung, beschreibung, anlass, sortierung)
WHERE b.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.buchung_terminarten t
    WHERE t.mitarbeiter_id = b.user_id
      AND (
        t.anlass = v.anlass
        OR lower(btrim(t.bezeichnung)) = lower(v.bezeichnung)
      )
  );
