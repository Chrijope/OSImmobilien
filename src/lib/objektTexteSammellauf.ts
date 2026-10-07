/**
 * Der Sammellauf: Kurzbeschreibung und Standortargumente für viele Objekte
 * nacheinander nachholen.
 *
 * WARUM ES IHN GIBT
 *
 * Die Erzeugung startet bisher nur, wenn jemand die Objektseite eines
 * einzelnen Objekts öffnet. Rund neunzig Objekte aus Investagon liegen damit
 * ohne Text da, und niemand klickt sie einzeln an. Dieser Lauf holt sie nach,
 * aus der Objektübersicht heraus.
 *
 * Seit dem 23.09.2026 holt der Server dasselbe nach jedem Investagon-Abgleich
 * in kleinen Etappen selbst nach (Sammelmodus von `objekt-texte-ki`). Dieser
 * Knopf bleibt, um es für eine Liste sofort zu erledigen.
 *
 * NACHEINANDER, NICHT GLEICHZEITIG
 *
 * Jeder Lauf liest bis zu vier Unterlagen, schickt sie an ein Sprachmodell und
 * schreibt das Ergebnis zurück. Zehn davon gleichzeitig wären zehnmal so viel
 * Arbeitsspeicher in der Function und ein sicherer Weg in die Bremse des
 * Gateways. Deshalb: einer nach dem anderen, mit einer kurzen Pause dazwischen.
 *
 * DIE KONTINGENTE SIND DIE OBERGRENZE, NICHT DIE WAND
 *
 * Die Function lässt je Nutzer zwanzig Läufe in der Stunde und hundert am Tag
 * zu. Dieser Lauf fährt nicht dagegen, bis es kracht, sondern hört von selbst
 * nach zwanzig Objekten auf und sagt, wie viele offen bleiben. Wird die Grenze
 * trotzdem erreicht, etwa weil vorher schon Läufe verbraucht wurden, hört er
 * beim ersten abgewiesenen Aufruf auf. Was bis dahin geschrieben wurde, bleibt
 * geschrieben; ein Abbruch verwirft nichts.
 *
 * Seit dem 23.09.2026 gilt das nur noch für die Rollen ohne Leitung. Admin und
 * Inhaber haben ein höheres Kontingent und arbeiten alle Objekte in einem
 * Durchgang ab, siehe `src/lib/objektTexteGesamtlauf.ts`.
 *
 * DIE REINE LOGIK, OHNE OBERFLÄCHE
 *
 * Diese Datei kennt weder Knöpfe noch Dialoge. Sie nimmt eine Liste Objekte,
 * meldet den Fortschritt und gibt einen Bericht zurück. Die Anzeige liegt in
 * `src/components/objekte/ObjektTexteSammellauf.tsx`, geprüft wird hier in
 * `src/lib/objektTexteSammellauf.test.ts`.
 */

import type { ObjektData } from "@/lib/objekteStore";
import {
  erzeugeObjektTexte,
  hatTexte,
  objektTexteStand,
  type ErzeugenErgebnis,
  type Kontingentgrenze,
} from "@/lib/objektTexteKi";
import {
  KONTINGENT_LEITUNG,
  KONTINGENT_STANDARD,
  kontingentFuer,
  type TexteKontingent,
} from "../../supabase/functions/_shared/objekt-texte-kontingent";

export { KONTINGENT_LEITUNG, KONTINGENT_STANDARD, kontingentFuer };
export type { TexteKontingent };

/**
 * Die Kontingente der Edge Function je Nutzer.
 *
 * Seit dem 23.09.2026 je Rolle: Admin und Inhaber dürfen 150 Läufe je Stunde
 * und 400 je Tag, alle anderen 20 und 100. Die Zahlen stehen an genau einer
 * Stelle, in `supabase/functions/_shared/objekt-texte-kontingent.ts`, und die
 * Function liest dieselbe Datei. So können Browser und Server nicht mehr
 * auseinanderlaufen; früher merkte man das nur daran, dass der Sammellauf zu
 * früh aufhörte oder in eine Absage rannte.
 *
 * `KONTINGENT_STUNDE` und `KONTINGENT_TAG` sind die Werte für alle Rollen
 * außer der Leitung. Diesen Sammellauf starten nur noch sie; die Leitung nimmt
 * den Durchgang über alle Objekte (`src/lib/objektTexteGesamtlauf.ts`).
 */
export const KONTINGENT_STUNDE = KONTINGENT_STANDARD.stunde;
export const KONTINGENT_TAG = KONTINGENT_STANDARD.tag;
export const KONTINGENT_STUNDE_LEITUNG = KONTINGENT_LEITUNG.stunde;
export const KONTINGENT_TAG_LEITUNG = KONTINGENT_LEITUNG.tag;

/**
 * Pause zwischen zwei Läufen.
 *
 * Ein Lauf dauert ohnehin mehrere Sekunden. Diese Pause ist keine Drosselung
 * der Kosten, sondern Höflichkeit gegenüber dem Gateway, das bei zu dichtem
 * Nachfeuern mit 429 antwortet.
 */
export const PAUSE_MS = 1500;

/**
 * So viel braucht der Sammellauf von einem Objekt zu wissen.
 *
 * Titel, Adresse, Ort und Beschreibung sind die Objektangaben, aus denen seit
 * dem 23.09.2026 jeder Text entstehen kann (siehe `objektTexteStand`).
 * Adresse und Ort dürfen fehlen, damit ältere Aufrufer nicht brechen.
 */
export type SammellaufObjekt = Pick<ObjektData, "id" | "titel" | "meta" | "dokumente" | "beschreibung"> &
  Partial<Pick<ObjektData, "adresse" | "ort">>;

/** Warum ein Objekt gar nicht erst angefasst wurde. */
export interface SammellaufAufteilung {
  /** Objekte, für die ein Lauf lohnt. */
  offen: SammellaufObjekt[];
  /** Objekte, die schon einen Stand der aktuellen Fassung oder einen Vermerk tragen. */
  hatTexte: SammellaufObjekt[];
  /** Objekte ohne jede Objektangabe. */
  ohneGrundlage: SammellaufObjekt[];
}

/**
 * Die Liste in drei Haufen teilen, bevor ein einziger Aufruf herausgeht.
 *
 * Objekte ohne Kennung fallen heraus: Ohne sie könnte die Function nichts
 * laden, der Aufruf würde nur ein Kontingent verbrauchen.
 */
export function teileObjekteAuf(objekte: SammellaufObjekt[]): SammellaufAufteilung {
  const aufteilung: SammellaufAufteilung = { offen: [], hatTexte: [], ohneGrundlage: [] };
  for (const objekt of objekte || []) {
    if (!objekt?.id) continue;
    const stand = objektTexteStand(objekt);
    if (stand === "hat-texte") aufteilung.hatTexte.push(objekt);
    else if (stand === "grundlage-fehlt") aufteilung.ohneGrundlage.push(objekt);
    else aufteilung.offen.push(objekt);
  }
  return aufteilung;
}

/** Der Stand während des Laufs, für die Anzeige. */
export interface SammellaufFortschritt {
  /** Wie viele Objekte dieser Lauf anfasst. */
  gesamt: number;
  /** Das wievielte davon gerade an der Reihe ist, ab 1. */
  nummer: number;
  /** Das Objekt, das gerade läuft. */
  titel: string;
  /** Wie viele davon einen Text bekommen haben. */
  fertig: number;
  /** Wie viele ohne Text geblieben sind. */
  ohneText: number;
}

/**
 * Warum der Lauf zu Ende ist. „nicht-ausgerollt“: Die Function selbst fehlt
 * oder ist veraltet, siehe `FunktionStand` in `objektTexteKi.ts`.
 */
export type SammellaufEnde = "fertig" | "abgebrochen" | "kontingent" | "nicht-ausgerollt";

/** Ein Objekt, das keinen Text bekommen hat, mit dem Grund im Klartext. */
export interface OhneTextEintrag {
  titel: string;
  grund: string;
}

export interface SammellaufBericht {
  /** Objekte in der übergebenen Liste. */
  gesamt: number;
  /** Läufe, die wirklich herausgegangen sind. */
  angefasst: number;
  /** Objekte, die jetzt einen gespeicherten Text haben. */
  fertig: number;
  /** Übersprungen, weil schon ein Text oder ein Vermerk da war. */
  uebersprungenHatTexte: number;
  /** Übersprungen, weil die Grundlage fehlt. Auch die, bei denen erst die
   *  Function das festgestellt hat. */
  uebersprungenOhneGrundlage: number;
  /** Läufe, die schiefgegangen sind. */
  fehlgeschlagen: number;
  /** Objekte, die ein späterer Lauf noch einmal versuchen würde. */
  nochOffen: number;
  ende: SammellaufEnde;
  /** Bei `ende: "kontingent"` der Satz, der erklärt, wann es weitergeht. */
  grenzeText: string;
  /** Wer keinen Text bekommen hat und warum. */
  ohneText: OhneTextEintrag[];
}

/**
 * Was bei einer erreichten Grenze auf dem Bildschirm stehen soll.
 *
 * `kontingent` ist das des Aufrufers, damit die Leitung ihre eigene Zahl liest
 * und nicht die der anderen Rollen.
 */
export function grenzeSatz(grenze: Kontingentgrenze, kontingent: TexteKontingent = KONTINGENT_STANDARD): string {
  if (grenze === "stunde") {
    return `Das stündliche Kontingent von ${kontingent.stunde} Läufen ist erschöpft. In einer Stunde geht es weiter.`;
  }
  if (grenze === "tag") {
    return `Das Tageskontingent von ${kontingent.tag} Läufen ist erschöpft. Morgen geht es weiter.`;
  }
  if (grenze === "guthaben") {
    return "Das KI-Guthaben ist aufgebraucht. Das lässt sich nur in Lovable auffüllen.";
  }
  return "Die KI-Schnittstelle bremst gerade. In ein paar Minuten geht es weiter.";
}

/** Der Satz, wenn der Lauf von selbst vor der Grenze anhält. */
function vorsorglichSatz(offenGeblieben: number): string {
  return (
    `Mehr als ${KONTINGENT_STUNDE} Läufe je Stunde nimmt die Schnittstelle nicht an. ` +
    `${offenGeblieben} ${offenGeblieben === 1 ? "Objekt bleibt" : "Objekte bleiben"} für den nächsten Lauf offen.`
  );
}

export interface SammellaufOptionen {
  /** Der einzelne Lauf. Im Test ersetzt, sonst die Edge Function. */
  erzeuge?: (objektId: string) => Promise<ErzeugenErgebnis>;
  /** Wird vor und nach jedem Objekt gerufen. */
  melde?: (fortschritt: SammellaufFortschritt) => void;
  /** Gibt true zurück, sobald der Nutzer abbricht. */
  abgebrochen?: () => boolean;
  /** Die Pause zwischen zwei Läufen. Im Test ohne echtes Warten. */
  warte?: (ms: number) => Promise<void>;
  /** Höchstzahl der Läufe. Standard ist das stündliche Kontingent. */
  hoechstens?: number;
  pauseMs?: number;
}

const echteWartezeit = (ms: number) => new Promise<void>((fertig) => setTimeout(fertig, ms));

/**
 * Den Sammellauf ausführen.
 *
 * Abgebrochen wird zwischen zwei Objekten, nicht mitten in einem: Ein
 * laufender Aufruf schreibt sein Ergebnis noch zu Ende, sonst wäre das
 * Kontingent verbraucht und der Text trotzdem weg.
 */
export async function objektTexteSammellauf(
  objekte: SammellaufObjekt[],
  optionen: SammellaufOptionen = {},
): Promise<SammellaufBericht> {
  const erzeuge = optionen.erzeuge ?? ((id: string) => erzeugeObjektTexte(id, { automatisch: true }));
  const melde = optionen.melde ?? (() => undefined);
  const abgebrochen = optionen.abgebrochen ?? (() => false);
  const warte = optionen.warte ?? echteWartezeit;
  const hoechstens = Math.max(0, optionen.hoechstens ?? KONTINGENT_STUNDE);
  const pauseMs = optionen.pauseMs ?? PAUSE_MS;

  const aufteilung = teileObjekteAuf(objekte);
  const zuTun = aufteilung.offen.slice(0, hoechstens);
  const vorsorglichZurueckgestellt = aufteilung.offen.length - zuTun.length;

  const bericht: SammellaufBericht = {
    gesamt: (objekte || []).length,
    angefasst: 0,
    fertig: 0,
    uebersprungenHatTexte: aufteilung.hatTexte.length,
    uebersprungenOhneGrundlage: aufteilung.ohneGrundlage.length,
    fehlgeschlagen: 0,
    nochOffen: aufteilung.offen.length,
    ende: vorsorglichZurueckgestellt > 0 ? "kontingent" : "fertig",
    grenzeText: vorsorglichZurueckgestellt > 0 ? vorsorglichSatz(vorsorglichZurueckgestellt) : "",
    ohneText: [],
  };

  /** Objekte, an denen jetzt ein Vermerk „ohne Ergebnis" steht. Sie sind erledigt. */
  let nachtraeglichOhneGrundlage = 0;

  const stand = (nummer: number, titel: string): SammellaufFortschritt => ({
    gesamt: zuTun.length,
    nummer,
    titel,
    fertig: bericht.fertig,
    ohneText: bericht.ohneText.length,
  });

  for (let i = 0; i < zuTun.length; i++) {
    if (abgebrochen()) {
      bericht.ende = "abgebrochen";
      bericht.grenzeText = "";
      break;
    }

    const objekt = zuTun[i];
    const titel = objekt.titel || "Objekt ohne Titel";
    melde(stand(i + 1, titel));

    const ergebnis = await erzeuge(objekt.id);
    bericht.angefasst += 1;

    if (ergebnis.funktion) {
      // Die Function fehlt oder ist veraltet. Das trifft jedes weitere Objekt
      // genauso, also hier aufhören und sagen, was zu tun ist.
      bericht.ende = "nicht-ausgerollt";
      bericht.grenzeText = ergebnis.fehler;
      melde(stand(i + 1, titel));
      break;
    }

    if (ergebnis.grenze) {
      // Dieses Objekt hat nichts bekommen, und die nächsten bekämen auch
      // nichts. Der Lauf hört hier auf, statt weiterzufeuern.
      bericht.ende = "kontingent";
      bericht.grenzeText = grenzeSatz(ergebnis.grenze);
      bericht.ohneText.push({ titel, grund: grenzeSatz(ergebnis.grenze) });
      melde(stand(i + 1, titel));
      break;
    }

    if (ergebnis.fehler) {
      bericht.fehlgeschlagen += 1;
      bericht.ohneText.push({ titel, grund: ergebnis.fehler });
    } else if (ergebnis.texte?.ohneErgebnis) {
      // Die Function hat die Grundlage erst beim Sammeln der Tatsachen
      // verworfen. Ein Vermerk liegt jetzt am Objekt, ein zweiter Lauf würde
      // ihn nicht mehr anfassen.
      bericht.uebersprungenOhneGrundlage += 1;
      nachtraeglichOhneGrundlage += 1;
      bericht.ohneText.push({ titel, grund: ergebnis.texte.ohneErgebnis });
    } else if (!hatTexte(ergebnis.texte)) {
      bericht.fehlgeschlagen += 1;
      bericht.ohneText.push({ titel, grund: "Es kam kein verwertbarer Text zurück." });
    } else if (!ergebnis.gespeichert) {
      bericht.fehlgeschlagen += 1;
      bericht.ohneText.push({
        titel,
        grund: "Der Text ist entstanden, konnte aber nicht am Objekt gespeichert werden. Fehlt die Berechtigung?",
      });
    } else {
      bericht.fertig += 1;
    }

    melde(stand(i + 1, titel));
    if (i < zuTun.length - 1 && pauseMs > 0) await warte(pauseMs);
  }

  // Was jetzt noch offen ist, versucht ein späterer Lauf erneut.
  // Fehlgeschlagene zählen dazu, an ihnen steht nichts; die mit Vermerk nicht.
  bericht.nochOffen = aufteilung.offen.length - bericht.fertig - nachtraeglichOhneGrundlage;
  return bericht;
}
