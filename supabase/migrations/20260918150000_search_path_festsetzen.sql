-- ===========================================================================
-- Suchpfad bei den letzten 17 Funktionen festsetzen
-- ===========================================================================
--
-- WARUM
--
-- Eine Datenbankfunktion sucht die Tabellen, die sie benutzt, ueber einen
-- Suchpfad. Steht der nicht fest, koennte jemand mit Schreibrechten im
-- Schema eine eigene Tabelle unterschieben, die die Funktion dann statt der
-- echten benutzt. Das Pruefwerkzeug von Lovable meldet das als
-- "Function Search Path Mutable".
--
-- Die Luecke greift erst, wenn jemand ohnehin schon in der Datenbank
-- schreiben kann. Sie ist also eine Absicherung in der Tiefe und kein
-- offenes Tor. Sie kostet aber auch fast nichts, deshalb wird sie zugemacht.
--
-- WARUM DAS HIER OHNE RISIKO IST
--
-- ALTER FUNCTION ... SET search_path aendert NUR diese eine Einstellung. Der
-- Rumpf der Funktion wird nicht angefasst, nicht neu geschrieben und nicht
-- neu uebersetzt. Es gibt also keine Gelegenheit, dabei etwas kaputtzumachen.
-- Das ist der Unterschied zu CREATE OR REPLACE, wo man den ganzen Code
-- fehlerfrei wiederholen muesste.
--
-- Die Schleife holt sich die betroffenen Funktionen selbst aus dem Katalog,
-- statt 17 Namen fest einzutragen. Damit erwischt sie auch die richtigen
-- Signaturen bei gleichnamigen Funktionen und laesst in Ruhe, was den
-- Suchpfad laengst hat. Mehrfach ausfuehrbar.
-- ===========================================================================

DO $$
DECLARE
  _f RECORD;
  _anzahl integer := 0;
BEGIN
  FOR _f IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND (
         p.proconfig IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
         )
       )
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) SET search_path = public',
        _f.proname, _f.args
      );
      _anzahl := _anzahl + 1;
      RAISE NOTICE 'Suchpfad gesetzt: %(%)', _f.proname, _f.args;
    EXCEPTION WHEN OTHERS THEN
      -- Eine Funktion, die sich nicht aendern laesst, haelt den Rest nicht auf.
      RAISE WARNING 'Suchpfad NICHT gesetzt bei %(%): %', _f.proname, _f.args, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Fertig, % Funktionen angepasst.', _anzahl;
END $$;
