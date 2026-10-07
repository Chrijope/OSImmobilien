import { cacheGet, cacheInsert, cacheUpdate, cacheDelete, cacheFilter, cacheSet, cacheReload, cacheUpsert, SchreibenAbgelehnt } from "./dataCache";
import { EXKLUSIV_KENNUNG_SCHLUESSEL, exklusivKennungenFuerNamen, exklusivKennungenLesen } from "../../supabase/functions/_shared/objekt-zugang.ts";
import { supabase } from "@/integrations/supabase/client";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";
import { getUserSetting, setUserSetting } from "./userSettingsCache";
import { einheitImAngebot } from "./objektKennzahlen";
import {
  VORMERKUNG_MIGRATION,
  vormerkErgebnisLesen,
  vormerkFunktionFehlt,
  type VormerkErgebnis,
} from "./einheitVormerkung";
import { reservierungNachUnterschrift } from "../../supabase/functions/_shared/einheit-vormerkung";
import {
  GLOBALOBJEKT_ANLAGEKLASSE,
  hausImCrmGebunden,
  istGlobalobjekt,
} from "../../supabase/functions/_shared/globalobjekt";
import {
  einheitAenderung,
  einheitLoeschSperre,
  einheitStatus,
  investmentEinheit,
  istUuid,
  KEINE_BEZUEGE,
  neueEinheitZeile,
  zeilenAbgleich,
  zwischenspeicherVollstaendig,
  type EinheitBezuege,
  type EinheitStatus,
  type Zeile,
} from "./objektSpeichernAbgleich";
import { kundenFreigabeWert } from "../../supabase/functions/_shared/dokument-freigabe";
import { istUebernahmeKopie } from "../../supabase/functions/_shared/grundriss-erkennung";
import {
  OBJEKT_RESERVIERUNG_MIGRATION,
  hausBelegungLesen,
  objektVormerkErgebnisLesen,
  type HausBelegung,
  type ObjektVormerkErgebnis,
} from "./objektBelegung";

import { heuteBerlinIso } from "./datumsformate";
import { hausgeldTeile } from "../../supabase/functions/_shared/einheit-hausgeld";
import { hinweisDialog } from "./confirm";

export { anzahlEinheiten } from "./objektBelegung";

// ── Interfaces (unchanged) ──

export interface ObjektBild {
  id: string;
  url: string;
  alt: string;
  reihenfolge: number;
}

/**
 * Was Admin oder Inhaber je Unterlage für Kunden entschieden haben
 * (Dokumenten-Ampel, Migration 20260923170000). Nur aus der Tabelle gelesen,
 * siehe `freigabeFelder`. Vor der Migration fehlen die Felder.
 */
export interface DokumentFreigabeFelder {
  kundenFreigabe?: "frei" | "gesperrt" | null;
  geschwaerzt?: boolean;
  /** Die Zeile trägt die Spalten der Migration, umschalten ist also möglich. */
  freigabeSpalten?: boolean;
}

export interface ObjektDokument extends DokumentFreigabeFelder {
  id: string;
  name: string;
  url: string;
  typ: "standard" | "custom";
  kategorie: "objektunterlagen" | "intern";
  sichtbar: boolean;
}

export interface WohnungDokument extends DokumentFreigabeFelder {
  id: string;
  name: string;
  url: string;
  kategorie: "wohnungsunterlagen" | "intern";
  /**
   * Steht als Zeile in `wohnungs_dokumente`. Von Hand hochgeladene
   * Wohnungsunterlagen stehen dagegen nur in `wohnungen.meta.dokumente`, dort
   * kann keine Freigabe hängen.
   */
  ausTabelle?: boolean;
}

export interface ObjektWohnung {
  id: string;
  weNr: string;
  etage: string;
  lage: string;
  groesse: number;
  zimmer: number;
  mieteGesamt: number;
  vkGesamt: number;
  qmPreis: number;
  rendite: number;
  vermietet: boolean;
  /** Detaillierter Vermietungsstatus: 'vermietet' | 'leerstand' | 'gekuendigt' | 'in_vermietung' | 'eigennutzung' */
  vermietungsStatus?: "vermietet" | "leerstand" | "gekuendigt" | "in_vermietung" | "eigennutzung";
  status: "frei" | "reserviert" | "verkauft";
  /**
   * Der Zustand im Klartext, wie Investagon ihn anzeigt: "Frei", "Angefragt",
   * "Reserviert", "Notartermin", "Notarvorbereitung", "Verkauft".
   *
   * Der Import legt den ganzen Originaldatensatz in `meta.investagonRaw` ab,
   * dort steht das Feld `statusName`. Die drei CRM-Zustaende darueber bleiben
   * unveraendert, an ihnen haengen Auswertungen und Filter. Dieses Feld ist
   * allein fuer die Anzeige, siehe `src/lib/einheitBelegung.ts`.
   */
  investagonStatusText?: string;
  /**
   * Die Investagon-Kennung dieser Einheit, sofern sie von dort stammt.
   *
   * Nur zur Herkunftsfrage, siehe `src/lib/investagonHerkunft.ts`: Was
   * Investagon liefert, wird alle 15 Minuten ueberschrieben, dort darf die
   * Oberflaeche keine Pflegeknoepfe anbieten.
   */
  investagonId?: string;
  /**
   * Der Originaldatensatz der Einheit, so wie Investagon ihn geliefert hat.
   * Daraus kommt unter anderem `investagonStatusText`. Wird nur durchgereicht,
   * das CRM liest darin nicht weiter.
   */
  investagonRaw?: Record<string, any>;
  kundeId?: string;
  kundeName?: string;
  beraterName?: string;
  reserviertAm?: string;
  /**
   * Wer die Reservierung ausgelöst hat (Nutzerkennung). Nach einer
   * Unterschrift der Absender der Vereinbarung, ersatzweise der zuständige
   * Partner. Setzt allein die Datenbank, siehe Migration
   * `20260923150000_reservierung_vormerkung.sql`.
   */
  reserviertVon?: string;
  /**
   * Die Vormerkung von 60 Minuten ab dem Versand der
   * Reservierungsvereinbarung (Christians Regeln vom 23.09.2026). Der Status
   * bleibt dabei „frei“. Abgelaufen ist sie, sobald `vorgemerktBis` vorbei
   * ist; es gibt keinen Lauf, der sie wegräumt. Geschrieben wird sie nur von
   * der Datenbankfunktion `vormerke_einheit`, nie über `updateWohnung`.
   * Die Namen sind mit der Einheitentabelle abgesprochen.
   */
  vorgemerktBis?: string;
  vorgemerktKundeId?: string;
  vorgemerktKundeName?: string;
  vorgemerktBeraterName?: string;
  /** Nutzerkennung dessen, der vorgemerkt hat. */
  vorgemerktVon?: string;
  dokumente?: WohnungDokument[];
  bilder?: ObjektBild[];
  exklusivNutzer?: string[];
  /** Geplante Mieterhöhung: neue Kaltmiete */
  neueMiete?: number;
  /** Geplante Mieterhöhung: ab Datum (YYYY-MM-DD) */
  mieterhoehungAb?: string;
  /** Optionaler Stellplatz: Kaufpreis */
  stellplatzPreis?: number;
  /** Optionaler Stellplatz: monatliche Miete */
  stellplatzMiete?: number;
  /**
   * Der Möbelanteil, der in `vkGesamt` steckt. Setzt nur der
   * Investagon-Import (`meta.moebelPreis`), das CRM pflegt ihn nicht. Der
   * Investmentrechner übernimmt ihn als „davon Möbel/Inventar“.
   */
  moebelPreis?: number;
  /*
   * Rechenwerte aus Investagon, seit dem 25.09.2026. Setzt nur der Import,
   * das CRM pflegt sie nicht; beim Speichern bleiben sie über das vorhandene
   * `meta` erhalten. Der Investmentrechner übernimmt sie in die Vorbelegung.
   */
  /** Monatliche Zuführung zur Instandhaltungsrücklage in € (kein Rücklagenbestand) */
  ruecklageZufuehrungMonat?: number;
  /** Nutzungsdauer der Möbel in Jahren */
  moebelNutzungsdauerJahre?: number;
  /** Finanzierungsnebenkosten in % der Darlehenssumme */
  finanzierungsnebenkostenSatz?: number;
  /** Aktuelle Instandhaltungsrücklage dieser Wohnung in € */
  ruecklageWohnung?: number;
  /** Hausgeld brutto/Monat dieser Wohnung in € */
  hausgeldMonat?: number;
  /** Nicht umlagefähiger Hausgeld-Anteil dieser Wohnung in €/Monat */
  hausgeldNichtUmlagefaehigEuro?: number;
  /** Nicht umlagefähiger Hausgeld-Anteil dieser Wohnung in % */
  hausgeldNichtUmlagefaehigP?: number;
  /** Optionaler externer Link (z.B. Cloud-Ordner) mit allen Wohnungsunterlagen */
  unterlagenLink?: string;

  // ── Felder der Objektseite und des Exposés (liegen in `meta`) ──
  // Investagon liefert Stadtteil, Sanierungsjahr und Sanierungsanteil, wenn
  // die API sie kennt; sonst pflegt der Objektpartner sie von Hand. Der
  // Import überschreibt nur Felder, die er tatsächlich geliefert bekommt.
  /** Stadtteil, etwa „Göggingen" */
  stadtteil?: string;
  /** Jahr der letzten Sanierung dieser Einheit */
  sanierungsjahr?: number;
  /** Anteil dieser Einheit an den Sanierungen am Gemeinschaftseigentum in Prozent (nach MEA) */
  sanierungAnteilProzent?: number;
  /** Derselbe Anteil in Euro */
  sanierungAnteilBetrag?: number;
  /** Umlagefähige Nebenkosten je Monat, für die Warmmiete */
  nebenkostenMonat?: number;
  /** Garantierte Erstvermietung (Kaltmiete je Monat), nur bei Neubau oder Leerstand */
  mietgarantieKalt?: number;
  /** Laufzeit der Mietgarantie in Monaten ab Übergabe */
  mietgarantieMonate?: number;
  /** WEG-Verwaltung je Monat für diese Einheit */
  verwaltungWegMonat?: number;
  /** Sondereigentumsverwaltung je Monat für diese Einheit */
  verwaltungSevMonat?: number;
  /** SEV im ersten Jahr inklusive */
  sevErstesJahrInklusive?: boolean;
  /** Seit wann die Einheit vermietet ist (YYYY-MM-DD oder YYYY-MM) */
  vermietetSeit?: string;
}

/** Zahl aus `meta` lesen, leer und ungültig werden zu undefined. */
function metaZahl(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Text aus `meta` lesen, leer wird zu undefined. */
function metaText(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function getObjektKalkMeta(objekt: any): any {
  const meta: any = objekt?.meta || {};
  // Aktueller Speicherort ist `meta.kalkulation`; ältere Screens/Altdaten nutzen teils `meta.kalk`.
  return { ...(meta.kalk || {}), ...(meta.kalkulation || {}) };
}

function getWohnungShare(objekt: any, wohnung?: any): number {
  if (!wohnung) return 1;
  const wohnungen = Array.isArray(objekt?.wohnungen) ? objekt.wohnungen : [];
  const isGlobalObjekt = istGlobalobjekt(objekt);
  const isEinzelwohnung = Boolean(objekt?.meta?.einzelwohnung) || wohnungen.length <= 1;

  // In der normalen Objektanlage mit einzeln angelegten Wohnungen werden Hausgeld
  // und nicht umlagefähiges Hausgeld pro Wohnung erfasst und müssen zu 100 % in
  // die jeweilige Wohnungs-Kalkulation laufen. Nur echte Globalobjekte enthalten
  // Objekt-Gesamtsummen, die anteilig verteilt werden.
  if (!isGlobalObjekt || isEinzelwohnung) return 1;

  const qmTotal = wohnungen.reduce((sum: number, w: any) => sum + (Number(w?.groesse) || 0), 0);
  const qm = Number(wohnung?.groesse) || 0;
  if (qmTotal > 0 && qm > 0) return qm / qmTotal;

  return 1 / Math.max(wohnungen.length, 1);
}

/**
 * Das Hausgeld gesamt der Einheit selbst, ohne Objektwert: gepflegt oder nach
 * der gemeinsamen Regel (`_shared/einheit-hausgeld.ts`) aus den Teilen, bei
 * Investagon-Einheiten aus `investagonRaw`. Bewusst nicht in
 * `dbRowToWohnung`: Sonst schriebe jedes Speichern den gerechneten Wert als
 * scheinbare Handpflege nach `meta.hausgeldMonat`. Nimmt eine `ObjektWohnung`
 * oder eine Tabellenzeile mit `meta`.
 */
export function hausgeldMonatEinheit(wohnung?: any): number | undefined {
  if (!wohnung) return undefined;
  return hausgeldTeile(wohnung).gesamt ?? hausgeldTeile(wohnung.meta).gesamt;
}

/**
 * Monatliches Brutto-Hausgeld für eine konkrete Wohnung.
 * Bei als Einzelwohnung angelegten Objekten gelten die im Objekt-Stamm erfassten Werte
 * immer zu 100 % für diese eine Einheit – sie werden nicht aufgeteilt.
 */
export function getHausgeldMonatForWohnung(objekt: any, wohnung?: any): number {
  const direkt = hausgeldMonatEinheit(wohnung) ?? 0;
  if (direkt > 0) return direkt;

  const kalk = getObjektKalkMeta(objekt);
  const global: any = objekt?.globalDaten || objekt?.global_daten || {};
  const objektWert = Number(kalk.hausgeldMonat ?? global.hausgeldMonat ?? global.hausgeld_monat ?? objekt?.global_hausgeld_monat ?? 0);
  if (objektWert <= 0) return 0;

  return Math.round(objektWert * getWohnungShare(objekt, wohnung));
}

/**
 * Gibt die zum Stichtag gültige Miete zurück.
 * Wenn eine Mieterhöhung hinterlegt ist und das Datum erreicht/überschritten,
 * wird die neue Miete zurückgegeben, sonst die aktuelle.
 * Optional: stichtag angeben für Zukunftsberechnungen.
 */
export function getAktuelleMiete(wohnung: ObjektWohnung, stichtag?: string): number {
  if (!wohnung.neueMiete || !wohnung.mieterhoehungAb) return wohnung.mieteGesamt;
  // Heute in deutscher Zeit; der UTC-Tag hing nachts bis 02:00 Uhr zurück.
  const ref = stichtag || heuteBerlinIso();
  return ref >= wohnung.mieterhoehungAb ? wohnung.neueMiete : wohnung.mieteGesamt;
}

/**
 * Monatliches NICHT umlegbares Hausgeld des gesamten Objekts.
 * Reihenfolge: expliziter EUR-Override (meta.kalkulation/meta.kalk),
 * sonst % auf Brutto-Hausgeld (default 30 %).
 * Akzeptiert sowohl camelCase als auch DB-snake_case-Felder.
 */
export function getHausgeldNichtUmlegbarMonat(objekt: any): number {
  if (!objekt) return 0;
  const kalk = getObjektKalkMeta(objekt);
  const global: any = objekt.globalDaten || objekt.global_daten || {};
  const eur = Number(kalk.hausgeldNichtUmlagefaehigEuro || 0);
  if (eur > 0) return eur;
  const gesamt = Number(global.hausgeldMonat ?? global.hausgeld_monat ?? kalk.hausgeldMonat ?? 0);
  const p = Number(kalk.hausgeldNichtUmlagefaehigP ?? 30);
  return Math.round((gesamt * p) / 100);
}

/**
 * Monatlicher nicht umlagefähiger Hausgeld-Anteil für eine konkrete Wohnung.
 * EUR-Override schlägt %-Berechnung. Einzelwohnungen werden zu 100 % übernommen.
 */
export function getHausgeldNichtUmlegbarForWohnung(objekt: any, wohnung?: any): number {
  const direkt = Number(
    wohnung?.hausgeldNichtUmlagefaehigEuro
      ?? wohnung?.meta?.hausgeldNichtUmlagefaehigEuro
      ?? 0,
  );
  if (direkt > 0) return direkt;

  const kalk = getObjektKalkMeta(objekt);
  const eur = Number(kalk.hausgeldNichtUmlagefaehigEuro || 0);
  if (eur > 0) return Math.round(eur * getWohnungShare(objekt, wohnung));

  const hausgeld = getHausgeldMonatForWohnung(objekt, wohnung);
  const p = Number(wohnung?.hausgeldNichtUmlagefaehigP ?? wohnung?.meta?.hausgeldNichtUmlagefaehigP ?? kalk.hausgeldNichtUmlagefaehigP ?? 30);
  return Math.round((hausgeld * p) / 100);
}

export function getHausgeldNichtUmlegbarP(objekt: any, wohnung?: any): number {
  const kalk = getObjektKalkMeta(objekt);
  return Number(wohnung?.hausgeldNichtUmlagefaehigP ?? wohnung?.meta?.hausgeldNichtUmlagefaehigP ?? kalk.hausgeldNichtUmlagefaehigP ?? 30);
}

/**
 * Prüft ob eine Mieterhöhung hinterlegt und noch ausstehend ist.
 */
export function hatGeplanteErhoehung(wohnung: ObjektWohnung): boolean {
  if (!wohnung.neueMiete || !wohnung.mieterhoehungAb) return false;
  const heute = new Date().toISOString().split("T")[0];
  return wohnung.mieterhoehungAb > heute;
}

export interface ObjektData {
  id: string;
  titel: string;
  adresse: string;
  plz: string;
  ort: string;
  beschreibung: string;
  highlights: string[];
  bildUrl: string;
  bilder: ObjektBild[];
  dokumente: ObjektDokument[];
  wohnungen: ObjektWohnung[];
  /**
   * Nur gesetzt in der Angebotssicht (`objektImAngebot`): die Einheiten, die
   * dort aus `wohnungen` herausgenommen wurden, weil sie verkauft sind oder
   * Investagon sie nicht anbietet. Sie gehoeren weiter zum Objekt, und
   * `saveObjekt` legt sie deshalb wieder dazu, statt sie zu loeschen.
   */
  wohnungenNichtImAngebot?: ObjektWohnung[];
  videoUrl: string;
  videoSichtbar: boolean;
  badge: string;
  groesseVon: number;
  groesseBis: number;
  preisVon: number;
  preisBis: number;
  renditeVon: number;
  renditeBis: number;
  sichtbar: boolean;
  status?: "entwurf" | "freigegeben";
  erstellt_am: string;
  erstellt_von?: string;
  exklusivPartner?: string[];
  cloudOrdnerUrl?: string;
  globalObjekt?: boolean;
  /**
   * Die Belegung des ganzen Hauses, nur beim Globalobjekt (Migration
   * `20260923152000_globalobjekt_reservierung.sql`). Fehlt das Feld, ist die
   * Migration noch nicht gelaufen; dann lässt sich das Haus nicht reservieren.
   *
   * Geschrieben wird die Belegung nur von der Datenbank
   * (`reserviere_objekt_nach_unterschrift`), die Vormerkung nur von
   * `vormerke_objekt`. `saveObjekt` schreibt keine dieser Spalten, siehe
   * `objektToDbRow`. Sonst könnte ein älterer Stand aus dem Zwischenspeicher
   * eine frische Reservierung überschreiben.
   */
  belegung?: HausBelegung;
  belegungKundeId?: string;
  belegungKundeName?: string;
  /** Wann reserviert wurde, als Zeitpunkt. */
  belegungAm?: string;
  /** Nutzerkennung dessen, der die Reservierung ausgelöst hat. */
  belegungVon?: string;
  /** Die 60 Minuten Vormerkung ab dem Versand der Vereinbarung. Die Belegung bleibt dabei „frei“. */
  vorgemerktBis?: string;
  vorgemerktKundeId?: string;
  vorgemerktKundeName?: string;
  vorgemerktVon?: string;
  vorgemerktBeraterName?: string;
  sanierungskosten?: number;
  /** Verteilung des Erhaltungsaufwands auf 1–5 Jahre (§82b EStDV). Default 1. */
  erhaltungsaufwandJahre?: number;
  afaDaten?: {
    afaModell: "linear" | "degressiv" | "gutachten";
    afaSatz: number;
    restnutzungsdauer: number;
    grundstueckAnteil: number;
    bodenrichtwert?: number;
    grundstuecksflaeche?: number;
  };
  globalDaten?: {
    gesamtQm: number;
    etagen: number;
    baujahr: number;
    grundstueckQm: number;
    verkaufspreis: number;
    qmPreis: number;
    rendite: number;
    jahresnettomiete: number;
    hausgeldMonat: number;
    kaufnebenkosten: number;
    grundstueckAnteil: number;
    zustand: string;
    energieeffizienzklasse: string;
    stellplaetze: number;
    vermietungsstand: number;
  };
  verkaeuferDaten?: {
    /**
     * Firma oder Privatperson, ausdrücklich gewählt. Leer bei allen Objekten
     * aus der Zeit davor. Siehe `verkaeuferName.ts`.
     */
    art?: "firma" | "person" | "";
    /** Firmenname bei „Firma“, Nachname bei „Privatperson“. */
    name: string;
    /** Nur bei „Privatperson“. */
    vorname?: string;
    strasse: string;
    plz: string;
    ort: string;
    email: string;
    telefon: string;
    /**
     * Altes Feld aus der Zeit vor der Wahl: ein zweiter, freiwilliger
     * Firmenname neben dem Namen. Es wird nicht mehr abgefragt, bleibt aber
     * stehen, damit an bestehenden Objekten nichts verschwindet.
     */
    firma?: string;
  };
  meta?: Record<string, any>;
}

export const DEFAULT_WOHNUNG_DOCS: WohnungDokument[] = [
  { id: "wd1", name: "Wohnfläche", url: "", kategorie: "wohnungsunterlagen" },
  { id: "wd2", name: "Grundriss", url: "", kategorie: "wohnungsunterlagen" },
  { id: "wd4", name: "Wohnungsbilder", url: "", kategorie: "wohnungsunterlagen" },
  { id: "wd5", name: "Renovierung WE", url: "", kategorie: "wohnungsunterlagen" },
  { id: "wd6", name: "Mietvertrag", url: "", kategorie: "wohnungsunterlagen" },
  { id: "wd7", name: "Wirtschaftsplan", url: "", kategorie: "wohnungsunterlagen" },
  { id: "wd8", name: "Hausgeld", url: "", kategorie: "wohnungsunterlagen" },
  { id: "wd9", name: "GBA Wohnung", url: "", kategorie: "wohnungsunterlagen" },
];

export function defaultDokumente(): ObjektDokument[] {
  return [
    { id: crypto.randomUUID(), name: "Exposé", url: "", typ: "standard", kategorie: "objektunterlagen", sichtbar: true },
    { id: crypto.randomUUID(), name: "Objektbeschreibung", url: "", typ: "standard", kategorie: "objektunterlagen", sichtbar: true },
    { id: crypto.randomUUID(), name: "Objektbilder", url: "", typ: "standard", kategorie: "objektunterlagen", sichtbar: true },
    { id: crypto.randomUUID(), name: "Lageplan", url: "", typ: "standard", kategorie: "objektunterlagen", sichtbar: true },
    { id: crypto.randomUUID(), name: "Versicherungsnachweis", url: "", typ: "standard", kategorie: "objektunterlagen", sichtbar: true },
    { id: crypto.randomUUID(), name: "Energieausweis", url: "", typ: "standard", kategorie: "objektunterlagen", sichtbar: true },
    { id: crypto.randomUUID(), name: "Aufteilungsplan", url: "", typ: "standard", kategorie: "objektunterlagen", sichtbar: true },
    { id: crypto.randomUUID(), name: "Grundbuchauszug", url: "", typ: "standard", kategorie: "objektunterlagen", sichtbar: true },
    { id: crypto.randomUUID(), name: "Teilungserklärung", url: "", typ: "standard", kategorie: "objektunterlagen", sichtbar: true },
    { id: crypto.randomUUID(), name: "Wohnflächenberechnung", url: "", typ: "standard", kategorie: "objektunterlagen", sichtbar: true },
  ];
}

// ── Mapping DB ↔ App Models ──

const numberOr = (value: unknown, fallback: number) => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export function dbRowToObjekt(row: any, bilder: any[], dokumente: any[], wohnungen: any[], wohnungsBilder: any[] = [], mitDokumentenCache = true): ObjektData {
  return {
    id: row.id,
    titel: row.titel || "",
    adresse: row.adresse || "",
    plz: row.plz || "",
    ort: row.ort || "",
    beschreibung: row.beschreibung || "",
    highlights: row.highlights || [],
    bildUrl: row.bild_url || "",
    videoUrl: row.video_url || "",
    videoSichtbar: row.video_sichtbar ?? false,
    badge: row.badge || "",
    groesseVon: numberOr(row.groesse_von, 0),
    groesseBis: numberOr(row.groesse_bis, 0),
    preisVon: numberOr(row.preis_von, 0),
    preisBis: numberOr(row.preis_bis, 0),
    renditeVon: numberOr(row.rendite_von, 0),
    renditeBis: numberOr(row.rendite_bis, 0),
    sichtbar: row.sichtbar !== false,
    status: row.status || "freigegeben",
    erstellt_am: row.erstellt_am || "",
    erstellt_von: row.erstellt_von || undefined,
    exklusivPartner: row.exklusiv_partner || [],
    cloudOrdnerUrl: row.cloud_ordner_url || "",
    globalObjekt: row.global_objekt ?? false,
    // Die Spalten gibt es erst mit der Migration 20260923152000. Vorher fehlen
    // sie in der Zeile, und `belegung` bleibt leer: das Zeichen, dass das Haus
    // noch nicht reserviert werden kann.
    ...(row.belegung === undefined || row.belegung === null ? {} : { belegung: hausBelegungLesen(row.belegung) }),
    belegungKundeId: row.belegung_kunde_id || undefined,
    belegungKundeName: row.belegung_kunde_name || undefined,
    belegungAm: row.belegung_am || undefined,
    belegungVon: row.belegung_von || undefined,
    vorgemerktBis: row.vorgemerkt_bis || undefined,
    vorgemerktKundeId: row.vorgemerkt_kunde_id || undefined,
    vorgemerktKundeName: row.vorgemerkt_kunde_name || undefined,
    vorgemerktVon: row.vorgemerkt_von || undefined,
    vorgemerktBeraterName: row.vorgemerkt_berater_name || undefined,
    sanierungskosten: numberOr(row.erhaltungsaufwand ?? row.sanierungskosten, 0),
    erhaltungsaufwandJahre: Math.max(1, Math.min(5, numberOr(row.erhaltungsaufwand_jahre, 1))),
    afaDaten: {
      afaModell: row.afa_modell ?? "linear",
      afaSatz: numberOr(row.afa_satz, 2),
      restnutzungsdauer: numberOr(row.restnutzungsdauer, 50),
      grundstueckAnteil: numberOr(row.grundstueck_anteil, 20),
      bodenrichtwert: numberOr(row.bodenrichtwert, 0),
      grundstuecksflaeche: numberOr(row.global_grundstueck_qm, 0),
    },
    globalDaten: {
      gesamtQm: numberOr(row.global_gesamt_qm, 0),
      etagen: numberOr(row.global_etagen, 0),
      baujahr: numberOr(row.global_baujahr, 0),
      grundstueckQm: numberOr(row.global_grundstueck_qm, 0),
      verkaufspreis: numberOr(row.global_verkaufspreis, 0),
      qmPreis: numberOr(row.global_gesamt_qm, 0) > 0
        ? parseFloat((numberOr(row.global_verkaufspreis, 0) / numberOr(row.global_gesamt_qm, 0)).toFixed(2))
        : 0,
      rendite: numberOr(row.global_rendite, 0),
      jahresnettomiete: numberOr(row.global_jahresnettomiete, 0),
      hausgeldMonat: numberOr(row.global_hausgeld_monat, 0),
      kaufnebenkosten: numberOr(row.global_kaufnebenkosten, 0),
      grundstueckAnteil: numberOr(row.grundstueck_anteil, 20),
      zustand: row.global_zustand || "",
      energieeffizienzklasse: row.global_energieeffizienzklasse || "",
      stellplaetze: numberOr(row.global_stellplaetze, 0),
      vermietungsstand: numberOr(row.global_vermietungsstand, 0),
    },
    bilder: bilder.map(b => ({
      id: b.id,
      url: b.url,
      alt: b.alt || "",
      reihenfolge: b.reihenfolge || 0,
    })),
    dokumente: dokumente.map(d => ({
      id: d.id,
      name: d.name,
      url: d.url || "",
      typ: d.typ || "standard",
      kategorie: d.kategorie || "objektunterlagen",
      sichtbar: d.sichtbar !== false,
      ...freigabeFelder(d),
    })),
    wohnungen: wohnungen.map(w => dbRowToWohnung(w, wohnungsBilder.filter((b: any) => b.wohnung_id === w.id), mitDokumentenCache)),
    meta: row.meta || {},
    verkaeuferDaten: (row.meta as any)?.verkaeuferDaten || undefined,
  };
}

/**
 * Die Freigabe-Spalten einer Dokumentzeile, nur wenn die Zeile sie trägt.
 *
 * Ohne die Migration 20260923170000 fehlen sie, dann bleibt das Ergebnis
 * leer und die Ampel läuft mit ihren Grundregeln.
 */
function freigabeFelder(d: unknown): DokumentFreigabeFelder {
  if (!d || typeof d !== "object" || !("kunden_freigabe" in d)) return {};
  const zeile = d as Record<string, unknown>;
  return { kundenFreigabe: kundenFreigabeWert(zeile.kunden_freigabe), geschwaerzt: zeile.geschwaerzt === true, freigabeSpalten: true };
}

/** Schlüssel, die in `meta.dokumente` nichts gelten, siehe `wohnungDokumente`. */
const NUR_AUS_DER_TABELLE = ["kunden_freigabe", "kunden_freigabe_von", "kunden_freigabe_am", "geschwaerzt", "kundenFreigabe", "freigabeSpalten", "ausTabelle"];

/**
 * Die Unterlagen einer Einheit aus `meta.dokumente` und aus der Tabelle.
 *
 * Bei gleicher Adresse gewinnt die Tabelle. Freigabe und Schwärzung zählen
 * nur aus der Tabelle: Dort schützt sie ein Auslöser, `meta` dagegen darf
 * jede interne Rolle schreiben. Was dort unter diesen Schlüsseln steht (etwa
 * eine beim Speichern mitgeschriebene Kopie), fällt deshalb weg.
 */
function wohnungDokumente(ausMeta: unknown, ausTabelle: Array<Record<string, unknown>>): WohnungDokument[] {
  const metaEintraege = (Array.isArray(ausMeta) ? ausMeta : [])
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    // Ein aus einer PDF übernommener Grundriss steht nur in der Tabelle, eine Kopie in `meta` ist veraltet (`istUebernahmeKopie`).
    .filter((d) => !istUebernahmeKopie(d.url))
    .map((d) => {
      const sauber = { ...d };
      for (const schluessel of NUR_AUS_DER_TABELLE) delete sauber[schluessel];
      return sauber;
    });
  const tabellenZeilen: Array<Record<string, unknown>> = ausTabelle.map((d) => ({ ...d, ausTabelle: true, ...freigabeFelder(d) }));
  return [...new Map([...metaEintraege, ...tabellenZeilen].map((d) => [d.url || d.id, d])).values()] as unknown as WohnungDokument[];
}

function dbRowToWohnung(w: any, tableBilder: any[] = [], mitDokumentenCache = true): ObjektWohnung {
  const meta = w.meta || {};
  const metaBilder = Array.isArray(meta.bilder) ? meta.bilder : [];
  return {
    id: w.id,
    weNr: w.we_nr || "",
    etage: w.etage || "",
    lage: w.lage || "",
    groesse: Number(w.groesse) || 0,
    zimmer: Number(w.zimmer) || 0,
    mieteGesamt: Number(w.miete_gesamt) || 0,
    vkGesamt: Number(w.vk_gesamt) || 0,
    qmPreis: Number(w.qm_preis) || 0,
    rendite: Number(w.rendite) || 0,
    vermietet: w.vermietet || false,
    vermietungsStatus: meta.vermietungsStatus || (w.vermietet ? "vermietet" : "leerstand"),
    status: einheitStatus(w.status),
    investagonStatusText: metaText(meta.investagonRaw?.statusName),
    investagonId: metaText(meta.investagonId),
    investagonRaw: meta.investagonRaw && typeof meta.investagonRaw === "object" ? meta.investagonRaw : undefined,
    kundeId: w.kunde_id || undefined,
    kundeName: w.kunde_name || undefined,
    beraterName: meta.beraterName || undefined,
    reserviertAm: w.reserviert_am || w.gesetzt_am || undefined,
    // Die Spalten gibt es erst mit der Migration 20260923150000. Vorher fehlen
    // sie in der Zeile, und die Felder bleiben leer.
    reserviertVon: w.reserviert_von || undefined,
    vorgemerktBis: w.vorgemerkt_bis || undefined,
    vorgemerktKundeId: w.vorgemerkt_kunde_id || undefined,
    vorgemerktKundeName: w.vorgemerkt_kunde_name || undefined,
    vorgemerktBeraterName: w.vorgemerkt_berater_name || undefined,
    vorgemerktVon: w.vorgemerkt_von || undefined,
    dokumente: wohnungDokumente(meta.dokumente, mitDokumentenCache ? cacheFilter<Record<string, unknown>>("wohnungs_dokumente", (d) => d.wohnung_id === w.id) : []),
    bilder: [...new Map([...metaBilder, ...tableBilder].map((b: any) => [b.url, { id: b.id, url: b.url, alt: b.alt || "", reihenfolge: b.reihenfolge || 0 }])).values()].sort((a, b) => a.reihenfolge - b.reihenfolge),
    exklusivNutzer: meta.exklusivNutzer || undefined,
    stellplatzPreis: meta.stellplatzPreis ?? undefined,
    stellplatzMiete: meta.stellplatzMiete ?? undefined,
    moebelPreis: metaZahl(meta.moebelPreis),
    ruecklageZufuehrungMonat: metaZahl(meta.ruecklageZufuehrungMonat),
    moebelNutzungsdauerJahre: metaZahl(meta.moebelNutzungsdauerJahre),
    finanzierungsnebenkostenSatz: metaZahl(meta.finanzierungsnebenkostenSatz),
    neueMiete: meta.neueMiete ?? undefined,
    mieterhoehungAb: meta.mieterhoehungAb ?? undefined,
    ruecklageWohnung: meta.ruecklageWohnung ?? undefined,
    hausgeldMonat: meta.hausgeldMonat ?? undefined,
    hausgeldNichtUmlagefaehigEuro: meta.hausgeldNichtUmlagefaehigEuro ?? undefined,
    hausgeldNichtUmlagefaehigP: meta.hausgeldNichtUmlagefaehigP ?? undefined,
    unterlagenLink: meta.unterlagenLink ?? undefined,
    stadtteil: metaText(meta.stadtteil),
    sanierungsjahr: metaZahl(meta.sanierungsjahr),
    sanierungAnteilProzent: metaZahl(meta.sanierungAnteilProzent),
    sanierungAnteilBetrag: metaZahl(meta.sanierungAnteilBetrag),
    nebenkostenMonat: metaZahl(meta.nebenkostenMonat),
    mietgarantieKalt: metaZahl(meta.mietgarantieKalt),
    mietgarantieMonate: metaZahl(meta.mietgarantieMonate),
    verwaltungWegMonat: metaZahl(meta.verwaltungWegMonat),
    verwaltungSevMonat: metaZahl(meta.verwaltungSevMonat),
    sevErstesJahrInklusive: meta.sevErstesJahrInklusive === true ? true : undefined,
    vermietetSeit: metaText(meta.vermietetSeit),
  };
}

/**
 * Das Objekt als Datenbankzeile für `saveObjekt`.
 *
 * Belegung und Vormerkung des Hauses (`belegung`, `belegung_*`,
 * `vorgemerkt_*`) stehen hier ausdrücklich NICHT drin. `saveObjekt` schreibt
 * die Zeile als Ganzes; stünden die Spalten hier, schriebe jedes Speichern im
 * CRM den Stand aus dem Zwischenspeicher zurück und könnte damit eine
 * Reservierung überschreiben, die ein anderer Partner gerade bekommen hat.
 * Ohne die Spalten lässt die Datenbank sie beim Speichern unberührt.
 */
export const OBJEKT_BELEGUNG_SPALTEN = [
  "belegung", "belegung_kunde_id", "belegung_kunde_name", "belegung_am", "belegung_von",
  "vorgemerkt_bis", "vorgemerkt_kunde_id", "vorgemerkt_kunde_name", "vorgemerkt_von", "vorgemerkt_berater_name",
] as const;

export function objektToDbRow(o: ObjektData): Record<string, any> {
  return {
    id: o.id,
    titel: o.titel,
    adresse: o.adresse,
    plz: o.plz,
    ort: o.ort,
    beschreibung: o.beschreibung,
    highlights: o.highlights,
    bild_url: o.bildUrl,
    video_url: o.videoUrl,
    video_sichtbar: o.videoSichtbar,
    badge: o.badge,
    groesse_von: o.groesseVon,
    groesse_bis: o.groesseBis,
    preis_von: o.preisVon,
    preis_bis: o.preisBis,
    rendite_von: o.renditeVon,
    rendite_bis: o.renditeBis,
    sichtbar: o.sichtbar,
    status: o.status || "freigegeben",
    erstellt_am: o.erstellt_am,
    erstellt_von: o.erstellt_von || null,
    exklusiv_partner: o.exklusivPartner || [],
    cloud_ordner_url: o.cloudOrdnerUrl || null,
    global_objekt: o.globalObjekt ?? false,
    sanierungskosten: o.sanierungskosten ?? 0,
    erhaltungsaufwand: o.sanierungskosten ?? 0,
    erhaltungsaufwand_jahre: Math.max(1, Math.min(5, o.erhaltungsaufwandJahre ?? 1)),
    afa_modell: o.afaDaten?.afaModell ?? "linear",
    afa_satz: o.afaDaten?.afaSatz ?? 2,
    restnutzungsdauer: o.afaDaten?.restnutzungsdauer ?? 50,
    grundstueck_anteil: o.afaDaten?.grundstueckAnteil ?? 20,
    bodenrichtwert: o.afaDaten?.bodenrichtwert ?? 0,
    global_gesamt_qm: o.globalDaten?.gesamtQm ?? null,
    global_etagen: o.globalDaten?.etagen ?? null,
    global_baujahr: o.globalDaten?.baujahr ?? null,
    global_grundstueck_qm: o.globalDaten?.grundstueckQm ?? null,
    global_verkaufspreis: o.globalDaten?.verkaufspreis ?? null,
    global_rendite: o.globalDaten?.rendite ?? null,
    global_jahresnettomiete: o.globalDaten?.jahresnettomiete ?? null,
    global_hausgeld_monat: o.globalDaten?.hausgeldMonat ?? null,
    global_kaufnebenkosten: o.globalDaten?.kaufnebenkosten ?? null,
    global_zustand: o.globalDaten?.zustand || null,
    global_energieeffizienzklasse: o.globalDaten?.energieeffizienzklasse || null,
    global_stellplaetze: o.globalDaten?.stellplaetze ?? null,
    global_vermietungsstand: o.globalDaten?.vermietungsstand ?? null,
    meta: o.meta || {},
  };
}

/**
 * Eine Wohnung in eine Datenbankzeile umschreiben.
 *
 * `bestandsMeta` ist das `meta` der bereits gespeicherten Zeile. Es gehoerte
 * dazu, als `saveObjekt` die Einheiten noch loeschte und neu einfuegte (bis
 * zum 23.09.2026): Alles, was das CRM nicht als eigenes Feld kennt, war
 * nach jedem Speichern von Hand weg. Betroffen waren die Investagon-Einheitenkennung, der
 * Originaldatensatz mit dem Zustand im Klartext, der Moebelpreis und die
 * Marke `investagonStatusVerwaltet`, an der der Import erkennt, ob er den
 * Status dieser Wohnung setzen darf. Danach fiel die Wiedererkennung im
 * Import auf die Wohnungsnummer zurueck.
 *
 * Exportiert, damit der Test genau diesen Rundlauf pruefen kann.
 */
export function wohnungToDbRow(
  w: ObjektWohnung,
  objektId: string,
  bestandsMeta?: Record<string, any> | null,
): Record<string, any> {
  return {
    id: w.id,
    objekt_id: objektId,
    we_nr: w.weNr,
    etage: w.etage,
    lage: w.lage,
    groesse: w.groesse,
    zimmer: w.zimmer,
    miete_gesamt: w.mieteGesamt,
    vk_gesamt: w.vkGesamt,
    qm_preis: w.qmPreis,
    rendite: w.rendite,
    vermietet: w.vermietet,
    status: w.status,
    kunde_id: w.kundeId || null,
    kunde_name: w.kundeName || null,
    gesetzt_am: null,
    gesetzt_bis: null,
    reserviert_am: w.reserviertAm || null,
    /*
     * Vormerkung und Auslöser nur, wenn sie gesetzt sind: Solange die
     * Migration fehlt, gibt es die Spalten nicht, und ein `null` dafür ließe
     * das ganze Schreiben scheitern. `updateWohnung` und `saveObjekt` nehmen
     * sie ohnehin wieder heraus, beide schreiben sie nie.
     */
    ...(w.reserviertVon ? { reserviert_von: w.reserviertVon } : {}),
    ...(w.vorgemerktBis ? { vorgemerkt_bis: w.vorgemerktBis } : {}),
    ...(w.vorgemerktKundeId ? { vorgemerkt_kunde_id: w.vorgemerktKundeId } : {}),
    ...(w.vorgemerktKundeName ? { vorgemerkt_kunde_name: w.vorgemerktKundeName } : {}),
    ...(w.vorgemerktBeraterName ? { vorgemerkt_berater_name: w.vorgemerktBeraterName } : {}),
    ...(w.vorgemerktVon ? { vorgemerkt_von: w.vorgemerktVon } : {}),
    meta: {
      // Unbekannte Schluessel der vorhandenen Zeile zuerst, die gepflegten
      // Felder darunter stechen sie.
      ...(bestandsMeta || {}),
      dokumente: w.dokumente || [],
      bilder: w.bilder || [],
      beraterName: w.beraterName || null,
      exklusivNutzer: w.exklusivNutzer || null,
      vermietungsStatus: w.vermietungsStatus || (w.vermietet ? "vermietet" : "leerstand"),
      stellplatzPreis: w.stellplatzPreis ?? null,
      stellplatzMiete: w.stellplatzMiete ?? null,
      neueMiete: w.neueMiete ?? null,
      mieterhoehungAb: w.mieterhoehungAb ?? null,
      ruecklageWohnung: w.ruecklageWohnung ?? null,
      hausgeldMonat: w.hausgeldMonat ?? null,
      hausgeldNichtUmlagefaehigEuro: w.hausgeldNichtUmlagefaehigEuro ?? null,
      hausgeldNichtUmlagefaehigP: w.hausgeldNichtUmlagefaehigP ?? null,
      unterlagenLink: w.unterlagenLink ?? null,
      stadtteil: w.stadtteil ?? null,
      sanierungsjahr: w.sanierungsjahr ?? null,
      sanierungAnteilProzent: w.sanierungAnteilProzent ?? null,
      sanierungAnteilBetrag: w.sanierungAnteilBetrag ?? null,
      nebenkostenMonat: w.nebenkostenMonat ?? null,
      mietgarantieKalt: w.mietgarantieKalt ?? null,
      mietgarantieMonate: w.mietgarantieMonate ?? null,
      verwaltungWegMonat: w.verwaltungWegMonat ?? null,
      verwaltungSevMonat: w.verwaltungSevMonat ?? null,
      sevErstesJahrInklusive: w.sevErstesJahrInklusive ?? null,
      vermietetSeit: w.vermietetSeit ?? null,
      // Nur schreiben, wenn vorhanden: ein null wuerde beim Zusammenfuehren in
      // `updateWohnung` die vorhandene Kennung ueberschreiben.
      ...(w.investagonId ? { investagonId: w.investagonId } : {}),
      ...(w.investagonRaw ? { investagonRaw: w.investagonRaw } : {}),
      // Ebenso: Den Möbelpreis setzt nur der Import, ein null löschte ihn.
      ...(w.moebelPreis !== undefined ? { moebelPreis: w.moebelPreis } : {}),
    },
  };
}

// ── localStorage fallback for testaccount ──
const LS_KEY = "mi_objekte";
let lastObjektSaveError = "";
let lastObjektSaveHinweise: string[] = [];

export function getLastObjektSaveError() {
  return lastObjektSaveError;
}

/**
 * Was das letzte `saveObjekt` bewusst nicht übernommen hat, in Sätzen für den
 * Nutzer: eine reservierte Einheit, die nicht entfernt wurde, ein
 * Verkaufsstatus, der sich beim Bearbeiten des Objekts nicht ändern lässt.
 * Gespeichert wurde trotzdem, `saveObjekt` gab `true` zurück. Leer, wenn
 * alles übernommen wurde. Fehler stehen weiter in `getLastObjektSaveError`.
 */
export function getLastObjektSaveHinweise(): string[] {
  return [...lastObjektSaveHinweise];
}

function setObjektSaveError(context: string, error: any) {
  const detail = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(" · ");
  lastObjektSaveError = detail ? `${context}: ${detail}` : context;
  console.error(context, error);
}

function lsGetObjekte(): ObjektData[] {
  return localGet<ObjektData[]>(LS_KEY, []);
}

function lsSaveObjekte(data: ObjektData[]) {
  localSet(LS_KEY, data);
}

// ── Public API ──

export function getObjekte(): ObjektData[] {
  if (isTestAccount()) return lsGetObjekte();

  const objektRows = cacheGet("objekte");
  const allBilder = cacheGet("objekt_bilder");
  const allDoks = cacheGet("objekt_dokumente");
  const allWohnungen = cacheGet("wohnungen");
  const allWohnungsBilder = cacheGet("wohnungs_bilder");

  return objektRows.map(row => {
    const bilder = allBilder.filter((b: any) => b.objekt_id === row.id);
    const doks = allDoks.filter((d: any) => d.objekt_id === row.id);
    const wohnungen = allWohnungen.filter((w: any) => w.objekt_id === row.id);
    return dbRowToObjekt(row, bilder, doks, wohnungen, allWohnungsBilder);
  });
}

/**
 * Dasselbe Objekt, gekuerzt auf die Einheiten, die im Angebot stehen.
 *
 * Christians Regel vom 23.09.2026: Verkaufte Einheiten und solche, die
 * Investagon nicht anbietet (offline, in Ueberpruefung, Entwurf, verkauft),
 * verschwinden aus allem, was ein Partner zum Anbieten nutzt. Die Regel steht
 * in `einheitImAngebot`, hier wird sie auf ein Objekt angewandt.
 *
 * Bewusst NICHT in `getObjekte` oder `getObjektById`: Beide speisen auch
 * Bearbeitung und Kundenprofil. Das Kundenprofil muss den Kauf des Kunden
 * weiter zeigen, und `saveObjekt` entfernt Einheiten, die in der Eingabe
 * fehlen; ein gekuerztes Objekt dort wollte die fehlenden entfernen.
 */
export function objektImAngebot(objekt: ObjektData): ObjektData {
  const wohnungen: ObjektWohnung[] = [];
  const nichtImAngebot: ObjektWohnung[] = [];
  for (const w of objekt.wohnungen || []) {
    (einheitImAngebot(w) ? wohnungen : nichtImAngebot).push(w);
  }
  return { ...objekt, wohnungen, wohnungenNichtImAngebot: nichtImAngebot };
}

/** Alle Objekte in der Angebotssicht, fuer Objektuebersicht und Einheitenspiegel. */
export function getObjekteImAngebot(): ObjektData[] {
  return getObjekte().map(objektImAngebot);
}

/** Die Eckdaten einer reservierten Einheit, ohne Bilder und Dokumente. */
export interface WohnungKurz {
  objektId: string;
  titel: string;
  adresse: string;
  plz: string;
  ort: string;
  weNr: string;
  vkGesamt: number;
  groesse: number;
  /** Titelbild des Objekts, für Kundenprofil und Portal. */
  bildUrl: string;
}

/**
 * Adresse und Eckdaten einer Einheit, so günstig wie möglich.
 *
 * `getObjekte` baut jedes Objekt samt Bildern, Dokumenten und allen Einheiten
 * neu auf, und `getObjektById` immerhin noch eines davon. Für die Frage „wo
 * liegt diese Wohnung und was kostet sie“ ist das viel zu teuer: Die Pipeline
 * stellt sie einmal je Karte und noch einmal für jede Spaltensumme, also
 * hunderte Male je Bilddurchlauf. Hier sind es zwei Suchen im Zwischen-
 * speicher, ohne einen einzigen Datensatz umzubauen.
 */
export function getWohnungKurz(objektId?: string | null, wohnungId?: string | null): WohnungKurz | null {
  if (!objektId && !wohnungId) return null;
  try {
    if (isTestAccount()) {
      const objekte = lsGetObjekte();
      const objekt = objektId
        ? objekte.find((o) => o.id === objektId)
        : objekte.find((o) => o.wohnungen?.some((w) => w.id === wohnungId));
      if (!objekt) return null;
      const w = wohnungId ? objekt.wohnungen?.find((x) => x.id === wohnungId) : undefined;
      return {
        objektId: objekt.id, titel: objekt.titel, adresse: objekt.adresse,
        plz: objekt.plz, ort: objekt.ort,
        weNr: w?.weNr || "", vkGesamt: w?.vkGesamt || 0, groesse: w?.groesse || 0,
        bildUrl: objekt.bildUrl || objekt.bilder?.[0]?.url || "",
      };
    }

    const wohnungRow = wohnungId
      ? cacheGet("wohnungen").find((w: any) => w.id === wohnungId)
      : undefined;
    // Ohne Objekt-Kennung am Investment die des Wohnungsdatensatzes nehmen.
    const zielObjektId = objektId || wohnungRow?.objekt_id;
    if (!zielObjektId) return null;
    const objektRow = cacheGet("objekte").find((o: any) => o.id === zielObjektId);
    if (!objektRow) return null;

    return {
      objektId: objektRow.id,
      titel: objektRow.titel || "",
      adresse: objektRow.adresse || "",
      plz: objektRow.plz || "",
      ort: objektRow.ort || "",
      weNr: wohnungRow?.we_nr || "",
      vkGesamt: Number(wohnungRow?.vk_gesamt) || 0,
      groesse: Number(wohnungRow?.groesse) || 0,
      // Erst das Titelbild des Objekts, sonst das erste hinterlegte Bild.
      bildUrl:
        objektRow.bild_url ||
        cacheGet("objekt_bilder")
          .filter((b: any) => b.objekt_id === objektRow.id)
          .sort((a: any, b: any) => (a.reihenfolge || 0) - (b.reihenfolge || 0))[0]?.url ||
        "",
    };
  } catch {
    // Ein noch nicht gefüllter Zwischenspeicher darf nichts umwerfen.
    return null;
  }
}

export function getObjektById(id: string): ObjektData | undefined {
  if (isTestAccount()) return lsGetObjekte().find(o => o.id === id);
  const row = cacheGet("objekte").find((r: any) => r.id === id);
  if (!row) return undefined;
  const bilder = cacheFilter("objekt_bilder", (b: any) => b.objekt_id === id);
  const doks = cacheFilter("objekt_dokumente", (d: any) => d.objekt_id === id);
  const wohnungen = cacheFilter("wohnungen", (w: any) => w.objekt_id === id);
  const wohnungsBilder = cacheGet("wohnungs_bilder");
  return dbRowToObjekt(row, bilder, doks, wohnungen, wohnungsBilder);
}

/**
 * Ein Objekt aus der Angebotssicht wieder vollstaendig machen.
 *
 * Sicherheitsnetz fuer `saveObjekt`: Kommt dort ein Objekt aus der
 * Angebotssicht an, fehlen ihm die verkauften und nicht angebotenen
 * Einheiten. `saveObjekt` entfernt Einheiten, die in der Eingabe fehlen; die
 * verkauften und die aus Investagon schuetzt es zwar selbst, hier kommen sie
 * aber gar nicht erst als Loeschwunsch an. Christians Regel vom 23.09.2026:
 * nie loeschen.
 */
export function mitAllenEinheiten(objekt: ObjektData): ObjektData {
  const { wohnungenNichtImAngebot: ausgeblendet, ...ohneSicht } = objekt;
  if (!ausgeblendet?.length) return ohneSicht;
  const vorhanden = new Set(ohneSicht.wohnungen.map((w) => w.id));
  return {
    ...ohneSicht,
    wohnungen: [
      ...ohneSicht.wohnungen,
      ...ausgeblendet.filter((w) => !vorhanden.has(w.id)),
    ],
  };
}

/** Höchstens so viele Kennungen je Abfrage, sonst wird die Adresse zu lang. */
const KENNUNGEN_JE_ABFRAGE = 100;
/** Supabase liefert je Abruf höchstens 1000 Zeilen, ohne Fehlermeldung. */
const ZEILEN_JE_BLOCK = 1000;
/** Notbremse, damit ein Fehler nicht endlos blättert. */
const MAX_BLOECKE = 50;
/** So viele Einheiten werden gleichzeitig geändert. */
const EINHEITEN_JE_WELLE = 5;

/**
 * Der Teil des Supabase-Clients, den `saveObjekt` braucht. Die erzeugten
 * Typen kennen nicht alle Spalten (Vormerkung, Belegung, Freigabe), deshalb
 * wird mit schlichten Zeilen gearbeitet.
 */
interface DbAntwort<T> {
  data: T | null;
  error: { message?: string; details?: string; hint?: string; code?: string } | null;
}
interface Leseabfrage extends PromiseLike<DbAntwort<Zeile[]>> {
  eq(spalte: string, wert: unknown): Leseabfrage;
  in(spalte: string, werte: unknown[]): Leseabfrage;
  order(spalte: string, optionen?: { ascending?: boolean }): Leseabfrage;
  range(von: number, bis: number): Leseabfrage;
  maybeSingle(): PromiseLike<DbAntwort<Zeile>>;
}
interface Loeschabfrage extends PromiseLike<DbAntwort<null>> {
  eq(spalte: string, wert: unknown): Loeschabfrage;
  in(spalte: string, werte: unknown[]): Loeschabfrage;
  select(spalten: string): PromiseLike<DbAntwort<Zeile[]>>;
}
interface ObjektDb {
  from(tabelle: string): {
    select(spalten: string): Leseabfrage;
    upsert(zeilen: Zeile | Zeile[]): PromiseLike<DbAntwort<null>>;
    insert(zeilen: Zeile[]): PromiseLike<DbAntwort<null>>;
    update(werte: Zeile): { eq(spalte: string, wert: unknown): PromiseLike<DbAntwort<null>> };
    delete(): Loeschabfrage;
  };
}
const objektDb = () => supabase as unknown as ObjektDb;

/**
 * Alle Zeilen einer Tabelle zu diesen Schlüsselwerten, frisch aus der
 * Datenbank und geblättert. Wirft bei einem Fehler.
 */
async function frischeZeilen(tabelle: string, spalte: string, werte: string[]): Promise<Zeile[]> {
  const db = objektDb();
  const zeilen: Zeile[] = [];
  for (let i = 0; i < werte.length; i += KENNUNGEN_JE_ABFRAGE) {
    const teil = werte.slice(i, i + KENNUNGEN_JE_ABFRAGE);
    for (let block = 0; ; block++) {
      if (block >= MAX_BLOECKE) throw new Error(`${tabelle}: zu viele Zeilen zum Abgleichen`);
      const von = block * ZEILEN_JE_BLOCK;
      const { data, error } = await db.from(tabelle).select("*").in(spalte, teil)
        .order("id", { ascending: true }).range(von, von + ZEILEN_JE_BLOCK - 1);
      if (error) throw error;
      const gelesen = (data || []) as Zeile[];
      zeilen.push(...gelesen);
      if (gelesen.length < ZEILEN_JE_BLOCK) break;
    }
  }
  return zeilen;
}

/** Was von einem Objekt gerade in der Datenbank steht. */
interface FrischerStand {
  objekt: Zeile | null;
  wohnungen: Zeile[];
  objektBilder: Zeile[];
  objektDokumente: Zeile[];
  wohnungsBilder: Zeile[];
}

async function frischerStand(objektId: string): Promise<FrischerStand> {
  const db = objektDb();
  const [objektAntwort, wohnungen, objektBilder, objektDokumente] = await Promise.all([
    db.from("objekte").select("*").eq("id", objektId).maybeSingle(),
    frischeZeilen("wohnungen", "objekt_id", [objektId]),
    frischeZeilen("objekt_bilder", "objekt_id", [objektId]),
    frischeZeilen("objekt_dokumente", "objekt_id", [objektId]),
  ]);
  if (objektAntwort.error) throw objektAntwort.error;
  const wohnungsBilder = await frischeZeilen("wohnungs_bilder", "wohnung_id", wohnungen.map((w) => String(w.id)));
  return { objekt: objektAntwort.data ?? null, wohnungen, objektBilder, objektDokumente, wohnungsBilder };
}

/** Kennungen, die der Zwischenspeicher von dieser Tabelle kennt. */
function imZwischenspeicher(tabelle: string): (id: string) => boolean {
  const ids = new Set(cacheGet<Zeile>(tabelle).map((z) => String(z.id)));
  return (id: string) => ids.has(id);
}

/** Zeilen des Zwischenspeichers nach Kennung, als „Basis“ des Abgleichs. */
function zwischenspeicherNachId(tabelle: string): (id: string) => Zeile | undefined {
  const zeilen = new Map(cacheGet<Zeile>(tabelle).map((z) => [String(z.id), z]));
  return (id: string) => zeilen.get(id);
}

const gueltigesBild = (url: unknown) => typeof url === "string" && url.startsWith("http");

const STATUS_TEXT: Record<EinheitStatus, string> = { frei: "Frei", reserviert: "Reserviert", verkauft: "Verkauft" };

function einheitName(weNr: unknown): string {
  const nr = String(weNr ?? "").trim();
  return nr ? `Einheit „${nr}“` : "Eine Einheit ohne Nummer";
}

/**
 * Was außerhalb der Zeile an diesen Einheiten hängt, für `einheitLoeschSperre`.
 *
 * Investments aus dem Zwischenspeicher und zusätzlich frisch aus der
 * Datenbank: `investments` kommt blockweise in den Zwischenspeicher, und eine
 * Tabelle gilt schon nach dem ersten Block als geladen. Offene Kundenlinks
 * liest `objektExposeStore`, erst hier nachgeladen, weil dessen Importe
 * (über den Exposé-Rechner bis `investmentsStore`) sonst an jedem Import
 * dieses Stores hingen.
 *
 * Wirft, wenn sich das nicht prüfen lässt. Dann wird nichts gelöscht.
 */
async function einheitBezuege(wohnungIds: string[]): Promise<Map<string, EinheitBezuege>> {
  const gesucht = new Set(wohnungIds);
  const investmentsJeEinheit = new Map<string, Set<string>>();
  const merken = (investment: Zeile) => {
    const wohnungId = investmentEinheit(investment);
    if (!gesucht.has(wohnungId)) return;
    const ids = investmentsJeEinheit.get(wohnungId) ?? new Set<string>();
    ids.add(String(investment.id));
    investmentsJeEinheit.set(wohnungId, ids);
  };
  cacheGet<Zeile>("investments").forEach(merken);
  const db = objektDb();
  for (let i = 0; i < wohnungIds.length; i += KENNUNGEN_JE_ABFRAGE) {
    const teil = wohnungIds.slice(i, i + KENNUNGEN_JE_ABFRAGE);
    const { data, error } = await db.from("investments").select("id, meta").in("meta->>wohnungId", teil);
    if (error) throw error;
    (data || []).forEach(merken);
  }

  const { ladeOffeneLinksZuEinheiten } = await import("./objektExposeStore");
  const links = await ladeOffeneLinksZuEinheiten(wohnungIds);
  if (links.fehler) throw new Error(`Kundenlinks: ${links.fehler}`);

  return new Map(wohnungIds.map((id) => [id, {
    investments: investmentsJeEinheit.get(id)?.size ?? 0,
    offeneLinks: links.jeEinheit.get(id) ?? 0,
  }]));
}

/**
 * Ein Objekt speichern, samt Einheiten, Objektunterlagen und Bildern.
 *
 * Geschrieben wird nur, was sich geändert hat (seit dem 23.09.2026). Vorher
 * wurden Einheiten, Unterlagen und Bilder gelöscht und neu angelegt; über
 * die Kaskaden verschwanden dabei gesendete Exposé-Links, die
 * Einheitenunterlagen aus Investagon und die Freigaben der Dokumenten-Ampel,
 * und Status und Kunde jeder Einheit kamen aus dem Zwischenspeicher zurück.
 *
 * Der Ablauf:
 *
 *   0. Den Stand des Objekts frisch aus der Datenbank lesen. Gelingt das
 *      nicht, wird nichts geschrieben.
 *   1. Die Objektzeile wie bisher als Ganzes, ohne Hausbelegung und
 *      Vormerkung. Ein reserviertes oder vorgemerktes Haus bleibt
 *      Globalobjekt (`_shared/globalobjekt.ts`).
 *   2. Objektbilder und Objektunterlagen: neue und geänderte in einem
 *      gemeinsamen Upsert, fehlende löschen. Die Freigabespalten der
 *      Unterlagen gehen nie mit.
 *   3. Einheiten: vorhandene per UPDATE nur mit geänderten Feldern, nie
 *      Status, Kunde, Reservierung oder Vormerkung; neue per INSERT, ohne
 *      Kunden; fehlende löschen, außer sie sind reserviert, verkauft,
 *      vorgemerkt, haben einen Kunden oder kommen aus Investagon.
 *   4. Einheitenbilder: neue hinzufügen, fehlende löschen.
 *
 * Gelöscht wird nur, was der Zwischenspeicher kennt, denn nur das kann der
 * Aufrufer gesehen und entfernt haben. Bei Bildern und Unterlagen muss er den
 * Bestand sogar vollständig kennen (blockweises Laden), sonst bleibt alles.
 *
 * Was dabei bewusst nicht übernommen wurde, steht danach in
 * `getLastObjektSaveHinweise`. Ein Fehler steht in `getLastObjektSaveError`,
 * und `false` kommt zurück; bei einem neuen Objekt wird dann wieder
 * aufgeräumt.
 */
/**
 * Zu den Namen der Exklusivpartner die Kennungen in `meta` mitschreiben
 * (05.10.2026). Die Namen selbst bleiben unverändert; die Regel steht in
 * `_shared/objekt-zugang.ts`.
 */
export function mitExklusivKennungen(objekt: ObjektData, profile: ReadonlyArray<{ id?: unknown; name?: unknown }>): ObjektData {
  const meta = objekt.meta || {};
  const bisher = exklusivKennungenLesen(meta);
  const kennungen = exklusivKennungenFuerNamen(objekt.exklusivPartner, bisher, profile || []);
  const leer = Object.keys(kennungen).length === 0;
  if (leer && !(EXKLUSIV_KENNUNG_SCHLUESSEL in meta)) return objekt;
  const { [EXKLUSIV_KENNUNG_SCHLUESSEL]: _alt, ...rest } = meta;
  return { ...objekt, meta: leer ? rest : { ...rest, [EXKLUSIV_KENNUNG_SCHLUESSEL]: kennungen } };
}

export async function saveObjekt(eingabe: ObjektData): Promise<boolean> {
  lastObjektSaveError = "";
  lastObjektSaveHinweise = [];
  const objekt = mitExklusivKennungen(mitAllenEinheiten(eingabe), cacheGet("profiles"));
  if (isTestAccount()) {
    const all = lsGetObjekte();
    const idx = all.findIndex(o => o.id === objekt.id);
    if (idx >= 0) all[idx] = objekt;
    else all.push(objekt);
    lsSaveObjekte(all);
    return true;
  }

  const db = objektDb();
  const hinweise: string[] = [];
  const hinweis = (satz: string) => {
    if (!hinweise.includes(satz)) hinweise.push(satz);
  };

  // 0. Der Stand in der Datenbank. Ohne ihn lässt sich nicht sagen, was neu,
  //    geändert oder entfernt ist; dann lieber gar nichts schreiben.
  let stand: FrischerStand;
  try {
    stand = await frischerStand(objekt.id);
  } catch (fehler) {
    setObjektSaveError("Der aktuelle Stand des Objekts konnte nicht gelesen werden, gespeichert wurde nichts. Bitte versuche es noch einmal", fehler);
    return false;
  }

  // Neu ist ein Objekt nur, wenn weder Datenbank noch Zwischenspeicher es
  // kennen. Nur dann wird bei einem Fehler wieder aufgeräumt.
  const isNewObjekt = !stand.objekt && !imZwischenspeicher("objekte")(objekt.id);

  /*
   * Ein neues Objekt, dessen Speichern scheiterte, wieder entfernen.
   *
   * Seit dem 04.10.2026 wird jeder Schritt geprueft und am Ende nachgesehen,
   * ob noch etwas da ist. Vorher liefen die Schritte blind; blieb ein Teil
   * stehen (etwa weil die Loeschpruefung der Datenbank eine schon verkaufte
   * Einheit festhielt), erfuhr niemand davon. Eine Transaktion ueber mehrere
   * Tabellen gibt es aus dem Browser nicht, deshalb nur die klare Meldung.
   */
  const rollbackNewObjekt = async () => {
    if (!isNewObjekt) return;
    const offen: string[] = [];
    const schritt = async (name: string, aufruf: PromiseLike<{ error: unknown }>) => {
      try {
        const { error } = await aufruf;
        if (error) offen.push(`${name}: ${(error as { message?: string }).message || "abgelehnt"}`);
      } catch (e) {
        offen.push(`${name}: ${(e as Error).message || "nicht erreichbar"}`);
      }
    };
    await schritt("Bilder", db.from("objekt_bilder").delete().eq("objekt_id", objekt.id));
    await schritt("Einheiten", db.from("wohnungen").delete().eq("objekt_id", objekt.id));
    await schritt("Unterlagen", db.from("objekt_dokumente").delete().eq("objekt_id", objekt.id));
    await schritt("Objekt", db.from("objekte").delete().eq("id", objekt.id));
    // Die Zeilensicherheit lehnt still ab; deshalb nachsehen, was noch steht.
    try {
      const { data: rest } = await db.from("objekte").select("id").eq("id", objekt.id);
      const { data: restEinheiten } = await db.from("wohnungen").select("id").eq("objekt_id", objekt.id);
      if ((rest || []).length > 0) offen.push("Das Objekt selbst ist noch gespeichert");
      if ((restEinheiten || []).length > 0) offen.push(`${restEinheiten!.length} Einheiten sind noch gespeichert`);
    } catch (e) {
      offen.push(`Restbestand nicht prüfbar: ${(e as Error).message}`);
    }
    if (offen.length > 0) {
      console.error("Bereinigung nach Teil-Fehler unvollständig", offen);
      void hinweisDialog({
        title: "Objekt wurde nur teilweise angelegt",
        description: `${objekt.titel || "Das Objekt"} wurde nur teilweise angelegt: ${offen.join("; ")}. Bitte prüfen oder Admin melden.`,
      });
    }
  };
  /** Tabellen, die dieses Speichern verändert hat; nur sie werden neu geladen. */
  const geschrieben = new Set<string>();
  const nachladen = () => Promise.all([...geschrieben].map((tabelle) => cacheReload(tabelle)));

  const scheitern = async (kontext: string, fehler: unknown) => {
    setObjektSaveError(kontext, fehler);
    if (isNewObjekt) await rollbackNewObjekt();
    // Bei einem vorhandenen Objekt bleibt stehen, was schon geschrieben ist;
    // die Anzeige soll genau das zeigen.
    else await nachladen();
    return false;
  };

  /**
   * Löscht Zeilen, die in der Eingabe fehlen, sofern der Zwischenspeicher
   * den Bestand vollständig kennt. Die Zeilensicherheit lässt ein verbotenes
   * Löschen ohne Fehler durch, es trifft dann keine Zeile. Deshalb kommen die
   * gelöschten Kennungen zurück und werden gezählt. Gibt einen Fehler der
   * Datenbank zurück, sonst null.
   */
  const entfernen = async (tabelle: string, loeschen: Zeile[], bestand: Zeile[], was: string): Promise<unknown> => {
    if (loeschen.length === 0) return null;
    if (!zwischenspeicherVollstaendig(bestand, imZwischenspeicher(tabelle))) {
      hinweis(`Entfernte ${was} wurden noch nicht gelöscht, weil noch nicht alle geladen waren. Bitte lade die Seite neu und entferne sie noch einmal.`);
      return null;
    }
    const ergebnis = await zeilenLoeschen(tabelle, loeschen.map((z) => String(z.id)));
    if (ergebnis.fehler) return ergebnis.fehler;
    geschrieben.add(tabelle);
    if (ergebnis.geloescht.size < loeschen.length) {
      hinweis(`Nicht alle entfernten ${was} ließen sich löschen, die Datenbank hat es abgelehnt.`);
    }
    return null;
  };

  // 1. Die Objektzeile, ohne Belegung und Vormerkung des Hauses.
  const dbRow = objektToDbRow(objekt);
  for (const spalte of OBJEKT_BELEGUNG_SPALTEN) delete dbRow[spalte];
  if (
    stand.objekt
    && istGlobalobjekt(stand.objekt as { global_objekt?: boolean | null })
    && hausImCrmGebunden(stand.objekt)
    && dbRow.global_objekt !== true
  ) {
    // Ein Haus, an dem im CRM ein Kunde hängt, zerfällt nicht unter der Hand
    // in Einheiten; dieselbe Regel wie im Import (`globalSchalterNachImport`).
    delete dbRow.global_objekt;
    const frischesMeta = (stand.objekt.meta ?? {}) as Record<string, unknown>;
    if (!frischesMeta.investagonSlug) dbRow.meta = { ...(dbRow.meta || {}), anlageklasse: GLOBALOBJEKT_ANLAGEKLASSE };
    hinweis("Das Haus ist im CRM reserviert oder vorgemerkt. Solange das so ist, bleibt es ein Globalobjekt.");
  }
  const { error: objError } = await db.from("objekte").upsert(dbRow);
  if (objError) {
    setObjektSaveError("Objekt-Stammdaten konnten nicht gespeichert werden", objError);
    return false;
  }
  geschrieben.add("objekte");

  // Kennt der Zwischenspeicher eine Zeile, die Datenbank aber nicht mehr, hat
  // sie inzwischen jemand gelöscht; sie entsteht dann nicht neu. Bei einem
  // neuen Objekt gibt es so etwas nicht.
  const anderswoGeloescht = (tabelle: string) => (isNewObjekt ? undefined : imZwischenspeicher(tabelle));

  // 2a. Objektbilder. Ohne ein einziges gültiges Bild in der Eingabe bleiben
  //     sie, wie sie sind (Schutz vor versehentlichem Leeren, wie bisher).
  const validBilder = (objekt.bilder ?? []).filter((b) => gueltigesBild(b.url));
  if (validBilder.length > 0) {
    const abgleich = zeilenAbgleich({
      eingabe: validBilder.map((b) => ({ id: b.id, objekt_id: objekt.id, url: b.url, alt: b.alt || "", reihenfolge: b.reihenfolge ?? 0 })),
      bestand: stand.objektBilder,
      felder: ["url", "alt", "reihenfolge"],
      inhalt: (z) => String(z.url ?? ""),
      basis: zwischenspeicherNachId("objekt_bilder"),
      bekannt: anderswoGeloescht("objekt_bilder"),
    });
    if (abgleich.schreiben.length > 0) {
      const { error } = await db.from("objekt_bilder").upsert(abgleich.schreiben);
      if (error) return scheitern(`Objektbilder konnten nicht gespeichert werden (${abgleich.schreiben.length})`, error);
      geschrieben.add("objekt_bilder");
    }
    const loeschFehler = await entfernen("objekt_bilder", abgleich.loeschen, stand.objektBilder, "Objektbilder");
    if (loeschFehler) return scheitern("Objektbilder konnten nicht entfernt werden", loeschFehler);
  }

  // 2b. Objektunterlagen. Die Freigabespalten der Dokumenten-Ampel
  //     (Migration 20260923170000) stehen bewusst nicht in der Zeile; sie
  //     ändert allein `setze_kunden_freigabe`.
  if ((objekt.dokumente ?? []).length > 0) {
    const abgleich = zeilenAbgleich({
      eingabe: objekt.dokumente.map((d) => ({
        id: d.id, objekt_id: objekt.id, name: d.name, url: d.url, typ: d.typ, kategorie: d.kategorie, sichtbar: d.sichtbar,
      })),
      bestand: stand.objektDokumente,
      felder: ["name", "url", "typ", "kategorie", "sichtbar"],
      inhalt: (z) => [z.kategorie, z.name, z.url].map((v) => String(v ?? "")).join("|"),
      basis: zwischenspeicherNachId("objekt_dokumente"),
      bekannt: anderswoGeloescht("objekt_dokumente"),
    });
    if (abgleich.schreiben.length > 0) {
      const { error } = await db.from("objekt_dokumente").upsert(abgleich.schreiben);
      if (error) return scheitern(`Objektdokumente konnten nicht gespeichert werden (${abgleich.schreiben.length})`, error);
      geschrieben.add("objekt_dokumente");
    }
    const loeschFehler = await entfernen("objekt_dokumente", abgleich.loeschen, stand.objektDokumente, "Objektunterlagen");
    if (loeschFehler) return scheitern("Objektunterlagen konnten nicht entfernt werden", loeschFehler);
  }

  // 3. Einheiten. Ohne Einheiten in der Eingabe bleiben sie, wie sie sind
  //    (Schutz vor versehentlichem Leeren, wie bisher).
  if (objekt.wohnungen.length > 0) {
    const bestandNachId = new Map(stand.wohnungen.map((w) => [String(w.id), w]));
    const imCache = zwischenspeicherNachId("wohnungen");
    const cacheBilder = new Map<string, Zeile[]>();
    for (const b of cacheGet<Zeile>("wohnungs_bilder")) {
      const wohnungId = String(b.wohnung_id ?? "");
      if (!bestandNachId.has(wohnungId)) continue;
      const liste = cacheBilder.get(wohnungId);
      if (liste) liste.push(b);
      else cacheBilder.set(wohnungId, [b]);
    }
    const bestandBilder = (wohnungId: string) => stand.wohnungsBilder.filter((b) => String(b.wohnung_id) === wohnungId);

    const aenderungen: Array<{ id: string; werte: Zeile }> = [];
    const neue: Zeile[] = [];
    /** Kennung der Eingabe → Kennung in der Datenbank; eine neue Einheit kann eine neue bekommen. */
    const kennungen = new Map<string, string>();
    const vergeben = new Set<string>(bestandNachId.keys());

    for (const w of objekt.wohnungen) {
      if (kennungen.has(w.id)) continue;
      const zeile = wohnungToDbRow(w, objekt.id);
      const bestand = bestandNachId.get(w.id);
      if (bestand) {
        kennungen.set(w.id, w.id);
        const cacheZeile = imCache(w.id);
        // Die Basis ist, was der Aufrufer gesehen hat. Kennt der
        // Zwischenspeicher die Einheit nicht, gilt der frische Stand.
        const basis = cacheZeile
          ? wohnungToDbRow(dbRowToWohnung(cacheZeile, cacheBilder.get(w.id) ?? []), objekt.id)
          : wohnungToDbRow(dbRowToWohnung(bestand, bestandBilder(w.id)), objekt.id);
        const ohneMeta = [
          ...(w.bilder === undefined ? ["bilder"] : []),
          ...(w.dokumente === undefined ? ["dokumente"] : []),
        ];
        const { werte, statusVerlangt } = einheitAenderung({ eingabe: zeile, basis, bestand, ohneMeta });
        if (statusVerlangt) {
          hinweis(`${einheitName(bestand.we_nr)}: Der Verkaufsstatus bleibt „${STATUS_TEXT[einheitStatus(bestand.status)]}“. Reservieren, Aufheben und Verkaufen laufen über die Reservierung und die Einheitenliste, nicht über das Bearbeiten des Objekts.`);
        }
        if (Object.keys(werte).length > 0) aenderungen.push({ id: w.id, werte });
        continue;
      }
      const cacheZeile = imCache(w.id);
      if (!isNewObjekt && cacheZeile && String(cacheZeile.objekt_id) === objekt.id) {
        hinweis(`${einheitName(w.weNr)} wurde inzwischen an anderer Stelle entfernt und deshalb nicht wieder angelegt.`);
        continue;
      }
      // `wohnungen.id` ist eine UUID. Die Verwaltungsansicht vergibt für neue
      // Einheiten Kennungen wie „<objekt>-w<zeit>“; die lehnt die Datenbank ab.
      const id = istUuid(w.id) && !vergeben.has(w.id) ? w.id : crypto.randomUUID();
      vergeben.add(id);
      kennungen.set(w.id, id);
      neue.push(neueEinheitZeile({ ...zeile, id }));
    }

    for (let i = 0; i < aenderungen.length; i += EINHEITEN_JE_WELLE) {
      const welle = aenderungen.slice(i, i + EINHEITEN_JE_WELLE);
      const antworten = await Promise.all(welle.map((a) => db.from("wohnungen").update(a.werte).eq("id", a.id)));
      const fehler = antworten.find((a) => a.error)?.error;
      if (fehler) return scheitern("Wohnungen konnten nicht gespeichert werden", fehler);
      geschrieben.add("wohnungen");
    }

    if (neue.length > 0) {
      const { error: wErr } = await db.from("wohnungen").insert(neue);
      if (wErr) return scheitern(`Wohnungen konnten nicht gespeichert werden (${neue.length})`, wErr);
      geschrieben.add("wohnungen");
    }

    // 4. Einheitenbilder, nur für Einheiten, deren Bilder die Eingabe nennt.
    const bildEingabe: Zeile[] = [];
    const bildBestand: Zeile[] = [];
    for (const w of objekt.wohnungen) {
      const id = kennungen.get(w.id);
      if (!id || w.bilder === undefined) continue;
      for (const b of w.bilder) {
        if (!gueltigesBild(b.url)) continue;
        bildEingabe.push({ id: b.id, wohnung_id: id, url: b.url, alt: b.alt || "", reihenfolge: b.reihenfolge ?? 0 });
      }
      if (bestandNachId.has(id)) bildBestand.push(...bestandBilder(id));
    }
    const bildAbgleich = zeilenAbgleich({
      eingabe: bildEingabe,
      bestand: bildBestand,
      felder: ["url", "alt", "reihenfolge"],
      inhalt: (z) => `${String(z.wohnung_id ?? "")}|${String(z.url ?? "")}`,
      basis: zwischenspeicherNachId("wohnungs_bilder"),
      bekannt: anderswoGeloescht("wohnungs_bilder"),
    });
    if (bildAbgleich.schreiben.length > 0) {
      const { error: wbErr } = await db.from("wohnungs_bilder").upsert(bildAbgleich.schreiben);
      if (wbErr) return scheitern(`Wohnungsbilder konnten nicht gespeichert werden (${bildAbgleich.schreiben.length})`, wbErr);
      geschrieben.add("wohnungs_bilder");
    }
    const bildLoeschFehler = await entfernen("wohnungs_bilder", bildAbgleich.loeschen, bildBestand, "Einheitenbilder");
    if (bildLoeschFehler) return scheitern("Einheitenbilder konnten nicht entfernt werden", bildLoeschFehler);

    // 5. Entfernte Einheiten, zuletzt. Nur, was der Zwischenspeicher kennt,
    //    und nie eine geschützte (`einheitLoeschSperre`).
    const eingabeIds = new Set(objekt.wohnungen.map((w) => w.id));
    let entfernt = stand.wohnungen.filter((w) => !eingabeIds.has(String(w.id)) && imCache(String(w.id)));
    let bezuege = new Map<string, EinheitBezuege>();
    if (entfernt.length > 0) {
      try {
        bezuege = await einheitBezuege(entfernt.map((w) => String(w.id)));
      } catch (fehler) {
        console.error("Bezüge der entfernten Einheiten nicht lesbar", fehler);
        hinweis("Entfernte Einheiten wurden nicht gelöscht, weil sich nicht prüfen ließ, ob noch Investments oder Kundenlinks an ihnen hängen. Bitte versuche es noch einmal.");
        entfernt = [];
      }
    }
    const zuLoeschen: Zeile[] = [];
    for (const bestand of entfernt) {
      const sperre = einheitLoeschSperre(bestand, bezuege.get(String(bestand.id)) ?? KEINE_BEZUEGE);
      if (sperre) {
        hinweis(`${einheitName(bestand.we_nr)} wurde nicht entfernt, weil ${sperre}.`);
        continue;
      }
      zuLoeschen.push(bestand);
    }
    if (zuLoeschen.length > 0) {
      const ergebnis = await zeilenLoeschen("wohnungen", zuLoeschen.map((w) => String(w.id)));
      if (ergebnis.fehler) return scheitern("Wohnungen konnten nicht entfernt werden", ergebnis.fehler);
      // Die Kaskade nimmt Bilder und Unterlagen der Einheit mit.
      for (const tabelle of ["wohnungen", "wohnungs_bilder", "wohnungs_dokumente"]) geschrieben.add(tabelle);
      for (const w of zuLoeschen) {
        if (!ergebnis.geloescht.has(String(w.id))) {
          hinweis(`${einheitName(w.we_nr)} konnte nicht entfernt werden, die Datenbank hat es abgelehnt.`);
        }
      }
    }
  }

  // 6. Nur die Tabellen neu laden, die sich geändert haben.
  await nachladen();

  lastObjektSaveHinweise = hinweise;
  return true;
}

/**
 * Löscht Zeilen nach Kennung und gibt zurück, welche tatsächlich gelöscht
 * wurden. Die Zeilensicherheit verhindert ein verbotenes Löschen ohne
 * Fehlermeldung, dann fehlt die Kennung in der Antwort.
 */
async function zeilenLoeschen(tabelle: string, ids: string[]): Promise<{ geloescht: Set<string>; fehler: unknown }> {
  const db = objektDb();
  const geloescht = new Set<string>();
  for (let i = 0; i < ids.length; i += KENNUNGEN_JE_ABFRAGE) {
    const teil = ids.slice(i, i + KENNUNGEN_JE_ABFRAGE);
    const { data, error } = await db.from(tabelle).delete().in("id", teil).select("id");
    if (error) return { geloescht, fehler: error };
    for (const z of data || []) geloescht.add(String(z.id));
  }
  return { geloescht, fehler: null };
}

export interface ObjektLoeschErgebnis {
  geloescht: boolean;
  /** Warum nicht gelöscht wurde, als ganzer Satz für den Hinweis. Leer bei Erfolg. */
  grund: string | null;
}

/**
 * Ein Objekt samt Einheiten löschen.
 *
 * Seit dem 04.10.2026 mit derselben Sperre wie eine einzelne Einheit
 * (`pruefeEinheitLoeschen`): Ist eine Einheit reserviert, verkauft,
 * vorgemerkt, einem Kunden zugeordnet, aus Investagon, hängt ein Investment
 * oder ein offener Kundenlink daran, oder ist das ganze Haus belegt, bleibt
 * alles stehen. Vorher löschte die Funktion vier Tabellen nacheinander,
 * prüfte keinen einzigen Schritt, und die Seite meldete „gelöscht“, bevor
 * überhaupt eine Antwort da war.
 *
 * Gelöscht wird nur noch die Zeile in `objekte`; Einheiten, Bilder und
 * Unterlagen nimmt die Datenbank über ON DELETE CASCADE in demselben Schritt
 * mit. So bleibt nie ein halb gelöschtes Objekt zurück. Die Zeilensicherheit
 * lehnt ein verbotenes Löschen still ab, deshalb wird nachgesehen, ob die
 * Zeile wirklich weg ist.
 */
export async function deleteObjekt(id: string): Promise<ObjektLoeschErgebnis> {
  if (isTestAccount()) {
    lsSaveObjekte(lsGetObjekte().filter(o => o.id !== id));
    return { geloescht: true, grund: null };
  }

  /*
   * Zuerst der gepruefte Weg in der Datenbank (Migration 20261004193000):
   * Sperre auf Objekt und Einheiten, Rechte wie die Loeschregel, alle Bezuege
   * ohne Zeilensicherheit. Nur wenn die Funktion fehlt, prueft der Browser
   * wie unten.
   */
  const { error: rpcFehler } = await rpc("objekt_loeschen", { _objekt_id: id });
  if (!rpcFehler) {
    await objektCachesNachladen();
    return { geloescht: true, grund: null };
  }
  if (!vormerkFunktionFehlt(rpcFehler)) {
    console.error("Objekt nicht gelöscht", rpcFehler);
    return { geloescht: false, grund: rpcFehler.message || "Das Objekt konnte nicht gelöscht werden. Bitte versuche es noch einmal." };
  }

  const db = objektDb();

  const { data: objekt, error: objektFehler } = await db
    .from("objekte").select("*").eq("id", id).maybeSingle();
  if (objektFehler) {
    console.error("Stand des Objekts nicht lesbar", objektFehler);
    return { geloescht: false, grund: "Der aktuelle Stand des Objekts ließ sich nicht lesen, deshalb wurde nichts gelöscht. Bitte versuche es noch einmal." };
  }
  if (!objekt) {
    await cacheReload("objekte");
    return { geloescht: false, grund: "Das Objekt wurde nicht gefunden. Vielleicht hat es inzwischen jemand anderes entfernt." };
  }
  if (hausBelegungLesen(objekt.belegung) !== "frei" || String(objekt.belegung_kunde_id || "").trim()) {
    return { geloescht: false, grund: "Das Objekt kann nicht gelöscht werden, weil das ganze Haus reserviert oder verkauft ist." };
  }

  const { data: einheiten, error: einheitenFehler } = await db
    .from("wohnungen").select("*").eq("objekt_id", id);
  if (einheitenFehler) {
    console.error("Einheiten des Objekts nicht lesbar", einheitenFehler);
    return { geloescht: false, grund: "Die Einheiten des Objekts ließen sich nicht lesen, deshalb wurde nichts gelöscht. Bitte versuche es noch einmal." };
  }
  const zeilen = (einheiten || []) as Zeile[];
  let bezuege: Map<string, EinheitBezuege>;
  try {
    bezuege = await einheitBezuege(zeilen.map((w) => String(w.id)));
  } catch (fehler) {
    console.error("Bezüge der Einheiten nicht lesbar", fehler);
    return { geloescht: false, grund: "Ob noch ein Investment oder ein Kundenlink an einer Einheit hängt, ließ sich nicht prüfen. Deshalb wurde nichts gelöscht. Bitte versuche es noch einmal." };
  }
  const gesperrt = zeilen
    .map((w) => {
      const sperre = einheitLoeschSperre(w, bezuege.get(String(w.id)) ?? KEINE_BEZUEGE);
      return sperre ? `${einheitName(w.we_nr)} (${sperre})` : null;
    })
    .filter((s): s is string => !!s);
  if (gesperrt.length > 0) {
    const liste = gesperrt.slice(0, 3).join(", ") + (gesperrt.length > 3 ? ` und ${gesperrt.length - 3} weitere` : "");
    return { geloescht: false, grund: `Das Objekt kann nicht gelöscht werden, weil Einheiten gebunden sind: ${liste}.` };
  }

  const ergebnis = await zeilenLoeschen("objekte", [id]);
  if (ergebnis.fehler) {
    console.error("Objekt konnte nicht gelöscht werden", ergebnis.fehler);
    return { geloescht: false, grund: "Das Objekt konnte nicht gelöscht werden. Bitte versuche es noch einmal." };
  }
  if (!ergebnis.geloescht.has(id)) {
    return { geloescht: false, grund: "Die Datenbank hat das Löschen abgelehnt. Vermutlich fehlt dir dafür das Recht." };
  }

  await objektCachesNachladen();
  return { geloescht: true, grund: null };
}

/** Nach dem Loeschen eines Objekts: alles, was die Kaskade mitgenommen hat. */
function objektCachesNachladen(): Promise<unknown> {
  return Promise.all(
    ["objekte", "objekt_bilder", "objekt_dokumente", "wohnungen", "wohnungs_bilder", "wohnungs_dokumente"]
      .map((tabelle) => cacheReload(tabelle)),
  );
}

export async function updateObjektField(id: string, fields: Partial<ObjektData>) {
  const obj = getObjektById(id);
  if (!obj) return;
  await saveObjekt({ ...obj, ...fields });
}

/** Lightweight update – only patches the objekte row without re-syncing bilder/dokumente/wohnungen */
export async function updateObjektFieldFast(id: string, dbFields: Record<string, any>) {
  if (isTestAccount()) {
    const all = lsGetObjekte();
    const idx = all.findIndex(o => o.id === id);
    if (idx >= 0) {
      Object.assign(all[idx], dbFields);
      lsSaveObjekte(all);
    }
    return;
  }
  const db = supabase as any;
  // Mit Rückgabe: Die Zeilenregel lehnt still ab (null Zeilen). Bis zum
  // 04.10.2026 kam ein Fehler hier gar nicht an, Knöpfe meldeten Erfolg.
  const { data, error } = await db.from("objekte").update(dbFields).eq("id", id).select("id");
  await cacheReload("objekte");
  if (error) throw error;
  if (Array.isArray(data) && data.length === 0) {
    throw new SchreibenAbgelehnt("Dieses Objekt darfst du nicht ändern. Das können Admin, Inhaber und der Objektpartner am eigenen Objekt.");
  }
}

/** Speichert nur das Titelbild; Galeriereihenfolge und Importdaten bleiben erhalten. */
export async function setObjektTitelbild(id: string, url: string): Promise<void> {
  if (!url) throw new Error("Kein Bild ausgewählt");
  if (isTestAccount()) {
    const all = lsGetObjekte();
    const objekt = all.find(o => o.id === id);
    if (!objekt) throw new Error("Objekt nicht gefunden");
    objekt.bildUrl = url;
    lsSaveObjekte(all);
    return;
  }
  const db = supabase as any;
  const { data: current, error: readError } = await db.from("objekte")
    .select("meta").eq("id", id).maybeSingle();
  if (readError) throw readError;
  // Merkt die bewusste Auswahl, damit der Investagon-Import sie nicht überschreibt.
  const meta = { ...((current?.meta as Record<string, any>) || {}), titelbildManuell: true };
  const { data, error } = await db.from("objekte")
    .update({ bild_url: url, meta }).eq("id", id).select("id");
  if (error) throw error;
  if (Array.isArray(data) && data.length === 0) {
    throw new SchreibenAbgelehnt("Dieses Objekt darfst du nicht ändern. Das können Admin, Inhaber und der Objektpartner am eigenen Objekt.");
  }
  await cacheReload("objekte");
}



export async function addDokument(objektId: string, dok: ObjektDokument): Promise<boolean> {
  if (isTestAccount()) {
    const obj = getObjektById(objektId);
    if (!obj) return false;
    obj.dokumente.push(dok);
    await saveObjekt(obj);
    return true;
  }
  try {
    await cacheUpsert("objekt_dokumente", { id: dok.id, objekt_id: objektId, name: dok.name, url: dok.url, typ: dok.typ, kategorie: dok.kategorie, sichtbar: dok.sichtbar });
    return true;
  } catch (err) {
    console.error("addDokument failed:", err);
    return false;
  }
}

export async function removeDokument(objektId: string, dokId: string): Promise<boolean> {
  if (isTestAccount()) {
    const obj = getObjektById(objektId);
    if (!obj) return false;
    obj.dokumente = obj.dokumente.filter(d => d.id !== dokId);
    await saveObjekt(obj);
    return true;
  }
  try {
    await cacheDelete("objekt_dokumente", dokId);
    return true;
  } catch (err) {
    console.error("removeDokument failed:", err);
    return false;
  }
}

/**
 * Eine Unterlage als Zeile in `wohnungs_dokumente` anlegen, wie `addDokument`
 * am Objekt.
 *
 * Nicht über `addWohnungDokument`: Das schreibt `wohnungen.meta.dokumente`,
 * und diese Liste setzt `saveObjekt` aus der Objektanlage jedes Mal neu
 * zusammen. War die Anlage vor dem Hinzufügen geöffnet, wäre die Unterlage
 * danach weg. Die Tabelle fasst `saveObjekt` nie an, und nur dort greifen
 * Freigabe-Schalter und Auslöser der Dokumenten-Ampel.
 */
export async function addWohnungTabellenDokument(wohnungId: string, dok: { id: string; name: string; url: string; kategorie: WohnungDokument["kategorie"] }): Promise<boolean> {
  try {
    await cacheUpsert("wohnungs_dokumente", { id: dok.id, wohnung_id: wohnungId, name: dok.name, url: dok.url, kategorie: dok.kategorie });
    return true;
  } catch (err) {
    console.error("addWohnungTabellenDokument failed:", err);
    return false;
  }
}

/** Eine Zeile aus `wohnungs_dokumente` entfernen. Löschen dürfen dort nur Admin und Inhaber. */
export async function removeWohnungTabellenDokument(dokId: string): Promise<boolean> {
  try {
    await cacheDelete("wohnungs_dokumente", dokId);
    return true;
  } catch (err) {
    console.error("removeWohnungTabellenDokument failed:", err);
    return false;
  }
}

/** Spalten, die `updateWohnung` nie schreibt, siehe dort. */
const VORMERKUNG_SPALTEN = [
  "reserviert_von", "vorgemerkt_bis", "vorgemerkt_kunde_id",
  "vorgemerkt_kunde_name", "vorgemerkt_berater_name", "vorgemerkt_von",
] as const;

/**
 * Eine Wohnung ändern.
 *
 * Gibt den Fehler der Datenbank zurück, sonst null. Bis zum 23.09.2026 wurde
 * er gar nicht abgefragt: Lehnte die Datenbank ab, etwa weil die Rolle nicht
 * reservieren darf, sah der Aufrufer trotzdem Erfolg. Die bisherigen Aufrufer
 * dürfen den Rückgabewert weiter übergehen, der Fehler steht dann wenigstens
 * im Protokoll.
 */
export async function updateWohnung(objektId: string, wohnungId: string, fields: Partial<ObjektWohnung>): Promise<unknown | null> {
  if (isTestAccount()) {
    const obj = getObjektById(objektId);
    if (!obj) return null;
    const idx = obj.wohnungen.findIndex(w => w.id === wohnungId);
    if (idx >= 0) obj.wohnungen[idx] = { ...obj.wohnungen[idx], ...fields };
    await saveObjekt(obj);
    return null;
  }

  const wRow = cacheGet("wohnungen").find((w: any) => w.id === wohnungId);
  if (!wRow) return null;
  const existing = dbRowToWohnung(wRow);
  const merged = { ...existing, ...fields };
  const dbRow = wohnungToDbRow(merged, objektId);
  const { id: _id, ...updates } = dbRow;
  // Schlüssel, die das CRM nicht kennt (etwa `moebelPreis` aus dem
  // Investagon-Import), bleiben erhalten. Vorher hat jede Änderung an einer
  // Wohnung das komplette `meta` durch die bekannten Felder ersetzt.
  updates.meta = { ...(wRow.meta || {}), ...updates.meta };
  /*
   * Vormerkung und Auslöser gehören der Datenbank (`vormerke_einheit`,
   * `reserviere_einheit_nach_unterschrift` und der Auslöser an `wohnungen`).
   * Käme hier der Stand aus dem Zwischenspeicher zurück, könnte eine ältere
   * Vormerkung eine frische überschreiben, die ein anderer Partner gerade
   * gesetzt hat.
   */
  for (const spalte of VORMERKUNG_SPALTEN) delete updates[spalte];
  const db = supabase as any;
  /*
   * Mit `.select("id")`: Lehnt die Zeilensicherheit ab, meldet die Datenbank
   * keinen Fehler, sondern ändert einfach null Zeilen. Ohne die Rückgabe sah
   * der Aufrufer dann „gespeichert“ (seit dem 30.09.2026 schreiben nur Admin,
   * Inhaber und der Objektpartner am eigenen Objekt).
   */
  const { data, error } = await db.from("wohnungen").update(updates).eq("id", wohnungId).select("id");
  const fehler = error ?? (Array.isArray(data) && data.length > 0
    ? null
    : { code: "42501", message: "Diese Einheit darfst du nicht ändern. Das können Admin und Inhaber." });
  if (fehler) console.error("Wohnung konnte nicht gespeichert werden:", fehler);
  await cacheReload("wohnungen");
  return fehler;
}

/**
 * Darf diese Einheit jetzt gelöscht werden? Gibt den Grund als ganzen Satz
 * zurück, sonst null.
 *
 * Dieselbe Regel wie beim Entfernen in `saveObjekt` (`einheitLoeschSperre`),
 * geprüft am frischen Stand aus der Datenbank. Der Zwischenspeicher kann eine
 * gerade eingegangene Reservierung noch nicht kennen. Lässt sich der Stand
 * nicht lesen, gilt die Einheit als gesperrt.
 *
 * Im Testkonto gibt es nichts zu prüfen, dort bleibt alles wie bisher.
 */
export async function pruefeEinheitLoeschen(wohnungId: string): Promise<string | null> {
  if (isTestAccount()) return null;
  let zeile: Zeile | null;
  try {
    const { data, error } = await objektDb().from("wohnungen").select("*").eq("id", wohnungId).maybeSingle();
    if (error) throw error;
    zeile = data ?? null;
  } catch (fehler) {
    console.error("Stand der Einheit nicht lesbar", fehler);
    return "Der aktuelle Stand der Einheit ließ sich nicht lesen, deshalb wurde nichts gelöscht. Bitte versuche es noch einmal.";
  }
  if (!zeile) {
    await cacheReload("wohnungen");
    return "Die Einheit wurde nicht gefunden. Vielleicht hat sie inzwischen jemand anderes entfernt.";
  }
  let bezuege: EinheitBezuege;
  try {
    bezuege = (await einheitBezuege([wohnungId])).get(wohnungId) ?? KEINE_BEZUEGE;
  } catch (fehler) {
    console.error("Bezüge der Einheit nicht lesbar", fehler);
    return "Ob noch ein Investment oder ein Kundenlink an der Einheit hängt, ließ sich nicht prüfen. Deshalb wurde nichts gelöscht. Bitte versuche es noch einmal.";
  }
  const sperre = einheitLoeschSperre(zeile, bezuege);
  return sperre ? `${einheitName(zeile.we_nr)} kann nicht gelöscht werden, weil ${sperre}.` : null;
}

export interface EinheitLoeschErgebnis {
  geloescht: boolean;
  /** Warum nicht gelöscht wurde, als ganzer Satz für den Hinweis. Leer bei Erfolg. */
  grund: string | null;
}

/**
 * Eine Einheit löschen, den Mülleimer in Verwaltungsansicht und Objektliste.
 *
 * Bis zum 23.09.2026 ging das ohne jede Prüfung. Über ON DELETE CASCADE fielen
 * Unterlagen, Bilder und gesendete Exposé-Links der Einheit weg, und
 * Investments zeigten per `meta.wohnungId` ins Leere. Jetzt wird unmittelbar
 * vor dem Löschen frisch geprüft (`pruefeEinheitLoeschen`), auch wenn der
 * Aufrufer das vor seiner Rückfrage schon getan hat: Solange die Rückfrage
 * offen ist, kann jemand reservieren.
 *
 * Die Zeilensicherheit lehnt ein verbotenes Löschen still ab. Deshalb wird
 * nachgesehen, ob die Zeile wirklich weg ist.
 */
export async function deleteWohnung(objektId: string, wohnungId: string): Promise<EinheitLoeschErgebnis> {
  if (isTestAccount()) {
    const obj = getObjektById(objektId);
    if (!obj) return { geloescht: false, grund: "Die Einheit wurde nicht gefunden." };
    obj.wohnungen = obj.wohnungen.filter(w => w.id !== wohnungId);
    saveObjekt(obj);
    return { geloescht: true, grund: null };
  }

  const sperre = await pruefeEinheitLoeschen(wohnungId);
  if (sperre) return { geloescht: false, grund: sperre };

  const ergebnis = await zeilenLoeschen("wohnungen", [wohnungId]);
  if (ergebnis.fehler) {
    console.error("Einheit konnte nicht gelöscht werden", ergebnis.fehler);
    // Die Sperre in der Datenbank (Migration 20261004193000) nennt den Grund selbst.
    const f = ergebnis.fehler as { code?: string; message?: string };
    return {
      geloescht: false,
      grund: f?.code === "P0001" && f.message ? f.message : "Die Einheit konnte nicht gelöscht werden. Bitte versuche es noch einmal.",
    };
  }
  if (!ergebnis.geloescht.has(wohnungId)) {
    return { geloescht: false, grund: "Die Datenbank hat das Löschen abgelehnt. Vermutlich fehlt dir dafür das Recht." };
  }
  // Die Kaskade nimmt Bilder und Unterlagen der Einheit mit.
  await Promise.all(["wohnungen", "wohnungs_bilder", "wohnungs_dokumente"].map((tabelle) => cacheReload(tabelle)));
  return { geloescht: true, grund: null };
}

// ── Reservierung ──

/** Die erzeugten Supabase-Typen kennen die Funktionen aus 20260930120000 noch nicht. */
type RpcAufruf = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
const rpc: RpcAufruf = (name, args) => (supabase as unknown as { rpc: RpcAufruf }).rpc(name, args);

/** Die Migration, die Aufheben und Abgleich als Datenbankfunktionen bringt. */
export const ABSICHERUNG_OBJEKTE_MIGRATION = "20260930120000_absicherung_objekte_speicher_chats";

/**
 * Die Reservierung einer Einheit aufheben.
 *
 * Seit dem 30.09.2026 über `einheit_reservierung_aufheben`: Nur Admin und
 * Inhaber schreiben direkt in `wohnungen`, der Vertrieb hebt über diese
 * Funktion auf, und zwar nur beim eigenen Kunden. Fehlt die Funktion, weil
 * die Migration noch nicht gelaufen ist, gilt der bisherige Weg.
 *
 * Wirft nicht. `ok: false` heißt: nichts geändert, `fehlerText` sagt warum.
 */
export async function removeReservierung(objektId: string, wohnungId: string): Promise<{ ok: boolean; fehlerText?: string }> {
  if (!isTestAccount()) {
    try {
      const { data, error } = await rpc("einheit_reservierung_aufheben", { p_wohnung_id: wohnungId });
      if (!error) {
        await cacheReload("wohnungen");
        const antwort = (data ?? {}) as { ok?: unknown; grund?: unknown };
        if (antwort.ok === true) return { ok: true };
        const fehlerText = antwort.grund === "keine_berechtigung"
          ? "Diese Reservierung gehört nicht zu deinem Kunden. Aufheben kann sie der zuständige Partner oder die Leitung."
          : "Die Reservierung ließ sich nicht aufheben.";
        console.warn("Reservierung nicht aufgehoben:", antwort.grund);
        return { ok: false, fehlerText };
      }
      if (!vormerkFunktionFehlt(error)) {
        console.error("Reservierung aufheben fehlgeschlagen:", error);
        return { ok: false, fehlerText: error.message || "Die Reservierung ließ sich nicht aufheben." };
      }
      console.warn(`einheit_reservierung_aufheben fehlt, die Migration ${ABSICHERUNG_OBJEKTE_MIGRATION} ist noch nicht gelaufen. Rückfall auf den bisherigen Weg.`);
    } catch (e) {
      console.error("Reservierung aufheben fehlgeschlagen:", e);
      return { ok: false, fehlerText: e instanceof Error ? e.message : String(e) };
    }
  }
  const fehler = await updateWohnung(objektId, wohnungId, {
    status: "frei",
    kundeId: undefined,
    kundeName: undefined,
    beraterName: undefined,
    reserviertAm: undefined,
  });
  return fehler ? { ok: false, fehlerText: (fehler as { message?: string })?.message } : { ok: true };
}

/** Die Migration, die den Sichtbarkeitsschalter als Datenbankfunktion bringt. */
export const OBJEKT_SICHTBARKEIT_MIGRATION = "20260930160000_objekt_sichtbarkeit_schalter";

/**
 * Ein Investagon-Objekt für den Vertrieb ein- oder ausblenden (Punkt auf der
 * Objektkachel, Christian am 30.09.2026).
 *
 * Über `objekt_sichtbarkeit_setzen`, weil Objektpartner Investagon-Objekte
 * nicht direkt ändern dürfen (die gehören niemandem, `erstellt_von` ist leer).
 * Fehlt die Funktion, gilt der direkte Weg; der klappt nur für Admin und
 * Inhaber, darum wird geprüft, ob die Zeile wirklich geändert wurde.
 *
 * Wirft nicht. `ok: false` heißt: nichts geändert, `fehlerText` sagt warum.
 */
export async function setObjektSichtbar(objektId: string, sichtbar: boolean): Promise<{ ok: boolean; fehlerText?: string }> {
  if (isTestAccount()) {
    await updateObjektFieldFast(objektId, { sichtbar });
    return { ok: true };
  }
  try {
    const { data, error } = await rpc("objekt_sichtbarkeit_setzen", { p_objekt_id: objektId, p_sichtbar: sichtbar });
    if (!error) {
      await cacheReload("objekte");
      const antwort = (data ?? {}) as { ok?: unknown; grund?: unknown };
      if (antwort.ok === true) return { ok: true };
      console.warn("Sichtbarkeit nicht geändert:", antwort.grund);
      return {
        ok: false,
        fehlerText: antwort.grund === "keine_berechtigung"
          ? "Die Sichtbarkeit schalten nur Admin, Inhaber und Objektpartner."
          : "Die Sichtbarkeit ließ sich nicht ändern.",
      };
    }
    if (!vormerkFunktionFehlt(error)) {
      console.error("Sichtbarkeit ändern fehlgeschlagen:", error);
      return { ok: false, fehlerText: error.message || "Die Sichtbarkeit ließ sich nicht ändern." };
    }
    console.warn(`objekt_sichtbarkeit_setzen fehlt, die Migration ${OBJEKT_SICHTBARKEIT_MIGRATION} ist noch nicht gelaufen. Rückfall auf den direkten Weg.`);
    const direkt = await (supabase as any).from("objekte").update({ sichtbar }).eq("id", objektId).select("id");
    await cacheReload("objekte");
    if (direkt.error) return { ok: false, fehlerText: direkt.error.message || "Die Sichtbarkeit ließ sich nicht ändern." };
    // RLS lehnt still ab: keine Fehlermeldung, aber auch keine geänderte Zeile.
    if (!direkt.data?.length) return { ok: false, fehlerText: "Die Datenbank hat die Änderung abgelehnt. Für Objektpartner fehlt noch eine Datenbankanpassung." };
    return { ok: true };
  } catch (e) {
    console.error("Sichtbarkeit ändern fehlgeschlagen:", e);
    return { ok: false, fehlerText: e instanceof Error ? e.message : String(e) };
  }
}

/** Free all units where this kunde is reserviert */
export async function freeWohnungenForKunde(kundeId: string) {
  const allObj = getObjekte();
  for (const obj of allObj) {
    for (const w of obj.wohnungen) {
      if (w.kundeId === kundeId && w.status === "reserviert") {
        await removeReservierung(obj.id, w.id);
      }
    }
  }
}

/**
 * Den Status einer Einheit aus dem Investment ableiten lassen (verkauft bei
 * „abgeschlossen“, reserviert bei wirksamer Reservierung oder späterer Stufe).
 *
 * Entscheidet allein die Datenbank (`einheit_belegung_abgleichen`), aus dem
 * gespeicherten Investment. Gibt `"ohne_migration"` zurück, solange die
 * Funktion fehlt, und im Testkonto; der Aufrufer nimmt dann den bisherigen
 * Weg. Wirft nicht.
 */
export async function gleicheEinheitMitInvestmentAb(investmentId: string): Promise<"erledigt" | "ohne_migration"> {
  if (isTestAccount()) return "ohne_migration";
  try {
    const { data, error } = await rpc("einheit_belegung_abgleichen", { p_investment_id: investmentId });
    if (error) {
      if (vormerkFunktionFehlt(error)) return "ohne_migration";
      console.warn("Belegungsabgleich fehlgeschlagen:", error.message || error);
      return "erledigt";
    }
    const grund = (data as { grund?: unknown } | null)?.grund;
    if (grund === "verkauft" || grund === "reserviert") await cacheReload("wohnungen");
    return "erledigt";
  } catch (e) {
    console.warn("Belegungsabgleich fehlgeschlagen:", e);
    return "erledigt";
  }
}

/**
 * Wird geworfen, wenn eine Einheit nicht für diesen Kunden reserviert werden
 * darf: Sie gehört schon einem anderen Kunden, ist verkauft oder gehört zu
 * einem Globalobjekt. Die Aufrufer unterscheiden daran „vergeben“ von einer
 * Störung.
 */
export class EinheitVergebenFehler extends Error {
  readonly grund: "vergeben" | "globalobjekt";
  constructor(grund: "vergeben" | "globalobjekt") {
    super(grund === "globalobjekt"
      ? "Einheiten eines Globalobjekts werden nicht einzeln reserviert."
      : "Diese Einheit ist bereits an einen anderen Kunden reserviert oder verkauft.");
    this.name = "EinheitVergebenFehler";
    this.grund = grund;
  }
}

/**
 * Der aktuelle Stand einer Einheit, frisch aus der Datenbank.
 *
 * Der Zwischenspeicher kann eine Sekunde hinterherhinken, und genau in dieser
 * Sekunde reserviert vielleicht ein zweiter Partner. Scheitert das Lesen,
 * gilt der Zwischenspeicher.
 */
async function einheitStandFrisch(wohnungId: string): Promise<{ status: string | null; kundeId: string | null }> {
  const ausCache = () => {
    const zeile = cacheGet<{ id: string; status?: string | null; kunde_id?: string | null }>("wohnungen")
      .find((w) => w.id === wohnungId);
    return { status: zeile?.status ?? null, kundeId: zeile?.kunde_id ?? null };
  };
  try {
    const { data, error } = await supabase.from("wohnungen").select("status, kunde_id").eq("id", wohnungId).maybeSingle();
    if (error || !data) return ausCache();
    return { status: data.status ?? null, kundeId: data.kunde_id ?? null };
  } catch {
    return ausCache();
  }
}

/**
 * Eine Einheit sofort auf reserviert setzen.
 *
 * Seit dem 23.09.2026 nur noch für Altwege und den Rückfall: Regulär
 * reserviert erst die Unterschrift (`finalize-reservierung`), vorher wird nur
 * vorgemerkt (`vormerkeEinheit`). Gebraucht wird diese Funktion noch, solange
 * die Migration `20260923150000_reservierung_vormerkung.sql` fehlt, und zum
 * Nachziehen unterschriebener Reservierungen auf der Objektseite.
 *
 * Vorher setzte sie „reserviert“, ohne nachzusehen, ob die Einheit noch frei
 * ist, und schrieb damit auch über die Reservierung eines anderen Kunden.
 * Jetzt wirft sie `EinheitVergebenFehler`, wenn die Einheit schon einem
 * anderen Kunden gehört, verkauft ist oder zu einem Globalobjekt gehört, und
 * einen gewöhnlichen Fehler, wenn die Datenbank ablehnt.
 */
export async function reserveWohnung(objektId: string, wohnungId: string, kundeId: string, kundeName: string, beraterName?: string) {
  if (!isTestAccount()) {
    const objektZeile = cacheGet<{ id: string; global_objekt?: boolean | null }>("objekte").find((o) => o.id === objektId);
    if (istGlobalobjekt(objektZeile)) throw new EinheitVergebenFehler("globalobjekt");
    const stand = await einheitStandFrisch(wohnungId);
    if (reservierungNachUnterschrift(stand, kundeId) === "vergeben") {
      throw new EinheitVergebenFehler("vergeben");
    }
  }
  const fehler = await updateWohnung(objektId, wohnungId, {
    status: "reserviert",
    kundeId,
    kundeName,
    ...(beraterName ? { beraterName } : {}),
    reserviertAm: new Date().toISOString(),
  });
  if (fehler) {
    const text = (fehler as { message?: string })?.message || "Die Datenbank hat die Reservierung abgelehnt.";
    throw new Error(text);
  }
}

/**
 * Eine freie Einheit für 60 Minuten für genau diesen Kunden vormerken.
 *
 * Christians Regeln vom 23.09.2026: Wer die Reservierungsvereinbarung zur
 * Unterschrift absendet, merkt vorher vor. Entschieden wird allein in der
 * Datenbank (`vormerke_einheit`), in einem Schritt, damit zwei Partner nicht
 * gleichzeitig gewinnen. Der Status bleibt „frei“; reserviert wird erst mit
 * der Unterschrift.
 *
 * Fehlt die Funktion, weil die Migration noch nicht gelaufen ist, kommt
 * `grund: "ohne_migration"` zurück. Der Aufrufer nimmt dann den bisherigen Weg
 * über `reserveWohnung`, damit der Vertrieb nicht stillsteht.
 *
 * Wirft nicht.
 */
export async function vormerkeEinheit(wohnungId: string, kontaktId: string): Promise<VormerkErgebnis> {
  if (isTestAccount()) return { ok: true, grund: "vorgemerkt" };
  try {
    // Die erzeugten Supabase-Typen kennen die neue Funktion noch nicht.
    const db = supabase as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
    };
    const { data, error } = await db.rpc("vormerke_einheit", { p_wohnung_id: wohnungId, p_kontakt_id: kontaktId });
    if (error) {
      if (vormerkFunktionFehlt(error)) {
        console.warn(
          `vormerke_einheit fehlt, die Migration ${VORMERKUNG_MIGRATION} ist noch nicht gelaufen. `
          + "Rückfall auf den bisherigen Weg: Die Einheit wird beim Absenden reserviert.",
        );
        return { ok: false, grund: "ohne_migration" };
      }
      console.error("Vormerkung fehlgeschlagen:", error);
      return { ok: false, grund: "fehler", fehlerText: error.message || String(error) };
    }
    const ergebnis = vormerkErgebnisLesen(data);
    if (ergebnis.grund === "fehler") console.error("Vormerkung:", ergebnis.fehlerText);
    // Die Anzeige sofort nachziehen. Die Echtzeitmeldung kommt zusätzlich.
    if (ergebnis.ok) await cacheReload("wohnungen");
    return ergebnis;
  } catch (e) {
    console.error("Vormerkung fehlgeschlagen:", e);
    return { ok: false, grund: "fehler", fehlerText: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Ein freies Globalobjekt, also das ganze Haus, für 60 Minuten für genau
 * diesen Kunden vormerken.
 *
 * Dieselben Regeln wie bei der Einheit (`vormerkeEinheit`), entschieden allein
 * in der Datenbank (`vormerke_objekt`) in einem Schritt. Die Belegung bleibt
 * „frei“; reserviert wird erst mit der Unterschrift.
 *
 * Anders als bei der Einheit gibt es ohne Migration KEINEN Rückfallweg:
 * `grund: "ohne_migration"` heißt für den Aufrufer, dass nichts hinausgehen
 * darf. Sonst verspräche die Vereinbarung ein reserviertes Haus, das niemand
 * festhält.
 *
 * Wirft nicht.
 */
export async function vormerkeObjekt(objektId: string, kontaktId: string): Promise<ObjektVormerkErgebnis> {
  if (isTestAccount()) return { ok: true, grund: "vorgemerkt" };
  try {
    // Die erzeugten Supabase-Typen kennen die neue Funktion noch nicht.
    const db = supabase as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
    };
    const { data, error } = await db.rpc("vormerke_objekt", { p_objekt_id: objektId, p_kontakt_id: kontaktId });
    if (error) {
      if (vormerkFunktionFehlt(error)) {
        console.warn(
          `vormerke_objekt fehlt, die Migration ${OBJEKT_RESERVIERUNG_MIGRATION} ist noch nicht gelaufen. `
          + "Eine Reservierung des ganzen Hauses geht deshalb nicht hinaus.",
        );
        return { ok: false, grund: "ohne_migration" };
      }
      console.error("Vormerkung des Hauses fehlgeschlagen:", error);
      return { ok: false, grund: "fehler", fehlerText: error.message || String(error) };
    }
    const ergebnis = objektVormerkErgebnisLesen(data);
    if (ergebnis.grund === "fehler") console.error("Vormerkung des Hauses:", ergebnis.fehlerText);
    // Die Anzeige sofort nachziehen. Die Echtzeitmeldung kommt zusätzlich.
    if (ergebnis.ok) await cacheReload("objekte");
    return ergebnis;
  } catch (e) {
    console.error("Vormerkung des Hauses fehlgeschlagen:", e);
    return { ok: false, grund: "fehler", fehlerText: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Die Reservierung eines ganzen Hauses aufheben (Globalobjekt).
 *
 * Christian am 23.09.2026: Platzt eine Hausreservierung, muss das Haus wieder
 * frei werden, ohne dass jemand SQL schreibt. Gegenstück zum „Aufheben“ an
 * einer Einheit in der Objektübersicht, und wie dort bleibt das Investment im
 * Kundenprofil unberührt.
 *
 * Geschrieben wird nur `belegung = 'frei'`. Kunde, Datum und Auslöser räumt
 * der Auslöser `objekt_belegung_pruefen` in der Datenbank ab
 * (20260923152000_globalobjekt_reservierung.sql). `saveObjekt` fasst diese
 * Spalten bewusst nie an, deshalb ein eigener, gezielter Schreibvorgang.
 * Der Knopf dazu steht nur für Admin und Inhaber da; die Zeilensicherheit auf
 * `objekte` entscheidet zusätzlich.
 *
 * Wirft nicht.
 */
export async function hebeHausReservierungAuf(objektId: string): Promise<{ ok: boolean; fehlerText?: string }> {
  if (isTestAccount()) return { ok: true };
  try {
    // Die erzeugten Supabase-Typen kennen die neue Spalte noch nicht.
    const db = supabase as unknown as {
      from: (tabelle: string) => {
        update: (werte: Record<string, unknown>) => {
          eq: (spalte: string, wert: string) => Promise<{ error: { message?: string } | null }>;
        };
      };
    };
    const { error } = await db.from("objekte").update({ belegung: "frei" }).eq("id", objektId);
    if (error) {
      console.error("Hausreservierung aufheben fehlgeschlagen:", error);
      return { ok: false, fehlerText: error.message || String(error) };
    }
    await cacheReload("objekte");
    return { ok: true };
  } catch (e) {
    console.error("Hausreservierung aufheben fehlgeschlagen:", e);
    return { ok: false, fehlerText: e instanceof Error ? e.message : String(e) };
  }
}

export function addWohnungDokument(objektId: string, wohnungId: string, dok: WohnungDokument) {
  const obj = getObjektById(objektId);
  if (!obj) return;
  const w = obj.wohnungen.find(w => w.id === wohnungId);
  if (!w) return;
  if (!w.dokumente) w.dokumente = [];
  w.dokumente.push(dok);
  updateWohnung(objektId, wohnungId, { dokumente: w.dokumente });
}

export function removeWohnungDokument(objektId: string, wohnungId: string, dokId: string) {
  const obj = getObjektById(objektId);
  if (!obj) return;
  const w = obj.wohnungen.find(w => w.id === wohnungId);
  if (!w || !w.dokumente) return;
  w.dokumente = w.dokumente.filter(d => d.id !== dokId);
  updateWohnung(objektId, wohnungId, { dokumente: w.dokumente });
}

export function addWohnungBild(objektId: string, wohnungId: string, bild: ObjektBild) {
  const obj = getObjektById(objektId);
  if (!obj) return;
  const w = obj.wohnungen.find(w => w.id === wohnungId);
  if (!w) return;
  if (!w.bilder) w.bilder = [];
  w.bilder.push(bild);
  updateWohnung(objektId, wohnungId, { bilder: w.bilder });
}

export function removeWohnungBild(objektId: string, wohnungId: string, bildId: string) {
  const obj = getObjektById(objektId);
  if (!obj) return;
  const w = obj.wohnungen.find(w => w.id === wohnungId);
  if (!w || !w.bilder) return;
  w.bilder = w.bilder.filter(b => b.id !== bildId);
  updateWohnung(objektId, wohnungId, { bilder: w.bilder });
}

export function updateWohnungDokument(objektId: string, wohnungId: string, dokId: string, updates: Partial<WohnungDokument>) {
  const obj = getObjektById(objektId);
  if (!obj) return;
  const w = obj.wohnungen.find(w => w.id === wohnungId);
  if (!w || !w.dokumente) return;
  const idx = w.dokumente.findIndex(d => d.id === dokId);
  if (idx >= 0) {
    w.dokumente[idx] = { ...w.dokumente[idx], ...updates };
    updateWohnung(objektId, wohnungId, { dokumente: w.dokumente });
  }
}

// ── New-object badge helpers ──

const LS_OBJEKTE_SEEN = "mi_objekte_last_seen";

export function getNewObjekteCount(): number {
  const lastSeen = isTestAccount()
    ? localStorage.getItem(LS_OBJEKTE_SEEN) || ""
    : getUserSetting<string>("objekte_last_seen", "");

  const objekte = getObjekte().filter(o => o.sichtbar && o.status === "freigegeben");
  if (!lastSeen) return 0; // first visit – don't flood
  return objekte.filter(o => o.erstellt_am > lastSeen).length;
}

export function markObjekteSeen() {
  const ts = new Date().toISOString();
  if (isTestAccount()) {
    localStorage.setItem(LS_OBJEKTE_SEEN, ts);
  } else {
    setUserSetting("objekte_last_seen", ts);
  }
  // Init if never set
  window.dispatchEvent(new CustomEvent("objekte-seen-updated"));
}

export function initObjekteSeenIfNeeded() {
  const existing = isTestAccount()
    ? localStorage.getItem(LS_OBJEKTE_SEEN)
    : getUserSetting<string>("objekte_last_seen", "");
  if (!existing) markObjekteSeen();
}
