/**
 * Zwei Wege zu den Kaufnebenkosten im Investmentrechner.
 *
 * Weg „bundesland": Grunderwerbsteuer, Notar und Grundbuch kommen aus der
 * Auswahl des Bundeslands und sind in der Oberfläche nicht von Hand änderbar.
 * Weg „manuell": alle Sätze werden wie bisher eingetippt.
 *
 * Die Sätze stammen ausschließlich aus `src/lib/kaufnebenkosten.ts`, das seine
 * Zahlen wiederum aus der zentralen Tabelle in `grunderwerbsteuer.ts` ableitet.
 * Hier wird bewusst keine eigene Liste geführt und nichts nachgerechnet, sonst
 * laufen die Sätze im CRM wieder auseinander.
 *
 * Der Rechenkern bleibt unberührt. Die Auswahl setzt nur die vorhandenen
 * Eingabefelder `transferTaxRate`, `notaryRate` und `landRegisterRate`.
 */
import { GRUNDBUCH_PROZENT, NOTAR_PROZENT } from "@/lib/kaufnebenkosten";

/** Welcher der beiden Wege gerade gilt. */
export type Kaufnebenkostenweg = "bundesland" | "manuell";

export interface Kaufnebenkostenauswahl {
  weg: Kaufnebenkostenweg;
  /** Schlüssel aus BUNDESLAND_NK, leer solange nichts gewählt ist. */
  bundesland: string;
}

/**
 * Startzustand: Weg über das Bundesland, aber noch ohne Auswahl. So muss sich
 * jemand aktiv für ein Land entscheiden und rechnet nicht versehentlich mit
 * einem voreingestellten Satz weiter.
 */
export const standardKaufnebenkostenauswahl: Kaufnebenkostenauswahl = {
  weg: "bundesland",
  bundesland: "",
};

/** Grunderwerbsteuer, mit der OS rechnet: zusammen mit Notar und Grundbuch 8,5 Prozent. */
export const OS_GRUNDERWERBSTEUER_PROZENT = 6.5;

/**
 * Die Bundesländer der Auswahlliste, seit dem 08.11.2026 nur noch Berlin und
 * Brandenburg / Potsdam (Christian). OS rechnet grundsätzlich mit 8,5 Prozent
 * Kaufnebenkosten: 6,5 Grunderwerbsteuer, 1,5 Notar, 0,5 Grundbuch. Das gilt
 * auch für Berlin, obwohl dort gesetzlich 6,0 Prozent Grunderwerbsteuer
 * anfallen; so hat Christian es vorgegeben. Wer andere Sätze braucht, trägt
 * sie über „Sätze selbst eintragen“ ein.
 *
 * Die Schlüssel sind die aus BUNDESLAND_NK, damit gespeicherte Auswahlen und
 * die Postleitzahl-Zuordnung weiter passen. Ein gespeichertes anderes Land
 * setzt keine Sätze mehr; die zuletzt eingetragenen bleiben stehen.
 */
export const BUNDESLAND_AUSWAHL: { value: string; label: string; grEstP: number }[] = [
  { value: "berlin", label: "Berlin", grEstP: OS_GRUNDERWERBSTEUER_PROZENT },
  { value: "brandenburg", label: "Brandenburg / Potsdam", grEstP: OS_GRUNDERWERBSTEUER_PROZENT },
];

/** Die drei Sätze, die eine Bundeslandauswahl setzt, in Prozent. */
export interface Kaufnebenkostensaetze {
  transferTaxRate: number;
  notaryRate: number;
  landRegisterRate: number;
}

/** Sätze zu einem Bundesland, oder null wenn der Schlüssel unbekannt ist. */
export function saetzeFuerBundesland(schluessel: string): Kaufnebenkostensaetze | null {
  const land = BUNDESLAND_AUSWAHL.find((eintrag) => eintrag.value === schluessel);
  if (!land) return null;
  return {
    transferTaxRate: land.grEstP,
    notaryRate: NOTAR_PROZENT,
    landRegisterRate: GRUNDBUCH_PROZENT,
  };
}

/** Name des gewählten Bundeslands, leer wenn nichts gewählt ist. */
export function bundeslandName(schluessel: string): string {
  return BUNDESLAND_AUSWAHL.find((eintrag) => eintrag.value === schluessel)?.label ?? "";
}

/** Eine Zeile der Anzeige: Bezeichnung, Satz in Prozent und Betrag in Euro. */
export interface Kaufnebenkostenposten {
  schluessel: keyof Kaufnebenkostensaetze;
  label: string;
  prozent: number;
  betrag: number;
}

/**
 * Die drei Posten als Prozentsatz und Betrag.
 *
 * Bemessungsgrundlage ist seit dem 30.09.2026 der Kaufpreis der Immobilie,
 * also Gesamtkaufpreis ohne Erhaltungsaufwand und ohne Möbel
 * (`nebenkostenBasis` im Ergebnis des Rechenkerns); der Aufrufer reicht sie
 * herein, gerechnet wird sie hier nicht. Sie gilt für alle drei Posten.
 */
export function kaufnebenkostenposten(saetze: Kaufnebenkostensaetze, kaufpreis: number): Kaufnebenkostenposten[] {
  const basis = Number.isFinite(kaufpreis) ? Math.max(0, kaufpreis) : 0;
  const zeile = (schluessel: keyof Kaufnebenkostensaetze, label: string): Kaufnebenkostenposten => {
    const prozent = Number.isFinite(saetze[schluessel]) ? saetze[schluessel] : 0;
    return { schluessel, label, prozent, betrag: (basis * prozent) / 100 };
  };
  return [
    zeile("transferTaxRate", "Grunderwerbsteuer"),
    zeile("notaryRate", "Notar"),
    zeile("landRegisterRate", "Grundbuch"),
  ];
}
