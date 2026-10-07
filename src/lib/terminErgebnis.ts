/**
 * Das Ergebnis eines Termins: Stattgefunden, Nicht erschienen, Verschoben.
 *
 * Diese Datei ist die einzige Wahrheit darueber, was bei einer dieser drei
 * Antworten passiert. Vorher stand alles in `BuchungErgebnisKarten.tsx`, und
 * die Karte war der einzige Ort, an dem sich ein Termin abschliessen liess.
 * Sie liegt im Reiter Stammdaten und laesst von Hand angelegte Meetings nach
 * `RUECKBLICK_TAGE` wieder los. Ein Termin, der laenger liegen geblieben ist,
 * war damit gar nicht mehr abzuschliessen.
 *
 * Seit 09/2026 greift auch die Aktionsliste im Kundenprofil hierher. Beide
 * Stellen rufen dieselben drei Funktionen. Wer die No-Show-Kette aendert,
 * aendert sie damit fuer beide zugleich; zwei Fassungen koennen nicht mehr
 * auseinanderlaufen.
 *
 * Bewusst ohne React: hier steht nur, was geschrieben wird. Die Rueckmeldung
 * an den Nutzer kommt ueber `melde` von aussen herein.
 */

import {
  ladeBuchungen, ladeLinks, setzeBuchungStatus, verschiebeBuchungIntern,
  type Buchung, type BuchungLink,
} from "./buchungStore";
import {
  addAktivitaet, addGeteilteAufgabe, getAktivitaeten,
  setzeAktivitaetErledigt, verschiebeAktivitaetTermin,
  type AktivitaetEntry,
} from "./aktivitaetenStore";
import { erledigeAufgabe, findeAufgabeZuAktivitaet, sageAufgabeAb, updateAufgabe } from "./aufgabenStore";
import { getInvestmentsByKontakt, updateInvestment } from "./investmentsStore";
import { gaesteNamenAusDetails, investmentAusDetails } from "./terminAnzeige";
import { loadAllUsers } from "./loadAllUsers";
import { kennungZuName } from "./beraterNamensabgleich";
import { oeffentlicheAdresse } from "./oeffentlicheBasis";
import { getEffectivePipelineStufe } from "./kontaktPipeline";
import { fortschrittsRang, istEndzustand } from "./pipelineStufen";
import { getKontaktById, mergeKontaktMetaMitGrund, updateKontakt } from "./kundenStore";
import { festerTerminSchluessel, noShowErfasst, noShowMetaPatch } from "./kundenNaechsteAktion";
import { meetingZeitISO } from "./meetingZeit";
import { mitKontaktMeta } from "./kontaktTermine";

/**
 * Welche Anlaesse eine Ergebnis-Karte bekommen.
 *
 * "sonstiges" bleibt bewusst draussen. Dahinter steht kein Schritt im
 * Vertriebsweg, ein Erschienen oder No-Show waere dort ohne Bedeutung.
 */
export const KARTEN_ANLAESSE = new Set([
  "erstgespraech", "beratung", "objektvorstellung", "finanzierungsgespraech",
]);

/**
 * Zu welcher Pipelinestufe ein geplatzter Termin fuehrt.
 *
 * Nur diese beiden Gespraeche haben eine eigene NoShow-Stufe, und sie sind
 * nicht austauschbar: "EG NoShow" gehoert zum Erstgespraech, "BG NoShow" zum
 * Beratungsgespraech. Objektvorstellung und Finanzierungsgespraech haben
 * keine, dort bleibt die Stufe stehen und nur die Aufgabe zur Neuterminierung
 * entsteht.
 */
export const NOSHOW_STUFE: Record<string, "eg_noshow" | "bg_noshow"> = {
  erstgespraech: "eg_noshow",
  beratung: "bg_noshow",
};

/**
 * Wie weit ein unerledigter Termin zurueckliegen darf, bevor die Karte im
 * Reiter Stammdaten ihn loslaesst.
 *
 * Gilt nur fuer die Karte. Die Aktionsliste im Kundenprofil zeigt einen
 * liegen gebliebenen Termin unbegrenzt an und muss ihn deshalb auch
 * unbegrenzt abschliessen koennen, sonst gibt es fuer alte Termine gar keinen
 * Weg mehr. Siehe `ladeErgebnisTermine`.
 */
export const RUECKBLICK_TAGE = 14;

/**
 * Darf ein No-Show die Stufe `ziel` setzen, wenn der Vorgang gerade auf
 * `jetzige` steht?
 *
 * Zwei Sperren, beide in dieselbe Richtung: Eine NoShow-Stufe darf einen
 * Vorgang niemals zurueckwerfen. Wer schon bei der Selbstauskunft oder in der
 * Finanzierung steht, verliert seinen Stand nicht, weil ein spaet
 * nachgetragenes Erstgespraech als geplatzt vermerkt wird. Und ein verlorener
 * oder archivierter Vorgang wird gar nicht angefasst.
 */
export function darfNoShowStufeSetzen(
  jetzige: string | null | undefined,
  ziel: "eg_noshow" | "bg_noshow",
): boolean {
  if (istEndzustand(jetzige)) return false;
  if (jetzige === ziel) return false;
  // Gleicher Rang ist erlaubt: "erstgespraech_geplant" und "eg_noshow" liegen
  // in der Fortschrittsleiste am selben Kaestchen, genau dort steht der
  // geplatzte Termin ja auch.
  return fortschrittsRang(jetzige) <= fortschrittsRang(ziel);
}

export type TerminModus = "video" | "vor_ort" | "telefon";

/** Ein vereinheitlichter Termin, egal aus welcher Quelle. */
export interface ErgebnisTermin {
  key: string;
  quelle: "buchung" | "aktivitaet";
  buchung?: Buchung;
  aktivitaet?: AktivitaetEntry;
  titel: string;
  startAt: Date;
  gebuchtAm?: string;
  modus?: TerminModus;
  /** Vollstaendiger Raumlink, falls es ein Videotermin ist. */
  raumLink?: string;
  treffpunkt?: string;
  dauerMinuten?: number;
  investmentLabel?: string | null;
  /** Wer am Termin teilnimmt: bei Buchungen der Buchende, sonst das Teilnehmer-Feld. */
  teilnehmer?: string;
  /** Nur die Namen der eingeladenen Gaeste, ohne Mail-Adressen. */
  gaeste?: string[];
}

/** Was die Schreibfunktionen ueber den Vorgang und den Nutzer wissen muessen. */
export interface ErgebnisKontext {
  kundeId: string;
  kundeName: string;
  /** Zustaendiger Vertriebspartner des Kunden, Ziel der Folgeaufgaben. */
  beraterName?: string;
  /** Kennung des zustaendigen Partners (zustaendig_id). Vorrang vor dem Namen. */
  beraterId?: string;
  userName: string;
  /** Rueckmeldung an den Nutzer, in der Regel der Toast der aufrufenden Seite. */
  melde: (meldung: { title: string; description?: string; variant?: "destructive" }) => void;
}

export function terminText(d: Date): string {
  return d.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

export function lokalesDatum(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function lokaleUhrzeit(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Setzt nach einem No-Show die passende NoShow-Stufe am Kontakt.
 *
 * Fehlschlaege sind hier bewusst still. Der No-Show selbst ist zu diesem
 * Zeitpunkt schon gespeichert, und eine Fehlermeldung ueber eine nicht
 * gesetzte Stufe wuerde den Eindruck erwecken, es sei gar nichts passiert.
 */
export function setzeNoShowStufe(kundeId: string, ziel: "eg_noshow" | "bg_noshow"): boolean {
  try {
    const kunde = getKontaktById(kundeId);
    if (!kunde) return false;
    if (!darfNoShowStufeSetzen(getEffectivePipelineStufe(kunde), ziel)) return false;
    updateKontakt(kundeId, { pipelineStufe: ziel });
    // Die Kachel "Naechster Schritt" liest die Stufe des Investments, nicht
    // die des Kontakts. Ohne das Nachziehen stand dort nach einem No-Show
    // weiter der Schritt des geplatzten Termins statt "Neuen ... vereinbaren".
    // Dieselbe Sperre wie am Kontakt: Ein weiter gediehenes Investment bleibt.
    for (const inv of getInvestmentsByKontakt(kundeId)) {
      if (darfNoShowStufeSetzen(inv.pipelineStufe, ziel)) updateInvestment(inv.id, { pipelineStufe: ziel });
    }
    return true;
  } catch (fehler) {
    console.error("NoShow-Stufe nicht gesetzt:", fehler);
    return false;
  }
}

/** Aus dem relativen Pfad der Aktivitaet wird eine vollstaendige Adresse. */
function vollerLink(roh?: string | null): string | undefined {
  const wert = (roh || "").trim();
  if (!wert) return undefined;
  if (wert.startsWith("/")) return oeffentlicheAdresse(wert);
  return wert;
}

/**
 * Den Weg eines von Hand angelegten Meetings aus der Aktivitaet ableiten.
 * Der Dialog schreibt den Hinweis beim Anlegen in die Details.
 */
function modusAusAktivitaet(a: AktivitaetEntry): { modus?: TerminModus; treffpunkt?: string } {
  if (a.zoomLink) return { modus: "video" };
  const details = a.details || "";
  const treffer = details.match(/Treffpunkt: (.+)/);
  if (treffer) return { modus: "vor_ort", treffpunkt: treffer[1].trim() };
  if (details.includes("Telefontermin")) return { modus: "telefon" };
  return {};
}

/**
 * Die echte Aufgabe hinter einem von Hand angelegten Meeting.
 *
 * Die Schnellaktion schreibt jeden Termin zweimal: als Aufgabe in `aufgaben`
 * und als Kopie in die Aktivitaetsliste. Wird nur die Kopie abgehakt, bleibt
 * die Aufgabe offen stehen und der Termin steht weiter in der Aktionsliste,
 * obwohl er erledigt ist. Dasselbe Nachziehen macht der Papierkorb der
 * Zeitleiste schon laenger.
 */
function aufgabeZumTermin(kundeId: string, t: ErgebnisTermin) {
  // Bei einer Buchung haengt die Aufgabe am Meeting der Buchung.
  const aktivitaetId = t.aktivitaet?.id || t.buchung?.aktivitaet_id || undefined;
  if (!aktivitaetId) return null;
  try {
    return findeAufgabeZuAktivitaet(kundeId, t.aktivitaet?.beschreibung, t.aktivitaet?.faelligAm, aktivitaetId);
  } catch (fehler) {
    console.error("Aufgabe zum Termin nicht gefunden:", fehler);
    return null;
  }
}

/**
 * Alle Termine eines Kunden, zu denen ein Ergebnis eingetragen werden kann.
 *
 * Zwei Quellen, eine Darstellung:
 *
 *   - Selbstbuchungen des Kunden ueber den Buchungslink (Tabelle buchungen).
 *   - Von Hand angelegte Meetings aus "Termin festlegen" (Termin-Aktivitaeten,
 *     die nicht aus einer Buchung stammen).
 *
 * `rueckblickTage` begrenzt die von Hand angelegten Meetings nach hinten.
 * `null` heisst: keine Grenze. Die Karte im Reiter Stammdaten setzt
 * `RUECKBLICK_TAGE`, damit dort keine uralten Karteileichen stehen. Die
 * Aktionsliste sucht ohne Grenze, denn sie zeigt den Termin ja auch ohne
 * Grenze an.
 */
export async function ladeErgebnisTermine(
  kundeId: string,
  optionen: { rueckblickTage?: number | null } = {},
): Promise<ErgebnisTermin[]> {
  const rueckblickTage = optionen.rueckblickTage === undefined ? RUECKBLICK_TAGE : optionen.rueckblickTage;
  const [bu, li] = await Promise.all([
    ladeBuchungen({ kontaktId: kundeId, limit: 50 }),
    ladeLinks(kundeId),
  ]);

  const investments = (() => {
    try { return getInvestmentsByKontakt(kundeId) as Array<{ id: string; label?: string; objektName?: string }>; }
    catch { return []; }
  })();
  const investmentLabel = (link: BuchungLink | undefined | null): string | null => {
    if (!link?.investment_id) return null;
    const inv = investments.find((i) => i.id === link.investment_id);
    return inv?.label || inv?.objektName || null;
  };

  const aktivitaeten = (() => {
    try { return getAktivitaeten(kundeId); } catch { return []; }
  })();

  const buchungsTermine: ErgebnisTermin[] = bu
    .filter((b) => b.status === "offen" && KARTEN_ANLAESSE.has(b.anlass))
    .map((b) => {
      const verknuepfte = b.aktivitaet_id
        ? aktivitaeten.find((a) => a.id === b.aktivitaet_id)
        : undefined;
      return {
        key: `bu-${b.id}`,
        quelle: "buchung" as const,
        buchung: b,
        titel: b.bezeichnung || "Videocall",
        startAt: new Date(b.start_at),
        gebuchtAm: b.created_at,
        modus: "video" as const,
        raumLink: vollerLink(verknuepfte?.zoomLink),
        dauerMinuten: b.dauer_minuten,
        investmentLabel: investmentLabel(b.link_id ? li.find((l) => l.id === b.link_id) : null),
        teilnehmer: b.name || undefined,
      };
    });

  // Von Hand angelegte Meetings: Termin-Aktivitaeten ohne Buchung dahinter.
  const buchungsAktivitaetIds = new Set(bu.map((b) => b.aktivitaet_id).filter(Boolean));
  const grenze = (() => {
    if (rueckblickTage === null) return null;
    const d = new Date();
    d.setDate(d.getDate() - rueckblickTage);
    return d;
  })();
  const manuelleTermine: ErgebnisTermin[] = aktivitaeten
    .filter((a) =>
      a.art === "meeting" &&
      !a.erledigtAm &&
      !!a.faelligAm &&
      !buchungsAktivitaetIds.has(a.id))
    .map((a) => {
      const start = new Date(`${a.faelligAm}T${a.uhrzeit || "10:00"}:00`);
      return { a, start };
    })
    .filter(({ start }) => !Number.isNaN(start.getTime()) && (!grenze || start >= grenze))
    .map(({ a, start }) => {
      const { modus, treffpunkt } = modusAusAktivitaet(a);
      return {
        key: `ak-${a.id}`,
        quelle: "aktivitaet" as const,
        aktivitaet: a,
        titel: a.beschreibung?.trim() || "Meeting",
        startAt: start,
        gebuchtAm: a.datum,
        modus,
        raumLink: vollerLink(a.zoomLink),
        treffpunkt,
        dauerMinuten: Number(a.dauer) || undefined,
        investmentLabel: investmentAusDetails(a.details) ?? null,
        teilnehmer: a.teilnehmer?.trim() || undefined,
        gaeste: gaesteNamenAusDetails(a.details),
      };
    });

  return [...buchungsTermine, ...manuelleTermine]
    .sort((x, y) => x.startAt.getTime() - y.startAt.getTime());
}

/**
 * Den Termin aus der Aktionsliste wiederfinden.
 *
 * Die Aktionsliste kennt die Termin-Zeile im Verlauf (`aktivitaetId`). Eine
 * Selbstbuchung haengt ueber `aktivitaet_id` an derselben Zeile, deshalb
 * findet dieselbe Frage beide Quellen.
 */
export function findeErgebnisTermin(
  termine: ErgebnisTermin[],
  aktivitaetId: string | undefined,
): ErgebnisTermin | null {
  if (!aktivitaetId) return null;
  return (
    termine.find((t) => t.aktivitaet?.id === aktivitaetId || t.buchung?.aktivitaet_id === aktivitaetId) || null
  );
}

/** Vermerk im Verlauf, sofort als erledigt, damit er nichts mehr anmahnt. */
function protokolliere(ctx: ErgebnisKontext, beschreibung: string, details?: string) {
  addAktivitaet({
    kundeId: ctx.kundeId,
    art: "meeting",
    beschreibung,
    details,
    von: ctx.userName,
    erledigtAm: new Date().toISOString(),
  });
}

/** Wer die Folgeaufgabe bekommt: bei Buchungen der Mitarbeiter, sonst der Berater. */
function empfaenger(t: ErgebnisTermin, ctx: ErgebnisKontext): string | undefined {
  if (t.quelle === "buchung") return t.buchung?.mitarbeiter_id;
  // Kennung zuerst; der Name nur, wenn genau ein Nutzer so heisst.
  return ctx.beraterId || kennungZuName(ctx.beraterName);
}

/**
 * "Stattgefunden": der Termin ist einfach abgeschlossen.
 *
 * Keine weitere Logik, so von Christian festgelegt. Bei Selbstbuchungen hakt
 * die Datenbank die Termin-Zeile im Verlauf gleich mit ab.
 */
export async function terminErschienen(t: ErgebnisTermin, ctx: ErgebnisKontext): Promise<boolean> {
  const aufgabe = aufgabeZumTermin(ctx.kundeId, t);
  const fehler = await schreibeTerminStatus(t, "wahrgenommen");
  if (fehler !== null) { meldeStatusFehler(ctx, fehler); return false; }
  await schliesseAufgabe(aufgabe);
  protokolliere(ctx, `${t.titel} erschienen ✓`, `Termin: ${terminText(t.startAt)}`);
  ctx.melde({ title: `${t.titel} erschienen ✓` });
  return true;
}

/**
 * Status des Termins schreiben. `null` heisst gespeichert, sonst der Fehler.
 *
 * Buchung: ueber `setzeBuchungStatus`. Nahm sie den Ersatzweg, hat die
 * Datenbank die Termin-Zeile nicht mit abgehakt; das geschieht hier. Scheitert
 * nur das, bleibt der Status trotzdem gespeichert.
 */
async function schreibeTerminStatus(t: ErgebnisTermin, status: "wahrgenommen" | "nicht_erschienen"): Promise<unknown | null> {
  if (t.quelle === "buchung" && t.buchung) {
    const ergebnis = await setzeBuchungStatus(t.buchung.id, status);
    if (!ergebnis.ok) return ergebnis.fehler ?? new Error("Unbekannter Fehler");
    const aktivitaetId = t.buchung.aktivitaet_id || t.aktivitaet?.id;
    if (ergebnis.ersatzweg && aktivitaetId) {
      try { await setzeAktivitaetErledigt(aktivitaetId); }
      catch (fehler) { console.error("Termin-Zeile zur Buchung nicht abgehakt:", fehler); }
    }
    return null;
  }
  if (t.aktivitaet) {
    try { await setzeAktivitaetErledigt(t.aktivitaet.id); } catch (fehler) { return fehler ?? new Error("Unbekannter Fehler"); }
  }
  return null;
}

/** Die echte Meldung der Datenbank mit anzeigen, sonst bleibt die Ursache unsichtbar. */
export function statusFehlerText(fehler: unknown): string {
  const f = fehler as { message?: unknown; details?: unknown; hint?: unknown } | null;
  const teile = [f?.message, f?.details, f?.hint].filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return teile.length ? teile.join(" · ") : String(fehler ?? "Unbekannter Fehler");
}

function meldeStatusFehler(ctx: ErgebnisKontext, fehler: unknown) {
  console.error("Termin-Ergebnis nicht gespeichert:", fehler);
  ctx.melde({ title: "Der Status konnte nicht gespeichert werden", description: statusFehlerText(fehler), variant: "destructive" });
}

/** Die echte Aufgabe mit schliessen. Fehlschlaege sind still, der Termin selbst steht schon. */
async function schliesseAufgabe(aufgabe: { id: string } | null) {
  if (!aufgabe) return;
  try {
    await erledigeAufgabe(aufgabe.id);
  } catch (fehler) {
    console.error("Aufgabe zum Termin konnte nicht geschlossen werden:", fehler);
  }
}

/**
 * Einen Termin als nicht stattgefunden schliessen, ohne Folgekette.
 *
 * Buchung: Status "nicht_erschienen", die Datenbank hakt die Termin-Zeile mit
 * No-Show-Vermerk ab. Von Hand angelegtes Meeting: die Zeile wird
 * abgeschlossen. Die Aufgabe dazu (ueber `meetingAktivitaetId`) wird
 * "abgesagt", nicht "erledigt": Der Termin zaehlt nicht als gefuehrt.
 */
async function schliesseAlsNoShow(t: ErgebnisTermin, kundeId: string): Promise<unknown | null> {
  const aufgabe = aufgabeZumTermin(kundeId, t);
  const fehler = await schreibeTerminStatus(t, "nicht_erschienen");
  if (fehler !== null) return fehler;
  if (aufgabe) {
    try { await sageAufgabeAb(aufgabe.id); }
    catch (fehler) { console.error("Aufgabe zum Termin nicht abgesagt:", fehler); }
  }
  return null;
}

/**
 * Den No-Show am Kontakt je Termin merken und einen festen Termin zum selben
 * Zeitpunkt aus der Liste nehmen. Still bei Fehlern: Der No-Show selbst ist
 * zu diesem Zeitpunkt schon gespeichert.
 */
async function merkeNoShow(kundeId: string, kontakt: unknown, datum: string, uhrzeit: string) {
  try {
    const ergebnis = await mergeKontaktMetaMitGrund(
      kundeId,
      noShowMetaPatch(kontakt as Parameters<typeof noShowMetaPatch>[0], festerTerminSchluessel(datum, uhrzeit)),
    );
    if (!ergebnis.ok) console.error("No-Show am Kontakt nicht gemerkt:", "grund" in ergebnis ? ergebnis.grund : "");
  } catch (fehler) {
    console.error("No-Show am Kontakt nicht gemerkt:", fehler);
  }
}

/**
 * Alle offenen Termine des Kunden zu genau diesem Tag und dieser Uhrzeit als
 * No-Show schliessen (Buchung, Meeting, Aufgabe), ohne Folgekette.
 *
 * Fuer den festen Termin am Kontakt: Die Terminseite legt denselben Termin
 * zusaetzlich als Buchung mit Meeting und Aufgabe an. Ohne das stand er nach
 * dem No-Show weiter in "Naechste Aktion". Ohne Uhrzeit wird nichts
 * geschlossen, ein Tag allein ist zu unscharf.
 */
export async function schliesseOffeneTermineZumZeitpunkt(kundeId: string, datum: string, uhrzeit?: string): Promise<number> {
  if (!datum || !uhrzeit) return 0;
  let termine: ErgebnisTermin[] = [];
  try { termine = await ladeErgebnisTermine(kundeId, { rueckblickTage: null }); }
  catch (fehler) { console.error("Termine zum No-Show nicht geladen:", fehler); return 0; }
  const ziel = festerTerminSchluessel(datum, uhrzeit);
  let geschlossen = 0;
  for (const t of termine) {
    if (festerTerminSchluessel(lokalesDatum(t.startAt), lokaleUhrzeit(t.startAt)) !== ziel) continue;
    if ((await schliesseAlsNoShow(t, kundeId)) === null) geschlossen += 1;
  }
  return geschlossen;
}

/**
 * "Nicht erschienen": Status, Vermerk, NoShow-Stufe, Aufgabe zur Neuterminierung.
 *
 * Die Kette bleibt genau so, wie sie in der Ergebnis-Karte entstanden ist.
 * Sie steht nur noch an dieser einen Stelle.
 */
export async function terminNoShow(t: ErgebnisTermin, ctx: ErgebnisKontext): Promise<boolean> {
  const datum = lokalesDatum(t.startAt);
  const uhrzeit = lokaleUhrzeit(t.startAt);
  // Mit meta: Ohne sie schrieb `merkeNoShow` die Termin-Listen neu, nur mit
  // diesem einen Termin, siehe `mitKontaktMeta`.
  const gefunden = getKontaktById(ctx.kundeId);
  const kontakt = gefunden ? mitKontaktMeta(gefunden) : undefined;
  // Bestandsfall: Zu diesem Zeitpunkt ist der No-Show schon erfasst (etwa im
  // Kasten zum festen Termin). Dann nur schliessen, keine zweite Folgekette.
  const schonErfasst = noShowErfasst(kontakt, datum, uhrzeit);
  const fehler = await schliesseAlsNoShow(t, ctx.kundeId);
  if (fehler !== null) {
    meldeStatusFehler(ctx, fehler);
    return false;
  }
  // Gemerkt wird nur ein geplatztes Erst- oder Beratungsgespraech: Die
  // Liste zaehlt das rote No-Show-Banner im Kundenprofil.
  if ((t.buchung && NOSHOW_STUFE[t.buchung.anlass]) || /erstgespr|beratung/i.test(t.titel)) {
    await merkeNoShow(ctx.kundeId, kontakt, datum, uhrzeit);
  }
  if (schonErfasst) {
    ctx.melde({ title: "Termin geschlossen", description: "Der No-Show war schon erfasst, es entstehen keine neuen Aufgaben." });
    return true;
  }
  protokolliere(ctx, `❌ No-Show: ${t.titel} am ${terminText(t.startAt)}`);
  // Die Stufe folgt dem Anlass der Buchung, nicht dem Titel: Ein
  // umbenanntes Erstgespraech bleibt eines. Von Hand angelegte Meetings
  // tragen keinen Anlass, dort bleibt die Stufe wie bisher stehen.
  const noShowStufe = t.buchung ? NOSHOW_STUFE[t.buchung.anlass] : undefined;
  const stufeGesetzt = noShowStufe ? setzeNoShowStufe(ctx.kundeId, noShowStufe) : false;
  // Folgekette: Der Vertriebspartner bekommt sofort die Aufgabe, den Kunden
  // neu zu kontaktieren.
  void addGeteilteAufgabe({
    titel: `❌ No-Show: ${ctx.kundeName} – ${t.titel}`,
    beschreibung: `${ctx.kundeName} ist zum Termin „${t.titel}" am ${terminText(t.startAt)} nicht erschienen. Bitte neu kontaktieren und einen neuen Termin vereinbaren.`,
    prioritaet: "hoch",
    typ: "anruf",
    faellig_am: lokalesDatum(new Date()),
    uhrzeit: "09:00",
    kundeId: ctx.kundeId,
    kundeName: ctx.kundeName,
    zugewiesenAn: empfaenger(t, ctx),
    erstelltVonName: ctx.userName,
    ausloeserSchluessel: `termin_noshow_${t.key}`,
  });
  ctx.melde({
    title: "No-Show registriert",
    description: stufeGesetzt
      ? `Der Kunde steht jetzt auf „${noShowStufe === "eg_noshow" ? "EG NoShow" : "BG NoShow"}", und der Vertriebspartner hat eine Aufgabe zur Neuterminierung in der Inbox.`
      : "Der Vertriebspartner hat eine Aufgabe zur Neuterminierung in der Inbox.",
  });
  return true;
}

/** Der Tag vor dem neuen Termin, fruehestens heute. Ziel der Folgeaufgabe. */
function tagDavor(neuDatum: string): string {
  const d = new Date(`${neuDatum}T12:00:00`);
  if (Number.isNaN(d.getTime())) return neuDatum;
  d.setDate(d.getDate() - 1);
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  return lokalesDatum(d < heute ? heute : d);
}

/**
 * "Verschoben": neue Zeit eintragen, auf Wunsch mit Folgeaufgabe.
 *
 * Neu seit 09/2026 sind zwei Dinge. Erstens zieht der neue Zeitpunkt jetzt
 * auch die echte Aufgabe nach; vorher wanderte nur die Zeile im Verlauf, und
 * die Aktionsliste zeigte weiter den alten, laengst ueberfaelligen Termin.
 * Zweitens kann gleich eine Folgeaufgabe entstehen, die einen Tag vor dem
 * neuen Termin ans Erinnern denkt. Der Ausloeser-Schluessel traegt den neuen
 * Zeitpunkt, deshalb entsteht sie beim zweiten Klick nicht doppelt, wohl aber
 * bei einer erneuten Verschiebung.
 */
/**
 * Der Ausloeser-Schluessel der Folgeaufgabe zu einer Verschiebung.
 *
 * Er steht hier und nicht an den beiden Verwendungsstellen, weil er an zwei
 * Orten gebraucht wird: beim Anlegen der Aufgabe und beim Aufraeumen, wenn
 * der Termin geloescht wird. Zwei getrennte Schreibweisen laufen frueher oder
 * spaeter auseinander, und dann bleibt die Aufgabe still liegen, ohne dass
 * irgendetwas eine Fehlermeldung zeigt.
 */
export function verschiebeAufgabenPraefix(terminKey: string): string {
  return `termin_verschoben_${terminKey}_`;
}

export function verschiebeAufgabenSchluessel(terminKey: string, datum: string, uhrzeit: string): string {
  return `${verschiebeAufgabenPraefix(terminKey)}${datum}_${uhrzeit}`;
}

export async function terminVerschieben(
  t: ErgebnisTermin,
  neuDatum: string,
  neuUhrzeit: string,
  ctx: ErgebnisKontext,
  optionen: { folgeaufgabe?: boolean } = {},
): Promise<boolean> {
  if (!neuDatum || !neuUhrzeit) return false;
  const aufgabe = aufgabeZumTermin(ctx.kundeId, t);
  let ok = true;
  if (t.quelle === "buchung" && t.buchung) ok = await verschiebeBuchungIntern(t.buchung, meetingZeitISO(neuDatum, neuUhrzeit));
  else if (t.aktivitaet) { try { await verschiebeAktivitaetTermin(t.aktivitaet.id, neuDatum, neuUhrzeit); } catch { ok = false; } }
  if (!ok) { ctx.melde({ title: "Der Termin konnte nicht verschoben werden", variant: "destructive" }); return false; }
  if (aufgabe) {
    try { await updateAufgabe(aufgabe.id, { faelligAm: neuDatum, uhrzeit: neuUhrzeit }); }
    catch (fehler) { console.error("Aufgabe zum Termin nicht mitverschoben:", fehler); }
  }
  protokolliere(ctx, `🔁 ${t.titel} verschoben auf ${neuDatum} um ${neuUhrzeit}`);
  if (optionen.folgeaufgabe) {
    void addGeteilteAufgabe({
      titel: `🔁 Verschoben: ${ctx.kundeName} – ${t.titel}`,
      beschreibung: `„${t.titel}" wurde auf ${neuDatum} um ${neuUhrzeit} verschoben. Bitte den Kunden vorher erinnern und den Termin vorbereiten.`,
      prioritaet: "mittel",
      typ: "anruf",
      faellig_am: tagDavor(neuDatum),
      uhrzeit: "09:00",
      kundeId: ctx.kundeId,
      kundeName: ctx.kundeName,
      zugewiesenAn: empfaenger(t, ctx),
      erstelltVonName: ctx.userName,
      ausloeserSchluessel: verschiebeAufgabenSchluessel(t.key, neuDatum, neuUhrzeit),
    });
  }
  ctx.melde({
    title: "Termin verschoben ✓",
    description: optionen.folgeaufgabe
      ? `Neuer Termin: ${neuDatum} um ${neuUhrzeit}. Die Folgeaufgabe liegt am ${tagDavor(neuDatum)} in der Inbox.`
      : `Neuer Termin: ${neuDatum} um ${neuUhrzeit}`,
  });
  return true;
}
