-- ===========================================================================
-- Absage bleibt im Closing, und eine neue Buchung holt aus der Wiedervorlage
-- zurueck
-- ===========================================================================
--
-- WARUM
--
-- Zwei Entscheidungen von GL am 16.09.2026, beide im Anschluss an
-- 20260916210000 ("Wer sich selbst einen Gespraechstermin bucht, steht danach
-- im Closing"):
--
--   1. "Sollte ein Bewerber den Termin absagen, dann muss das Closing-Gespraech
--      mit einem Badge als abgesagt angezeigt werden, soll aber bei Closing
--      liegen bleiben."
--   2. "Eine neue Buchung soll jemanden aus der Wiedervorlage zurueckholen."
--
-- ---------------------------------------------------------------------------
-- ZU 1: DIE ABSAGE AENDERT AN DER DATENBANK NICHTS
-- ---------------------------------------------------------------------------
--
-- `bewerber_termin_absagen` fasst die Stufe schon heute nicht an. Das ist
-- genau das gewuenschte Verhalten und bleibt deshalb, wie es ist. Diese
-- Migration haelt es nur ausdruecklich in einem Kommentar fest, damit es
-- niemand spaeter fuer ein Versehen haelt und "aufraeumt".
--
-- Woher das Abzeichen seine Auskunft nimmt, war die eigentliche Frage. Die
-- Absage raeumt `meta.erstgespraechDatum` und `meta.erstgespraechUhrzeit` am
-- Bewerber (nur dann, wenn dort noch genau dieser Termin steht). Danach sieht
-- ein abgesagter Termin aus wie ein nie gebuchter, und ein Abzeichen liesse
-- sich daraus nicht bauen.
--
-- Gewaehlt wurde deshalb `public.buchungen`:
--
--   - `buchung_absagen` setzt dort `status = 'abgesagt'`, `abgesagt_at = now()`
--     und `absage_grund`. `start_at` bleibt unveraendert stehen.
--   - Die Zeile ist die Tatsache. `meta` ist nur ihre Kopie, geschrieben von
--     `bewerber_termin_buchen`.
--   - Es muss nichts Neues erfunden werden: kein zusaetzlicher Vermerk im
--     `meta`, keine zweite Wahrheit, keine Migration fuer Bestandsdaten.
--
-- Der zweite Weg waere ein Vermerk im `meta` der Bewerbung gewesen, etwa wann
-- und von wem abgesagt wurde. Dagegen sprach mehr als nur der Aufwand:
-- `bewerberToDb` in `src/lib/bewerbungStore.ts` baut `meta` bei jedem
-- Speichern vollstaendig aus dem Bewerberobjekt im Arbeitsspeicher neu auf.
-- Ein Vermerk, den die Datenbank hineinschreibt, ueberlebt dort nur, bis
-- irgendjemand die Akte speichert, dessen Zwischenspeicher aelter ist.
--
-- Genau daran ist am 16.09.2026 auch der Termin von Berat Kilapia verschwunden:
-- Die Karte "Videocall Termin" zeigte ihn (sie liest `buchungen`), die Spalte
-- "Closing-Gespraech" zeigte einen Strich (sie las `meta`). Die Anzeige liest
-- seither ueberall `buchungen`, siehe `closingGespraechTermin` in
-- `src/lib/bewerberTermine.ts`. Das wirkt ohne jede Migration.
--
-- ---------------------------------------------------------------------------
-- ZU 2: 'FollowUp' KOMMT IN DIE LISTE DER STUFEN, DIE EINE BUCHUNG ANHEBT
-- ---------------------------------------------------------------------------
--
-- `bewerber_stufe_closing` hob die Stufe bisher aus '', 'eingegangen',
-- 'Eingang' und 'Erstgespraech'. Neu ist 'FollowUp'.
--
-- Warum 'FollowUp' und nicht 'Bedenkzeit': Die Wiedervorlage im Bewerber-
-- prozess heisst im Code 'FollowUp'. So steht es in
-- `src/components/bewerbung/useErstgespraechAbschluss.ts` ("followUpSetzen:
-- Empfehlung B, Wiedervorlage, Status Follow-Up") und in
-- `erstgespraechBausteine.tsx` ("Empfehlung B: Wiedervorlage mit Datum,
-- Uhrzeit und Notiz"). 'Bedenkzeit' ist etwas anderes: Dort hat das Gespraech
-- stattgefunden und der Bewerber ueberlegt, dazu gehoert ein vereinbarter
-- Rueckruf und kein neuer Gespraechstermin.
--
-- Den Rueckweg gibt es an einer Stelle uebrigens laengst: `closingRuecksprung-
-- Status` in `src/lib/bewerbungStore.ts` holt einen Bewerber aus 'FollowUp'
-- zurueck ins Closing, sobald im CRM ein neuer Closing-Termin gesetzt wird.
-- Nur der Weg ueber den Bewerber selbst tat es nicht. Dieselbe Luecke,
-- dieselbe Stelle wie gestern bei der Stufe und am 12.09.2026 beim
-- Erinnerungszaehler.
--
-- Unveraendert bleibt: Wer in Closing oder weiter steht (Bedenkzeit,
-- Paketwahl, Vertrag, Rechnung, Nutzer_anlegen, Aktiv) oder ausgeschieden ist
-- (Abgelehnt, KeinInteresse), wird nicht angefasst. Eine Buchung darf niemanden
-- zurueckwerfen.
--
-- ---------------------------------------------------------------------------
-- WENN DIE VORMIGRATION NOCH NICHT GELAUFEN IST
-- ---------------------------------------------------------------------------
--
-- Diese Migration baut auf 20260916210000 auf. Sie bricht deswegen aber nicht
-- ab: `bewerber_stufe_closing` wird mit CREATE OR REPLACE angelegt, gleich ob
-- es sie schon gibt oder nicht.
--
-- Nur waere sie ohne die Vormigration wirkungslos, denn dann rufen
-- `bewerber_termin_buchen` und `bewerber_termin_verschieben` sie gar nicht.
-- Das waere ein stiller Fehlschlag, und genau so einer ist heute schon einmal
-- aufgetreten (siehe den Kopf zu `sales_coach_aufnahmen` in
-- 20260916190000_kundenzugriff_rollenentscheidung.sql). Deshalb prueft
-- Abschnitt 1 nach und sagt im Klartext, was noch fehlt.
--
-- Wiederholbar: ein zweiter Lauf aendert nichts.
-- ===========================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Nachsehen, ob die Vormigration gelaufen ist
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Nur ein Hinweis, kein Abbruch. Wer den Hinweis liest, laesst
-- 20260916210000_bewerber_selbstbuchung_ins_closing.sql nachtraeglich laufen;
-- danach wirkt auch diese Migration wie gedacht.

DO $$
DECLARE
  _buchen regprocedure := to_regprocedure('public.bewerber_termin_buchen(text, timestamptz)');
  _verschieben regprocedure := to_regprocedure('public.bewerber_termin_verschieben(text, timestamptz)');
BEGIN
  IF _buchen IS NULL THEN
    RAISE NOTICE 'bewerber_termin_buchen fehlt (Migration 20260906120000 nie gelaufen). Die Stufenhebung bleibt wirkungslos.';
  ELSIF position('bewerber_stufe_closing' IN pg_get_functiondef(_buchen)) = 0 THEN
    RAISE NOTICE 'bewerber_termin_buchen ruft bewerber_stufe_closing nicht. Bitte zuerst 20260916210000_bewerber_selbstbuchung_ins_closing.sql ausfuehren, sonst hebt keine Buchung die Stufe.';
  END IF;

  IF _verschieben IS NOT NULL
     AND position('bewerber_stufe_closing' IN pg_get_functiondef(_verschieben)) = 0 THEN
    RAISE NOTICE 'bewerber_termin_verschieben ruft bewerber_stufe_closing nicht. Siehe Migration 20260916210000.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Die Wiedervorlage kommt dazu
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Einzige Aenderung gegenueber 20260916210000: 'FollowUp' steht mit in der
-- Liste. Alles Uebrige ist Wort fuer Wort dasselbe, damit sich die beiden
-- Fassungen vergleichen lassen.

CREATE OR REPLACE FUNCTION public.bewerber_stufe_closing(_bewerbung uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.bewerbungen
     SET status = 'Closing'
   WHERE id = _bewerbung
     AND COALESCE(status, '') IN ('', 'eingegangen', 'Eingang', 'Erstgespraech', 'FollowUp');
$$;

REVOKE ALL ON FUNCTION public.bewerber_stufe_closing(uuid) FROM public;

COMMENT ON FUNCTION public.bewerber_stufe_closing(uuid) IS
  'Hebt die Pipelinestufe eines Bewerbers auf Closing, aber nur aus Eingang, Erstgespraech und der Wiedervorlage (FollowUp). Wer weiter ist oder ausgeschieden, bleibt unberuehrt.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Die Absage laesst die Stufe in Ruhe, und das ist Absicht
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Keine Aenderung am Verhalten, nur der Kommentar. Er haelt GL-Vorgabe
-- an der Funktion selbst fest, damit sie nicht spaeter "vervollstaendigt" wird.

DO $$
BEGIN
  IF to_regprocedure('public.bewerber_termin_absagen(text, text)') IS NOT NULL THEN
    EXECUTE $c$
      COMMENT ON FUNCTION public.bewerber_termin_absagen(text, text) IS
        'Sagt den Gespraechstermin des Bewerbers ab und raeumt Datum und Uhrzeit in der Akte, wenn dort noch genau dieser Termin steht. Die Pipelinestufe bleibt bewusst unberuehrt: Ein abgesagter Bewerber bleibt im Closing und bekommt in der Liste nur das Abzeichen "Abgesagt" (Entscheidung GL, 16.09.2026). Das Abzeichen liest buchungen.status, nicht das meta der Bewerbung.'
    $c$;
  ELSE
    RAISE NOTICE 'bewerber_termin_absagen fehlt (Migration 20260906120000 nie gelaufen), Kommentar uebersprungen.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Nachtrag fuer die Altfaelle in der Wiedervorlage
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Wer in der Wiedervorlage steht und einen offenen, noch bevorstehenden Termin
-- hat, gehoert ins Closing. Die Wiedervorlage wollte genau diesen Termin
-- herbeifuehren; er ist da.
--
-- Bewusst nur bevorstehende Termine. Ein Termin, der laengst vorbei ist, sagt
-- ueber die Stufe nichts: Steht der Bewerber danach in der Wiedervorlage, hat
-- ein Mensch ihn nach dem Gespraech dorthin gesetzt. Das nachtraeglich
-- umzuschreiben waere eine Behauptung ueber die Vergangenheit. Dieselbe
-- Ueberlegung wie im Nachtrag von 20260916210000.
--
-- Abgesagte Termine zaehlen hier nicht mit (`status = 'offen'`): Eine Absage
-- holt niemanden zurueck, sie hinterlaesst nur das Abzeichen.
--
-- Zaehler vorher: Wie viele Bewerber stehen in der Wiedervorlage und haben
-- trotzdem einen offenen, noch bevorstehenden Termin?
--
--   select count(*)
--     from public.bewerbungen b
--    where coalesce(b.status, '') = 'FollowUp'
--      and exists (
--        select 1 from public.buchungen u
--         where u.bewerbung_id = b.id
--           and u.status = 'offen'
--           and u.start_at >= now());

DO $$
BEGIN
  -- Ohne die Spalte gibt es keine Bewerberbuchungen, also auch nichts
  -- nachzutragen. Kein Abbruch, nur ein Hinweis.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'buchungen'
       AND column_name = 'bewerbung_id'
  ) THEN
    RAISE NOTICE 'buchungen.bewerbung_id fehlt (Migration 20260906120000 nie gelaufen), Nachtrag uebersprungen.';
    RETURN;
  END IF;

  UPDATE public.bewerbungen b
     SET status = 'Closing'
   WHERE COALESCE(b.status, '') = 'FollowUp'
     AND EXISTS (
       SELECT 1 FROM public.buchungen u
        WHERE u.bewerbung_id = b.id
          AND u.status = 'offen'
          AND u.start_at >= now()
     );
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Prueflauf (auskommentiert, im SQL-Editor von Hand ausfuehren)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- a) Kennt die Stufenhebung jetzt die Wiedervorlage? Muss 'FollowUp' enthalten:
--
--   select pg_get_functiondef(to_regprocedure('public.bewerber_stufe_closing(uuid)'));
--
-- b) Dieselbe Zaehlung wie oben. Sie muss jetzt 0 ergeben:
--
--   select count(*)
--     from public.bewerbungen b
--    where coalesce(b.status, '') = 'FollowUp'
--      and exists (
--        select 1 from public.buchungen u
--         where u.bewerbung_id = b.id
--           and u.status = 'offen'
--           and u.start_at >= now());
--
-- c) Wen der Nachtrag betroffen hat:
--
--   select b.vorname, b.nachname, b.status, u.start_at
--     from public.bewerbungen b
--     join public.buchungen u on u.bewerbung_id = b.id and u.status = 'offen'
--    where b.status = 'Closing'
--      and u.start_at >= now()
--    order by u.start_at;
--
-- d) Die abgesagten Termine, die das Abzeichen bekommen sollen. Die Bewerber
--    muessen dabei weiterhin in ihrer Stufe stehen, typischerweise 'Closing':
--
--   select b.vorname, b.nachname, b.status,
--          u.start_at, u.abgesagt_at, u.absage_grund
--     from public.buchungen u
--     join public.bewerbungen b on b.id = u.bewerbung_id
--    where u.status = 'abgesagt'
--    order by u.abgesagt_at desc nulls last;
--
-- e) Gegenprobe zur Migration 20260916210000: Hat jemand einen offenen,
--    bevorstehenden Termin und steht trotzdem noch vor dem Closing?
--
--   select count(*)
--     from public.bewerbungen b
--    where coalesce(b.status, '') in ('', 'eingegangen', 'Eingang', 'Erstgespraech')
--      and exists (
--        select 1 from public.buchungen u
--         where u.bewerbung_id = b.id
--           and u.status = 'offen'
--           and u.start_at >= now());
