/**
 * Wie eine geplante Aktion abgeschlossen wird.
 *
 * Die Aktionsliste im Kundenprofil traegt seit 09/2026 je Eintrag einen
 * Haken. Was der Haken tut, haengt an der Art des Eintrags, und genau diese
 * Entscheidung steht hier: als reine Rechnerei, ohne Oberflaeche und ohne
 * Datenbank, damit sie pruefbar bleibt.
 *
 * Wichtig ist vor allem die Grenze zwischen Aufgabe und Termin. Eine Aufgabe
 * ist mit einem Klick erledigt. Ein Termin nicht: Dort haengt eine Folgekette
 * dran (NoShow-Stufe, Aufgabe zur Neuterminierung), und still abgehakt wuerde
 * er diese Kette ueberspringen. Deshalb fuehrt er immer in den Dialog mit den
 * drei Antworten.
 */

import { aktionArtLabel, type AktionArt, type GeplanteAktion } from "./kundenNaechsteAktion";

/**
 * Was der Haken bei diesem Eintrag auslösen soll.
 *
 * `hinweis` heißt: gar nichts, der Haken wird erst gar nicht angezeigt.
 */
export type AbschlussWeg = "direkt" | "termin_dialog" | "fester_termin" | "hinweis";

/**
 * Nur Aufgaben und Follow-ups verschwinden auf einen Klick.
 *
 * Termine und Videomeetings sind ausdrücklich nicht dabei. Wer das ändert,
 * überspringt die No-Show-Kette.
 */
export function istDirektErledigbar(art: AktionArt): boolean {
  return art === "aufgabe" || art === "follow_up";
}

/**
 * Welchen Weg der Haken eines Eintrags nimmt.
 *
 * `fester_termin` sind die Termine, die als Datum am Kontakt hängen
 * (Erstgespräch, Beratungsgespräch, Notartermin). Hinter ihnen steht keine
 * Termin-Zeile im Verlauf und damit auch keine Ergebnis-Karte. Sie werden im
 * Reiter Stammdaten gepflegt, dorthin führt der Haken.
 */
export function abschlussWeg(aktion: GeplanteAktion): AbschlussWeg {
  // Eine ausstehende Unterschrift ist erledigt, wenn der Kunde unterschreibt,
  // nicht wenn jemand einen Haken setzt. Ein Haken daneben wäre eine Lüge:
  // Der Eintrag käme beim nächsten Aufbau der Liste sofort wieder.
  if (aktion.art === "unterschrift") return "hinweis";
  if (istDirektErledigbar(aktion.art)) return "direkt";
  return aktion.aktivitaetId ? "termin_dialog" : "fester_termin";
}

/**
 * Die Einträge, die der Sammelweg anfasst.
 *
 * Bewusst eng: nur überfällige Aufgaben und Follow-ups. Termine sind nie
 * dabei, denn "alle erledigen" darf keinen Termin stillschweigend abhaken.
 * Und was noch nicht fällig ist, bleibt ebenfalls draußen: Der Sammelweg
 * räumt Liegengebliebenes auf, er arbeitet nicht vor.
 */
export function sammelbareAufgaben(aktionen: GeplanteAktion[]): GeplanteAktion[] {
  return (aktionen || []).filter((a) => a.ueberfaellig && istDirektErledigbar(a.art));
}

/**
 * Ab wann der Sammelweg überhaupt erscheint.
 *
 * Bei einem einzigen Eintrag ist er Lärm, dafür gibt es den Haken daneben.
 */
export const SAMMELWEG_SCHWELLE = 2;

export function zeigeSammelweg(aktionen: GeplanteAktion[]): boolean {
  return sammelbareAufgaben(aktionen).length >= SAMMELWEG_SCHWELLE;
}

/** Was die Rückfrage auflistet: jeder betroffene Eintrag mit seiner Art. */
export function sammelwegBeschreibung(aktionen: GeplanteAktion[]): string {
  const betroffen = sammelbareAufgaben(aktionen);
  const zeilen = betroffen.map((a) => `· ${a.titel} (${aktionArtLabel(a.art)})`);
  return [
    `Diese ${betroffen.length} überfälligen Einträge werden als erledigt markiert:`,
    "",
    ...zeilen,
    "",
    "Termine und Videomeetings bleiben unberührt.",
  ].join("\n");
}
