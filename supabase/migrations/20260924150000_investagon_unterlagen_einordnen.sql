-- ===========================================================================
-- Investagon-Unterlagen richtig einordnen (Bestand)
-- ===========================================================================
--
-- WARUM
--
-- Der Investagon-Import hat bis zum 24.09.2026 JEDE Datei mit der Kategorie
-- 'intern' angelegt (supabase/functions/investagon-import/bilder.ts). Bei
-- Gruentenweg 2 trugen so alle 18 Dokumente 'intern': Baubeschreibung,
-- Teilungserklaerung, Grundriss, Energieausweis. Folgen:
--   * Der Investmentrechner meldete "0 hinterlegte Dateien", weil er interne
--     Dateien bewusst auslaesst.
--   * Die Dokumentenseite zeigte das widerspruechliche "Intern · Kunde sieht".
--
-- Der Import ist korrigiert und legt neue Dateien als Objekt- beziehungsweise
-- Wohnungsunterlage ab. VORHANDENE Zeilen fasst er aber nicht mehr an: Findet
-- er die Zeile schon vor, laedt er hoechstens die Datei neu und geht weiter.
-- Der Bestand korrigiert sich also NICHT von selbst, deshalb diese Migration.
--
-- WAS SIE AENDERT, UND NUR DAS
--
--   Die Spalte `kategorie` von Zeilen, die der Import angelegt hat (Adresse
--   beginnt mit '/investagon-dokument/') und die heute 'intern' tragen:
--     objekt_dokumente    -> 'objektunterlagen'
--     wohnungs_dokumente  -> 'wohnungsunterlagen'
--   Ausgenommen bleibt, was Name oder Adresse als Verguetung oder
--   Vertriebsabsprache ausweist. Das bleibt 'intern'. Dieselbe Liste steht als
--   INTERNE_IMPORT_UNTERLAGE in supabase/functions/_shared/dokument-freigabe.ts.
--
-- WAS SIE NICHT AENDERT
--
--   `sichtbar`, `kunden_freigabe` und `geschwaerzt` bleiben unberuehrt. Von
--   Hand hochgeladene Dateien (andere Adressen) bleiben unberuehrt.
--
-- WARUM DIE KUNDENFREIGABE DADURCH NICHT GROSSZUEGIGER WIRD
--
--   Bei einer Datei aus Investagon zaehlt die Kategorie fuer die
--   Dokumenten-Ampel ueberhaupt nicht: `internVonHandAusZeile` gibt fuer den
--   Zeiger '/investagon-dokument/' immer false zurueck, es entscheidet allein
--   `darfZumKunden` nach Titel und Investagon-Kategorie. Mietvertrag und
--   Grundbuch bleiben rot und gehen nur als geschwaerzt geprueft freigegebene
--   Kopie hinaus. Das oeffentliche Exposé gibt ohnehin nur Adressen aus dem
--   oeffentlichen Eimer heraus, nie einen Investagon-Zeiger. Im internen
--   Exposé filtert `baueExposeInhalt` Investagon-Zeiger seit demselben Tag
--   ausdruecklich heraus. Keine RLS-Regel liest `kategorie`.
--
-- WIEDERHOLBAR: Ein zweiter Lauf findet nichts mehr und aendert nichts.
--
-- ---------------------------------------------------------------------------
-- VORABPRUEFUNG, nur lesend. Vor dem Ausfuehren einmal laufen lassen:
-- Sie zeigt je Tabelle, wie viele Zeilen sich aendern und wie viele bewusst
-- 'intern' bleiben.
--
--   select 'objekt_dokumente' as tabelle,
--          count(*) filter (where (coalesce(name, '') || ' ' || url) !~* '(provision|courtage|verg(ü|ue)tung|vertriebsvereinbarung|vertriebsvertrag|vermittlungsvertrag|vermittlungsvereinbarung|maklervertrag|maklerauftrag|tippgeber|kalkulation[[:space:]_-]*einkauf|einkaufspreis|(^|[^a-zäöüß])intern([^a-zäöüß]|$))') as wird_objektunterlage,
--          count(*) filter (where (coalesce(name, '') || ' ' || url) ~* '(provision|courtage|verg(ü|ue)tung|vertriebsvereinbarung|vertriebsvertrag|vermittlungsvertrag|vermittlungsvereinbarung|maklervertrag|maklerauftrag|tippgeber|kalkulation[[:space:]_-]*einkauf|einkaufspreis|(^|[^a-zäöüß])intern([^a-zäöüß]|$))') as bleibt_intern
--     from public.objekt_dokumente
--    where url like '/investagon-dokument/%' and kategorie = 'intern'
--   union all
--   select 'wohnungs_dokumente',
--          count(*) filter (where (coalesce(name, '') || ' ' || url) !~* '(provision|courtage|verg(ü|ue)tung|vertriebsvereinbarung|vertriebsvertrag|vermittlungsvertrag|vermittlungsvereinbarung|maklervertrag|maklerauftrag|tippgeber|kalkulation[[:space:]_-]*einkauf|einkaufspreis|(^|[^a-zäöüß])intern([^a-zäöüß]|$))'),
--          count(*) filter (where (coalesce(name, '') || ' ' || url) ~* '(provision|courtage|verg(ü|ue)tung|vertriebsvereinbarung|vertriebsvertrag|vermittlungsvertrag|vermittlungsvereinbarung|maklervertrag|maklerauftrag|tippgeber|kalkulation[[:space:]_-]*einkauf|einkaufspreis|(^|[^a-zäöüß])intern([^a-zäöüß]|$))')
--     from public.wohnungs_dokumente
--    where url like '/investagon-dokument/%' and kategorie = 'intern';
--
-- Und die Namen, die intern bleiben, zum Gegenlesen:
--
--   select 'objekt' as ebene, name from public.objekt_dokumente
--    where url like '/investagon-dokument/%' and kategorie = 'intern'
--      and (coalesce(name, '') || ' ' || url) ~* '(provision|courtage|verg(ü|ue)tung|vertriebsvereinbarung|vertriebsvertrag|vermittlungsvertrag|vermittlungsvereinbarung|maklervertrag|maklerauftrag|tippgeber|kalkulation[[:space:]_-]*einkauf|einkaufspreis|(^|[^a-zäöüß])intern([^a-zäöüß]|$))'
--   union all
--   select 'wohnung', name from public.wohnungs_dokumente
--    where url like '/investagon-dokument/%' and kategorie = 'intern'
--      and (coalesce(name, '') || ' ' || url) ~* '(provision|courtage|verg(ü|ue)tung|vertriebsvereinbarung|vertriebsvertrag|vermittlungsvertrag|vermittlungsvereinbarung|maklervertrag|maklerauftrag|tippgeber|kalkulation[[:space:]_-]*einkauf|einkaufspreis|(^|[^a-zäöüß])intern([^a-zäöüß]|$))';
-- ---------------------------------------------------------------------------

BEGIN;

UPDATE public.objekt_dokumente
   SET kategorie = 'objektunterlagen'
 WHERE url LIKE '/investagon-dokument/%'
   AND kategorie = 'intern'
   AND (coalesce(name, '') || ' ' || url) !~* '(provision|courtage|verg(ü|ue)tung|vertriebsvereinbarung|vertriebsvertrag|vermittlungsvertrag|vermittlungsvereinbarung|maklervertrag|maklerauftrag|tippgeber|kalkulation[[:space:]_-]*einkauf|einkaufspreis|(^|[^a-zäöüß])intern([^a-zäöüß]|$))';

UPDATE public.wohnungs_dokumente
   SET kategorie = 'wohnungsunterlagen'
 WHERE url LIKE '/investagon-dokument/%'
   AND kategorie = 'intern'
   AND (coalesce(name, '') || ' ' || url) !~* '(provision|courtage|verg(ü|ue)tung|vertriebsvereinbarung|vertriebsvertrag|vermittlungsvertrag|vermittlungsvereinbarung|maklervertrag|maklerauftrag|tippgeber|kalkulation[[:space:]_-]*einkauf|einkaufspreis|(^|[^a-zäöüß])intern([^a-zäöüß]|$))';

COMMIT;

-- Kontrolle: je Tabelle, wie viele Investagon-Dateien noch 'intern' tragen.
-- Erwartet: nur noch die, deren Name Verguetung oder Vertrieb nennt.
SELECT 'objekt_dokumente' AS tabelle, kategorie, count(*) AS anzahl
  FROM public.objekt_dokumente
 WHERE url LIKE '/investagon-dokument/%'
 GROUP BY kategorie
UNION ALL
SELECT 'wohnungs_dokumente', kategorie, count(*)
  FROM public.wohnungs_dokumente
 WHERE url LIKE '/investagon-dokument/%'
 GROUP BY kategorie
 ORDER BY 1, 2;
