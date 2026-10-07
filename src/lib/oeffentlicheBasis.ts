/**
 * Die veroeffentlichte Adresse der Anwendung, fuer alle Links an Kunden.
 *
 * Bewusst fest statt window.location.origin: Wer aus der Lovable-Vorschau
 * heraus arbeitet, erzeugte sonst Kundenlinks auf die zugriffsgeschuetzte
 * Vorschau-Adresse. Der Kunde landete dort vor einer Anmeldesperre und
 * konnte im schlimmsten Fall Projektzugriff anfragen (so geschehen am
 * 27.08.2026). Vorschau und Veroeffentlichung teilen dieselbe Datenbank,
 * ein Raum- oder Buchungstoken funktioniert auf der veroeffentlichten
 * Adresse deshalb immer.
 */
export const OEFFENTLICHE_BASIS = "https://osimmobilien.netlify.app";

/** Haengt einen absoluten Pfad an die veroeffentlichte Adresse. */
export function oeffentlicheAdresse(pfad: string): string {
  return `${OEFFENTLICHE_BASIS}${pfad.startsWith("/") ? pfad : `/${pfad}`}`;
}

/**
 * Ein lesbarer Zugangsschluessel: Terminereignis plus kurzer Zufallsteil.
 *
 * Beispiel: "beratungsgespraech-a8k2fq9m3t7c4e1b". Der Zufallsteil bleibt
 * der eigentliche Schluessel (16 Hexzeichen, praktisch unerratbar), das
 * Ereignis davor macht den Link fuer den Kunden verstaendlich. Bewusst OHNE
 * Kundennamen: Namen in Adressen bleiben in Browserverlaeufen und
 * Weiterleitungen haengen.
 */
export function terminToken(ereignis: string): string {
  const zufall = new Uint8Array(8);
  crypto.getRandomValues(zufall);
  const schluessel = Array.from(zufall).map((b) => b.toString(16).padStart(2, "0")).join("");
  const praefix = ereignis
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  return praefix ? `${praefix}-${schluessel}` : schluessel;
}
