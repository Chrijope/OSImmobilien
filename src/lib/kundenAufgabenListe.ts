/**
 * Die offenen Vorgänge eines Kunden als eine einzige Liste.
 *
 * Im Kundenprofil steht oben die Kachel "Offene Aufgaben". Sie zeigte bisher
 * nur eine Zahl. Damit man eine Aufgabe auch abhaken kann, ohne das Profil zu
 * verlassen, braucht die Kachel die Vorgänge selbst, und zwar aus beiden
 * Quellen, die am Kunden hängen:
 *
 *   - Tabelle `aufgaben`     (aufgabenStore.getAufgabenFuerKunde)
 *   - Tabelle `follow_ups`   (followUpStore.getFollowUpsByKunde)
 *
 * Bewusst nicht dabei ist die persönliche Inbox-Liste aus den
 * Nutzereinstellungen: Sie gehört einem einzelnen Nutzer und wäre für alle
 * anderen, die auf denselben Kunden schauen, unsichtbar. Ebenso wenig gehören
 * Bewerber-Vorgänge hierher, die hängen an einer Bewerbung, nicht an einem
 * Kunden.
 *
 * Hier steht ausschließlich Rechnerei: zusammenführen, einstufen, sortieren,
 * zählen. Anzeige und Klickverhalten bleiben in der Komponente.
 */

import type { Aufgabe } from "./aufgabenStore";
import type { FollowUp } from "./followUpStore";
import { alsDatumsString, heuteAlsString, istUeberfaellig } from "./faelligkeit";

export type KundenAufgabeQuelle = "aufgabe" | "follow_up";
export type KundenAufgabePrioritaet = "niedrig" | "mittel" | "hoch" | "dringend";

export interface KundenAufgabe {
  /** Eindeutig über beide Quellen hinweg, etwa "aufgabe:1a2b". */
  schluessel: string;
  /** Die Kennung in der jeweiligen Tabelle, für das Abhaken. */
  id: string;
  quelle: KundenAufgabeQuelle;
  titel: string;
  /** Tag der Fälligkeit als JJJJ-MM-TT. Leer, wenn keiner hinterlegt ist. */
  faelligTag: string;
  /** HH:MM, nur wenn eigens gepflegt. */
  uhrzeit?: string;
  prioritaet: KundenAufgabePrioritaet;
  ueberfaellig: boolean;
  /** Fällig am heutigen Tag und noch nicht überfällig. */
  heute: boolean;
}

const PRIORITAETEN: KundenAufgabePrioritaet[] = ["niedrig", "mittel", "hoch", "dringend"];

/** Unbekannte oder fehlende Angaben gelten als "mittel", wie in der Tabelle. */
function alsPrioritaet(wert?: string | null): KundenAufgabePrioritaet {
  const p = String(wert || "").toLowerCase();
  return (PRIORITAETEN as string[]).includes(p) ? (p as KundenAufgabePrioritaet) : "mittel";
}

/** Nur HH:MM übernehmen. Eine Uhrzeit aus einem Zeitstempel zählt nicht. */
function alsUhrzeit(wert?: string | null): string | undefined {
  const m = String(wert || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** Offen heißt: weder erledigt noch abgesagt. */
function aufgabeIstOffen(a: Aufgabe): boolean {
  return a.status !== "erledigt" && a.status !== "abgesagt";
}

/** Beim Follow-up zählen nur "offen" und "ueberfallig". */
function followUpIstOffen(f: FollowUp): boolean {
  return f.status === "offen" || f.status === "ueberfallig";
}

function einstufen(faelligTag: string, uhrzeit: string | undefined, jetzt: Date) {
  const ueberfaellig = istUeberfaellig(faelligTag, uhrzeit, jetzt);
  const heute = !ueberfaellig && !!faelligTag && faelligTag === heuteAlsString(jetzt);
  return { ueberfaellig, heute };
}

/**
 * Beide Quellen zu einer sortierten Liste.
 *
 * Reihenfolge: überfällige zuerst (das Älteste ganz oben), danach alles
 * Übrige nach Fälligkeit aufsteigend. Vorgänge ohne Termin stehen am Ende,
 * sie drängeln sich sonst vor einen Termin von heute.
 */
export function baueKundenAufgabenListe(
  aufgaben: Aufgabe[],
  followUps: FollowUp[],
  jetzt: Date = new Date(),
): KundenAufgabe[] {
  const liste: KundenAufgabe[] = [];

  for (const a of aufgaben || []) {
    if (!a || !aufgabeIstOffen(a)) continue;
    // Eine Aufgabe mit Bewerbungsbezug beschreibt keinen Kunden.
    if (a.bewerbungId) continue;
    const faelligTag = alsDatumsString(a.faelligAm);
    const uhrzeit = alsUhrzeit(a.uhrzeit);
    liste.push({
      schluessel: `aufgabe:${a.id}`,
      id: a.id,
      quelle: "aufgabe",
      titel: (a.titel || "").trim() || "Ohne Titel",
      faelligTag,
      uhrzeit,
      prioritaet: alsPrioritaet(a.prioritaet),
      ...einstufen(faelligTag, uhrzeit, jetzt),
    });
  }

  for (const f of followUps || []) {
    if (!f || !followUpIstOffen(f)) continue;
    const faelligTag = alsDatumsString(f.faelligAm);
    liste.push({
      schluessel: `follow_up:${f.id}`,
      id: f.id,
      quelle: "follow_up",
      titel: (f.titel || "").trim() || "Ohne Titel",
      faelligTag,
      uhrzeit: undefined,
      prioritaet: alsPrioritaet(f.prioritaet),
      ...einstufen(faelligTag, undefined, jetzt),
    });
  }

  return liste.sort(vergleiche);
}

function vergleiche(a: KundenAufgabe, b: KundenAufgabe): number {
  if (a.ueberfaellig !== b.ueberfaellig) return a.ueberfaellig ? -1 : 1;
  // Ohne Termin ans Ende der jeweiligen Gruppe.
  const tagA = a.faelligTag || "9999-12-31";
  const tagB = b.faelligTag || "9999-12-31";
  if (tagA !== tagB) return tagA < tagB ? -1 : 1;
  const zeitA = a.uhrzeit || "99:99";
  const zeitB = b.uhrzeit || "99:99";
  if (zeitA !== zeitB) return zeitA < zeitB ? -1 : 1;
  return a.titel.localeCompare(b.titel, "de");
}

/** Zahl für die Kachel: wie viele offen, davon wie viele überfällig. */
export function zaehleKundenAufgaben(liste: KundenAufgabe[]): {
  gesamt: number;
  ueberfaellig: number;
} {
  const eintraege = liste || [];
  return {
    gesamt: eintraege.length,
    ueberfaellig: eintraege.filter((e) => e.ueberfaellig).length,
  };
}

/** Beschriftung der Fälligkeit in einer Zeile. */
export function faelligkeitText(eintrag: KundenAufgabe): string {
  if (!eintrag.faelligTag) return "Ohne Termin";
  const datum = formatiereTag(eintrag.faelligTag);
  const zeit = eintrag.uhrzeit ? `, ${eintrag.uhrzeit} Uhr` : "";
  if (eintrag.ueberfaellig) return `überfällig seit ${datum}${zeit}`;
  if (eintrag.heute) return eintrag.uhrzeit ? `heute, ${eintrag.uhrzeit} Uhr` : "heute";
  return `${datum}${zeit}`;
}

/** JJJJ-MM-TT als TT.MM.JJJJ, ohne Zeitzonenrechnerei. */
function formatiereTag(tag: string): string {
  const m = tag.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : tag;
}

/** Klartext der Herkunft, für die dezente Kennzeichnung in der Zeile. */
export function quelleLabel(quelle: KundenAufgabeQuelle): string {
  return quelle === "follow_up" ? "Follow-up" : "Aufgabe";
}
