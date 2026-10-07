-- ===========================================================================
-- Karrierestufen: neue Titel fuer das vereinheitlichte Konditionsmodell
-- ===========================================================================
--
-- Etappe 1 des Bewerbermanagement-Umbaus: Alle neuen Partner starten
-- einheitlich mit 4 % Provision. Deshalb heisst die 4-%-Stufe
-- (id 'vertriebspartner') jetzt "Vertriebspartner" statt "Lead Partner",
-- und die alte 3-%-Stufe (id 'tippgeber') "Vertriebspartner (Alt)".
--
-- Die SAETZE bleiben unveraendert (3 / 4 / 4,5 / 5), sie gelten weiter fuer
-- den Bestand. Bestandspartner sind zusaetzlich ueber die festgeschriebenen
-- custom_provision_rate-Saetze abgesichert (Migrationen 20260818140000 und
-- 20260818141000), die Stufe ist fuer sie nur Anzeige und Fallback.
--
-- Aufloesungs-Folge (karriere_stufe_rate, Kennung vor Titel, unveraendert):
--   * "lead partner" trifft keinen Titel mehr und wird deshalb neuer
--     Legacy-Alias der 4-%-Stufe.
--   * Der nackte Titel "Vertriebspartner" loest kuenftig auf die 4-%-Stufe
--     auf (vorher 3 %). Das ist gewollt: Alt-Bestand mit diesem Wert hat
--     festgeschriebene custom-Saetze, die vor dem Stufensatz greifen.
--   * "Vertriebspartner (Alt)" loest ueber den Titel auf die 3-%-Stufe auf.
--
-- Dieses SQL ist das Abbild von KARRIERE_STUFEN in
-- src/lib/karriereStufeHelper.ts, siehe Kommentar auf der Tabelle.

INSERT INTO public.karriere_stufen (id, titel, rate, sortierung, legacy_aliase) VALUES
  ('tippgeber',        'Vertriebspartner (Alt)', 3,   1, ARRAY['junior berater']),
  ('vertriebspartner', 'Vertriebspartner',       4,   2, ARRAY['berater', 'lead berater', 'lead partner']),
  ('manager',          'Team Lead',              4.5, 3, ARRAY['team berater']),
  ('vertriebsfirma',   'Lizenzpartner',          5,   4, ARRAY['senior berater'])
ON CONFLICT (id) DO UPDATE
  SET titel = EXCLUDED.titel,
      rate = EXCLUDED.rate,
      sortierung = EXCLUDED.sortierung,
      legacy_aliase = EXCLUDED.legacy_aliase;
