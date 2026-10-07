/**
 * Single Source of Truth für Module/Routen, die noch im Aufbau sind
 * ("Entwurf" / "Bald verfügbar").
 *
 * → Werden in der Sidebar als gesperrt angezeigt (Badge "Bald verfügbar"
 *   für nicht-administrative Rollen, "Entwurf" für Admins).
 * → Werden in der CRM-Academy NICHT als Pflichtmodul geführt und tauchen
 *   in der Abschlussprüfung nicht auf, solange sie hier eingetragen sind.
 *
 * Wird ein Eintrag aus dieser Liste entfernt, gilt das Modul automatisch
 * als „live" – die Sidebar zeigt es regulär und die Academy nimmt das
 * zugehörige Wissenswelt-Modul wieder in die Pflicht-Lernpfade auf.
 */
export const DRAFT_ROUTES: ReadonlyArray<string> = [
  // Hauptbereich
  // "/anrufe" ist seit dem 25.09.2026 ganz entfallen, siehe App.tsx.
  // "/kalender" ist hier raus: Die Seite zeigt seit dem 04.08.2026 die eigenen
  // CRM-Termine und funktioniert ohne verbundenen Kalender vollstaendig.
  // Genau die leere Seite war der Grund fuer die Sperre.

  // Auswertung
  /*
   * "/abrechnungen" war vom 12. bis zum 14.09.2026 Entwurf.
   *
   * Christian hat die Seite in dieser Zeit durchgearbeitet: Die Rechnung
   * liest den Kaufpreis jetzt vom Investment, "Abschluesse" zaehlt den
   * durchlaufenen Notartermin, der Rechnungsbetrag haengt an der
   * eingetragenen Kaufpreisfaelligkeit, die Abrechnungshistorie zeigt zum
   * ersten Mal Zeilen, und die Rechnungspruefung der Buchhaltung kommt beim
   * Partner an. Damit ist die Seite wieder fuer alle offen.
   */

  // Tools
  "/academy",
  // Die Wissenswelt beschreibt in weiten Teilen einen aelteren Stand des CRM
  // und wird ueberarbeitet. Bis dahin sehen sie nur Admin und Inhaber.
  "/kalkulation-investagon",
  // "/investmentrechner" ist seit dem 07.09.2026 kein Entwurf mehr. Wer ihn
  // sieht, regelt `investmentrechnerAccess.ts`.

  // Hausverwaltung
  "/mieter",
  "/vermietung",
  "/dienstleister",
  "/hv-tickets",
  "/hv-statistiken",
  "/zaehlerstaende",
  "/kautionen",
  "/betriebskostenabrechnung",
  "/hv-kommunikation",
  "/mieterhoehung",
  "/uebergabeprotokoll",
  "/eigentuemer",
  "/versicherungen",
  "/fristenueberwachung",
];

const DRAFT_SET = new Set(DRAFT_ROUTES);

export function isDraftRoute(url: string): boolean {
  return DRAFT_SET.has(url);
}

/**
 * Mapping zwischen Wissenswelt-Artikel-Slugs und den zugehörigen
 * Sidebar-Routen. Wird ein Slug hier auf eine gesperrte Route abgebildet,
 * wird das Modul aus der Pflicht-Academy & der Prüfung herausgefiltert.
 */
const SLUG_TO_ROUTE: Record<string, string> = {
  mieter: "/mieter",
  vermietung: "/vermietung",
  dienstleister: "/dienstleister",
  "hv-tickets": "/hv-tickets",
  "hv-statistiken": "/hv-statistiken",
  zaehlerstaende: "/zaehlerstaende",
  kautionen: "/kautionen",
  betriebskostenabrechnung: "/betriebskostenabrechnung",
  "hv-kommunikation": "/hv-kommunikation",
  mieterhoehung: "/mieterhoehung",
  uebergabeprotokoll: "/uebergabeprotokoll",
  eigentuemer: "/eigentuemer",
  versicherungen: "/versicherungen",
  fristenueberwachung: "/fristenueberwachung",
  
  bewerberprozess: "/bewerberprozess",
  academy: "/academy",
};

export function isDraftSlug(slug: string): boolean {
  const route = SLUG_TO_ROUTE[slug];
  return route ? isDraftRoute(route) : false;
}
