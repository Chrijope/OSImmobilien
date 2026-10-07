/**
 * Die Texte der Einträge, die der Abwicklungsprozess selbst schreibt.
 *
 * Hintergrund: Beim Versand einer Reservierungsvereinbarung entstand die Notiz
 * „Selbstauskunft unterschrieben". Ursache war eine Wachschleife, die fragte,
 * ob *irgendetwas* unterschrieben ist, statt zu prüfen, *was* gerade neu
 * unterschrieben wurde. Die Texte selbst lagen dabei verstreut mitten im
 * Seitencode und ließen sich nicht prüfen. Hier stehen sie einmal, als reine
 * Werte, und `prozessNotizen.test.ts` hält sie fest.
 *
 * Zwei Regeln, die dieses Modul durchsetzt:
 *
 * 1. **Ereignis und Stufenwechsel sind zwei Einträge.** Sätze wie
 *    „… unterschrieben → Bonitätsunterlagen" verbinden zwei Dinge, die sich
 *    unabhängig voneinander ändern. Genau daraus ist der Fehler entstanden,
 *    dass der Text immer „Bonitätsunterlagen" behauptete, obwohl der Vorgang
 *    bei einem Selbstfinanzierer auf „Finanzierung" geht.
 * 2. **Jeder Eintrag kennt seine früheren Formulierungen.** Die Sperre gegen
 *    Doppeleinträge vergleicht den Text wortgleich gegen das, was schon in der
 *    Akte steht. Ohne die alten Formulierungen bekäme jeder laufende Vorgang
 *    beim ersten Aufruf nach dieser Änderung einen zweiten, gleichbedeutenden
 *    Eintrag. Deshalb trägt jede Notiz ihre Vorgänger mit, und die Sperre
 *    prüft gegen alle.
 */
import { stufenFilterLabel } from "./pipelineStufen";

/** Ein Eintrag, den der Prozess selbst schreibt. */
export interface ProzessNotiz {
  /** Der Text, der heute geschrieben wird. */
  text: string;
  /**
   * Frühere Formulierungen desselben Ereignisses. Nur für die Sperre gegen
   * Doppeleinträge, es wird nie einer davon geschrieben.
   */
  frueher: string[];
}

/** Alle Formulierungen, die für dieses Ereignis als „schon da" gelten. */
export function alleFormulierungen(notiz: ProzessNotiz): string[] {
  return [notiz.text, ...notiz.frueher];
}

/**
 * Steht dieses Ereignis schon in der Akte?
 *
 * `vorhandene` sind die Beschreibungen der bereits gespeicherten Einträge.
 */
export function istSchonNotiert(vorhandene: readonly string[], notiz: ProzessNotiz): boolean {
  const treffer = new Set(alleFormulierungen(notiz));
  return vorhandene.some((text) => treffer.has(text));
}

/** Welches Dokument der Kunde unterschreibt. */
export type Unterschriftsdokument = "sa" | "rv";

/** Der Unterschriftsstand eines Vorgangs. */
export interface Unterschriftsstand {
  /** Selbstauskunft unterschrieben. */
  sa: boolean;
  /** Reservierungsvereinbarung unterschrieben. */
  rv: boolean;
}

/**
 * Welche Unterschrift ist seit dem Ausgangszustand NEU dazugekommen?
 *
 * Der Kern der Reparatur. Vorher fragte die Wachschleife „ist irgendetwas
 * unterschrieben?". Bei einer Reservierung, die zur Unterschrift hinausgeht,
 * ist die Selbstauskunft immer längst unterschrieben, sonst wäre der Kunde gar
 * nicht so weit. Die Antwort war also ja, und der Sonst-Zweig schrieb
 * „Selbstauskunft unterschrieben", obwohl niemand etwas unterschrieben hatte.
 *
 * Verglichen wird deshalb der Übergang, nicht der Zustand. Was vor dem Start
 * der Schleife schon unterschrieben war, löst nichts mehr aus.
 */
export function neueUnterschriften(
  vorher: Unterschriftsstand,
  jetzt: Unterschriftsstand,
): Unterschriftsdokument[] {
  const neu: Unterschriftsdokument[] = [];
  if (jetzt.sa && !vorher.sa) neu.push("sa");
  if (jetzt.rv && !vorher.rv) neu.push("rv");
  return neu;
}

/* ── Selbstauskunft ── */

/** Der Berater hat die ausgefüllte Selbstauskunft zur Unterschrift geschickt. */
export const SA_ZUR_UNTERSCHRIFT_VERSENDET: ProzessNotiz = {
  text: "Selbstauskunft wartet auf Unterschrift vom Kunden",
  frueher: [],
};

/** Der Kunde hat die Selbstauskunft unterschrieben. */
export const SA_UNTERSCHRIEBEN: ProzessNotiz = {
  text: "Selbstauskunft unterschrieben",
  frueher: ["Selbstauskunft unterschrieben → Objektauswahl (Reservierung freigeschaltet)"],
};

/* ── Reservierung ── */

/** Der Partner hat die Reservierungsvereinbarung zur Unterschrift geschickt. */
export const RV_VERSENDET: ProzessNotiz = {
  text: "Reservierungsvereinbarung versendet",
  frueher: [],
};

/** Die Reservierungsvereinbarung ist eröffnet und wartet auf die Unterschrift. */
export const RV_ERSTELLT: ProzessNotiz = {
  text: "Reservierungsvereinbarung erstellt",
  frueher: ["Reservierungsvereinbarung erstellt → Reservierung (wartet auf Unterschrift)"],
};

/** Der Kunde hat die Reservierungsvereinbarung unterschrieben. */
export const RV_UNTERSCHRIEBEN: ProzessNotiz = {
  text: "Reservierungsvereinbarung unterschrieben",
  frueher: ["Reservierungsvereinbarung vom Kunden unterschrieben → Bonitätsunterlagen"],
};

/** Der Eintrag zur frisch eingegangenen Unterschrift. */
export function unterschriftNotiz(dokument: Unterschriftsdokument): ProzessNotiz {
  return dokument === "rv" ? RV_UNTERSCHRIEBEN : SA_UNTERSCHRIEBEN;
}

/**
 * Der Eintrag zum Versand eines Dokuments an den Kunden.
 *
 * Bewusst neben `unterschriftNotiz`: Versand und Unterschrift sind zwei
 * verschiedene Ereignisse und duerfen nie denselben Text bekommen. Genau das
 * war der gemeldete Fehler.
 */
export function versandNotiz(dokument: Unterschriftsdokument): ProzessNotiz {
  return dokument === "rv" ? RV_VERSENDET : SA_ZUR_UNTERSCHRIFT_VERSENDET;
}

/** Die Bildschirmmeldung zur frisch eingegangenen Unterschrift. */
export function unterschriftMeldung(dokument: Unterschriftsdokument): string {
  return dokument === "rv"
    ? "Reservierungsvereinbarung wurde unterschrieben!"
    : "Selbstauskunft wurde unterschrieben!";
}

/* ── Bonität, Notar, Kontaktversuch ── */

/** Alle Bonitätsunterlagen sind geprüft und freigegeben. */
export const BONITAET_FREIGEGEBEN: ProzessNotiz = {
  text: "Alle Bonitätsunterlagen freigegeben",
  frueher: ["Alle Bonitätsunterlagen freigegeben → Finanzierung"],
};

/** Der Notartermin steht mit Datum und Uhrzeit fest. */
export function notarterminGesetzt(datum: string, uhrzeit: string): ProzessNotiz {
  return {
    text: `Notartermin gesetzt am ${datum} um ${uhrzeit} Uhr`,
    frueher: [`Notartermin gesetzt am ${datum} um ${uhrzeit} Uhr → Notar`],
  };
}

/** Der Notartermin liegt in der Vergangenheit. */
export const NOTARTERMIN_STATTGEFUNDEN: ProzessNotiz = {
  text: "Notartermin stattgefunden",
  frueher: ["Notartermin stattgefunden → Fälligkeit / Bestandskunde"],
};

/**
 * Der Vertriebspartner hat den ersten Anruf protokolliert.
 *
 * Der alte Text nannte die Stufe „Kontaktversuche" im Satz. Gesetzt wird
 * tatsächlich der Schlüssel `kontaktversuche`, der Text war also nicht falsch,
 * aber er verband wieder Ereignis und Stufe. Die Stufe steht jetzt im eigenen
 * Eintrag und kommt aus dem Schlüssel, der wirklich geschrieben wird.
 */
export const ERSTER_KONTAKTVERSUCH: ProzessNotiz = {
  text: "Erster Kontaktversuch durch Vertriebspartner",
  frueher: ['Erster Kontaktversuch durch Vertriebspartner → Pipeline-Stufe „Kontaktversuche"'],
};

/* ── Stufenwechsel ── */

/**
 * Der Eintrag zum Stufenwechsel selbst.
 *
 * Der Anzeigename kommt aus `PIPELINE_STUFEN` und damit aus dem Schlüssel, der
 * tatsächlich gespeichert wird. Ein fest getippter Name kann nicht mehr an der
 * gesetzten Stufe vorbeilaufen.
 */
export function stufenwechselNotiz(zielStufe: string): ProzessNotiz {
  return {
    text: `Pipeline-Stufe gewechselt auf „${stufenFilterLabel(zielStufe)}"`,
    frueher: [],
  };
}
