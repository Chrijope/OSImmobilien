/**
 * Die geplanten Aktionen eines Kunden als eine chronologische Liste.
 *
 * Im Kundenprofil steht oben die Kachel "Nächste Aktion". Sie zeigt zugeklappt
 * den zeitlich nächsten geplanten Schritt mit Datum und Uhrzeit, aufgeklappt
 * alle geplanten Schritte. Die Quellen sind dieselben, aus denen die
 * Inaktivitätsampel ihre Antwort zieht (siehe `kontaktTermine.ts`), nur eben
 * einzeln und mit einem Sprungziel je Eintrag:
 *
 *   - Tabelle `aufgaben`        (Aufgaben, Follow-ups und Meetings, die über
 *                               die Schnellaktionen entstehen)
 *   - Tabelle `follow_ups`      (Follow-ups aus den Ketten)
 *   - Tabelle `aktivitaeten`    (Meetings und Aufgaben mit Fälligkeit; die
 *                               Schnellaktion schreibt jede Aufgabe zusätzlich
 *                               hierhin, siehe Entdopplung unten)
 *   - feste Termine am Kontakt  (Erstgespräch, Beratungsgespräch, Notartermin)
 *
 * Bewusst nicht dabei: Aufgaben ohne Fälligkeit, denn ohne Zeitpunkt ist
 * nichts "geplant", sie stehen in der Kachel "Offene Aufgaben". Ebenso nicht
 * die Wiedervorlagen, die das System nach einem "nicht erreicht" anlegt: Das
 * ist eine Sperrfrist, kein vereinbarter Schritt, und so zählt sie auch die
 * Ampel. Und nicht die Aufgabe "Objekt-Vorstellungstermin vereinbaren" für
 * Handbuch-Leads: Sie ist ein Auftrag, einen Termin erst zu machen, und steht
 * nach Christians Vorgabe nur unter "Offene Aufgaben".
 *
 * Hier steht ausschließlich Rechnerei: zusammenführen, entdoppeln, sortieren,
 * beschriften. Anzeige und Klickverhalten bleiben in der Komponente.
 */

import type { Aufgabe } from "./aufgabenStore";
import type { FollowUp } from "./followUpStore";
import type { AktivitaetEntry } from "./aktivitaetenStore";
import { istVorstellungsAufgabe } from "../../supabase/functions/_shared/handbuch-vorstellung.ts";
import type { FesterTermin } from "./kontaktTermine";
import { istVideoTermin, zuZeitpunkt } from "./naechsterKontakt";
import { rvWartetKachelText } from "./rvUnterschriftMahnung";

/**
 * "unterschrift" ist kein geplanter Schritt, sondern ein Wartezustand: Das
 * Dokument liegt beim Kunden. Es gibt dahinter keine Zeile, die jemand
 * abhaken koennte, siehe `aktionAbschluss.ts`.
 */
export type AktionArt = "termin" | "videotermin" | "follow_up" | "aufgabe" | "unterschrift";

/**
 * Wo im Profil der Eintrag liegt. `ankerId` ist die id des Zielelements;
 * fehlt das Element gerade (andere Seite der Liste, Karte ausgeblendet),
 * wechselt die Seite nur den Reiter.
 */
export interface AktionSprungziel {
  reiter: "aktivitaeten" | "stammdaten";
  ankerId: string;
}

export interface GeplanteAktion {
  /** Eindeutig über alle Quellen hinweg, etwa "aufgabe:1a2b". */
  schluessel: string;
  art: AktionArt;
  titel: string;
  /** Zeitpunkt in Millisekunden. Ohne Uhrzeit das Tagesende, siehe zuZeitpunkt. */
  zeitpunkt: number;
  /** Nur wahr, wenn eine Uhrzeit eigens gepflegt ist. Die 09:00 aus dem Zeitstempel zählt nicht. */
  hatUhrzeit: boolean;
  ueberfaellig: boolean;
  sprungziel: AktionSprungziel | null;
  /**
   * Die Termin- oder Aufgabenzeile im Verlauf, falls es eine gibt.
   *
   * Ueber sie findet die Aktionsliste die Ergebnis-Karte eines Termins und
   * damit die drei Antworten Stattgefunden, Nicht erschienen und Verschoben.
   * Feste Termine am Kontakt haben keine solche Zeile, dort bleibt das Feld
   * leer.
   */
  aktivitaetId?: string;
  /**
   * Nur bei einer ausstehenden Unterschrift ohne erfassten Versandzeitpunkt.
   * `zeitpunkt` ist dann nur ein Platzhalter fuer die Sortierung und wird
   * nirgends als Datum gezeigt.
   */
  zeitpunktUnbekannt?: boolean;
  /** Nur bei festen Terminen am Kontakt, siehe `festerTerminSchluessel`. */
  terminSchluessel?: string;
}

/**
 * Eine versendete Unterschrift, die noch aussteht.
 *
 * Sie ist kein geplanter Schritt und steht in keiner der vier Quellen oben.
 * Trotzdem gehoert sie in die Kachel: Solange sie aussteht, haengt der
 * Vorgang, und genau das soll im Profil stehen statt "Nichts geplant". Die
 * Inbox-Aufgaben aus `useInvestmentInboxTriggers` helfen hier nicht weiter,
 * die liegen in den persoenlichen Einstellungen ihres Empfaengers und nicht
 * am Kunden.
 */
export interface WartendeUnterschrift {
  /** Investment, zu dem die Unterschrift gehoert. Macht den Eintrag eindeutig. */
  investmentId: string;
  /** Was wartet, etwa "Reservierungsvereinbarung". */
  bezeichnung: string;
  /** Zeitpunkt des Versands in Millisekunden, null wenn er nie erfasst wurde. */
  versendetMs: number | null;
}

export interface AktionenEingabe {
  aufgaben?: Aufgabe[];
  followUps?: FollowUp[];
  aktivitaeten?: AktivitaetEntry[];
  termine?: FesterTermin[];
  unterschriften?: WartendeUnterschrift[];
  /**
   * Die Tabelle follow_ups kennt keine Uhrzeit. Die Anlege-Dialoge merken sie
   * am Kontakt (meta.followUpAm / followUpUhrzeit); stimmt der Tag, gilt sie.
   */
  followUpUhrzeit?: { tag?: string; uhrzeit?: string };
}

/** Anker des Terminblocks im Reiter Stammdaten, siehe KundenDetail. */
export const ANKER_FESTER_TERMIN = "kundenprofil-setter-termin";

/**
 * Kennt einen festen Termin am Kontakt über Tag und Uhrzeit wieder.
 *
 * Nur der Setter-Termin am Kontakt hat einen Ergebnis-Kasten. Für alle
 * anderen festen Termine (Beratungsgespräch am Kontakt, Termine an einem
 * Investment, Notar) merkt sich `meta.erledigteTermine` am Kontakt diese
 * Schlüssel, sobald jemand sie abhakt. Die Datumsfelder selbst bleiben
 * stehen, sie lesen Kontaktliste, Pipeline und Portal. Wird der Termin
 * verlegt, passt der Schlüssel nicht mehr und er erscheint wieder.
 */
export function festerTerminSchluessel(datum?: string, uhrzeit?: string): string {
  return `${String(datum || "").slice(0, 10)} ${alsUhrzeit(uhrzeit) || ""}`.trim();
}

/** Ein Kontakt, so wie ihn Seite (KundeData) oder Zwischenspeicher (Zeile) liefern. */
interface NoShowQuelle {
  noShowHistorie?: unknown;
  meta?: unknown;
}

function textListe(wert: unknown): string[] {
  return Array.isArray(wert) ? wert.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Die Termine, zu denen am Kontakt schon ein No-Show erfasst ist, als
 * `festerTerminSchluessel`.
 *
 * Zwei Quellen: `meta.noShowTermine` (seit 30.09.2026, je Termin ein
 * Schluessel) und die aeltere `noShowHistorie` des Setter-Kastens. So erkennt
 * das Profil auch Bestandsfaelle wieder, ohne beim Laden etwas zu schreiben.
 * Je Termin ein Schluessel: Ein alter No-Show verdeckt keinen neuen Termin.
 */
export function noShowTerminSchluessel(kontakt: NoShowQuelle | null | undefined): Set<string> {
  const meta = ((kontakt?.meta || {}) as Record<string, unknown>);
  const schluessel = new Set(textListe(meta.noShowTermine));
  const historie = Array.isArray(kontakt?.noShowHistorie) ? kontakt!.noShowHistorie
    : Array.isArray(meta.noShowHistorie) ? meta.noShowHistorie : [];
  for (const h of historie as Array<{ datum?: string; uhrzeit?: string }>) {
    if (h?.datum) schluessel.add(festerTerminSchluessel(h.datum, h.uhrzeit));
  }
  return schluessel;
}

export function noShowErfasst(kontakt: NoShowQuelle | null | undefined, datum?: string, uhrzeit?: string): boolean {
  if (!datum) return false;
  return noShowTerminSchluessel(kontakt).has(festerTerminSchluessel(datum, uhrzeit));
}

export interface NoShowEintrag {
  datum: string;
  uhrzeit?: string;
  berater?: string;
}

/**
 * Alle erfassten No-Shows am Kontakt, aelteste zuerst, je Termin einmal.
 *
 * Die `noShowHistorie` kennt nur der Setter-Kasten. No-Shows aus dem Kasten
 * zu festen Terminen, aus Buchungen und vom Haken stehen seit 30.09.2026 in
 * `meta.noShowTermine`, dort nur mit Tag und Uhrzeit. Das rote Banner im
 * Kundenprofil zaehlt beide, sonst fehlte ihm jeder No-Show ausserhalb des
 * Setter-Felds.
 */
export function noShowListe(kontakt: NoShowQuelle | null | undefined): NoShowEintrag[] {
  const meta = ((kontakt?.meta || {}) as Record<string, unknown>);
  const historie = (Array.isArray(kontakt?.noShowHistorie) ? kontakt!.noShowHistorie
    : Array.isArray(meta.noShowHistorie) ? meta.noShowHistorie : []) as Array<Partial<NoShowEintrag>>;
  const liste = new Map<string, NoShowEintrag>();
  for (const h of historie) {
    if (h?.datum) liste.set(festerTerminSchluessel(h.datum, h.uhrzeit), { datum: h.datum, uhrzeit: h.uhrzeit, berater: h.berater });
  }
  for (const k of textListe(meta.noShowTermine)) {
    if (liste.has(k)) continue;
    const [datum, uhrzeit] = k.split(" ");
    if (datum) liste.set(k, { datum, uhrzeit: uhrzeit || undefined });
  }
  return [...liste.values()].sort((a, b) => (zuZeitpunkt(a.datum, a.uhrzeit) ?? 0) - (zuZeitpunkt(b.datum, b.uhrzeit) ?? 0));
}

/**
 * Steht nach diesem No-Show schon ein neues Erst- oder Beratungsgespraech an?
 *
 * Gelesen wird die Liste der naechsten Aktionen, denn dort laufen alle Wege
 * zusammen: Setter-Feld, Termin am Kontakt oder Investment, Meeting mit
 * Aufgabe und Buchung ueber die Terminseite. Neu heisst: spaeter als der
 * geplatzte Termin. Der geplatzte selbst steht nach dem No-Show nicht mehr in
 * der Liste; ist er es im Bestandsfall doch, liegt er nicht spaeter.
 */
export function neuerGespraechsterminNachNoShow(letzter: NoShowEintrag | undefined, aktionen: GeplanteAktion[]): boolean {
  if (!letzter) return false;
  const grenze = zuZeitpunkt(letzter.datum, letzter.uhrzeit);
  if (grenze === null) return false;
  return (aktionen || []).some((a) =>
    (a.art === "termin" || a.art === "videotermin") &&
    /erstgespr|beratung/i.test(a.titel) &&
    a.zeitpunkt > grenze);
}

/**
 * Was am Kontakt-meta geschrieben wird, wenn ein Termin nicht stattfand:
 * aus der Liste der naechsten Aktionen (`erledigteTermine`) und als No-Show
 * gemerkt (`noShowTermine`). Ein Schreibvorgang ueber `mergeKontaktMeta`.
 */
export function noShowMetaPatch(kontakt: NoShowQuelle | null | undefined, schluessel: string) {
  const meta = ((kontakt?.meta || {}) as Record<string, unknown>);
  const dazu = (liste: string[]) => [...liste.filter((k) => k !== schluessel), schluessel];
  return {
    erledigteTermine: dazu(textListe(meta.erledigteTermine)),
    noShowTermine: dazu(textListe(meta.noShowTermine)),
  };
}

/**
 * Titel plus Tag, die Verbindung zwischen echter Aufgabe und ihrer Kopie im
 * Verlauf. Dieselbe Regel wie `aufgabenSchluessel` im Aufgaben-Store; hier
 * noch einmal, damit diese Datei ohne Store und Datenbank auskommt. Der Test
 * prüft, dass beide gleich rechnen.
 */
export function titelTagSchluessel(titel?: string, faelligAm?: string): string {
  return `${(titel || "").trim().toLowerCase()}|${String(faelligAm || "").slice(0, 10)}`;
}

/** Nur HH:MM zählt als gepflegte Uhrzeit. */
function alsUhrzeit(wert?: string | null): string | undefined {
  const m = String(wert || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function aufgabeIstOffen(a: Aufgabe): boolean {
  return a.status !== "erledigt" && a.status !== "abgesagt";
}

function followUpIstOffen(f: FollowUp): boolean {
  return f.status === "offen" || f.status === "ueberfallig";
}

/** Vom System nach einem "nicht erreicht" angelegt: Sperrfrist, kein Termin. */
function istWiedervorlage(a: Aufgabe): boolean {
  return !!a.ausloeserSchluessel?.startsWith("nicht_erreicht:");
}

function ankerAktivitaet(id: string): AktionSprungziel {
  return { reiter: "aktivitaeten", ankerId: `aktivitaet-${id}` };
}

export function baueGeplanteAktionen(e: AktionenEingabe, jetzt: Date = new Date()): GeplanteAktion[] {
  const jetztMs = jetzt.getTime();
  const liste: GeplanteAktion[] = [];
  const eintrag = (
    teil: Omit<GeplanteAktion, "ueberfaellig">,
  ) => liste.push({ ...teil, ueberfaellig: teil.zeitpunkt <= jetztMs });

  // Die Kopien in der Aktivitätsliste, erreichbar über Titel und Tag. Genau
  // dieser Schlüssel verbindet in `kontaktTermine` und in der Zeitleiste die
  // echte Aufgabe mit ihrem Eintrag im Verlauf.
  const kopien = new Map<string, AktivitaetEntry>();
  for (const a of e.aktivitaeten || []) {
    if (!a || a.erledigtAm || !a.faelligAm) continue;
    if (a.art !== "aufgabe" && a.art !== "meeting") continue;
    const k = titelTagSchluessel(a.beschreibung, a.faelligAm);
    if (!kopien.has(k)) kopien.set(k, a);
  }
  const verbraucht = new Set<string>();
  const aktivitaetNachId = new Map((e.aktivitaeten || []).filter(Boolean).map((a) => [a.id, a]));

  for (const a of e.aufgaben || []) {
    if (!a || !aufgabeIstOffen(a) || a.bewerbungId || istWiedervorlage(a)) continue;
    if (istVorstellungsAufgabe(a.ausloeserSchluessel)) continue;
    /*
     * Meeting und Aufgabe aus einem Guss (Terminseite, Meeting-Dialog,
     * Buchung) sind über `meetingAktivitaetId` gekoppelt und tragen oft
     * verschiedene Titel: "Erstgespräch" gegen "Erstgespräch mit …". Über
     * Titel und Tag fanden sie nicht zusammen, der Termin stand doppelt in der
     * Liste, und der Eintrag der Aufgabe kannte kein Meeting und damit kein
     * Ergebnis-Feld. Jetzt ist es ein Eintrag mit dem Meeting als Ziel.
     */
    const gekoppelt = a.meetingAktivitaetId ? aktivitaetNachId.get(a.meetingAktivitaetId) : undefined;
    // Meeting schon abgeschlossen: Die Datenbank zieht die Aufgabe nach
    // (Trigger `meeting_folgeobjekte`), bis dahin nichts mehr anzeigen.
    if (gekoppelt?.erledigtAm) continue;
    const zeitpunkt = zuZeitpunkt(a.faelligAm, a.uhrzeit);
    if (zeitpunkt === null) continue;
    const k = titelTagSchluessel(a.titel, a.faelligAm);
    const kopie = gekoppelt || kopien.get(k);
    verbraucht.add(k);
    if (gekoppelt) verbraucht.add(titelTagSchluessel(gekoppelt.beschreibung, gekoppelt.faelligAm));
    // Ist das Meeting noch nicht im Speicher, reicht die Kennung: Den
    // Ergebnis-Termin lädt die Aktionsliste beim Klick selbst nach.
    const meetingId = kopie?.id || a.meetingAktivitaetId;
    const art: AktionArt =
      a.typ === "meeting"
        ? istVideoTermin(kopie?.zoomLink) ? "videotermin" : "termin"
        : a.typ === "follow_up"
        ? "follow_up"
        : "aufgabe";
    eintrag({
      schluessel: `aufgabe:${a.id}`,
      art,
      // Der Titel des Meetings: Im Profil des Kunden ist "mit <Kunde>" doppelt.
      titel: (gekoppelt?.beschreibung || "").trim() || (a.titel || "").trim() || "Ohne Titel",
      zeitpunkt,
      hatUhrzeit: !!alsUhrzeit(a.uhrzeit),
      // Ohne Kopie im Verlauf zeigt die Zeitleiste die Aufgabe selbst als
      // Zeile "aufgabe-<id>", aber nur für von Hand angelegte.
      sprungziel: meetingId
        ? ankerAktivitaet(meetingId)
        : a.ausloeserSchluessel
        ? null
        : ankerAktivitaet(`aufgabe-${a.id}`),
      aktivitaetId: meetingId,
    });
  }

  for (const f of e.followUps || []) {
    if (!f || !followUpIstOffen(f) || !f.faelligAm) continue;
    const k = titelTagSchluessel(f.titel, f.faelligAm);
    // Der Follow-up-Dialog legt denselben Vorgang auch als Aufgabe an.
    if (verbraucht.has(k)) continue;
    const uhrzeit =
      e.followUpUhrzeit?.tag && f.faelligAm === e.followUpUhrzeit.tag
        ? alsUhrzeit(e.followUpUhrzeit.uhrzeit)
        : undefined;
    const zeitpunkt = zuZeitpunkt(f.faelligAm, uhrzeit);
    if (zeitpunkt === null) continue;
    const kopie = kopien.get(k);
    verbraucht.add(k);
    eintrag({
      schluessel: `follow_up:${f.id}`,
      art: "follow_up",
      titel: (f.titel || "").trim() || "Ohne Titel",
      zeitpunkt,
      hatUhrzeit: !!uhrzeit,
      sprungziel: kopie ? ankerAktivitaet(kopie.id) : null,
      aktivitaetId: kopie?.id,
    });
  }

  // Einträge im Verlauf, hinter denen keine echte Aufgabe steht: ältere
  // Meetings, Termine aus der Kopfzeile, Aufgaben aus der Zeit vor der
  // Tabelle `aufgaben`.
  for (const [k, a] of kopien) {
    if (verbraucht.has(k)) continue;
    const zeitpunkt = zuZeitpunkt(a.faelligAm, a.uhrzeit);
    if (zeitpunkt === null) continue;
    eintrag({
      schluessel: `aktivitaet:${a.id}`,
      art: a.art === "meeting" ? (istVideoTermin(a.zoomLink) ? "videotermin" : "termin") : "aufgabe",
      titel: (a.beschreibung || "").trim() || (a.art === "meeting" ? "Meeting" : "Ohne Titel"),
      zeitpunkt,
      hatUhrzeit: !!alsUhrzeit(a.uhrzeit),
      sprungziel: ankerAktivitaet(a.id),
      aktivitaetId: a.id,
    });
  }

  // Feste Termine am Kontakt. Kontakt und Investment tragen oft denselben
  // Termin, und ein gebuchter Videocall steht zusätzlich als Meeting im
  // Verlauf. Gleicher Zeitpunkt heißt: derselbe Termin, einmal reicht.
  const belegteZeiten = new Set(liste.filter((x) => x.art === "termin" || x.art === "videotermin").map((x) => x.zeitpunkt));
  const gesehen = new Set<string>();
  for (const t of e.termine || []) {
    if (!t?.datum) continue;
    const zeitpunkt = zuZeitpunkt(t.datum, t.uhrzeit);
    if (zeitpunkt === null) continue;
    const k = `${t.bezeichnung}|${zeitpunkt}`;
    if (gesehen.has(k) || belegteZeiten.has(zeitpunkt)) continue;
    gesehen.add(k);
    eintrag({
      schluessel: `termin:${t.bezeichnung}:${zeitpunkt}`,
      art: t.video ? "videotermin" : "termin",
      titel: t.bezeichnung,
      zeitpunkt,
      hatUhrzeit: !!alsUhrzeit(t.uhrzeit),
      sprungziel: { reiter: "stammdaten", ankerId: ANKER_FESTER_TERMIN },
      terminSchluessel: festerTerminSchluessel(t.datum, t.uhrzeit),
    });
  }

  // Ausstehende Unterschriften. Erst ab dem ersten vollen Tag: Wer heute
  // versendet hat, wartet noch nicht, er hat gerade etwas getan. Der
  // Zeitpunkt ist der Versand; die Unterzeile sagt deshalb "versendet am",
  // nicht "überfällig seit", siehe `aktionFaelligkeitText`.
  for (const u of e.unterschriften || []) {
    if (!u?.investmentId) continue;
    if (u.versendetMs === null) {
      // Altvorgang ohne Versandzeitpunkt: sichtbar, aber ohne Dauer. Der
      // Platzhalter 0 macht ihn zum aeltesten Eintrag. Die zugeklappte Kachel
      // nimmt ihn damit nur, wenn weder etwas ansteht noch ein anderer
      // Eintrag ueberfaellig ist, siehe `naechsteAktion`.
      eintrag({
        schluessel: `unterschrift:${u.investmentId}`,
        art: "unterschrift",
        titel: rvWartetKachelText(null, u.bezeichnung),
        zeitpunkt: 0,
        hatUhrzeit: false,
        sprungziel: null,
        zeitpunktUnbekannt: true,
      });
      continue;
    }
    if (!Number.isFinite(u.versendetMs)) continue;
    const tage = Math.floor((jetztMs - u.versendetMs) / 86_400_000);
    if (tage < 1) continue;
    eintrag({
      schluessel: `unterschrift:${u.investmentId}`,
      art: "unterschrift",
      titel: rvWartetKachelText(tage, u.bezeichnung),
      zeitpunkt: u.versendetMs,
      hatUhrzeit: false,
      sprungziel: null,
    });
  }

  return liste.sort(vergleiche);
}

/** Chronologisch, das Früheste zuerst. Überfälliges steht damit von selbst oben. */
function vergleiche(a: GeplanteAktion, b: GeplanteAktion): number {
  if (a.zeitpunkt !== b.zeitpunkt) return a.zeitpunkt - b.zeitpunkt;
  return a.titel.localeCompare(b.titel, "de");
}

/**
 * Was die zugeklappte Kachel zeigt: der nächste Schritt in der Zukunft.
 * Steht nichts mehr bevor, der zuletzt fällige, denn genau der ist liegen
 * geblieben. Dieselbe Wahl trifft `naechsterKontakt` für die Ampel.
 */
export function naechsteAktion(liste: GeplanteAktion[]): GeplanteAktion | null {
  const eintraege = liste || [];
  const bevorstehend = eintraege.find((x) => !x.ueberfaellig);
  if (bevorstehend) return bevorstehend;
  const ueberfaellige = eintraege.filter((x) => x.ueberfaellig);
  return ueberfaellige.length ? ueberfaellige[ueberfaellige.length - 1] : null;
}

const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** "Do 18.09., 14:00"; heute nur "heute, 14:00"; in einem anderen Jahr mit Jahreszahl. */
export function aktionZeitpunktText(aktion: GeplanteAktion, jetzt: Date = new Date()): string {
  const d = new Date(aktion.zeitpunkt);
  const zeit = aktion.hatUhrzeit
    ? `, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : "";
  const gleicherTag =
    d.getFullYear() === jetzt.getFullYear() && d.getMonth() === jetzt.getMonth() && d.getDate() === jetzt.getDate();
  if (gleicherTag) return `heute${zeit}`;
  const jahr = d.getFullYear() !== jetzt.getFullYear() ? String(d.getFullYear()) : "";
  return `${WOCHENTAGE[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${jahr}${zeit}`;
}

/**
 * Beschriftung in einer Zeile, bei Vergangenheit mit "überfällig seit".
 *
 * Eine ausstehende Unterschrift traegt als Zeitpunkt den Versand. "Überfällig
 * seit" dem Versandtag waere falsch, dort steht deshalb "versendet am".
 */
export function aktionFaelligkeitText(aktion: GeplanteAktion, jetzt: Date = new Date()): string {
  const text = aktionZeitpunktText(aktion, jetzt);
  if (aktion.art === "unterschrift") {
    if (aktion.zeitpunktUnbekannt) return "Versanddatum nicht erfasst";
    return text.startsWith("heute") ? `versendet ${text}` : `versendet am ${text}`;
  }
  return aktion.ueberfaellig ? `überfällig seit ${text}` : text;
}

/** Klartext der Art, für die kleine Marke vor dem Titel. */
export function aktionArtLabel(art: AktionArt): string {
  switch (art) {
    case "termin": return "Termin";
    case "videotermin": return "Videomeeting";
    case "follow_up": return "Follow-up";
    case "unterschrift": return "Unterschrift offen";
    default: return "Aufgabe";
  }
}
