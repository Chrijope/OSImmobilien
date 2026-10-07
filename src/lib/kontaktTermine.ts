/**
 * Alle Termine und Fälligkeiten eines Kunden an einer Stelle.
 *
 * Diese Sammlung lag in der Pipeline-Seite. Das Kundenprofil hatte für
 * dieselbe Frage eine eigene, ältere Logik, die weder Aufgaben noch die
 * Zuordnung zum Investment kannte. Auf der Kachel stand deshalb "Termin 64d
 * überfällig" und im Profil daneben nur ein grauer Punkt.
 *
 * Jetzt schöpfen beide aus derselben Quelle.
 */

import type { KundeData } from "./kundenStore";
import type { KontaktEingabe } from "./naechsterKontakt";
import { hatGeplantenTermin, istVideoTermin } from "./naechsterKontakt";
import { festerTerminSchluessel, noShowTerminSchluessel, baueGeplanteAktionen, titelTagSchluessel, type GeplanteAktion, type WartendeUnterschrift } from "./kundenNaechsteAktion";
import { getFollowUpsByKunde, type FollowUp } from "./followUpStore";
import { getAufgaben, getAufgabenFuerKunde, type Aufgabe } from "./aufgabenStore";
import { getInvestmentsByKontakt } from "./investmentsStore";
import { getAktivitaeten, type AktivitaetEntry } from "./aktivitaetenStore";
import { getEffectivePipelineStufe } from "./kontaktPipeline";
import { cacheGet } from "./dataCache";
import { istVorstellungsAufgabe } from "../../supabase/functions/_shared/handbuch-vorstellung.ts";

/**
 * @param investmentId Wenn gesetzt, zählen nur Aufgaben dieses Investments
 *                     plus die allgemeinen ohne Zuordnung.
 */
/*
 * Stufen, ab denen das Erstgespraech nachweislich gelaufen ist.
 *
 * Ausdrueckliche Aufzaehlung statt eines Vergleichs mit der Position in
 * PIPELINE_STUFEN: Dort stehen hinter "abgeschlossen" noch
 * "bestandsimport", "archiviert" und "verloren". Die sind kein spaeterer
 * Schritt im Verlauf, sondern Ablagen daneben, und ein Positionsvergleich
 * haette sie faelschlich als "weiter" gewertet.
 *
 * Alles, was hier nicht steht, behaelt den alten Namen. Bei "verloren" oder
 * "archiviert" laesst sich nicht mehr sagen, wie weit der Kontakt kam, und
 * dann lieber nichts umbenennen.
 */
const NACH_ERSTGESPRAECH = new Set<string>([
  "beratungsgespraech", "bg_noshow", "selbstauskunft", "bonitaetsunterlagen",
  "objektauswahl", "follow_up_objekt", "reservierung", "finanzierung", "notar", "faelligkeit",
  "abrechnung", "abgeschlossen", "vermoegensaufbau",
]);

/**
 * Wie der vom Setter gebuchte Termin heisst.
 *
 * `setterTerminDatum` traegt zwei verschiedene Termine. Der Name stammt
 * daher, WER ihn gebucht hat, nicht WELCHER es ist:
 *
 *   * Das Setter-Skript bucht darin ein Erstgespraech und setzt die Stufe
 *     auf "erstgespraech".
 *   * Die Terminvergabe in der Kundenakte bucht darin ein
 *     Beratungsgespraech und setzt die Stufe auf "beratungsgespraech".
 *
 * Beide schreiben in dasselbe Feld. Weil hier fest "Erstgespraech" stand,
 * lief jeder Beratungstermin unter dem falschen Namen. Gemeldet bei Kai
 * Laube und Andre Goller, und es ist derselbe Grund, aus dem der
 * Verschieben-Dialog "Erstgespraech verschieben" hiess.
 *
 * Die Pipelinestufe sagt, welcher es ist: Ab "beratungsgespraech" ist das
 * Erstgespraech vorbei, der eingetragene Termin also der Beratungstermin.
 *
 * Ein Kontakt ganz ohne gesetzte Stufe landet ueber den Rueckfall in
 * "erstgespraech_geplant" und heisst weiter Erstgespraech. Das ist richtig
 * so: Ohne Stufe gibt es kein Anzeichen, dass das Erstgespraech gelaufen
 * waere.
 */
export function setterTerminName(kunde: KundeData): string {
  try {
    if (NACH_ERSTGESPRAECH.has(getEffectivePipelineStufe(kunde))) return "Beratungsgespräch";
  } catch {
    /* Investment-Store noch nicht bereit: beim alten Namen bleiben. */
  }
  return "Erstgespräch";
}

export type FesterTermin = NonNullable<KontaktEingabe["termine"]>[number];

/**
 * Die fest gebuchten Termine am Kontakt und an seinen Investments.
 *
 * Eigene Funktion, weil die Kachel "Nächste Aktion" im Kundenprofil dieselben
 * Termine einzeln auflistet, die hier in die Ampel einfließen. Zwei Listen
 * hätten irgendwann verschiedene Termine gekannt.
 */
export function festeTermine(kunde: KundeData, investmentId?: string): FesterTermin[] {
  const meta = ((kunde as { meta?: Record<string, string> }).meta || {}) as Record<string, string>;
  const k = kunde as unknown as Record<string, string>;

  // Alle Terminfelder, die an einem Kontakt hängen können.
  //
  // Hier standen lange nur zwei davon. Ein Notartermin oder ein separat
  // gepflegtes Erstgespräch tauchte deshalb weder auf der Pipelinekachel noch
  // im Kundenprofil hinter dem Namen auf. Die Kachel zeigte stattdessen
  // weiter das alte Wiedervorlagedatum, obwohl ein Termin in der Zukunft
  // hinterlegt war.
  /*
   * Ist der Setter-Termin schon abgeschlossen?
   *
   * `terminErgebnis` traegt "erschienen" oder "noshow", gesetzt ueber den
   * Ergebnis-Kasten im Kundenprofil. Ein Termin mit Ergebnis ist erledigt und
   * gehoert nicht mehr in die Liste der naechsten Aktionen.
   *
   * Bis zum 16.09.2026 stand er dort trotzdem weiter als ueberfaellig, und zwar
   * unbegrenzt: Der Ergebnis-Kasten verschwindet nach dem Abschliessen, der
   * Eintrag blieb. Der Haken an ihm verwies dann auf einen Kasten, den es nicht
   * mehr gab, und es passierte nichts. Gemeldet von Christian am Beratungs-
   * gespraech von Otto Hans.
   */
  /*
   * Seit 30.09.2026 nur noch "erschienen". Ein No-Show leert das Setter-Feld
   * ohnehin, ein Datum darin ist danach ein NEUER Termin; dasselbe gilt fuer
   * "verschoben". Beide verschwanden sonst samt Ergebnis-Kasten, weil
   * `terminErgebnis` am Kontakt stehen bleibt. Ob gerade dieser Termin
   * erledigt ist, sagen die Schluessel je Termin unten.
   */
  const setterTerminAbgeschlossen = (kunde as { terminErgebnis?: string }).terminErgebnis === "erschienen";

  const termine: NonNullable<KontaktEingabe["termine"]> = [
    {
      datum: setterTerminAbgeschlossen ? "" : (k.setterTerminDatum || meta.setterTerminDatum),
      uhrzeit: k.setterTerminUhrzeit || meta.setterTerminUhrzeit,
      bezeichnung: setterTerminName(kunde),
    },
    {
      datum: meta.erstgespraechAm,
      uhrzeit: meta.erstgespraechUhrzeit,
      bezeichnung: "Erstgespräch",
    },
    {
      datum: meta.beratungsgespraechAm,
      uhrzeit: meta.beratungsgespraechUhrzeit,
      bezeichnung: "Beratungsgespräch",
    },
    {
      datum: meta.versicherungTerminDatum,
      uhrzeit: meta.versicherungTerminUhrzeit,
      bezeichnung: "Versicherungstermin",
    },
    {
      datum: meta.notarTermin,
      uhrzeit: meta.notarTerminUhrzeit,
      bezeichnung: "Notartermin",
    },
  ].filter((t) => !!t.datum);

  /*
   * Termine, die nur am INVESTMENT haengen. Die Terminbuchung im Kundenprofil
   * schreibt je Investment in meta.setterTerminDatum bzw.
   * meta.beratungsgespraechAm; die Kontakt-Ebene traegt dann teils noch einen
   * aelteren Termin. Ohne diese Quelle behauptete das Ampel-Badge hinter dem
   * Namen etwas anderes als die Ereigniskarte darunter (gemeldet bei Otto
   * Hans: Badge 31.07., Karte 29.08.).
   */
  try {
    for (const inv of getInvestmentsByKontakt(kunde.id)) {
      if (investmentId && inv.id !== investmentId) continue;
      const im = ((inv as { meta?: Record<string, string> }).meta || {}) as Record<string, string>;
      if (im.setterTerminDatum) {
        termine.push({
          datum: im.setterTerminDatum,
          uhrzeit: im.setterTerminUhrzeit,
          bezeichnung: setterTerminName(kunde),
        });
      }
      if (im.beratungsgespraechAm) {
        termine.push({
          datum: im.beratungsgespraechAm,
          uhrzeit: im.beratungsgespraechUhrzeit,
          bezeichnung: "Beratungsgespräch",
        });
      }
    }
  } catch { /* Store noch nicht bereit */ }

  // Von Hand abgehakt oder als No-Show erfasst, siehe `festerTerminSchluessel`.
  const erledigt = new Set([...erledigteTermine(kunde), ...noShowTerminSchluessel(mitKontaktMeta(kunde))]);
  return termine.filter((t) => !erledigt.has(festerTerminSchluessel(t.datum, t.uhrzeit)));
}

/**
 * Der Schluessel des Setter-Termins, solange sein Ergebnis-Kasten offen ist,
 * sonst `null`. Eine Regel fuer Kasten, Aktionsliste und Haken.
 */
export function offenerSetterTerminSchluessel(kunde: KundeData): string | null {
  const k = kunde as { setterTerminDatum?: string; setterTerminUhrzeit?: string; terminErgebnis?: string };
  if (!k.setterTerminDatum || k.terminErgebnis === "erschienen") return null;
  const schluessel = festerTerminSchluessel(k.setterTerminDatum, k.setterTerminUhrzeit);
  if (erledigteTermine(kunde).includes(schluessel) || noShowTerminSchluessel(mitKontaktMeta(kunde)).has(schluessel)) return null;
  return schluessel;
}

/**
 * Der Kontakt samt `meta`.
 *
 * `dbRowToKunde` uebernimmt nur einzelne Felder aus meta, nicht meta selbst.
 * Das Kundenprofil arbeitet mit genau diesem KundeData. `erledigteTermine` und
 * `noShowTermine` waren dort deshalb immer leer: Ein Beratungsgespraech blieb
 * nach "Stattgefunden" als Ergebnis-Kasten stehen, und das naechste Abhaken
 * schrieb die Liste neu, ohne die frueheren Eintraege (gemeldet 01.10.2026).
 * Fehlt meta, gilt die Zeile im Zwischenspeicher; die schreibt
 * `mergeKontaktMetaMitGrund` nach jedem Speichern zurueck.
 */
export function mitKontaktMeta<T extends KundeData>(kunde: T): T & { meta?: Record<string, unknown> } {
  const eigenes = (kunde as { meta?: Record<string, unknown> }).meta;
  if (eigenes) return kunde;
  const zeile = cacheGet<{ id: string; meta?: Record<string, unknown> }>("kontakte").find((r) => r.id === kunde.id);
  return zeile?.meta ? { ...kunde, meta: zeile.meta } : kunde;
}

/** Die abgehakten festen Termine am Kontakt, unlesbare Werte zählen nicht. */
export function erledigteTermine(kunde: KundeData): string[] {
  const roh = (mitKontaktMeta(kunde).meta || {}).erledigteTermine;
  return Array.isArray(roh) ? roh.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Die geplanten Schritte eines Kunden, eine Sammlung für alle Ansichten
 * (M20, 04.10.2026).
 *
 * Bis dahin gab es zwei: `kontaktQuellen` für Ampel, Pipelinekachel und
 * „Alle Kontakte“, und im Kundenprofil eine eigene für die Kachel „Nächste
 * Aktion“. Sie liefen auseinander (Meetings als Aufgabe, alte persönliche
 * Inbox-Liste nur hier, abgehakte Meetings nur dort erkannt). Jetzt sammelt
 * diese Funktion, `baueGeplanteAktionen` entdoppelt und sortiert, und
 * `kontaktQuellen` leitet daraus ab.
 *
 * @param investmentId Wenn gesetzt, zählen nur Aufgaben und Termine dieses
 *                     Investments plus die allgemeinen ohne Zuordnung.
 * @param quellen      Das Kundenprofil reicht seine eigene, vollständiger
 *                     geladene Aktivitätenliste und die wartenden
 *                     Unterschriften mit.
 */
export function geplanteAktionenFuer(
  kunde: KundeData,
  investmentId?: string,
  quellen: { aktivitaeten?: AktivitaetEntry[]; unterschriften?: WartendeUnterschrift[] } = {},
  jetzt: Date = new Date(),
): GeplanteAktion[] {
  const meta = (mitKontaktMeta(kunde).meta || {}) as Record<string, unknown>;
  let aufgaben: Aufgabe[] = [];
  let followUps: FollowUp[] = [];
  let aktivitaeten: AktivitaetEntry[] = quellen.aktivitaeten || [];
  try { aufgaben = getAufgabenFuerKunde(kunde.id, investmentId); } catch { /* Store noch nicht bereit */ }
  try { followUps = getFollowUpsByKunde(kunde.id); } catch { /* Store noch nicht bereit */ }
  if (!quellen.aktivitaeten) {
    try { aktivitaeten = getAktivitaeten(kunde.id); } catch { /* Store noch nicht bereit */ }
  }
  /*
   * Die Schnellaktion schreibt jede Aufgabe zweimal: als echte Aufgabe und
   * als Kopie im Verlauf. Nur die echte lässt sich abhaken. Ist sie erledigt
   * oder abgesagt, darf die Kopie nicht weiter als geplant zählen (gemeldet
   * bei David Botzem). Die Ampel kannte das schon, die Kachel im Profil nicht.
   */
  try {
    const geschlossen = new Set(
      getAufgaben()
        .filter((a) => a.kontaktId === kunde.id && (a.status === "erledigt" || a.status === "abgesagt"))
        .map((a) => titelTagSchluessel(a.titel, a.faelligAm)),
    );
    const offen = new Set(aufgaben.map((a) => titelTagSchluessel(a.titel, a.faelligAm)));
    if (geschlossen.size > 0) {
      aktivitaeten = aktivitaeten.filter((a) => {
        const k = titelTagSchluessel(a.beschreibung, a.faelligAm);
        return !geschlossen.has(k) || offen.has(k);
      });
    }
  } catch { /* Store noch nicht bereit */ }
  return baueGeplanteAktionen({
    aufgaben,
    followUps,
    aktivitaeten,
    termine: festeTermine(kunde, investmentId),
    followUpUhrzeit: {
      tag: typeof meta.followUpAm === "string" ? meta.followUpAm : undefined,
      uhrzeit: typeof meta.followUpUhrzeit === "string" ? meta.followUpUhrzeit : undefined,
    },
    unterschriften: quellen.unterschriften,
  }, jetzt);
}

/**
 * Die Quellen für `naechsterKontakt` (Ampel, Pipelinekachel, „Alle
 * Kontakte“), abgeleitet aus `geplanteAktionenFuer`.
 *
 * Dazu kommt, was die Kachel „Nächste Aktion“ bewusst auslässt, die Ampel
 * aber braucht: die Wiedervorlagen nach „nicht erreicht“ und `verstecktBis`
 * (beide als Wartephase, sie zählen nie als geplant) und der Auftrag
 * „Objekt-Vorstellungstermin vereinbaren“ (ab sofort fällig). Eine wartende
 * Unterschrift ist kein geplanter Schritt und bleibt hier außen vor.
 *
 * Die alte persönliche Inbox-Liste zählt seit dem 04.10.2026 nicht mehr: Sie
 * gehört einem einzelnen Nutzer, das Kundenprofil kannte sie nie, und dort
 * stehen seit der Umstellung auf die Tabelle `aufgaben` nur noch
 * automatische Hinweise.
 */
export function kontaktQuellen(
  kunde: KundeData,
  investmentId?: string,
): KontaktEingabe {
  const k = kunde as unknown as Record<string, string>;
  const geplant: NonNullable<KontaktEingabe["geplant"]> = geplanteAktionenFuer(kunde, investmentId)
    .filter((a) => a.art !== "unterschrift")
    .map((a) => ({
      zeit: a.zeitpunkt,
      quelle: a.art as Exclude<typeof a.art, "unterschrift">,
      // Termine heißen wie der Termin, Aufgaben und Follow-ups nach der Art.
      ...(a.art === "termin" || a.art === "videotermin" ? { bezeichnung: a.titel } : { titel: a.titel }),
    }));

  let aufgaben: NonNullable<KontaktEingabe["aufgaben"]> = [];
  try {
    aufgaben = getAufgabenFuerKunde(kunde.id, investmentId)
      .filter((a) => a.ausloeserSchluessel?.startsWith("nicht_erreicht:") || istVorstellungsAufgabe(a.ausloeserSchluessel))
      .map((a) => ({
        titel: a.titel,
        faelligAm: a.faelligAm,
        uhrzeit: a.uhrzeit,
        typ: a.typ,
        wiedervorlage: !!a.ausloeserSchluessel?.startsWith("nicht_erreicht:"),
        sofortFaellig: istVorstellungsAufgabe(a.ausloeserSchluessel),
      }));
  } catch { /* Store noch nicht bereit */ }

  return { geplant, aufgaben, verstecktBis: k.verstecktBis };
}

/**
 * Hat jemand mit dem Kunden einen nächsten Schritt in der Zukunft vereinbart?
 *
 * Solange das so ist, schweigen die Inaktivitäts-Hinweise (Stillstand,
 * Re-Engagement). Ein Vertriebspartner, der für den 23.11. ein Telefonat
 * eingetragen hat, ist nicht untätig, er wartet auf den Termin.
 *
 * Die persönliche Inbox-Liste bleibt dabei außen vor. Dort stehen seit der
 * Umstellung auf die Tabelle `aufgaben` nur noch automatische Hinweise, und
 * ein Hinweis mit 09:00 Uhr zählte sonst morgens selbst als Termin.
 *
 * Nach dem Termin gilt eine Schonfrist von 48 Stunden (Vorgabe Christian,
 * 01.10.2026): Zeit, das Ergebnis einzutragen, bevor ein Hinweis kommt.
 */
const SCHONFRIST_NACH_TERMIN_MS = 48 * 60 * 60 * 1000;

export function hatVereinbartenKontakt(kunde: KundeData, jetzt: number = Date.now()): boolean {
  return hatGeplantenTermin(
    kontaktQuellen(kunde),
    jetzt - SCHONFRIST_NACH_TERMIN_MS,
  );
}
