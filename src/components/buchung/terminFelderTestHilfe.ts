import { fireEvent } from "@testing-library/react";

/**
 * Testhilfe für `TerminFelder`: Datum und Uhrzeit setzen, wie ein Partner
 * klickt.
 *
 * Bewusst ohne `getByRole(..., { name })`: Das berechnet bei jedem Aufruf den
 * ganzen Barrierebaum der Seite und kostete auf der Terminseite je Test
 * zwanzig Sekunden und mehr. Die Knöpfe werden direkt gesucht, nur im
 * geöffneten Fenster.
 */

/** Der Tagesknopf mit dieser Zahl im geöffneten Kalender. */
export function tagesknopf(tag: number): HTMLButtonElement {
  const knopf = Array.from(document.querySelectorAll<HTMLButtonElement>("[role='grid'] button[name='day']"))
    .find((b) => b.textContent === String(tag));
  if (!knopf) throw new Error(`Tag ${tag} steht nicht im geöffneten Kalender`);
  return knopf;
}

/** Stunden- (0) oder Minutenspalte (1) der geöffneten Uhrzeitauswahl. */
export function uhrzeitSpalte(nr: 0 | 1): HTMLElement {
  const spalte = document.querySelectorAll<HTMLElement>("[data-uhrzeit-auswahl] [role='group']")[nr];
  if (!spalte) throw new Error("Die Uhrzeitauswahl ist nicht geöffnet");
  return spalte;
}

/** Der Knopf mit diesem Wert („09“, „35“) in einer Spalte. */
export function uhrzeitKnopf(nr: 0 | 1, wert: string): HTMLButtonElement {
  const knopf = uhrzeitSpalte(nr).querySelector<HTMLButtonElement>(`button[data-wert='${wert}']`);
  if (!knopf) throw new Error(`${wert} fehlt in der Uhrzeitauswahl`);
  return knopf;
}

/** Öffnet das Datumsfeld und wählt den Tag aus JJJJ-MM-TT (Monat muss offen sein). */
export function waehleDatum(feld: HTMLElement, iso: string): void {
  fireEvent.click(feld);
  fireEvent.click(tagesknopf(Number(iso.slice(8))));
}

/** Öffnet das Uhrzeitfeld und wählt HH:MM. */
export function waehleUhrzeit(feld: HTMLElement, hhmm: string): void {
  const [stunde, minute] = hhmm.split(":");
  fireEvent.click(feld);
  fireEvent.click(uhrzeitKnopf(0, stunde));
  fireEvent.click(uhrzeitKnopf(1, minute));
}
