/**
 * Gespeicherte Berechnungen des Investmentrechners
 * (Tabelle `investment_berechnungen`, Migration 20260907130000).
 *
 * Bis hierher hat der Rechner nichts gespeichert. Jetzt hängt jede Berechnung
 * an einem Investment, und es dürfen mehrere je Investment sein: Die Variante
 * mit mehr Eigenkapital soll neben der ersten stehen und sie nicht ersetzen.
 *
 * Bewusst ein direkter Supabase-Zugriff und nicht `dataCache`, aus demselben
 * Grund wie in objektExposeStore.ts: Die Tabelle entsteht erst mit der
 * Migration, und eine fehlende Tabelle in der Ladeliste des Zwischenspeichers
 * reißt beim Start den Realtime-Kanal mit (siehe abwesenheitStore.ts).
 * Solange die Migration nicht gelaufen ist, melden alle Funktionen
 * `migrationFehlt`, und der Rechner läuft weiter wie bisher, nur ohne
 * Speichern.
 *
 * Die Rechte stehen in der Datenbank, nicht hier: Sehen und schreiben darf,
 * wer den zugehörigen Kontakt bearbeiten darf (RLS über
 * `darf_kontakt_bearbeiten`). Ein ausgeblendeter Knopf ist keine
 * Zugriffskontrolle.
 */
import { supabase } from "@/integrations/supabase/client";
import { istTabelleUnbekannt } from "@/lib/abwesenheitStore";
import { standardKaufnebenkostenauswahl, type Kaufnebenkostenauswahl } from "@/lib/investmentrechner/kaufnebenkostenAuswahl";
import { leereUnterlagenDaten, type UnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import { herkunftAusJson, type Herkunft } from "@/lib/investmentrechner/herkunft";
import {
  ausgewiesenerKaufpreis,
  EINGABE_VERSION,
  standardEingabe,
  type InvestmentEingabe,
  type InvestmentErgebnis,
} from "@/lib/investmentrechner/rechenkern";

/*
 * Die erzeugten Supabase-Typen kennen `investment_berechnungen` noch nicht.
 * Bis die Typen neu erzeugt sind, derselbe Behelf wie in abwesenheitStore.
 */
const db = supabase as unknown as {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export const BERECHNUNGEN_MIGRATION = "20260907130000_investment_berechnungen.sql";

/** Der Hinweis, den die Oberfläche zeigt, solange die Tabelle fehlt. */
export const BERECHNUNGEN_MIGRATION_HINWEIS =
  `Migration ${BERECHNUNGEN_MIGRATION} noch nicht ausgeführt. Der Rechner läuft unverändert, gespeichert wird noch nichts.`;

/** Die Zahlen für die Liste, damit sie nichts nachrechnen muss. */
export interface BerechnungKennzahlen {
  kaufpreis: number;
  eigenkapital: number;
  /** Monatlicher Cashflow nach Steuern im ersten Jahr. */
  cashflowMonatNachSteuern: number;
  /** Bruttorendite als Faktor, also 0,0412 für 4,12 Prozent. */
  bruttorendite: number;
  /** Interner Zinsfuß als Faktor. Ohne Eigenkapital nicht bestimmbar. */
  irr: number | null;
}

export interface InvestmentBerechnung {
  id: string;
  investment_id: string;
  kontakt_id: string;
  wohnung_id: string | null;
  name: string;
  eingabe: InvestmentEingabe;
  knk: Kaufnebenkostenauswahl;
  unterlagen: UnterlagenDaten | null;
  kennzahlen: BerechnungKennzahlen;
  herkunft: Herkunft;
  erstellt_von: string | null;
  erstellt_am: string;
  geaendert_am: string;
}

/** Was gespeichert wird. Ohne Kennung wird angelegt, mit Kennung geändert. */
export interface BerechnungEingabe {
  investmentId: string;
  kontaktId: string;
  wohnungId?: string | null;
  name: string;
  eingabe: InvestmentEingabe;
  knk: Kaufnebenkostenauswahl;
  unterlagen?: UnterlagenDaten | null;
  kennzahlen: BerechnungKennzahlen;
  herkunft?: Herkunft;
  erstelltVon?: string | null;
}

export interface BerechnungenLadeErgebnis {
  berechnungen: InvestmentBerechnung[];
  /** Die Migration fehlt. Die Oberfläche zeigt dann einen ruhigen Hinweis. */
  migrationFehlt: boolean;
  fehler: string | null;
}

export interface BerechnungErgebnis {
  berechnung: InvestmentBerechnung | null;
  migrationFehlt: boolean;
  fehler: string | null;
}

export interface LoeschErgebnis {
  erfolg: boolean;
  migrationFehlt: boolean;
  fehler: string | null;
}

const SPALTEN =
  "id, investment_id, kontakt_id, wohnung_id, name, eingabe, knk, unterlagen, kennzahlen, herkunft, erstellt_von, erstellt_am, geaendert_am";

const EINGABE_FELDER = Object.keys(standardEingabe);

function zahl(wert: unknown, ersatz = 0): number {
  const n = Number(wert);
  return Number.isFinite(n) ? n : ersatz;
}

/**
 * Eine gespeicherte Eingabe über die Standardwerte legen.
 *
 * Nur bekannte Felder mit passendem Typ werden übernommen, wie in
 * `annahmenZusammenfuehren` im Exposé-Datensatz. Ein alter oder fremder
 * JSON-Stand füttert den Rechner sonst mit Unsinn, und das Ergebnis sähe
 * richtig aus.
 *
 * Alte Stände werden dabei einmal umgerechnet, siehe `aufGesamtkaufpreis`.
 */
export function eingabeAusJson(roh: unknown): InvestmentEingabe {
  const ergebnis: InvestmentEingabe = { ...standardEingabe };
  if (!roh || typeof roh !== "object") return ergebnis;
  const daten = roh as Record<string, unknown>;
  /*
    Ein Stand ohne Finanzierungsnebenkosten stammt von vor dem 25.09.2026 und
    wurde ohne sie gerechnet. Er bekommt 0 statt des Standards, sonst
    verschöbe sich eine schon gezeigte Berechnung beim bloßen Öffnen. Wird er
    wieder gespeichert, steht der Satz ausdrücklich darin.
  */
  ergebnis.financingCostRate = 0;
  for (const schluessel of EINGABE_FELDER as (keyof InvestmentEingabe)[]) {
    const wert = daten[schluessel];
    if (wert === undefined || wert === null) continue;
    const vorlage = standardEingabe[schluessel];
    const passt =
      (typeof vorlage === "number" && typeof wert === "number" && Number.isFinite(wert))
      || (typeof vorlage === "boolean" && typeof wert === "boolean")
      || (typeof vorlage === "string" && typeof wert === "string");
    if (passt) (ergebnis as unknown as Record<string, unknown>)[schluessel] = wert;
  }
  return aufGesamtkaufpreis(ergebnis, daten.eingabeVersion);
}

/**
 * Einen Stand von vor dem 25.09.2026 auf den Gesamtkaufpreis umrechnen.
 *
 * Bis dahin war `purchasePrice` der Kaufpreis ohne Möbel, die Möbel kamen
 * obendrauf. Seitdem ist `purchasePrice` der Gesamtkaufpreis und die Möbel
 * ein Anteil darin. Ein alter Stand wird deshalb so gelesen: Kaufpreis gleich
 * alter Kaufpreis plus alte Möbel, Möbel bleiben als „davon“ stehen. So
 * beschreibt er denselben Kauf wie vorher.
 *
 * Erkannt wird ein alter Stand an der fehlenden oder kleineren Versionsmarke.
 * Das Ergebnis trägt die aktuelle Marke; wird es wieder gespeichert, steht
 * sie in der Datenbank, und der Stand wird beim nächsten Öffnen nicht noch
 * einmal umgerechnet. Keine Datenbankmigration: Wer nie wieder speichert,
 * bekommt bei jedem Öffnen dieselbe Umrechnung, und das Ergebnis ist immer
 * dasselbe.
 */
export function aufGesamtkaufpreis(eingabe: InvestmentEingabe, gespeicherteVersion: unknown): InvestmentEingabe {
  const version =
    typeof gespeicherteVersion === "number" && Number.isFinite(gespeicherteVersion) ? gespeicherteVersion : 1;
  if (version >= EINGABE_VERSION) return { ...eingabe, eingabeVersion: EINGABE_VERSION };
  return {
    ...eingabe,
    purchasePrice: eingabe.purchasePrice + Math.max(0, eingabe.furniturePrice),
    eingabeVersion: EINGABE_VERSION,
  };
}

function knkAusJson(roh: unknown): Kaufnebenkostenauswahl {
  if (!roh || typeof roh !== "object") return standardKaufnebenkostenauswahl;
  const daten = roh as Record<string, unknown>;
  const weg = daten.weg === "manuell" ? "manuell" : "bundesland";
  return { weg, bundesland: typeof daten.bundesland === "string" ? daten.bundesland : "" };
}

function unterlagenAusJson(roh: unknown): UnterlagenDaten | null {
  if (!roh || typeof roh !== "object") return null;
  const daten = roh as Record<string, unknown>;
  const ergebnis: UnterlagenDaten = { ...leereUnterlagenDaten };
  for (const schluessel of Object.keys(leereUnterlagenDaten) as (keyof UnterlagenDaten)[]) {
    const wert = daten[schluessel];
    if (wert === undefined || wert === null) continue;
    const vorlage = leereUnterlagenDaten[schluessel];
    if (Array.isArray(vorlage)) {
      if (Array.isArray(wert)) {
        (ergebnis as unknown as Record<string, unknown>)[schluessel] = wert.filter((e) => typeof e === "string");
      }
      continue;
    }
    if (typeof vorlage === typeof wert) (ergebnis as unknown as Record<string, unknown>)[schluessel] = wert;
  }
  return ergebnis;
}

function kennzahlenAusJson(roh: unknown): BerechnungKennzahlen {
  const daten = roh && typeof roh === "object" ? (roh as Record<string, unknown>) : {};
  const irr = daten.irr;
  return {
    kaufpreis: zahl(daten.kaufpreis),
    eigenkapital: zahl(daten.eigenkapital),
    cashflowMonatNachSteuern: zahl(daten.cashflowMonatNachSteuern),
    bruttorendite: zahl(daten.bruttorendite),
    irr: irr === null || irr === undefined || !Number.isFinite(Number(irr)) ? null : Number(irr),
  };
}

function zeileZuBerechnung(z: Record<string, unknown>): InvestmentBerechnung {
  return {
    id: String(z.id),
    investment_id: String(z.investment_id),
    kontakt_id: String(z.kontakt_id),
    wohnung_id: (z.wohnung_id as string | null) ?? null,
    name: String(z.name ?? ""),
    eingabe: eingabeAusJson(z.eingabe),
    knk: knkAusJson(z.knk),
    unterlagen: unterlagenAusJson(z.unterlagen),
    kennzahlen: kennzahlenAusJson(z.kennzahlen),
    herkunft: herkunftAusJson(z.herkunft, EINGABE_FELDER),
    erstellt_von: (z.erstellt_von as string | null) ?? null,
    erstellt_am: String(z.erstellt_am ?? ""),
    geaendert_am: String(z.geaendert_am ?? ""),
  };
}

/**
 * Aus einem Datenbankfehler wird ein Satz, den ein Mensch lesen kann.
 *
 * Die Originalmeldung ist englisch und nennt Tabellen- und Regelnamen. Sie
 * gehört ins Protokoll, nicht in das Hinweisfeld des Partners: Sie hilft ihm
 * nicht und verrät einem Neugierigen den inneren Aufbau.
 */
function alsFehler(error: { code?: string; message?: string }): { migrationFehlt: boolean; fehler: string | null } {
  if (istTabelleUnbekannt(error)) return { migrationFehlt: true, fehler: null };
  console.warn("[investmentBerechnungen]", error.code, error.message);
  const verweigert = error.code === "42501" || /row-level security|permission denied/i.test(error.message || "");
  return {
    migrationFehlt: false,
    fehler: verweigert
      ? "Das hat nicht geklappt. Vielleicht darfst du diesen Kunden nicht bearbeiten."
      : "Das hat nicht geklappt. Bitte versuche es in einem Moment noch einmal.",
  };
}

/** Die Kennzahlen aus Eingabe und Ergebnis, ohne selbst zu rechnen. */
export function kennzahlenAus(eingabe: InvestmentEingabe, ergebnis: InvestmentErgebnis): BerechnungKennzahlen {
  const erstesJahr = ergebnis.years[0];
  return {
    // Der Gesamtkaufpreis, die Möbel stecken seit dem 25.09.2026 darin. Alte
    // Zeilen haben hier Kaufpreis plus Möbel gespeichert, also dieselbe Zahl.
    // Beim All-inclusive-Modell samt Aufschlag, passend zur Bruttorendite daneben.
    kaufpreis: ausgewiesenerKaufpreis(eingabe, ergebnis),
    eigenkapital: eingabe.equity,
    cashflowMonatNachSteuern: erstesJahr ? erstesJahr.cashflowAfterTax / 12 : 0,
    bruttorendite: ergebnis.grossYield,
    irr: ergebnis.irr,
  };
}

/**
 * Ein Vorschlag für den Namen einer neuen Berechnung.
 *
 * Objekt und Einheit, weil das die Frage ist, die eine Berechnung beantwortet.
 * Erst wenn beides fehlt, wird daraus ein Datum, damit nie ein leerer Name in
 * der Liste steht.
 */
export function berechnungsnameVorschlag(objektTitel?: string | null, weNr?: string | null): string {
  const teile = [objektTitel?.trim(), weNr?.trim() ? `WE ${weNr.trim()}` : ""].filter(Boolean);
  if (teile.length > 0) return teile.join(", ");
  return `Berechnung vom ${new Date().toLocaleDateString("de-DE")}`;
}

/** Alle Berechnungen eines Investments, die neueste zuerst. */
export async function ladeBerechnungen(investmentId: string): Promise<BerechnungenLadeErgebnis> {
  if (!investmentId) return { berechnungen: [], migrationFehlt: false, fehler: null };
  const { data, error } = await db
    .from("investment_berechnungen")
    .select(SPALTEN)
    .eq("investment_id", investmentId)
    .order("geaendert_am", { ascending: false });
  if (error) return { berechnungen: [], ...alsFehler(error) };
  const zeilen = Array.isArray(data) ? data : [];
  return {
    berechnungen: zeilen.map((z) => zeileZuBerechnung(z as Record<string, unknown>)),
    migrationFehlt: false,
    fehler: null,
  };
}

/** Eine einzelne Berechnung über ihre Kennung. */
export async function ladeBerechnung(id: string): Promise<BerechnungErgebnis> {
  if (!id) return { berechnung: null, migrationFehlt: false, fehler: null };
  const { data, error } = await db.from("investment_berechnungen").select(SPALTEN).eq("id", id).maybeSingle();
  if (error) return { berechnung: null, ...alsFehler(error) };
  return {
    berechnung: data ? zeileZuBerechnung(data as Record<string, unknown>) : null,
    migrationFehlt: false,
    fehler: null,
  };
}

function zuZeile(daten: BerechnungEingabe): Record<string, unknown> {
  return {
    investment_id: daten.investmentId,
    kontakt_id: daten.kontaktId,
    wohnung_id: daten.wohnungId || null,
    name: daten.name,
    eingabe: daten.eingabe,
    knk: daten.knk,
    unterlagen: daten.unterlagen ?? null,
    kennzahlen: daten.kennzahlen,
    herkunft: daten.herkunft ?? {},
  };
}

/** Eine neue Berechnung anlegen. */
export async function speichereBerechnung(daten: BerechnungEingabe): Promise<BerechnungErgebnis> {
  const { data, error } = await db
    .from("investment_berechnungen")
    // erstellt_von setzt die Datenbank aus der angemeldeten Kennung. Käme der
    // Wert aus dem Browser, könnte jemand eine fremde Kennung eintragen, und
    // "angelegt von" wäre als Nachweis wertlos.
    .insert(zuZeile(daten))
    .select(SPALTEN)
    .single();
  if (error) return { berechnung: null, ...alsFehler(error) };
  return { berechnung: zeileZuBerechnung(data as Record<string, unknown>), migrationFehlt: false, fehler: null };
}

/**
 * Eine vorhandene Berechnung ändern.
 *
 * `erstellt_von` bleibt bewusst stehen: Wer sie angelegt hat, ändert sich
 * nicht dadurch, dass jemand anderes sie später anfasst. Wann sie zuletzt
 * geändert wurde, setzt der Trigger in der Datenbank.
 */
export async function aktualisiereBerechnung(id: string, daten: BerechnungEingabe): Promise<BerechnungErgebnis> {
  const { data, error } = await db
    .from("investment_berechnungen")
    .update(zuZeile(daten))
    .eq("id", id)
    .select(SPALTEN)
    .maybeSingle();
  if (error) return { berechnung: null, ...alsFehler(error) };
  return {
    berechnung: data ? zeileZuBerechnung(data as Record<string, unknown>) : null,
    migrationFehlt: false,
    fehler: null,
  };
}

/** Eine Berechnung löschen. */
export async function loescheBerechnung(id: string): Promise<LoeschErgebnis> {
  /*
   * Die betroffene Zeile kommt zurück, sonst wäre jedes Löschen erfolgreich.
   *
   * Verweigert die Zugriffsregel das Löschen, ist das kein Fehler, sondern
   * schlicht "keine Zeile betroffen". Ohne diese Prüfung meldete die
   * Oberfläche "Berechnung gelöscht", und beim nächsten Laden wäre sie wieder
   * da, ohne dass jemand den Grund sieht.
   */
  const { data, error } = await db
    .from("investment_berechnungen")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { erfolg: false, ...alsFehler(error) };
  if (!data || data.length === 0) {
    return {
      erfolg: false,
      migrationFehlt: false,
      fehler: "Die Berechnung konnte nicht gelöscht werden. Vielleicht darfst du diesen Kunden nicht bearbeiten.",
    };
  }
  return { erfolg: true, migrationFehlt: false, fehler: null };
}
