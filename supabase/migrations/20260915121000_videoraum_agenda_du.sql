-- ===========================================================================
-- Die Standardagenda des Videoraums spricht auch mit Kunden per Du
-- ===========================================================================
--
-- Seit dem 15.09.2026 spricht das ganze Projekt per Du, Kunden wie Bewerber.
-- Die Standardagenda fuer Erstgespraech, Beratung und Objektvorstellung stand
-- bis dahin im Sie ("Ihre Ausgangslage", "Sie entscheiden, ob und wie es
-- weitergeht"). Sie steht im Warteraum, den der Kunde vor dem Gespraech sieht,
-- und waere dort die letzte Stelle mit Sie gewesen.
--
-- Nur der Wortlaut aendert sich. Schluessel, Reihenfolge und Minuten bleiben
-- wie in 20260908160000, der Fall `bewerbergespraech` ist unveraendert
-- uebernommen, weil CREATE OR REPLACE die ganze Funktion ersetzt.
--
-- Die Zwillingsfassung im Browser liegt in `src/lib/videoraumAgenda.ts` und
-- ist wortgleich. Wer hier etwas aendert, aendert es auch dort.
--
-- Bestehende Raeume behalten ihre Agenda: Sie wird beim Anlegen einmal in
-- `videoraeume.agenda` geschrieben, nicht bei jedem Aufruf neu berechnet.
-- Die Migration ist wiederholbar, mehrfaches Ausfuehren aendert nach dem
-- ersten Lauf nichts mehr.
--
-- Voraussetzung: 20260908160000_persoenliches_gespraech.sql.

CREATE OR REPLACE FUNCTION public.videoraum_standard_agenda(_art text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _art
    WHEN 'erstgespraech' THEN '[
      {"titel":"Kurz kennenlernen","text":"Wer wir sind und wie wir arbeiten.","minuten":5},
      {"titel":"Deine Situation","text":"Wo du heute stehst und was du erreichen willst.","minuten":10},
      {"titel":"Passt das zusammen?","text":"Ehrlich und ohne Verkaufsdruck.","minuten":10},
      {"titel":"Nächster Schritt","text":"Du entscheidest, ob ein ausführliches Gespräch folgt.","minuten":5}
    ]'::jsonb
    WHEN 'beratung' THEN '[
      {"titel":"Deine Ausgangslage","text":"Einkommen, Steuerlast, was du bisher aufgebaut hast.","minuten":10},
      {"titel":"Was rechnerisch möglich ist","text":"Wir rechnen deinen Rahmen gemeinsam durch.","minuten":15},
      {"titel":"Passende Objekte","text":"Zwei bis drei konkrete Beispiele aus dem Bestand.","minuten":15},
      {"titel":"Selbstauskunft ausfüllen","text":"Wir gehen sie gemeinsam durch. Danach wissen wir verbindlich, welcher Rahmen für dich machbar ist.","minuten":15},
      {"titel":"Deine Fragen und nächster Schritt","text":"Du entscheidest, ob und wie es weitergeht.","minuten":5}
    ]'::jsonb
    WHEN 'objektvorstellung' THEN '[
      {"titel":"Das Objekt im Überblick","text":"Lage, Zustand, Ausstattung.","minuten":15},
      {"titel":"Deine Berechnung","text":"Zeile für Zeile gemeinsam durch.","minuten":20},
      {"titel":"Vermietung und Verwaltung","text":"Wer sich worum kümmert.","minuten":10},
      {"titel":"Deine Fragen","text":"Alles, was offen ist.","minuten":15}
    ]'::jsonb
    WHEN 'bewerbergespraech' THEN '[
      {"titel":"Ankommen","text":"Kurz gegenseitig vorstellen. Was du im Kennenlernen geschrieben hast, ist gelesen.","minuten":5},
      {"titel":"Deine Themen","text":"Was du markiert hast, und deine eigene Frage.","minuten":13},
      {"titel":"Wie die Zusammenarbeit läuft","text":"Vergütung, was das Haus stellt, Gewerbe und Erlaubnis.","minuten":12},
      {"titel":"Wie es weitergeht","text":"Du entscheidest, ob du starten möchtest. Ein Vertrag kommt erst danach.","minuten":5}
    ]'::jsonb
    ELSE '[]'::jsonb
  END;
$$;
