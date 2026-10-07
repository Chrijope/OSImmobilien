/**
 * Zahlen, Euro, Datum und Uhrzeit in der Sprache des Kunden.
 *
 * Die Umsetzung liegt in `supabase/functions/_shared/sprach-format.ts`, damit
 * Browser (PDFs, Portal, Seiten) und Edge Functions (Mails) aus einer Quelle
 * formatieren. Ein PDF und die Mail zum selben Termin sollen gleich aussehen.
 * Die Begründungen zu den Formaten stehen dort im Dateikopf.
 *
 * Kurzfassung:
 *   zahlText(1234.5, "en", 1)        → "1,234.5"
 *   euroText(1234, "en")             → "€1,234"      (Deutsch "1.234 €")
 *   prozentText(3, "en")             → "3.0%"        (Deutsch "3,0 %")
 *   datumText(d, "en")               → "25 Sep 2026" (Deutsch "25.09.2026")
 *   datumLangText(d, "en", { wochentag: true }) → "Friday, 25 September 2026"
 *   uhrzeitText(d, "en")             → "14:30"
 *   datumUhrzeitText(d, "en")        → "25 Sep 2026, 14:30" (Deutsch "…, 14:30 Uhr")
 *
 * Die Sprache eines Kunden liefert `kundenSprache` aus `src/lib/kundenSprache.ts`.
 */
export {
  SPRACH_LOCALE,
  STANDARD_ZEITZONE,
  zahlText,
  euroText,
  prozentText,
  datumText,
  datumLangText,
  uhrzeitText,
  datumUhrzeitText,
  type FormatSprache,
  type DatumEingabe,
} from "../../supabase/functions/_shared/sprach-format.ts";
