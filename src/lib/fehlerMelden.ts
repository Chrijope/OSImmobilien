/**
 * Zentraler Auslöser für die Fehlermeldung.
 *
 * Der Meldedialog hängt bisher an der Kopfzeile. Damit ist er genau dann nicht
 * erreichbar, wenn man ihn am dringendsten braucht: Bei einem Absturz rendert
 * die Fehlerseite anstelle der ganzen Anwendung, Kopfzeile inklusive.
 *
 * Deshalb liegt der Dialog jetzt global in der App, und jede Stelle im Code
 * kann ihn über `oeffneFehlerMeldung()` aufrufen.
 */

import { useSyncExternalStore } from "react";
import {
  betreffAusFehler,
  holeLetztenFehler,
  merkeFehler,
  type TechnischerFehler,
} from "@/lib/fehlerKontext";

export interface FehlerMeldungVorgabe {
  betreff?: string;
  beschreibung?: string;
  prioritaet?: "niedrig" | "mittel" | "hoch";
  /** Soll beim Öffnen automatisch ein Bildschirmfoto erstellt werden? */
  screenshot?: boolean;
  fehler?: TechnischerFehler | null;
}

interface Zustand {
  offen: boolean;
  vorgabe: FehlerMeldungVorgabe;
}

let zustand: Zustand = { offen: false, vorgabe: {} };
const hoerer = new Set<() => void>();

function melden() {
  hoerer.forEach((h) => h());
}

export const fehlerMeldung = {
  subscribe(fn: () => void) {
    hoerer.add(fn);
    return () => hoerer.delete(fn);
  },
  get(): Zustand {
    return zustand;
  },
};

export function useFehlerMeldung(): Zustand {
  return useSyncExternalStore(fehlerMeldung.subscribe, fehlerMeldung.get, fehlerMeldung.get);
}

export function oeffneFehlerMeldung(vorgabe: FehlerMeldungVorgabe = {}): void {
  zustand = {
    offen: true,
    vorgabe: { screenshot: true, ...vorgabe, fehler: vorgabe.fehler ?? holeLetztenFehler() },
  };
  melden();
}

export function schliesseFehlerMeldung(): void {
  zustand = { offen: false, vorgabe: {} };
  melden();
}

/**
 * Ruhe-Regel: Derselbe Fehler erzeugt höchstens einen Hinweis je Sitzung.
 *
 * Ohne diese Regel würde eine Schleife, die denselben Fehler zwanzigmal wirft,
 * zwanzig Hinweise stapeln. Der erste, der einen davon ungelesen wegklickt,
 * meldet danach nie wieder etwas.
 *
 * Übergeben wird der `ruhefingerabdruck`, also das Merkmal OHNE Route. Am
 * 16.09.2026 meldete ein Vertriebspartner eine Fehlerflut: Mit dem
 * routenabhängigen Abdruck galt derselbe Fehler auf jeder Seite als neu und
 * kam bei jedem Klick in der Seitenleiste erneut durch. Siehe
 * `ruhefingerabdruckFuer` in `fehlerKontext.ts`.
 */
const schonGezeigt = new Set<string>();

export function darfFehlerHinweisZeigen(ruhefingerabdruck: string): boolean {
  if (schonGezeigt.has(ruhefingerabdruck)) return false;
  schonGezeigt.add(ruhefingerabdruck);
  return true;
}

/** Nur für Tests: Die Ruhepause wieder aufheben. */
export function _setzeRuhepauseZurueck(): void {
  schonGezeigt.clear();
}

/**
 * Aus einer beliebigen Fehlermeldung heraus melden.
 *
 * Wird vom Melden-Knopf an den Fehler-Toasts benutzt. Der Dialog geht auf,
 * Betreff und Beschreibung sind vorbefüllt, der Screenshot wird erstellt.
 */
export function meldeFehlerAusToast(meldung: string, detail?: string): void {
  const f = merkeFehler({
    meldung: detail ? `${meldung}: ${detail}` : meldung,
    quelle: "manuell",
    route: typeof window !== "undefined" ? window.location.pathname : "",
  });
  oeffneFehlerMeldung({
    betreff: betreffAusFehler(meldung),
    fehler: f,
    screenshot: true,
  });
}
