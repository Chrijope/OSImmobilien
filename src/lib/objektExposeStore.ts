/**
 * Datensatz je Exposé (Tabelle `objekt_exposes`, Migration 20260902200000).
 *
 * Bewusst ein direkter Supabase-Zugriff und nicht `dataCache`: Die Tabelle
 * entsteht erst mit der Migration, und eine fehlende Tabelle in der
 * Ladeliste des Zwischenspeichers reißt beim Start den Realtime-Kanal mit
 * (siehe abwesenheitStore.ts). Solange die Migration nicht gelaufen ist,
 * melden die Funktionen `migrationFehlt`, und die Exposé-Seite zeigt alles
 * an, nur ohne Speichern.
 */
import { supabase } from "@/integrations/supabase/client";
import { istTabelleUnbekannt } from "@/lib/abwesenheitStore";
import { cacheGet } from "@/lib/dataCache";
import { type InvestmentZeileMitSa, type SaDaten } from "@/lib/saQuelle";
import { ANNAHMEN_HERKUNFT, type ExposeAnnahmen } from "@/lib/exposeAnnahmen";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import {
  EXPOSE_VERSAND_MIGRATION_FEHLT, exposeBezeichnung, KUNDEN_EXPOSE_BASIS, KUNDENLINK_AUSWAHL_MIGRATION_FEHLT, KUNDENLINK_MIGRATION_FEHLT,
  kundenansichtLink as kundenansichtLinkGemeinsam, kundenExposeLink as kundenExposeLinkGemeinsam,
  kundenlinkFuer, versandSpalteFehlt, type KundenlinkArt,
} from "../../supabase/functions/_shared/kunden-expose";

export type { KundenlinkArt } from "../../supabase/functions/_shared/kunden-expose";
export { KUNDENLINK_ART_STANDARD, kundenlinkArtName } from "../../supabase/functions/_shared/kunden-expose";

/*
 * Die erzeugten Supabase-Typen kennen `objekt_exposes` noch nicht. Bis die
 * Typen neu erzeugt sind, derselbe Behelf wie in abwesenheitStore.
 */
const db = supabase as unknown as {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export const OBJEKT_EXPOSE_MIGRATION = "20260902200000_objekt_exposes.sql";

/**
 * `?ansicht=kunde`: die Vorschau aus „Exposé für Kunden“. Die Seite zeigt
 * dann, was der Kunde über seinen Link sieht, ohne die interne Leiste
 * („Zur Einheit im CRM“, „Vorschau ohne Kunden“) und mit dem Partnerkasten
 * oben. Siehe `ObjektExpose.tsx`.
 */
export const KUNDENANSICHT_PARAM = "ansicht";
export const KUNDENANSICHT_WERT = "kunde";

function mitAbfrage(basis: string, kundeId: string | null | undefined, kundenansicht: boolean): string {
  const abfrage = new URLSearchParams();
  if (kundeId) abfrage.set("kunde", kundeId);
  if (kundenansicht) abfrage.set(KUNDENANSICHT_PARAM, KUNDENANSICHT_WERT);
  const text = abfrage.toString();
  return text ? `${basis}?${text}` : basis;
}

/** Adresse der internen Exposé-Seite, optional mit Kunde und als Kundenansicht. */
export function exposePfad(objektId: string, wohnungId: string, kundeId?: string | null, kundenansicht = false): string {
  return mitAbfrage(`/objekte/${objektId}/einheiten/${wohnungId}/expose`, kundeId, kundenansicht);
}

/**
 * Adresse des Exposés für das ganze Objekt, etwa ein Globalobjekt. Der Knopf
 * „Exposé anzeigen“ auf der Objektseite zeigt hierhin. Eine Einzelwohnung
 * leitet die Seite selbst auf das Exposé ihrer Einheit weiter.
 */
export function objektExposePfad(objektId: string, kundeId?: string | null, kundenansicht = false): string {
  return mitAbfrage(`/objekte/${objektId}/expose`, kundeId, kundenansicht);
}

/** Der Hinweis, den die Seite zeigt, solange die Tabelle fehlt. */
export const EXPOSE_MIGRATION_HINWEIS =
  `Migration ${OBJEKT_EXPOSE_MIGRATION} noch nicht ausgeführt. Das Exposé lässt sich ansehen, die Annahmen bleiben aber nur in diesem Browser.`;

export interface ObjektExpose {
  id: string;
  /** Leer beim Exposé des ganzen Objekts (seit Migration 20260923151000). */
  wohnung_id: string | null;
  objekt_id: string;
  kontakt_id: string | null;
  erstellt_von: string | null;
  token: string;
  annahmen: Partial<ExposeAnnahmen>;
  annahmen_gesperrt: boolean;
  sichtbare_abschnitte: string[];
  preisstand: number | null;
  preisstand_am: string | null;
  gueltig_bis: string | null;
  aufrufe: number;
  zuletzt_aufgerufen_am: string | null;
  erstellt_am: string;
  aktualisiert_am: string;
}

export interface ExposeLadeErgebnis {
  expose: ObjektExpose | null;
  /** Die Migration fehlt. Die Seite zeigt dann einen Hinweis statt Speichern. */
  migrationFehlt: boolean;
  fehler: string | null;
}

const SPALTEN =
  "id, wohnung_id, objekt_id, kontakt_id, erstellt_von, token, annahmen, annahmen_gesperrt, sichtbare_abschnitte, preisstand, preisstand_am, gueltig_bis, aufrufe, zuletzt_aufgerufen_am, erstellt_am, aktualisiert_am";

function zeileZuExpose(z: Record<string, unknown>): ObjektExpose {
  const annahmen = z.annahmen && typeof z.annahmen === "object" ? (z.annahmen as Partial<ExposeAnnahmen>) : {};
  const abschnitte = Array.isArray(z.sichtbare_abschnitte) ? (z.sichtbare_abschnitte as unknown[]).filter((a): a is string => typeof a === "string") : [];
  return {
    id: String(z.id),
    wohnung_id: z.wohnung_id ? String(z.wohnung_id) : null,
    objekt_id: String(z.objekt_id),
    kontakt_id: (z.kontakt_id as string | null) ?? null,
    erstellt_von: (z.erstellt_von as string | null) ?? null,
    token: String(z.token ?? ""),
    annahmen,
    annahmen_gesperrt: !!z.annahmen_gesperrt,
    sichtbare_abschnitte: abschnitte,
    preisstand: z.preisstand === null || z.preisstand === undefined ? null : Number(z.preisstand),
    preisstand_am: (z.preisstand_am as string | null) ?? null,
    gueltig_bis: (z.gueltig_bis as string | null) ?? null,
    aufrufe: Number(z.aufrufe ?? 0),
    zuletzt_aufgerufen_am: (z.zuletzt_aufgerufen_am as string | null) ?? null,
    erstellt_am: String(z.erstellt_am ?? ""),
    aktualisiert_am: String(z.aktualisiert_am ?? ""),
  };
}

function fehlerErgebnis(error: { code?: string; message?: string }): ExposeLadeErgebnis {
  if (istTabelleUnbekannt(error)) return { expose: null, migrationFehlt: true, fehler: null };
  return { expose: null, migrationFehlt: false, fehler: error.message || "Unbekannter Fehler" };
}

/**
 * Das jüngste Exposé zu einer Wohnung und einem Kunden. Ohne Kunde das
 * jüngste ohne Kundenbezug, also die neutrale Vorschau.
 *
 * Die neutrale Vorschau gehört seit dem 05.10.2026 dem, der sie gespeichert
 * hat (`eigeneId`, Prüfung Codex): Seit Vertriebspartner das Exposé öffnen,
 * bekäme der Admin sonst die Reglerstände eines Partners und umgekehrt. Ohne
 * eigene Kennung gibt es deshalb keine neutrale Zeile.
 */
export async function ladeExposeFuer(wohnungId: string, kontaktId: string | null, eigeneId: string | null | undefined): Promise<ExposeLadeErgebnis> {
  if (!kontaktId && !eigeneId) return { expose: null, migrationFehlt: false, fehler: null };
  let abfrage = db.from("objekt_exposes").select(SPALTEN).eq("wohnung_id", wohnungId);
  abfrage = kontaktId ? abfrage.eq("kontakt_id", kontaktId) : abfrage.is("kontakt_id", null).eq("erstellt_von", eigeneId as string);
  const { data, error } = await abfrage.order("aktualisiert_am", { ascending: false }).limit(1);
  if (error) return fehlerErgebnis(error);
  const zeile = Array.isArray(data) && data[0] ? zeileZuExpose(data[0] as Record<string, unknown>) : null;
  return { expose: zeile, migrationFehlt: false, fehler: null };
}

/**
 * Passt ein über `?expose=` geladener Datensatz zu dieser Seite?
 *
 * Nur, wenn Objekt und Einheit stimmen und der Kundenbezug genau der Kunde
 * ist, den die Seite gerade zeigen darf (`erlaubterKundeId`, nach aktiver
 * Rolle schon gefiltert, siehe `useExposeKunde`). Ohne Kundenbezug zählt
 * nur die eigene neutrale Vorschau. Sonst startet die Seite neutral.
 */
export function exposeDatensatzPasst(
  expose: Pick<ObjektExpose, "objekt_id" | "wohnung_id" | "kontakt_id" | "erstellt_von"> | null | undefined,
  seite: { objektId: string; wohnungId: string | null; erlaubterKundeId: string | null; eigeneId: string | null | undefined },
): boolean {
  if (!expose) return false;
  if (expose.objekt_id !== seite.objektId || (expose.wohnung_id ?? null) !== (seite.wohnungId ?? null)) return false;
  if (expose.kontakt_id) return expose.kontakt_id === seite.erlaubterKundeId;
  return !!seite.eigeneId && expose.erstellt_von === seite.eigeneId && !seite.erlaubterKundeId;
}

/** Ein Exposé über seine Kennung, etwa aus der Adresse `?expose=`. Vor dem Übernehmen `exposeDatensatzPasst` fragen. */
export async function ladeExposeNachId(id: string): Promise<ExposeLadeErgebnis> {
  const { data, error } = await db.from("objekt_exposes").select(SPALTEN).eq("id", id).maybeSingle();
  if (error) return fehlerErgebnis(error);
  return { expose: data ? zeileZuExpose(data as Record<string, unknown>) : null, migrationFehlt: false, fehler: null };
}

export interface ExposeSpeicherEingabe {
  /** Vorhandenes Exposé ändern; ohne Kennung wird ein neues angelegt. */
  id?: string;
  wohnungId: string;
  objektId: string;
  kontaktId: string | null;
  erstelltVon: string;
  annahmen: ExposeAnnahmen;
  annahmenGesperrt: boolean;
  /** Kaufpreis der Wohnung zum Zeitpunkt des Speicherns (ohne Stellplatz). */
  preisstand: number;
}

/**
 * Annahmen samt Preisstand speichern. Legt an oder ändert. Meldet
 * `migrationFehlt`, wenn die Tabelle noch nicht existiert, damit die Seite
 * ruhig weiterläuft und die Annahmen im Browser behält.
 */
export async function speichereExpose(e: ExposeSpeicherEingabe): Promise<ExposeLadeErgebnis> {
  const jetzt = new Date().toISOString();
  const felder = {
    annahmen: e.annahmen,
    annahmen_gesperrt: e.annahmenGesperrt,
    preisstand: e.preisstand,
    preisstand_am: jetzt,
  };
  if (e.id) {
    const { data, error } = await db.from("objekt_exposes").update(felder).eq("id", e.id).select(SPALTEN).maybeSingle();
    if (error) return fehlerErgebnis(error);
    if (data) return { expose: zeileZuExpose(data as Record<string, unknown>), migrationFehlt: false, fehler: null };
    // Zeile nicht mehr da oder nicht mehr erlaubt: neu anlegen.
  }
  const { data, error } = await db
    .from("objekt_exposes")
    .insert({
      wohnung_id: e.wohnungId,
      objekt_id: e.objektId,
      kontakt_id: e.kontaktId,
      erstellt_von: e.erstelltVon,
      ...felder,
    })
    .select(SPALTEN)
    .single();
  if (error) return fehlerErgebnis(error);
  return { expose: zeileZuExpose(data as Record<string, unknown>), migrationFehlt: false, fehler: null };
}

/**
 * Hat sich der Kaufpreis seit dem gespeicherten Preisstand geändert?
 * Unter einem Euro Abweichung gilt als gleich (Rundung aus dem Import).
 */
export function preisHatSichGeaendert(expose: Pick<ObjektExpose, "preisstand"> | null | undefined, aktuellerKaufpreis: number): boolean {
  if (!expose || expose.preisstand === null || !Number.isFinite(expose.preisstand)) return false;
  return Math.abs(expose.preisstand - aktuellerKaufpreis) >= 1;
}

/**
 * Gespeicherte Annahmen über die Vorbelegung legen. Es werden nur bekannte
 * Schlüssel mit passendem Typ übernommen, damit ein alter oder fremder
 * JSON-Stand den Rechner nicht mit Unsinn füttert.
 */
export function annahmenZusammenfuehren(basis: ExposeAnnahmen, gespeichert: Partial<ExposeAnnahmen> | null | undefined): ExposeAnnahmen {
  if (!gespeichert) return basis;
  const ergebnis: ExposeAnnahmen = { ...basis };
  for (const schluessel of Object.keys(ANNAHMEN_HERKUNFT) as Array<keyof ExposeAnnahmen>) {
    const wert = gespeichert[schluessel];
    if (wert === undefined) continue;
    const vorlage = basis[schluessel];
    const passt =
      (schluessel === "grenzsteuersatzManuellProzent" && (wert === null || typeof wert === "number"))
      || (typeof vorlage === "number" && typeof wert === "number" && Number.isFinite(wert))
      || (typeof vorlage === "boolean" && typeof wert === "boolean")
      || (typeof vorlage === "string" && typeof wert === "string");
    if (passt) (ergebnis as unknown as Record<string, unknown>)[schluessel] = wert;
  }
  return ergebnis;
}

// ── Kunde und Selbstauskunft ──

export interface ExposeKunde {
  id: string;
  name: string;
  /** Der für den Kunden zuständige Vertriebspartner. Er steht im Exposé als Ansprechpartner. */
  zustaendigId?: string | null;
}

interface KontaktZeile {
  id: string;
  vorname?: string | null;
  nachname?: string | null;
  firma?: string | null;
  zustaendig_id?: string | null;
  geloescht?: boolean | null;
  archiviert?: boolean | null;
  meta?: { saData?: SaDaten | null } | null;
}

interface InvestmentZeile extends InvestmentZeileMitSa {
  kunde_id?: string | null;
}

export function kontaktAnzeigename(k: Pick<KontaktZeile, "vorname" | "nachname" | "firma">): string {
  return [k.vorname, k.nachname].filter(Boolean).join(" ").trim() || k.firma || "Kunde";
}

/**
 * Der Kunde zum Exposé, nur Kennung und Name.
 *
 * Vorher hing hier eine Selbstauskunft mit dran: die neueste über alle
 * Investments, sonst der Altbestand am Kontakt. Damit belegte das Exposé
 * einer Einheit seine Annahmen (Einkommen, Familienstand, Eigenkapital) aus
 * einem ganz anderen Vorgang vor. Ein Exposé wird ohne Investment geöffnet,
 * es steht also gar nicht fest, welche Selbstauskunft gemeint wäre. Deshalb
 * gilt hier "gar nichts", und der Rechner startet mit seinen
 * Standardannahmen (Regel in saQuelle.ts).
 */
export function kundeAusCache(kontaktId: string | null | undefined): ExposeKunde | null {
  if (!kontaktId) return null;
  const kontakt = cacheGet<KontaktZeile>("kontakte").find((k) => k.id === kontaktId);
  if (!kontakt) return null;
  return { id: kontakt.id, name: kontaktAnzeigename(kontakt), zustaendigId: kontakt.zustaendig_id ?? null };
}

export interface KundeAuswahl {
  id: string;
  name: string;
  hatSelbstauskunft: boolean;
}

/**
 * Kunden für die Auswahl: nicht gelöscht, nicht archiviert, alphabetisch.
 * Ob überhaupt irgendwo eine Selbstauskunft vorliegt, steht dabei.
 *
 * Wird auch vom Investmentrechner benutzt, und dort belegt sie tatsächlich
 * vor, allerdings erst nach der Wahl eines Investments. Im Exposé ist die
 * Marke nur ein Hinweis, dass der Kunde schon eine Selbstauskunft
 * ausgefüllt hat, nicht mehr.
 */
export function kundenZurAuswahl(): KundeAuswahl[] {
  const mitSa = new Set<string>();
  for (const i of cacheGet<InvestmentZeile>("investments")) {
    if (i.kunde_id && (i.meta?.saData || i.meta?.saSnapshot)) mitSa.add(i.kunde_id);
  }
  return cacheGet<KontaktZeile>("kontakte")
    .filter((k) => !k.geloescht && !k.archiviert)
    .map((k) => ({ id: k.id, name: kontaktAnzeigename(k), hatSelbstauskunft: mitSa.has(k.id) || !!k.meta?.saData }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

// ── Kundenlink: Versand, Liste „Gesendete Links“ im Kundenprofil, Rückzug ──
//
// Seit dem 23.09.2026 ein einziger Weg („Kundenlink senden“): Die Edge
// Function `send-kunden-expose` schickt den Link per Mail mit Knopf oder
// erzeugt ihn nur (etwa für WhatsApp). Jeder Versand ist eine Zeile in
// `objekt_exposes` mit `gesendet_am`, und genau diese Zeilen zeigt das
// Kundenprofil beim Investment. Die Spalten dafür kommen mit der Migration
// 20260923151000; ohne sie meldet alles hier `migrationFehlt`.
//
// Zwei Arten (Migration 20260923171000, Spalten `art` und
// `einstieg_wohnung_id`): die Objektübersicht des Hauses (ein Link je Kunde,
// Investment und Objekt, Einstieg bei einer Wohnung) und das Exposé einer
// Einheit. Ohne diese Migration gibt es nur Exposés; die Liste liest dann
// ohne die beiden Spalten weiter, und nur das Senden der Objektübersicht
// meldet die fehlende Migration.

export const EXPOSE_VERSAND_MIGRATION = "20260923151000_kunden_expose_versand.sql";
export const KUNDENLINK_MIGRATION = "20260923171000_kundenlink_objektuebersicht.sql";

/** Dieselbe Meldung wie in der Function, damit beide Stellen gleich reden. */
export const EXPOSE_VERSAND_MIGRATION_HINWEIS = EXPOSE_VERSAND_MIGRATION_FEHLT;

/** Dasselbe für die Objektübersicht (Migration 20260923171000). */
export const KUNDENLINK_MIGRATION_HINWEIS = KUNDENLINK_MIGRATION_FEHLT;

/**
 * Der persönliche Kundenlink, immer auf der veröffentlichten Adresse, nie auf
 * der Vorschau von Lovable. Dieselbe Funktion, mit der `send-kunden-expose`
 * den Link für die Mail baut (`supabase/functions/_shared/kunden-expose.ts`).
 */
export function kundenExposeLink(objektId: string, wohnungId: string | null | undefined, token: string): string {
  return kundenExposeLinkGemeinsam(objektId, wohnungId, token);
}

/**
 * Derselbe Link zum Nachsehen aus dem CRM: `vorschau=1` sorgt dafür, dass
 * `get-expose` den Aufruf nicht zählt und keine Glocke auslöst.
 */
export function kundenExposeVorschauLink(objektId: string, wohnungId: string | null | undefined, token: string): string {
  return `${kundenExposeLink(objektId, wohnungId, token)}&vorschau=1`;
}

/** Der persönliche Link zur Objektübersicht, dieselbe Regel wie in `send-kunden-expose`. */
export function kundenansichtLink(token: string): string {
  return kundenansichtLinkGemeinsam(token);
}

/**
 * Die Objektübersicht zum Nachsehen aus dem CRM. Dieselbe Abmachung wie beim
 * Exposé: Mit `vorschau=1` zählt `get-kundenansicht` nicht und läutet keine
 * Glocke.
 */
export function kundenansichtVorschauLink(token: string): string {
  return `${kundenansichtLink(token)}?vorschau=1`;
}

interface ObjektZeileKurz { id: string; titel?: string | null; adresse?: string | null; ort?: string | null }
interface WohnungZeileKurz { id: string; we_nr?: string | number | null }

/**
 * „Wohnung 7, Parkstraße 8, Augsburg“ aus dem Zwischenspeicher. Dieselbe
 * Regel wie im Betreff der Mail. Fehlt das Objekt im Zwischenspeicher, steht
 * dort schlicht „Exposé“.
 */
export function exposeBezeichnungAusCache(objektId: string, wohnungId: string | null | undefined): string {
  const objekt = cacheGet<ObjektZeileKurz>("objekte").find((o) => o.id === objektId);
  const wohnung = wohnungId ? cacheGet<WohnungZeileKurz>("wohnungen").find((w) => w.id === wohnungId) : undefined;
  const bezeichnung = exposeBezeichnung({
    mitEinheit: !!wohnungId,
    weNr: wohnung?.we_nr != null ? String(wohnung.we_nr) : null,
    objektTitel: objekt?.titel,
    adresse: objekt?.adresse,
    ort: objekt?.ort,
  });
  return bezeichnung || "Exposé";
}

/** Steht am Kunden eine E-Mail-Adresse? Ohne sie geht nur „Link kopieren“. */
export function kundeHatEmail(kontaktId: string | null | undefined): boolean {
  if (!kontaktId) return false;
  const kontakt = cacheGet<{ id: string; email?: string | null }>("kontakte").find((k) => k.id === kontaktId);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(kontakt?.email ?? "").trim());
}

export interface GesendetesExpose {
  id: string;
  /** Ohne Migration 20260923171000 immer `expose`. */
  art: KundenlinkArt;
  objekt_id: string;
  /** Beim Exposé die Einheit; bei der Objektübersicht leer, sie gehört zum ganzen Haus. */
  wohnung_id: string | null;
  /** Nur bei der Objektübersicht: die Wohnung, bei der der Link öffnet. */
  einstieg_wohnung_id: string | null;
  kontakt_id: string | null;
  investment_id: string | null;
  token: string;
  gueltig_bis: string | null;
  gesendet_am: string;
  gesendet_von: string | null;
  versandweg: "mail" | "link" | null;
  zurueckgezogen_am: string | null;
  aufrufe: number;
  erstmals_aufgerufen_am: string | null;
  zuletzt_aufgerufen_am: string | null;
}

export type ExposeLinkStatus = "aktiv" | "abgelaufen" | "zurueckgezogen";

/** Gilt der Link noch? Dieselbe Regel wie `linkZustand` in `get-expose`. */
export function exposeLinkStatus(e: Pick<GesendetesExpose, "gueltig_bis" | "zurueckgezogen_am">, jetzt: number = Date.now()): ExposeLinkStatus {
  if (e.zurueckgezogen_am) return "zurueckgezogen";
  if (e.gueltig_bis) {
    const frist = Date.parse(e.gueltig_bis);
    if (Number.isNaN(frist) || frist < jetzt) return "abgelaufen";
  }
  return "aktiv";
}

const VERSAND_SPALTEN =
  "id, objekt_id, wohnung_id, kontakt_id, investment_id, token, gueltig_bis, gesendet_am, gesendet_von, versandweg, zurueckgezogen_am, aufrufe, erstmals_aufgerufen_am, zuletzt_aufgerufen_am";

/** Dieselben mit Art und Einstiegswohnung (Migration 20260923171000). */
const VERSAND_SPALTEN_MIT_ART = `${VERSAND_SPALTEN}, art, einstieg_wohnung_id`;

function zeileZuGesendet(z: Record<string, unknown>): GesendetesExpose {
  const text = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    id: String(z.id),
    // Alles außer ausdrücklich `objektuebersicht` ist ein Exposé, auch eine Zeile ohne Spalte.
    art: z.art === "objektuebersicht" ? "objektuebersicht" : "expose",
    objekt_id: String(z.objekt_id ?? ""),
    wohnung_id: text(z.wohnung_id),
    einstieg_wohnung_id: text(z.einstieg_wohnung_id),
    kontakt_id: text(z.kontakt_id),
    investment_id: text(z.investment_id),
    token: String(z.token ?? ""),
    gueltig_bis: text(z.gueltig_bis),
    gesendet_am: String(z.gesendet_am ?? ""),
    gesendet_von: text(z.gesendet_von),
    versandweg: z.versandweg === "mail" || z.versandweg === "link" ? z.versandweg : null,
    zurueckgezogen_am: text(z.zurueckgezogen_am),
    aufrufe: Number(z.aufrufe ?? 0) || 0,
    erstmals_aufgerufen_am: text(z.erstmals_aufgerufen_am),
    zuletzt_aufgerufen_am: text(z.zuletzt_aufgerufen_am),
  };
}

export interface GesendeteLadeErgebnis {
  eintraege: GesendetesExpose[];
  migrationFehlt: boolean;
  fehler: string | null;
}

/**
 * Die gesendeten Links eines Kunden zu einem Investment, beide Arten, neueste
 * zuerst. Welche Zeilen jemand sieht, entscheidet die Zeilensicherheit auf
 * `objekt_exposes` (Admin und Inhaber, Ersteller, zuständiger Partner).
 *
 * Erst mit Art und Einstiegswohnung; fehlen die beiden Spalten noch
 * (Migration 20260923171000), dasselbe ohne sie. Sonst verschwände die ganze
 * Liste, nur weil die neuere Migration noch aussteht.
 */
export async function ladeGesendeteExposes(kontaktId: string, investmentId: string): Promise<GesendeteLadeErgebnis> {
  const abfrage = (spalten: string) => db
    .from("objekt_exposes")
    .select(spalten)
    .eq("kontakt_id", kontaktId)
    .eq("investment_id", investmentId)
    .not("gesendet_am", "is", null)
    .order("gesendet_am", { ascending: false });
  let { data, error } = await abfrage(VERSAND_SPALTEN_MIT_ART);
  if (error && versandSpalteFehlt(error)) ({ data, error } = await abfrage(VERSAND_SPALTEN));
  if (error) {
    if (istTabelleUnbekannt(error)) return { eintraege: [], migrationFehlt: true, fehler: null };
    return { eintraege: [], migrationFehlt: false, fehler: error.message || "Unbekannter Fehler" };
  }
  const eintraege = (Array.isArray(data) ? data : []).map((z) => zeileZuGesendet(z as Record<string, unknown>));
  return { eintraege, migrationFehlt: false, fehler: null };
}

export interface ExposeAktionErgebnis {
  erfolg: boolean;
  migrationFehlt: boolean;
  fehler: string | null;
}

/**
 * Einen Link zurückziehen. Danach zeigt er nur noch einen Hinweis mit den
 * Kontaktdaten des Partners, wie ein abgelaufener. Nicht umkehrbar: Wer
 * danach sendet, bekommt einen neuen Link.
 */
export async function zieheExposeZurueck(id: string): Promise<ExposeAktionErgebnis> {
  const { data, error } = await db
    .from("objekt_exposes")
    .update({ zurueckgezogen_am: new Date().toISOString() })
    .eq("id", id)
    .is("zurueckgezogen_am", null)
    .select("id");
  if (error) {
    if (istTabelleUnbekannt(error)) return { erfolg: false, migrationFehlt: true, fehler: null };
    return { erfolg: false, migrationFehlt: false, fehler: error.message || "Unbekannter Fehler" };
  }
  // Keine Zeile getroffen: schon zurückgezogen oder nicht erlaubt.
  if (!Array.isArray(data) || data.length === 0) {
    return { erfolg: false, migrationFehlt: false, fehler: "Der Link war schon zurückgezogen oder du darfst ihn nicht ändern." };
  }
  return { erfolg: true, migrationFehlt: false, fehler: null };
}

export interface OffeneLinksErgebnis {
  /** Anzahl je Einheit. Fehlt eine Einheit, hängt an ihr kein offener Link. */
  jeEinheit: Map<string, number>;
  fehler: string | null;
}

/** Höchstens so viele Kennungen je Abfrage, sonst wird die Adresse zu lang. */
const EINHEITEN_JE_ABFRAGE = 100;

/**
 * Gesendete, nicht zurückgezogene Kundenlinks je Einheit, für den Löschschutz
 * der Einheiten (`einheitLoeschSperre`).
 *
 * Gezählt wird, was hinausging (`gesendet_am`) und nicht zurückgezogen ist,
 * auch ein abgelaufener Link: Er lässt sich erneut senden, und das Löschen der
 * Einheit nähme ihn per Kaskade samt Verlauf mit. Eine nur intern gespeicherte
 * Zeile (ohne `gesendet_am`) ist kein Link. Die Objektübersicht zählt mit,
 * wenn sie bei der Einheit einsteigt.
 *
 * Fehlt die Tabelle, gibt es keine Links. Fehlt die Spalte der
 * Objektübersicht (Migration 20260923171000), zählt nur das Exposé.
 */
export async function ladeOffeneLinksZuEinheiten(wohnungIds: string[]): Promise<OffeneLinksErgebnis> {
  const jeEinheit = new Map<string, number>();
  const gesucht = new Set(wohnungIds);
  const zaehlen = (zeilen: unknown, spalte: string) => {
    for (const z of Array.isArray(zeilen) ? (zeilen as Record<string, unknown>[]) : []) {
      if (!z.gesendet_am || z.zurueckgezogen_am) continue;
      const id = String(z[spalte] ?? "");
      if (gesucht.has(id)) jeEinheit.set(id, (jeEinheit.get(id) ?? 0) + 1);
    }
  };
  const fehlerText = (error: { message?: string }) => error.message || "Unbekannter Fehler";

  for (let i = 0; i < wohnungIds.length; i += EINHEITEN_JE_ABFRAGE) {
    const teil = wohnungIds.slice(i, i + EINHEITEN_JE_ABFRAGE);
    // `*`, damit eine noch fehlende Versandspalte die Abfrage nicht scheitern lässt.
    const exposes = await db.from("objekt_exposes").select("*").in("wohnung_id", teil);
    if (exposes.error) {
      if (istTabelleUnbekannt(exposes.error)) return { jeEinheit, fehler: null };
      return { jeEinheit, fehler: fehlerText(exposes.error) };
    }
    zaehlen(exposes.data, "wohnung_id");

    const einstiege = await db.from("objekt_exposes").select("*").in("einstieg_wohnung_id", teil);
    if (einstiege.error) {
      if (!versandSpalteFehlt(einstiege.error)) return { jeEinheit, fehler: fehlerText(einstiege.error) };
    } else {
      zaehlen(einstiege.data, "einstieg_wohnung_id");
    }
  }
  return { jeEinheit, fehler: null };
}

export interface KundenExposeAuftrag {
  /** `mail`: Mail mit Knopf an den Kunden. `link`: nur den Link erzeugen. */
  modus: "mail" | "link";
  /** Ohne Angabe das Exposé, so wie vor dem 23.09.2026. */
  art?: KundenlinkArt;
  kontaktId: string;
  investmentId: string;
  objektId: string;
  /** Exposé: die Einheit, leer beim ganzen Objekt. Objektübersicht: die Einstiegswohnung, leer heißt Hausebene. */
  wohnungId: string | null;
  /**
   * Nur Objektübersicht: die Wohnungen, die der Kunde sieht, `null` für alle
   * freien. Fehlt die Angabe, bleibt die Auswahl des Links, wie sie ist
   * (Erneut senden aus dem Kundenprofil).
   */
  wohnungAuswahl?: string[] | null;
}

/** Die Wohnung, die zu einem gesendeten Link gehört: beim Exposé die Einheit, bei der Objektübersicht der Einstieg. */
export function wohnungDesLinks(e: Pick<GesendetesExpose, "art" | "wohnung_id" | "einstieg_wohnung_id">): string | null {
  return e.art === "objektuebersicht" ? e.einstieg_wohnung_id : e.wohnung_id;
}

/** Der Link eines gesendeten Eintrags, je Art. */
export function kundenlinkDesEintrags(e: Pick<GesendetesExpose, "art" | "objekt_id" | "wohnung_id" | "token">): string {
  return kundenlinkFuer(e.art, e.objekt_id, e.wohnung_id, e.token);
}

/** Derselbe zum Nachsehen aus dem CRM, zählt nicht mit. */
export function kundenlinkVorschauDesEintrags(e: Pick<GesendetesExpose, "art" | "objekt_id" | "wohnung_id" | "token">): string {
  return e.art === "objektuebersicht" ? kundenansichtVorschauLink(e.token) : kundenExposeVorschauLink(e.objekt_id, e.wohnung_id, e.token);
}

/**
 * Der Auftrag, mit dem ein gesendeter Link erneut hinausgeht: dieselbe Art,
 * dieselbe Wohnung. Die Function nimmt dann dieselbe Zeile und verlängert
 * die Frist.
 */
export function auftragZumErneutSenden(
  e: Pick<GesendetesExpose, "art" | "objekt_id" | "wohnung_id" | "einstieg_wohnung_id">,
  kontaktId: string,
  investmentId: string,
  modus: "mail" | "link",
): KundenExposeAuftrag {
  return { modus, art: e.art, kontaktId, investmentId, objektId: e.objekt_id, wohnungId: wohnungDesLinks(e) };
}

export interface KundenExposeErgebnis {
  ok: boolean;
  link: string | null;
  gueltigBis: string | null;
  migrationFehlt: boolean;
  fehler: string | null;
}

/** Die Function hinter „Kundenlink senden“. */
export const KUNDENLINK_FUNCTION = "send-kunden-expose";

/**
 * Die Meldung, wenn auf dem Server noch die Fassung vor dem 23.09.2026 läuft.
 * Die kennt keine Art, macht aus jeder Anfrage ein Exposé und sagt das nicht.
 */
export const KUNDENLINK_FUNCTION_VERALTET =
  `Die Function ${KUNDENLINK_FUNCTION} läuft noch in einer älteren Fassung und kennt die Objektübersicht nicht. Roll sie in Lovable neu aus, dann klappt es.`;

/**
 * Dasselbe für die Wohnungsauswahl (05.10.2026): Die ältere Fassung hat den
 * Link erzeugt, die Auswahl aber übergangen. Der Kunde sieht dann alle
 * freien Wohnungen, das muss Christian sofort erfahren.
 */
export const KUNDENLINK_AUSWAHL_FUNCTION_VERALTET =
  `Die Function ${KUNDENLINK_FUNCTION} läuft noch in einer älteren Fassung und hat die Wohnungsauswahl nicht gespeichert. Der Kunde sieht über den Link alle freien Wohnungen. Roll ${KUNDENLINK_FUNCTION} und get-kundenansicht in Lovable neu aus und sende danach noch einmal.`;

/** Die Meldung, solange die Migration 20261005100000 (Spalte `wohnung_auswahl`) fehlt. */
export const KUNDENLINK_AUSWAHL_MIGRATION_HINWEIS = KUNDENLINK_AUSWAHL_MIGRATION_FEHLT;

export interface KundenlinkAuswahlStand {
  /** Für Kunde, Investment und Haus gibt es schon eine lebende Objektübersicht. */
  vorhanden: boolean;
  /** Ihre Wohnungsauswahl, `null` heißt alle freien Wohnungen. */
  auswahl: string[] | null;
}

/**
 * Die Wohnungsauswahl des bestehenden Links zu Kunde, Investment und Haus,
 * damit der Dialog sie vorbelegt. Dieselbe Zeile, die `send-kunden-expose`
 * beim Senden wiederverwendet (`zeile.ts`). Fehlt die Spalte noch (Migration
 * 20261005100000), trägt kein Link eine Auswahl: dann alle freien. Jeder
 * andere Lesefehler heißt „kein Link bekannt“, der Dialog belegt dann nur die
 * eigene Wohnung vor.
 */
export async function ladeKundenlinkAuswahl(kontaktId: string, investmentId: string, objektId: string): Promise<KundenlinkAuswahlStand> {
  const abfrage = (spalten: string) => db
    .from("objekt_exposes")
    .select(spalten)
    .eq("objekt_id", objektId)
    .eq("kontakt_id", kontaktId)
    .eq("investment_id", investmentId)
    .eq("art", "objektuebersicht")
    .is("zurueckgezogen_am", null)
    .limit(1);
  try {
    let { data, error } = await abfrage("id, wohnung_auswahl");
    if (error && versandSpalteFehlt(error)) ({ data, error } = await abfrage("id"));
    const zeile = !error && Array.isArray(data) ? (data[0] as { wohnung_auswahl?: unknown } | undefined) : undefined;
    if (!zeile) return { vorhanden: false, auswahl: null };
    const wert = zeile.wohnung_auswahl;
    return { vorhanden: true, auswahl: Array.isArray(wert) ? wert.map(String) : null };
  } catch {
    return { vorhanden: false, auswahl: null };
  }
}

/**
 * Liegt der Link auf der veröffentlichten Adresse, auf der gerade auch das
 * CRM läuft? In der Lovable-Vorschau nicht: Der Link führt dann auf
 * osimmobilien.netlify.app, und dort gibt es neue Seiten erst nach dem
 * Veröffentlichen.
 */
export function kundenlinkAufDieserAdresse(hostname: string): boolean {
  return hostname === new URL(KUNDEN_EXPOSE_BASIS).hostname;
}

/**
 * Kundenlink senden oder nur erzeugen, über `send-kunden-expose`.
 *
 * Bewusst ohne Empfängeradresse: Die Function nimmt sie ausschließlich aus
 * dem Kontakt. Die Frist (60 Tage) setzt ebenfalls die Function.
 *
 * Jede Meldung ist lesbar (Christian, 23.09.2026, nach einer nackten 404):
 * der Grund der Function, sonst was mit der Function selbst ist (nicht
 * ausgerollt, startet nicht, nicht erreichbar, alte Fassung), siehe
 * `edgeFehlerMitGrund`.
 */
export async function sendeKundenExpose(a: KundenExposeAuftrag): Promise<KundenExposeErgebnis> {
  const art = a.art ?? "expose";
  // Nur beim Versand per Mail. „Link erzeugen“ schickt dem Kunden nichts.
  // Einmalige Rückfrage „Deutsch oder English?“, falls noch nie gewählt (Plan
  // Kundensprache 2.4). Dynamisch geladen, damit kein Importkreis zum Kundenstore entsteht.
  if (a.modus === "mail") await (await import("./kundenSprache")).stelleKundenspracheSicher(a.kontaktId);
  const { data, error } = await supabase.functions.invoke(KUNDENLINK_FUNCTION, {
    body: {
      modus: a.modus,
      art,
      kontaktId: a.kontaktId,
      investmentId: a.investmentId,
      objektId: a.objektId,
      wohnungId: a.wohnungId,
      ...(art === "objektuebersicht" && a.wohnungAuswahl !== undefined ? { wohnungAuswahl: a.wohnungAuswahl } : {}),
    },
  });
  if (error) {
    const mitGrund = (await edgeFehlerMitGrund(error, { functionName: KUNDENLINK_FUNCTION })) as Error;
    const text = mitGrund?.message || "Der Kundenlink konnte nicht gesendet werden.";
    // Welche Migration fehlt, sagt die Function; die Meldung wird unverändert weitergegeben.
    const fehlend = [EXPOSE_VERSAND_MIGRATION_HINWEIS, KUNDENLINK_MIGRATION_HINWEIS, KUNDENLINK_AUSWAHL_MIGRATION_HINWEIS].find((m) => text.includes(m));
    return { ok: false, link: null, gueltigBis: null, migrationFehlt: !!fehlend, fehler: fehlend ?? text };
  }
  const antwort = (data ?? {}) as { ok?: boolean; link?: unknown; gueltigBis?: unknown; error?: unknown; art?: unknown; wohnungAuswahl?: unknown };
  if (antwort.ok !== true || typeof antwort.link !== "string") {
    return {
      ok: false, link: null, gueltigBis: null, migrationFehlt: false,
      fehler: typeof antwort.error === "string" ? antwort.error : "Der Kundenlink konnte nicht gesendet werden.",
    };
  }
  /*
   * Die neue Fassung nennt die Art in der Antwort. Fehlt sie bei der
   * Objektübersicht, hat die alte Fassung still ein Exposé erzeugt; der Link
   * wäre nicht der gewünschte. Dann lieber sagen, was zu tun ist.
   */
  if (art === "objektuebersicht" && antwort.art !== "objektuebersicht") {
    return { ok: false, link: null, gueltigBis: null, migrationFehlt: false, fehler: KUNDENLINK_FUNCTION_VERALTET };
  }
  // Eine Auswahl geschickt, aber die Antwort kennt sie nicht: alte Fassung, der Link zeigt alle freien Wohnungen.
  if (art === "objektuebersicht" && Array.isArray(a.wohnungAuswahl) && !("wohnungAuswahl" in antwort)) {
    return { ok: false, link: null, gueltigBis: null, migrationFehlt: false, fehler: KUNDENLINK_AUSWAHL_FUNCTION_VERALTET };
  }
  return {
    ok: true,
    link: antwort.link,
    gueltigBis: typeof antwort.gueltigBis === "string" ? antwort.gueltigBis : null,
    migrationFehlt: false,
    fehler: null,
  };
}
