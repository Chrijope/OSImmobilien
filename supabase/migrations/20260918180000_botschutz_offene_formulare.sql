-- ===========================================================================
-- Die beiden offenen Tueren schliessen: Einreichungen und Zaehler
-- ===========================================================================
--
-- WARUM
--
-- Zwei Tabellen standen jedem offen, der die oeffentliche Adresse und den
-- oeffentlichen Schluessel kennt, und beide ohne jede Bremse:
--
--   * `objekt_einreichungen`, ueber die Richtlinie
--     "Oeffentliche Einreichungen erstellen" (20260831180000). Jeder konnte
--     beliebig viele Einreichungen anlegen, mit erfundenen Eigentuemerdaten.
--   * `analysetool_ereignisse`, ueber eine Richtlinie mit
--     `WITH CHECK (true)` fuer `anon` (20260908120000). Jeder konnte die
--     Tabelle vollschreiben und damit jede Auswertung verfaelschen.
--
-- Abfliessen kann in beiden Faellen nichts. Die Angaben traegt der Absender
-- selbst ein, und der Zaehler kennt ohnehin keinen Personenbezug. Das Risiko
-- liegt in der Gegenrichtung: Muell in den Tabellen und gefaelschte
-- Einreichungen, die hinterher ein Mensch aussortieren muss.
--
-- WAS SICH AENDERT
--
-- Beide Wege laufen ab jetzt ueber eine Edge Function, und die Function
-- traegt den Schutz:
--
--   * `submit-objekt-einreichung`: Honigtopf und Kontingent je Anschluss.
--   * `analyse-ereignis`: Kontingent je Anschluss.
--
-- Beide benutzen dieselbe Postgres-Funktion `check_rate_limit`, die auch
-- `submit-lead` seit jeher benutzt. Kein zweiter Weg und kein zweiter Zaehler.
-- Weil eine Edge Function mit der Dienstrolle schreibt, braucht `anon` auf
-- den beiden Tabellen gar kein Schreibrecht mehr.
--
-- WICHTIG, REIHENFOLGE
--
-- Diese Migration nimmt `anon` das direkte Schreibrecht. Die beiden Functions
-- muessen deshalb VORHER ausgerollt sein, sonst laeuft die Objekteinreichung
-- ins Leere. Die Oberflaeche ruft sie bereits.
--
-- Der Zaehler ist davon unkritisch: Faellt er aus, wird nur nicht gezaehlt.
--
-- Wiederholbar: ein zweiter Lauf aendert nichts.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Objekteinreichungen: kein direkter Weg mehr von aussen
-- ---------------------------------------------------------------------------
--
-- Die interne Richtlinie "Interne erstellen Einreichungen" (20260321124218)
-- bleibt unberuehrt, im CRM aendert sich also nichts. Weg faellt allein die
-- offene Tuer, durch die auch ein Skript ging.

DROP POLICY IF EXISTS "Oeffentliche Einreichungen erstellen" ON public.objekt_einreichungen;

REVOKE ALL ON public.objekt_einreichungen FROM anon;

-- Der Bild-Upload ueber den offenen Link bleibt, wie er ist: `anon` darf
-- weiterhin nur in `einreichungen/public/` schreiben, nicht lesen, nicht
-- aendern, nicht loeschen (20260831180000). Ohne Bilder waere das Formular
-- fuer den Einreicher nur halb so viel wert.


-- ---------------------------------------------------------------------------
-- 2) Zaehler der oeffentlichen Rechner: nur noch ueber die Function
-- ---------------------------------------------------------------------------
--
-- Angemeldete Nutzer duerfen weiterhin schreiben. Das kostet nichts: Wer ein
-- Konto hat, ist bekannt, und die Oberflaeche geht ohnehin ueber die
-- Function. Faellt die Richtlinie ganz weg, koennte ein spaeterer interner
-- Zaehler still aufhoeren zu zaehlen, ohne dass es jemandem auffiele.

DROP POLICY IF EXISTS analysetool_ereignisse_insert ON public.analysetool_ereignisse;
CREATE POLICY analysetool_ereignisse_insert
  ON public.analysetool_ereignisse FOR INSERT
  TO authenticated
  WITH CHECK (true);

REVOKE ALL ON public.analysetool_ereignisse FROM anon;

-- Lesen bleibt fuer Angemeldete, wie bisher (Auswertung im CRM). Aendern und
-- Loeschen bleiben ohne Richtlinie und damit der Dienstrolle vorbehalten.


-- ---------------------------------------------------------------------------
-- 3) Nachsehen
-- ---------------------------------------------------------------------------
--
-- Steht `anon` nirgends mehr als Empfaenger?
--
--     select policyname, roles, cmd
--       from pg_policies
--      where tablename in ('objekt_einreichungen', 'analysetool_ereignisse');
--
--     select grantee, privilege_type
--       from information_schema.role_table_grants
--      where table_name in ('objekt_einreichungen', 'analysetool_ereignisse')
--        and grantee = 'anon';
--
-- Die zweite Abfrage muss leer sein.
--
-- Gegenprobe im Betrieb:
--   * /objekt-akquise ohne Anmeldung ausfuellen und absenden. Die Einreichung
--     muss ankommen. Kommt "Der Versand ist im Moment leider nicht moeglich",
--     ist `submit-objekt-einreichung` noch nicht ausgerollt.
--   * Den Steuerrechner oeffnen und in der Auswertung pruefen, ob der
--     Trichter weiterzaehlt.
