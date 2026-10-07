/**
 * Die Objektliste in Favoriten, Gesamtportfolio und Nicht verfuegbar teilen.
 *
 * Die Aufteilung liegt hier und nicht in der Seite, damit Kachel- und
 * Listenansicht nachweislich dieselbe Reihenfolge zeigen und die Regel
 * "keine leere Ueberschrift" pruefbar bleibt. Die Seite entscheidet nur noch,
 * wie eine Ueberschrift aussieht, nicht mehr, ob es sie gibt.
 *
 * Der dritte Block "Nicht verfuegbar" kam am 23.09.2026 dazu, auf Christians
 * Wunsch: Was gerade niemand anbieten kann, soll nicht zwischen dem Freien
 * stehen, sondern darunter gesammelt.
 */

import type { BelegungsEinheit } from "@/lib/einheitBelegung";
import { uebersichtsBelegung, type HausBelegung } from "@/lib/objektBelegung";
import { neueZuerst } from "@/lib/objekteNeu";

export interface ObjektGruppe<T> {
  /**
   * Die Ueberschrift ueber dem Block, oder `null` fuer die ungeteilte Liste.
   * `null` heisst ausdruecklich: hier steht keine Ueberschrift, nicht etwa
   * eine leere.
   */
  titel: string | null;
  /** Eine kurze Erklaerung unter der Ueberschrift, nur wo sie noetig ist. */
  unterzeile?: string;
  /**
   * Laesst sich der Block zuklappen? Nur "Nicht verfuegbar": Wer dort nichts
   * sucht, soll es aus dem Weg raeumen koennen. Favoriten und Portfolio sind
   * das, womit gearbeitet wird, die bleiben immer offen.
   */
  einklappbar?: boolean;
  objekte: T[];
}

/**
 * Was die Aufteilung von einem Objekt braucht. Gemeint ist das Objekt in der
 * Angebotssicht (`objektImAngebot` im Store): In `wohnungen` stehen nur die
 * angebotenen Einheiten, der Rest in `wohnungenNichtImAngebot`.
 */
export interface GruppierbaresObjekt {
  id: string;
  sichtbar: boolean;
  wohnungen: BelegungsEinheit[];
  wohnungenNichtImAngebot?: BelegungsEinheit[];
  /** Beim Globalobjekt zählt die Belegung des ganzen Hauses mit, siehe `uebersichtsBelegung`. */
  globalObjekt?: boolean;
  belegung?: HausBelegung;
}

/**
 * Ist an diesem Objekt fuer den Vertrieb gerade etwas zu haben?
 *
 * Zwei Bedingungen, beide aus vorhandenen Regeln und nicht neu erfunden:
 *
 * 1. Das Objekt ist sichtbar. Ein ausgeblendetes Objekt (oranger Punkt) bietet
 *    niemand an, auch wenn darin noch eine Einheit frei ist.
 * 2. Es ist nicht voll belegt nach `angebotsBelegung`. Das ist genau die
 *    Regel, nach der die Seite eine Kachel grau hinterlegt und den Aufdruck
 *    "Reserviert" oder "Notartermin" setzt. Frei heisst dort: mindestens eine
 *    angebotene Einheit mit Status "frei". Was angeboten ist, hat vorher die
 *    Angebotsregel aus Investagon entschieden.
 *
 * ZWEI FAELLE SEHEN GLEICH AUS UND SIND ES NICHT
 *
 * In der Angebotssicht ist `wohnungen` leer bei einem Objekt, das gar keine
 * Einheit hat, und ebenso bei einem, dessen Einheiten alle in Investagon
 * offline, verkauft oder im Entwurf stehen. Der Unterschied steckt in
 * `wohnungenNichtImAngebot`: Dort legt die Angebotssicht die aussortierten
 * Einheiten ab, statt sie wegzuwerfen. `angebotsBelegung` liest genau das.
 *
 * - Gar keine Einheit: unfertig, nicht ausverkauft. Das Objekt bleibt
 *   verfuegbar. Das deckt auch die Sekunden, in denen die Einheiten noch
 *   laden, sonst stuende beim Oeffnen der Seite kurz alles unten.
 * - Einheiten, aber keine im Angebot: nicht verfuegbar, auch wenn das Objekt
 *   sichtbar ist. Seit dem 23.09.2026 blendet der Import solche Objekte nicht
 *   mehr aus, der Punkt ist also gruen. Ohne diese Unterscheidung stuenden die
 *   Offline-Objekte im Gesamtportfolio.
 */
export function istVerfuegbar(objekt: GruppierbaresObjekt): boolean {
  if (!objekt.sichtbar) return false;
  // Seit dem 23.09.2026 zählt ein reserviertes oder verkauftes Globalobjekt als belegt.
  return !uebersichtsBelegung(objekt).vollBelegt;
}

/**
 * Teilt eine bereits gefilterte und sortierte Objektliste in hoechstens drei
 * Bloecke.
 *
 * Wer ausgeblendete Objekte (oranger Punkt, von Hand ausgeblendet) nicht sehen
 * darf, dem hat der Filter der Seite sie vorher schon entfernt. Diese
 * Funktion kennt keine Rollen.
 *
 * - Favoriten: alles mit Stern. Die Markierung hat Vorrang, ein Favorit bleibt
 *   hier, auch wenn er inzwischen belegt oder ausgeblendet ist.
 * - Gesamtportfolio: was verfuegbar ist, siehe `istVerfuegbar`.
 * - Nicht verfuegbar: alles uebrige.
 *
 * Ein leerer Block entfaellt samt Ueberschrift. Gibt es weder Favoriten noch
 * Nicht verfuegbares, bleibt es bei der einen Liste ohne Ueberschrift.
 *
 * Die Reihenfolge innerhalb eines Blocks bleibt genau so, wie sie
 * hereingegeben wurde. Einzige Ausnahme seit dem 23.09.2026: Wird `neuSeit`
 * mitgegeben, stehen im Gesamtportfolio (auch in der ungeteilten Liste) die
 * neuen Objekte vorn, das juengste Anlegen zuerst, siehe `objekteNeu.ts`.
 * Favoriten und Nicht verfuegbar bleiben, wie sie sind.
 */
export function objektGruppen<T extends GruppierbaresObjekt>(
  objekte: T[],
  istFavorit: (id: string) => boolean,
  neuSeit?: (objekt: T) => number | null,
): ObjektGruppe<T>[] {
  const favoriten: T[] = [];
  let portfolio: T[] = [];
  const nichtVerfuegbar: T[] = [];
  for (const objekt of objekte) {
    if (istFavorit(objekt.id)) favoriten.push(objekt);
    else if (istVerfuegbar(objekt)) portfolio.push(objekt);
    else nichtVerfuegbar.push(objekt);
  }
  if (neuSeit) portfolio = neueZuerst(portfolio, neuSeit);

  // Nichts abzutrennen, weder oben noch unten. Dann bleibt es bei der einen
  // Liste, so wie die Seite sie vorher schon gezeigt hat.
  if (favoriten.length === 0 && nichtVerfuegbar.length === 0) {
    return [{ titel: null, objekte: portfolio }];
  }

  const gruppen: ObjektGruppe<T>[] = [];
  if (favoriten.length > 0) {
    gruppen.push({ titel: "Favoriten", objekte: favoriten });
  }
  if (portfolio.length > 0) {
    gruppen.push({ titel: "Gesamtportfolio", objekte: portfolio });
  }
  if (nichtVerfuegbar.length > 0) {
    gruppen.push({
      titel: "Nicht verfügbar",
      // Fuer alle Rollen derselbe Text. Von Hand Ausgeblendetes steht zwar
      // auch hier, sehen koennen es aber nur Bearbeiter, und die erkennen es
      // am orangen Punkt.
      unterzeile: "reserviert, beim Notar oder nicht mehr im Angebot",
      einklappbar: true,
      objekte: nichtVerfuegbar,
    });
  }
  return gruppen;
}
