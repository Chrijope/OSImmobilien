/**
 * Telefon und E-Mail aus dem Impressum, an einer Stelle.
 *
 * Beides wird an mehreren Stellen gebraucht: auf der Impressumsseite, in der
 * Datenschutzerklärung und in der Widerrufsbelehrung der
 * Reservierungsvereinbarung. Die Telefonnummer ist in der
 * Belehrung seit dem 28.05.2022 Pflichtangabe (Anlage 1 zu Art. 246a § 1
 * Abs. 2 Satz 2 EGBGB).
 *
 * Bewusst nicht in `pdfBranding.ts`: Die Datei bindet jsPDF ein, und das
 * Formular auf dem Schirm soll die Firmenangaben lesen können, ohne die
 * PDF-Bibliothek mitzuladen. `pdfBranding` reicht beide Werte neben
 * `COMPANY_LINE` weiter.
 *
 * Festgelegt von Christian am 15.09.2026. Vorher stand im CRM
 * office@moreimmo.de, auf der Website office@more.immo; jetzt gilt überall
 * die Adresse der Website. Wird die Nummer leer gelassen, lassen alle Stellen
 * die Telefonzeile weg, statt etwas zu erfinden.
 */
export const IMPRESSUM_TELEFON = "+49 176 60995539";

/**
 * Die Firmenzeile in Fußzeilen und im Kontaktblock des Exposés. Aus demselben
 * Grund hier und nicht in `pdfBranding.ts`: Das Exposé baut seinen Inhalt auch
 * auf Seiten, die jsPDF erst beim Klick auf „Exposé herunterladen“ laden
 * sollen (Kundenansicht, öffentliches Exposé).
 */
export const COMPANY_LINE = "MOREImmo, Wendelsteinstraße 19, 83075 Bad Feilnbach";
export const IMPRESSUM_EMAIL = "office@more.immo";

/**
 * Das Büro als Empfänger interner Meldungen (Notartermin, Kaufvertrag,
 * Kaufpreisfälligkeit). Festgelegt von Christian am 25.09.2026: Solche
 * Meldungen gehen ans Büro und an keine fremde Adresse.
 */
export const BUERO_EMAIL = IMPRESSUM_EMAIL;
