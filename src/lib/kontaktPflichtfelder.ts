/**
 * Pflichtfelder beim Anlegen eines Kontakts.
 *
 * Liegt hier und nicht im Dialog, weil es den Dialog zweimal gibt: einmal als
 * Komponente `NeuerKontaktDialog` und einmal fest eingebaut in der Seite
 * `Kontakte`. Beide sollen dieselben Felder verlangen.
 */

export type KontaktPflichtEingabe = {
  anrede: string;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  leadTyp: string;
};

/**
 * Welche Pflichtfelder sind noch leer?
 *
 * Die Adresse (Straße, Hausnummer, PLZ, Ort) gehört bewusst nicht dazu. Beim
 * ersten Kontakt liegt sie oft noch gar nicht vor und darf das Anlegen deshalb
 * nicht blockieren. Nachgetragen wird sie später in den Stammdaten.
 */
export function fehlendePflichtfelder(form: KontaktPflichtEingabe): Record<string, boolean> {
  const werte: Record<string, string> = {
    anrede: form.anrede,
    vorname: form.vorname.trim(),
    nachname: form.nachname.trim(),
    email: form.email.trim(),
    telefon: form.telefon.trim(),
    leadTyp: form.leadTyp,
  };
  const fehler: Record<string, boolean> = {};
  Object.entries(werte).forEach(([feld, wert]) => { if (!wert) fehler[feld] = true; });
  return fehler;
}
