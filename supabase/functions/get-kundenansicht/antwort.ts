/**
 * Die Kundenansicht („Objektübersicht“): wer sie sieht und was sie herausgibt.
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * `get-kundenansicht` bedient zwei Zugänge mit derselben Antwort (Bauplan
 * Kundenansicht vom 23.09.2026, freigegeben von Christian):
 *
 *   - den Kundenlink `/immobilie/<Schlüssel>`, ohne Anmeldung. Der Schlüssel
 *     steht in `objekt_exposes.token`, gilt aber nur für Zeilen der Art
 *     `objektuebersicht`, die gültig und nicht zurückgezogen sind.
 *   - die Vorschau „Als Kunde ansehen“ im CRM (Admin, Inhaber, Vertriebsleitung, Vertriebspartner), mit
 *     deren Anmeldung. Sie zählt nichts und läutet keine Glocke.
 *
 * Was du im Termin zeigst, ist damit genau das, was der Kunde bekommt.
 *
 * Hier stehen nur reine Regeln ohne Deno- oder Browser-Bezug, damit Vitest sie
 * prüfen kann (`src/lib/kundenansichtAntwort.test.ts`) und das Frontend die
 * Antworttypen mitliest.
 *
 * POSITIVLISTE, FELD FÜR FELD
 *
 * Grundlage ist die Positivliste des öffentlichen Exposés
 * (`_shared/expose-oeffentlich.ts`), hier bewusst enger und Feld für Feld
 * erweitert um das, was Kacheln und Objektdetails brauchen. Nie hinaus gehen:
 *
 *   - `unterlagenLink` an Objekt und Wohnung (Sammelordner mit allem)
 *   - `meta.dokumente` und jede Ablageadresse einer Unterlage; die Liste der
 *     Unterlagen trägt nur Namen, die Datei gibt es einzeln über „datei“
 *   - `kunde_*`, `vorgemerkt_*`, `belegung_*`, `reserviert_von`,
 *     `erstellt_von`, `exklusiv_partner`, `meta.verkaeuferDaten`,
 *     `meta.beraterName`
 *   - Provision und alle übrigen Investagon-Rohdaten, auch `files` (dort
 *     stehen Originaladressen bei Investagon) und der Verkaufsstand
 *     (`active`, `statusName`)
 *   - Verkaufsstand und Volumen: Reservierte und verkaufte Wohnungen stehen
 *     gar nicht erst in der Antwort, auch nicht als Zahl
 *
 * Unter einem erlaubten Schlüssel geht nur hinaus, was die erwartete Form hat:
 * Text, Zahl, Wahrheitswert, oder die bekannten Listen mit ihren bekannten
 * Feldern. Ein Objekt, das jemand unter einen erlaubten Namen schiebt, bleibt
 * drin.
 */
import { einheitAngebot, istImAngebot } from "../_shared/einheit-angebot.ts";
import { einheitBelegt, kundeGesetzt, vormerkungFuerAnderen } from "../_shared/einheit-vormerkung.ts";
import { hausBelegt, hausBelegungLesen, hausFremdVorgemerkt } from "../_shared/objekt-belegung.ts";
import { istGlobalobjekt } from "../_shared/globalobjekt.ts";
import { darfZumKunden, dokumentAmpel, dokumentOberbegriff, freigabeDokumentAusZeile } from "../_shared/dokument-freigabe.ts";
import { investagonKategorieAusRohdaten } from "../_shared/dokument-gruppen.ts";
import { hatKundenaktionsRolle } from "../_shared/kundenaktionen-rollen.ts";
import { istExposeToken, oeffentlicherAnsprechpartner } from "../_shared/expose-oeffentlich.ts";
import type { Sprache } from "../_shared/kunden-sprache.ts";
import { LINK_SPALTEN, linkZustand, type ExposeLinkZeile } from "../_shared/expose-kundenlink.ts";
import { ablageFuer, DATEI_GUELTIG_SEKUNDEN, istKennung, type Ablage } from "../_shared/kunden-ablage.ts";
import { kundenMeta, kundenRohdaten } from "../_shared/kunden-meta.ts";
export { kundenMeta, kundenRohdaten };
// Weiter von hier erreichbar, damit bestehende Aufrufer nichts umstellen müssen.
export { ablageFuer, DATEI_GUELTIG_SEKUNDEN, istKennung, type Ablage };

/* ────────────────────────────────────────────────────────────────────────
 * Grundwerte
 * ──────────────────────────────────────────────────────────────────────── */

/** Die Art der Zeile in `objekt_exposes`, die diese Function ausliefert. */
export const KUNDENANSICHT_ART = "objektuebersicht";

/**
 * Die Spalten der Linkzeile. `art` und `einstieg_wohnung_id` führt die
 * Migration 20260923171000 ein. Fehlen sie, meldet die Abfrage einen Fehler,
 * und dann gibt es noch keinen einzigen Link dieser Art: Die Function
 * antwortet „nicht gefunden“.
 */
export const KUNDENLINK_SPALTEN = `${LINK_SPALTEN}, art, einstieg_wohnung_id`;

/**
 * Dieselben mit der Wohnungsauswahl (Migration 20261005100000). Fehlt die
 * Spalte, liest die Function ohne sie weiter: Dann kann noch kein Link eine
 * Auswahl tragen, und jeder zeigt wie bisher alle freien Wohnungen.
 */
export const KUNDENLINK_SPALTEN_MIT_AUSWAHL = `${KUNDENLINK_SPALTEN}, wohnung_auswahl`;

export interface KundenlinkZeile extends ExposeLinkZeile {
  art?: string | null;
  einstieg_wohnung_id?: string | null;
  wohnung_auswahl?: unknown;
}

/**
 * Die Wohnungen, die der Kunde über diesen Link sehen darf (Christian,
 * 05.10.2026). `null` heißt: keine Auswahl, alle freien Wohnungen, so wie
 * jeder Link vor der Auswahl. Eine Liste schränkt ein, auch eine leere oder
 * eine mit kaputten Einträgen: Was nicht lesbar ist, gibt nichts frei.
 */
export function auswahlLesen(wert: unknown): string[] | null {
  if (wert === null || wert === undefined) return null;
  if (!Array.isArray(wert)) return [];
  return wert.filter(istKennung);
}

/** Wie das Haus zu zeigen ist. Dieselbe Einteilung wie `objektStruktur` im CRM. */
export type Struktur = "globalobjekt" | "einzelwohnung" | "mehrere_einheiten";

/**
 * Was aus der Wohnung geworden ist, bei der der Link einsteigt.
 *
 *   keiner                der Link steigt beim Haus ein
 *   frei                  die Wohnung ist frei und im Angebot
 *   fuer_dich_reserviert  sie ist für genau diesen Kunden reserviert
 *   vergeben              reserviert, verkauft, fremd vorgemerkt oder nicht
 *                         mehr im Angebot. Der Kunde sieht dann einen Hinweis
 *                         und die freien Wohnungen.
 */
export type EinstiegZustand = "keiner" | "frei" | "fuer_dich_reserviert" | "vergeben";

/* ────────────────────────────────────────────────────────────────────────
 * Kleine Helfer
 * ──────────────────────────────────────────────────────────────────────── */

function alsObjekt(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function textWert(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

function zahlWert(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Nur Text, Zahl, Wahrheitswert oder leer. Alles andere gilt als nicht vorhanden. */
function istSchlicht(v: unknown): boolean {
  return v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
}

/** Die erlaubten schlichten Felder aus einer Quelle. */
function schlichteFelder(quelle: Record<string, unknown> | undefined, erlaubt: readonly string[]): Record<string, unknown> {
  const ziel: Record<string, unknown> = {};
  if (!quelle) return ziel;
  for (const schluessel of erlaubt) {
    if (schluessel in quelle && istSchlicht(quelle[schluessel])) ziel[schluessel] = quelle[schluessel];
  }
  return ziel;
}

/* ────────────────────────────────────────────────────────────────────────
 * Die Anfrage
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Die Vorschau darf eine Wohnungsauswahl mitbringen, damit sie zeigt, was
 * der Link zeigen wird. Der Kundenlink nie: Seine Auswahl steht nur an der
 * Linkzeile, eine Angabe in der Anfrage wird übergangen.
 */
export type Zugang =
  | { art: "link"; token: string }
  | { art: "vorschau"; objektId: string; investmentId: string | null; auswahl: string[] | null };

/** Welche Datei gemeint ist. Genau die drei Angaben aus der Liste. */
export interface DokumentVerweis {
  bereich: "objekt" | "wohnung";
  wohnungId: string | null;
  id: string;
}

export type Anfrage =
  | { aktion: "laden"; zugang: Zugang; wohnungId: string | null; aufruf: boolean }
  | { aktion: "datei"; zugang: Zugang; wohnungId: string | null; dokument: DokumentVerweis };

/**
 * Den Rumpf der Anfrage lesen. Was nicht passt, ist `null`, und die Function
 * antwortet mit 400, ohne zu sagen, woran es lag.
 *
 * Mit `token` ist es der Kundenlink, sonst die Vorschau mit `objektId`. Die
 * Vorschau prüft die Function erst danach, über die Anmeldung.
 */
export function pruefeAnfrage(body: unknown): Anfrage | null {
  const b = alsObjekt(body);
  if (!b) return null;
  const aktion = b.aktion === "datei" ? "datei" : b.aktion === "laden" || b.aktion === undefined ? "laden" : null;
  if (!aktion) return null;

  let zugang: Zugang;
  if (b.token !== undefined && b.token !== null && b.token !== "") {
    if (!istExposeToken(b.token)) return null;
    zugang = { art: "link", token: b.token };
  } else {
    if (!istKennung(b.objektId)) return null;
    const investmentId = b.investmentId === undefined || b.investmentId === null || b.investmentId === ""
      ? null
      : istKennung(b.investmentId) ? b.investmentId : undefined;
    if (investmentId === undefined) return null;
    let auswahl: string[] | null = null;
    if (b.wohnungAuswahl !== undefined && b.wohnungAuswahl !== null) {
      if (!Array.isArray(b.wohnungAuswahl) || !b.wohnungAuswahl.every(istKennung)) return null;
      auswahl = b.wohnungAuswahl;
    }
    zugang = { art: "vorschau", objektId: b.objektId, investmentId, auswahl };
  }

  const wohnungId = b.wohnungId === undefined || b.wohnungId === null || b.wohnungId === ""
    ? null
    : istKennung(b.wohnungId) ? b.wohnungId : undefined;
  if (wohnungId === undefined) return null;

  if (aktion === "laden") return { aktion, zugang, wohnungId, aufruf: b.aufruf === true };

  const d = alsObjekt(b.dokument);
  if (!d || (d.bereich !== "objekt" && d.bereich !== "wohnung") || !istKennung(d.id)) return null;
  const dokWohnung = d.wohnungId === undefined || d.wohnungId === null || d.wohnungId === ""
    ? null
    : istKennung(d.wohnungId) ? d.wohnungId : undefined;
  if (dokWohnung === undefined) return null;
  if (d.bereich === "wohnung" && !dokWohnung) return null;
  return { aktion, zugang, wohnungId, dokument: { bereich: d.bereich, wohnungId: d.bereich === "wohnung" ? dokWohnung : null, id: d.id } };
}

/* ────────────────────────────────────────────────────────────────────────
 * Link und Vorschau
 * ──────────────────────────────────────────────────────────────────────── */

export type LinkPruefung = "unbekannt" | "abgelaufen" | "gueltig";

/**
 * Taugt die Zeile als Kundenlink der Objektübersicht?
 *
 * Nur die Art `objektuebersicht`. Ein Exposé-Schlüssel öffnet hier nichts, und
 * eine Zeile ohne Art (vor der Migration) auch nicht: Solche Zeilen sind
 * immer Exposés. Zurückgezogen gilt wie abgelaufen (`linkZustand`).
 */
export function linkPruefen(zeile: KundenlinkZeile | null | undefined, jetzt: number = Date.now()): LinkPruefung {
  if (!zeile || textWert(zeile.art) !== KUNDENANSICHT_ART) return "unbekannt";
  return linkZustand(zeile, jetzt);
}

/**
 * Die Spalte in `investments`, die den Kunden nennt. Sie heißt `kunde_id`
 * (uuid), nicht `kontakt_id`. Verglichen wird nur Kennung mit Kennung, nie
 * über einen Umweg als Text.
 */
export const INVESTMENT_KUNDE_SPALTE = "kunde_id";

/** Der Kunde eines Investments aus der gelesenen Zeile, sonst nichts. */
export function kundeAusInvestment(zeile: unknown): string | null {
  const wert = alsObjekt(zeile)?.[INVESTMENT_KUNDE_SPALTE];
  return istKennung(wert) ? wert : null;
}

/**
 * Darf der Aufrufer die Vorschau sehen? Admin, Inhaber, Vertriebsleitung und
 * Vertriebspartner (Christians Go vom 05.10.2026, vorher nur Admin und
 * Inhaber), dieselbe Liste wie die Knöpfe (`kundenaktionen-rollen.ts`).
 * Gelesen werden die zugewiesenen Rollen aus `user_roles`, nie etwas aus der
 * Anfrage. Den Kundenbezug über `investmentId` bekommt ein Partner nur für
 * eigene und vertretene Kunden, das prüft `index.ts`.
 */
export function vorschauErlaubt(rollen: unknown): boolean {
  return hatKundenaktionsRolle(rollen);
}

/* ────────────────────────────────────────────────────────────────────────
 * Welche Wohnungen der Kunde sieht
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Das Haus als Ganzes oder in Wohnungen?
 *
 * Maßgeblich ist der Schalter `global_objekt`, dann `meta.einzelwohnung`,
 * sonst die Zahl ALLER Einheiten, auch der vergebenen. Ein Haus mit zehn
 * Wohnungen, von denen noch eine frei ist, bleibt ein Haus.
 */
export function kundenStruktur(objekt: Record<string, unknown>, anzahlEinheiten: number): Struktur {
  if (istGlobalobjekt(objekt as { global_objekt?: boolean | null })) return "globalobjekt";
  if (alsObjekt(objekt.meta)?.einzelwohnung === true || anzahlEinheiten <= 1) return "einzelwohnung";
  return "mehrere_einheiten";
}

export type Sichtbarkeit = "frei" | "fuer_dich" | "nein";

/**
 * Wie eine Wohnung für diesen Kunden dasteht.
 *
 * Frei heißt dasselbe wie intern (`istImAngebot`): in Investagon online und
 * nicht verkauft, im CRM weder reserviert noch verkauft, ohne Kunden. Dazu
 * darf sie nicht gerade für einen anderen Kunden vorgemerkt sein.
 *
 * „Für dich“ ist sie, wenn sie im CRM für genau diesen Kunden reserviert ist.
 * Verglichen werden nur Kennungen, ein Name geht nie hinaus. Verkauft zählt
 * nie dazu, auch nicht an ihn.
 */
export function wohnungSichtbarkeit(
  zeile: Record<string, unknown>,
  kontaktId: string | null | undefined,
  jetzt: Date = new Date(),
): Sichtbarkeit {
  const status = textWert(zeile.status);
  const kunde = textWert(zeile.kunde_id);
  const roh = alsObjekt(zeile.meta)?.investagonRaw;
  if (einheitBelegt(status) || kundeGesetzt(kunde)) {
    const reserviert = ["reserviert", "gesetzt"].includes(status.toLowerCase());
    const kontakt = textWert(kontaktId);
    return reserviert && !!kontakt && kunde === kontakt && einheitAngebot(roh) !== "verkauft" ? "fuer_dich" : "nein";
  }
  if (!istImAngebot(status, roh)) return "nein";
  const vorgemerkt = vormerkungFuerAnderen(
    { vorgemerktBis: textWert(zeile.vorgemerkt_bis) || null, vorgemerktKundeId: textWert(zeile.vorgemerkt_kunde_id) || null },
    textWert(kontaktId) || null,
    jetzt,
  );
  return vorgemerkt ? "nein" : "frei";
}

/**
 * Wie das ganze Haus (Globalobjekt) für diesen Kunden dasteht. Dieselben
 * Regeln wie bei einer Wohnung, nur an `objekte.belegung`. Fehlen die Spalten
 * (Migration 20260923152000 nicht gelaufen), ist das Haus frei.
 */
export function hausSichtbarkeit(
  objekt: Record<string, unknown>,
  kontaktId: string | null | undefined,
  jetzt: Date = new Date(),
): Sichtbarkeit {
  const belegung = hausBelegungLesen(objekt.belegung);
  const kunde = textWert(objekt.belegung_kunde_id);
  const kontakt = textWert(kontaktId);
  if (hausBelegt({ belegung, kundeId: kunde || null })) {
    return belegung === "reserviert" && !!kontakt && kunde === kontakt ? "fuer_dich" : "nein";
  }
  const fremd = hausFremdVorgemerkt(
    { vorgemerktBis: textWert(objekt.vorgemerkt_bis) || null, vorgemerktKundeId: textWert(objekt.vorgemerkt_kunde_id) || null },
    kontakt || null,
    jetzt,
  );
  return fremd ? "nein" : "frei";
}

export interface WohnungsAuswahl {
  /** Die Zeilen, die der Kunde sieht, in Reihenfolge der Einheitennummer. */
  sichtbar: Array<{ zeile: Record<string, unknown>; fuerDich: boolean }>;
  einstieg: { wohnungId: string | null; zustand: EinstiegZustand };
  /** Beim Globalobjekt und beim Einzelobjekt: Gibt es gar nichts mehr zu zeigen? */
  nichtsMehrDa: boolean;
}

/** „WE 2“ vor „WE 10“. */
function nachNummer(a: Record<string, unknown>, b: Record<string, unknown>): number {
  return textWert(a.we_nr).localeCompare(textWert(b.we_nr), "de", { numeric: true, sensitivity: "base" });
}

/**
 * Welche Wohnungen hinausgehen, und was aus der Einstiegswohnung wurde.
 *
 *   - Mehrere Wohnungen: alle freien. Die Einstiegswohnung zusätzlich, wenn
 *     sie für genau diesen Kunden reserviert ist. Jede andere reservierte
 *     Wohnung fehlt, auch die, die für ihn reserviert ist, aber nicht der
 *     Einstieg ist (Entscheidung vom 23.09.2026, Frage 2).
 *   - Einzelobjekt: die eine Wohnung, sie ist immer der Einstieg. Ist sie
 *     vergeben, gibt es nichts mehr zu zeigen.
 *   - Globalobjekt: verkauft wird das Haus. Die Einheiten gehen nur für den
 *     Mietenspiegel hinaus, alle, aber ohne Preise (siehe `kundenWohnung`).
 *     Ist das Haus vergeben, gibt es nichts mehr zu zeigen.
 *
 * `auswahl` (seit dem 05.10.2026): Trägt der Link eine Wohnungsauswahl, gilt
 * alles oben nur noch für diese Wohnungen. Jede andere fehlt, als gäbe es sie
 * nicht, auch wenn jemand ihre Kennung in die Adresse schreibt. Wird eine
 * gewählte reserviert oder verkauft, fällt sie wie bisher weg. Beim
 * Globalobjekt gibt es keine Auswahl, verkauft wird das Haus.
 */
export function wohnungsAuswahl(e: {
  struktur: Struktur;
  objekt: Record<string, unknown>;
  wohnungen: Array<Record<string, unknown>>;
  kontaktId: string | null;
  einstiegId: string | null;
  auswahl?: string[] | null;
  /**
   * Fremd-exklusive Einheiten (05.10.2026). Sie fehlen in der Verkaufsliste;
   * Struktur und beim Globalobjekt der Mietenspiegel zählen weiter alle.
   */
  ausgeschlossen?: ReadonlySet<string>;
  jetzt?: Date;
}): WohnungsAuswahl {
  const jetzt = e.jetzt ?? new Date();
  const gewaehlt = e.auswahl ? new Set(e.auswahl) : null;
  const alle = [...e.wohnungen]
    .filter((w) => istKennung(w.id) && (e.struktur === "globalobjekt"
      || ((!gewaehlt || gewaehlt.has(w.id)) && !e.ausgeschlossen?.has(w.id))))
    .sort(nachNummer);

  if (e.struktur === "globalobjekt") {
    const haus = hausSichtbarkeit(e.objekt, e.kontaktId, jetzt);
    return {
      sichtbar: haus === "nein" ? [] : alle.map((zeile) => ({ zeile, fuerDich: false })),
      einstieg: { wohnungId: null, zustand: haus === "fuer_dich" ? "fuer_dich_reserviert" : haus === "frei" ? "keiner" : "vergeben" },
      nichtsMehrDa: haus === "nein",
    };
  }

  const einstiegId = e.struktur === "einzelwohnung"
    ? (alle.find((w) => w.id === e.einstiegId)?.id as string | undefined) ?? (alle[0]?.id as string | undefined) ?? null
    : e.einstiegId;

  const sichtbar: WohnungsAuswahl["sichtbar"] = [];
  let zustand: EinstiegZustand = einstiegId ? "vergeben" : "keiner";
  for (const zeile of alle) {
    const s = wohnungSichtbarkeit(zeile, e.kontaktId, jetzt);
    const istEinstieg = !!einstiegId && zeile.id === einstiegId;
    if (s === "frei") {
      sichtbar.push({ zeile, fuerDich: false });
      if (istEinstieg) zustand = "frei";
    } else if (s === "fuer_dich" && istEinstieg) {
      sichtbar.push({ zeile, fuerDich: true });
      zustand = "fuer_dich_reserviert";
    }
  }
  // Eine Einstiegswohnung, die es gar nicht mehr gibt, ist ein Einstieg beim Haus.
  if (einstiegId && !alle.some((w) => w.id === einstiegId)) zustand = "keiner";

  return {
    sichtbar,
    einstieg: { wohnungId: zustand === "keiner" ? null : einstiegId, zustand },
    nichtsMehrDa: e.struktur === "einzelwohnung" && sichtbar.length === 0,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Die Positivliste
 * ──────────────────────────────────────────────────────────────────────── */

/** Spalten des Objekts für jede Art. */
const OBJEKT_SPALTEN = [
  "id", "titel", "adresse", "plz", "ort", "beschreibung", "bild_url", "badge", "global_objekt",
  "global_baujahr", "global_etagen", "global_gesamt_qm", "global_grundstueck_qm",
  "global_hausgeld_monat", "global_kaufnebenkosten", "global_zustand", "global_energieeffizienzklasse",
  "afa_modell", "afa_satz", "restnutzungsdauer", "grundstueck_anteil", "bodenrichtwert",
  "erhaltungsaufwand", "erhaltungsaufwand_jahre", "sanierungskosten",
] as const;

/**
 * Preis und Miete des ganzen Hauses. Nur beim Globalobjekt, dort sind sie
 * das Angebot. Bei einem Haus mit einzelnen Wohnungen wären sie das Volumen.
 */
const OBJEKT_SPALTEN_GLOBAL = [
  "global_verkaufspreis", "global_jahresnettomiete", "global_rendite", "global_stellplaetze", "global_vermietungsstand",
] as const;

/**
 * Spalten einer Wohnung. `status` kommt nicht aus der Zeile, sondern aus der
 * Auswahl: „frei“ oder, für die Einstiegswohnung dieses Kunden, „reserviert“.
 */
const WOHNUNG_SPALTEN = ["id", "objekt_id", "we_nr", "etage", "lage", "groesse", "zimmer", "miete_gesamt", "vk_gesamt", "qm_preis", "rendite", "vermietet"] as const;

/** Beim Globalobjekt nur, was der Mietenspiegel braucht: keine Einzelpreise. */
const WOHNUNG_SPALTEN_GLOBAL = ["id", "objekt_id", "we_nr", "etage", "lage", "groesse", "zimmer", "miete_gesamt", "vermietet"] as const;

// Die Positivliste für `meta` steht seit dem 28.09.2026 in `_shared/kunden-meta.ts`,
// weil auch der OS Lotse sie nutzt. Unverändert, hier nur weitergereicht.

/** Das Objekt für die Antwort. */
export function kundenObjekt(row: Record<string, unknown>, struktur: Struktur): Record<string, unknown> {
  const ziel = schlichteFelder(row, OBJEKT_SPALTEN);
  if (struktur === "globalobjekt") Object.assign(ziel, schlichteFelder(row, OBJEKT_SPALTEN_GLOBAL));
  // Eine Adresse, die kein https ist, zeigt der Browser ohnehin nicht an.
  if (typeof ziel.bild_url === "string" && !/^https:\/\//i.test(ziel.bild_url)) delete ziel.bild_url;
  ziel.meta = kundenMeta(row.meta, "objekt");
  return ziel;
}

export interface KundenBild {
  id: string;
  url: string;
  alt: string;
  reihenfolge: number;
}

/**
 * Bilder: nur Kennung, Adresse, Beschriftung und Reihenfolge, nur https.
 * Doppelte Adressen fallen weg, die erste gewinnt.
 */
export function kundenBilder(...quellen: unknown[]): KundenBild[] {
  const gesehen = new Set<string>();
  const ziel: KundenBild[] = [];
  for (const quelle of quellen) {
    for (const eintrag of Array.isArray(quelle) ? quelle : []) {
      const b = alsObjekt(eintrag);
      const url = textWert(b?.url);
      if (!b || !/^https:\/\//i.test(url) || gesehen.has(url)) continue;
      gesehen.add(url);
      ziel.push({ id: textWert(b.id) || url, url, alt: textWert(b.alt), reihenfolge: zahlWert(b.reihenfolge) ?? ziel.length });
    }
  }
  return ziel;
}

/** Eine Wohnung für die Antwort, samt ihrer Bilder und dem Merker „für dich“. */
export function kundenWohnung(row: Record<string, unknown>, e: { struktur: Struktur; fuerDich: boolean }): Record<string, unknown> {
  if (e.struktur === "globalobjekt") {
    return { ...schlichteFelder(row, WOHNUNG_SPALTEN_GLOBAL), status: "frei", meta: kundenMeta(row.meta, "wohnung_global"), bilder: [] };
  }
  return {
    ...schlichteFelder(row, WOHNUNG_SPALTEN),
    status: e.fuerDich ? "reserviert" : "frei",
    ...(e.fuerDich ? { fuerDich: true } : {}),
    meta: kundenMeta(row.meta, "wohnung"),
    bilder: kundenBilder(alsObjekt(row.meta)?.bilder, row.wohnungs_bilder),
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Unterlagen
 * ──────────────────────────────────────────────────────────────────────── */

/** Was die Seite von einer Unterlage erfährt: nie eine Adresse. */
export interface KundenDokument {
  id: string;
  bereich: "objekt" | "wohnung";
  wohnungId: string | null;
  name: string;
  oberbegriff: string;
  /** Die Investagon-Kategorie, damit die Liste gleich gruppiert wie intern. */
  investagonKategorie?: string;
  /** Die Dateiendung, etwa „pdf“. Für Vorschau und Dateinamen. */
  endung: string;
  /**
   * Die Entscheidung von Admin oder Inhaber, nur wenn sie „frei“ lautet, und
   * „geschwärzt geprüft“, nur wenn gesetzt. Die Dokumentenansicht prüft im
   * Kundenmodus die Ampel noch einmal (`darfZumKunden`); ohne diese beiden
   * Angaben fiele dort eine freigegebene gelbe Unterlage wieder heraus.
   */
  kundenFreigabe?: "frei";
  geschwaerzt?: true;
}

/** Eine zurückgehaltene Unterlage, ohne Namen: Die Seite sagt nur, dass es sie gibt. */
export interface Zurueckgehalten {
  bereich: "objekt" | "wohnung";
  wohnungId: string | null;
  rot: boolean;
}

/** Die Endung aus einem Pfad oder Namen. Reine Ziffern zählen nicht, „2010“ ist ein Jahr. */
export function dateiEndung(wert: string): string {
  const letztes = (wert || "").split(/[?#]/)[0].split("/").pop() || "";
  const treffer = letztes.match(/\.([a-z0-9]{2,5})$/i);
  return treffer && /[a-z]/i.test(treffer[1]) ? treffer[1].toLowerCase() : "";
}

export interface UnterlagenQuelle {
  bereich: "objekt" | "wohnung";
  wohnungId: string | null;
  /** Zeilen aus `objekt_dokumente` beziehungsweise `wohnungs_dokumente`. */
  zeilen: unknown;
  /** Einträge aus `wohnungen.meta.dokumente`. Eine Freigabe darin zählt nicht. */
  metaEintraege?: unknown;
  /** `meta.investagonRaw` von Objekt beziehungsweise Einheit, für die Kategorie. */
  investagonRoh?: unknown;
}

/** Eine Unterlage mit ihrer Ablage, nur im Server. */
export interface DokumentIntern extends KundenDokument {
  ablage: Ablage;
}

/**
 * Die Unterlagen eines Bereichs nach der Ampel (`_shared/dokument-freigabe.ts`).
 *
 * Tabelle und `meta.dokumente` werden wie im Exposé über Adresse und Kennung
 * zusammengeführt, die Tabellenzeile gewinnt: Eine alte Kopie in `meta`
 * brächte sonst eine Unterlage zurück, die Admin oder Inhaber gesperrt haben.
 *
 * Hinaus geht nur, was die Ampel erlaubt UND im eigenen Speicher liegt. Was
 * die Ampel zurückhält, zählt in `zurueckgehalten`, ohne Namen.
 */
export function kundenUnterlagen(q: UnterlagenQuelle): { dokumente: DokumentIntern[]; zurueckgehalten: Zurueckgehalten[] } {
  const kategorieFuer = investagonKategorieAusRohdaten(q.investagonRoh);
  const kandidaten = new Map<string, { zeile: Record<string, unknown>; herkunft: "tabelle" | "meta" }>();
  const tabellenIds = new Set<string>();
  for (const roh of Array.isArray(q.zeilen) ? q.zeilen : []) {
    const zeile = alsObjekt(roh);
    const url = textWert(zeile?.url);
    if (!zeile || !url || url === "__gallery__") continue;
    kandidaten.set(url, { zeile, herkunft: "tabelle" });
    const id = textWert(zeile.id);
    if (id) tabellenIds.add(id);
  }
  for (const roh of Array.isArray(q.metaEintraege) ? q.metaEintraege : []) {
    const zeile = alsObjekt(roh);
    const url = textWert(zeile?.url);
    if (!zeile || !url || url === "__gallery__" || kandidaten.has(url) || tabellenIds.has(textWert(zeile.id))) continue;
    kandidaten.set(url, { zeile, herkunft: "meta" });
  }

  const dokumente: DokumentIntern[] = [];
  const zurueckgehalten: Zurueckgehalten[] = [];
  const vergeben = new Set<string>();
  for (const { zeile, herkunft } of kandidaten.values()) {
    const name = textWert(zeile.name);
    const id = textWert(zeile.id);
    const investagonKategorie = kategorieFuer(name);
    const freigabe = freigabeDokumentAusZeile(zeile, herkunft, investagonKategorie);
    if (!darfZumKunden(freigabe)) {
      zurueckgehalten.push({ bereich: q.bereich, wohnungId: q.wohnungId, rot: dokumentAmpel(freigabe) === "rot" });
      continue;
    }
    const ablage = ablageFuer(zeile.url);
    // Ohne Namen oder Kennung lässt sich die Datei weder zeigen noch wiederfinden.
    if (!ablage || !name || !istKennung(id) || vergeben.has(id)) continue;
    vergeben.add(id);
    dokumente.push({
      id,
      bereich: q.bereich,
      wohnungId: q.wohnungId,
      name,
      oberbegriff: dokumentOberbegriff(freigabe),
      ...(investagonKategorie ? { investagonKategorie } : {}),
      endung: dateiEndung(ablage.pfad) || dateiEndung(name),
      ...(freigabe.kundenFreigabe === "frei" ? { kundenFreigabe: "frei" as const } : {}),
      ...(freigabe.geschwaerzt ? { geschwaerzt: true as const } : {}),
      ablage,
    });
  }
  return { dokumente, zurueckgehalten };
}

/** Die Unterlage ohne ihre Ablage, so wie sie in die Antwort geht. */
export function ohneAblage(d: DokumentIntern): KundenDokument {
  const { ablage: _ablage, ...rest } = d;
  return rest;
}

/** Die gemeinte Unterlage aus der geprüften Liste, oder nichts. */
export function findeDokument(liste: DokumentIntern[], verweis: DokumentVerweis): DokumentIntern | undefined {
  return liste.find((d) => d.id === verweis.id && d.bereich === verweis.bereich && (d.wohnungId || null) === (verweis.wohnungId || null));
}

/* ────────────────────────────────────────────────────────────────────────
 * Die Antwort
 * ──────────────────────────────────────────────────────────────────────── */

export type KundenPartner = NonNullable<ReturnType<typeof oeffentlicherAnsprechpartner>>;

/** Die vier Angaben des Partners, dieselbe Auswahl wie im Exposé. */
export function kundenPartner(profil: unknown): KundenPartner | undefined {
  return oeffentlicherAnsprechpartner(profil);
}

export interface KundenansichtAntwort {
  art: typeof KUNDENANSICHT_ART;
  struktur: Struktur;
  objekt: Record<string, unknown>;
  bilder: KundenBild[];
  wohnungen: Array<Record<string, unknown>>;
  einstieg: { wohnungId: string | null; zustand: EinstiegZustand };
  dokumente: KundenDokument[];
  zurueckgehalten: Zurueckgehalten[];
  ansprechpartner?: KundenPartner;
  /** Zeitpunkt der Antwort, für „Stand“ im Fuß. */
  stand: string;
  /** Die Sprache des Kunden am Link (Plan Kundensprache, Etappe 3). Fehlt ohne Kontakt. */
  sprache?: Sprache;
}

/** Nichts mehr zu zeigen: Das Haus oder die eine Wohnung ist vergeben. */
export interface VergebenAntwort {
  vergeben: true;
  struktur: Struktur;
  ansprechpartner?: KundenPartner;
  sprache?: Sprache;
}

/** Abgelaufen oder zurückgezogen: nur der Partner. */
export interface AbgelaufenAntwort {
  abgelaufen: true;
  ansprechpartner?: KundenPartner;
  sprache?: Sprache;
}

export function abgelaufenAntwort(partner: KundenPartner | undefined, sprache?: Sprache): AbgelaufenAntwort {
  return { abgelaufen: true, ...(partner ? { ansprechpartner: partner } : {}), ...(sprache ? { sprache } : {}) };
}

export function vergebenAntwort(struktur: Struktur, partner: KundenPartner | undefined, sprache?: Sprache): VergebenAntwort {
  return { vergeben: true, struktur, ...(partner ? { ansprechpartner: partner } : {}), ...(sprache ? { sprache } : {}) };
}

/**
 * Die ganze Antwort aus den gelesenen Zeilen. Alles, was hinausgeht, läuft
 * hier durch die Positivliste.
 */
export function baueAntwort(e: {
  objekt: Record<string, unknown>;
  objektBilder: unknown;
  wohnungen: Array<Record<string, unknown>>;
  objektDokumente: unknown;
  kontaktId: string | null;
  einstiegId: string | null;
  /** Die Wohnungsauswahl des Links, `null` für alle freien. */
  auswahl?: string[] | null;
  /** Fremd-exklusive Einheiten, siehe `wohnungsAuswahl`. */
  ausgeschlossen?: ReadonlySet<string>;
  partner: KundenPartner | undefined;
  /** Die Sprache des Kunden, wenn am Link ein Kontakt hängt. */
  sprache?: Sprache;
  jetzt?: Date;
}): KundenansichtAntwort | VergebenAntwort {
  const jetzt = e.jetzt ?? new Date();
  const struktur = kundenStruktur(e.objekt, e.wohnungen.length);
  const auswahl = wohnungsAuswahl({
    struktur, objekt: e.objekt, wohnungen: e.wohnungen, kontaktId: e.kontaktId, einstiegId: e.einstiegId, auswahl: e.auswahl,
    ausgeschlossen: e.ausgeschlossen, jetzt,
  });
  if (auswahl.nichtsMehrDa) return vergebenAntwort(struktur, e.partner, e.sprache);

  const unterlagen = alleUnterlagen({ struktur, objekt: e.objekt, objektDokumente: e.objektDokumente, sichtbar: auswahl.sichtbar.map((s) => s.zeile) });
  return {
    art: KUNDENANSICHT_ART,
    struktur,
    objekt: kundenObjekt(e.objekt, struktur),
    bilder: kundenBilder(e.objektBilder),
    wohnungen: auswahl.sichtbar.map(({ zeile, fuerDich }) => kundenWohnung(zeile, { struktur, fuerDich })),
    einstieg: auswahl.einstieg,
    dokumente: unterlagen.dokumente.map(ohneAblage),
    zurueckgehalten: unterlagen.zurueckgehalten,
    ...(e.partner ? { ansprechpartner: e.partner } : {}),
    stand: jetzt.toISOString(),
    ...(e.sprache ? { sprache: e.sprache } : {}),
  };
}

/**
 * Alle Unterlagen, die der Kunde gerade sehen darf: die des Hauses und die
 * jeder sichtbaren Wohnung. Beim Globalobjekt nur die des Hauses, dort gibt
 * es keine Wohnungsebene. Dieselbe Liste prüft „datei“ vor jeder Adresse.
 */
export function alleUnterlagen(e: {
  struktur: Struktur;
  objekt: Record<string, unknown>;
  objektDokumente: unknown;
  sichtbar: Array<Record<string, unknown>>;
}): { dokumente: DokumentIntern[]; zurueckgehalten: Zurueckgehalten[] } {
  const haus = kundenUnterlagen({
    bereich: "objekt", wohnungId: null, zeilen: e.objektDokumente, investagonRoh: alsObjekt(e.objekt.meta)?.investagonRaw,
  });
  if (e.struktur === "globalobjekt") return haus;
  const dokumente = [...haus.dokumente];
  const zurueckgehalten = [...haus.zurueckgehalten];
  for (const w of e.sichtbar) {
    const meta = alsObjekt(w.meta);
    const einheit = kundenUnterlagen({
      bereich: "wohnung",
      wohnungId: textWert(w.id),
      zeilen: w.wohnungs_dokumente,
      metaEintraege: meta?.dokumente,
      investagonRoh: meta?.investagonRaw,
    });
    dokumente.push(...einheit.dokumente);
    zurueckgehalten.push(...einheit.zurueckgehalten);
  }
  return { dokumente, zurueckgehalten };
}
