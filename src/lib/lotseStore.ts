/**
 * Datenzugriff des MORE Lotsen (Reiter auf der Einheitenseite).
 *
 * Hier stehen alle Wege zur Datenbank und zur Function `objekt-lotse`, die
 * Komponenten rufen Supabase nicht selbst auf:
 *
 *   - die Zustimmung zum Hinweis „Umgang mit KI“ lesen und speichern,
 *   - den eigenen Verlauf zu einer Einheit laden (die neuesten 50),
 *   - eine Frage stellen und die geprüften Blöcke der Antwort empfangen,
 *   - beim Öffnen die Unterlagen im Hintergrund vorbereiten lassen,
 *   - die Zahlen der Investmentkalkulation für den Lotsen zusammenstellen.
 *
 * Fehlt die Migration `20260928120000_objekt_lotse.sql`, meldet jeder Weg
 * `migrationFehlt`, und der Reiter sagt „Der Lotse wird gerade eingerichtet“.
 */
import { supabase } from "@/integrations/supabase/client";
import { istTabelleUnbekannt } from "@/lib/abwesenheitStore";
import { berechneInvestment, standardEingabe, type InvestmentEingabe, type InvestmentErgebnis } from "@/lib/investmentrechner/rechenkern";
import { vorbelegungAusEinheit } from "@/lib/investmentrechner/objektVorbelegung";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import {
  LOTSE_HINWEIS_FASSUNG,
  LOTSE_KALKULATION_FASSUNG,
  LOTSE_KUNDENDATEN_TEXT,
  LOTSE_KUNDENNAME_TEXT,
  LOTSE_PROVISION_TEXT,
  pruefeKalkulation,
  type LotseKalkulation,
} from "../../supabase/functions/_shared/lotse-regeln.ts";

export {
  frageMitKundendaten,
  frageMitKundennamen,
  LOTSE_HINWEIS_FASSUNG,
  LOTSE_KUNDENDATEN_TEXT,
  LOTSE_KUNDENNAME_TEXT,
  LOTSE_VORSCHLAEGE,
  lotseVorschlaege,
  trenneQuellen,
} from "../../supabase/functions/_shared/lotse-regeln.ts";
export type { LotseKalkulation } from "../../supabase/functions/_shared/lotse-regeln.ts";

/*
 * Die drei Tabellen des Lotsen stehen noch nicht in den erzeugten Typen
 * (Migration 20260928120000). Deshalb ohne Typen, gelesen wird ohnehin roh.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** So viele Nachrichten zeigt der Verlauf höchstens. */
const VERLAUF_GROESSE = 50;

export interface LotseNachricht {
  id: string;
  rolle: "user" | "assistant";
  inhalt: string;
  quellen: string[];
  erstelltAm: string;
  /**
   * Die kundenfreie Kalkulation, mit der diese Antwort erfragt wurde. Nur im
   * Speicher der Sitzung, nie in der Datenbank. Geladene ältere Antworten
   * haben keine, dann gibt es an der Quelle keine Erklärung (LOTSE2-004).
   */
  kalkulation?: LotseKalkulation | null;
  /** Der Strom brach ab: Die gezeigten Blöcke sind unvollständig und nicht gespeichert. Nur im Speicher der Sitzung. */
  unvollstaendig?: boolean;
}

/* ------------------------------------------------------------------ */
/* Zustimmung                                                         */
/* ------------------------------------------------------------------ */

export interface ZustimmungStand {
  akzeptiert: boolean;
  migrationFehlt: boolean;
  fehler: string | null;
}

/** Hat der Nutzer die aktuelle Fassung des Hinweises bestätigt? Die Zeilenregel liefert nur die eigene Zeile. */
export async function ladeZustimmung(): Promise<ZustimmungStand> {
  const { data, error } = await db.from("lotse_zustimmung").select("fassung").maybeSingle();
  if (istTabelleUnbekannt(error)) return { akzeptiert: false, migrationFehlt: true, fehler: null };
  if (error) return { akzeptiert: false, migrationFehlt: false, fehler: "Der Stand deiner Zustimmung ließ sich nicht laden." };
  const fassung = Number((data as { fassung?: unknown } | null)?.fassung ?? 0);
  return { akzeptiert: fassung >= LOTSE_HINWEIS_FASSUNG, migrationFehlt: false, fehler: null };
}

/** Die Zustimmung zur aktuellen Fassung speichern. Den Zeitpunkt setzt die Datenbank. */
export async function speichereZustimmung(): Promise<ZustimmungStand> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { akzeptiert: false, migrationFehlt: false, fehler: "Bitte melde dich neu an." };
  const { error } = await db
    .from("lotse_zustimmung")
    .upsert({ user_id: user.id, fassung: LOTSE_HINWEIS_FASSUNG }, { onConflict: "user_id" });
  if (istTabelleUnbekannt(error)) return { akzeptiert: false, migrationFehlt: true, fehler: null };
  if (error) return { akzeptiert: false, migrationFehlt: false, fehler: "Deine Zustimmung ließ sich nicht speichern. Bitte versuch es noch einmal." };
  return { akzeptiert: true, migrationFehlt: false, fehler: null };
}

/* ------------------------------------------------------------------ */
/* Verlauf                                                            */
/* ------------------------------------------------------------------ */

export interface VerlaufStand {
  nachrichten: LotseNachricht[];
  migrationFehlt: boolean;
  fehler: string | null;
}

function quellenAus(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((q): q is string => typeof q === "string") : [];
}

/** Die eigenen Nachrichten zu dieser Einheit, älteste zuerst. Fremde liefert die Zeilenregel nicht. */
export async function ladeVerlauf(objektId: string, wohnungId?: string | null): Promise<VerlaufStand> {
  let abfrage = db
    .from("lotse_nachrichten")
    .select("id, rolle, inhalt, quellen, erstellt_am")
    .eq("objekt_id", objektId);
  abfrage = wohnungId ? abfrage.eq("wohnung_id", wohnungId) : abfrage.is("wohnung_id", null);
  const { data, error } = await abfrage.order("erstellt_am", { ascending: false }).limit(VERLAUF_GROESSE);
  if (istTabelleUnbekannt(error)) return { nachrichten: [], migrationFehlt: true, fehler: null };
  if (error) return { nachrichten: [], migrationFehlt: false, fehler: "Dein Verlauf ließ sich nicht laden." };
  const zeilen = (data ?? []) as Array<Record<string, unknown>>;
  return {
    nachrichten: zeilen.reverse().map((z) => ({
      id: String(z.id),
      rolle: z.rolle === "assistant" ? "assistant" : "user",
      inhalt: String(z.inhalt ?? ""),
      quellen: quellenAus(z.quellen),
      erstelltAm: String(z.erstellt_am ?? ""),
    })),
    migrationFehlt: false,
    fehler: null,
  };
}

/* ------------------------------------------------------------------ */
/* Frage stellen                                                      */
/* ------------------------------------------------------------------ */

export type LotseAntwort =
  | { ok: true; text: string }
  | { ok: false; code: string; meldung: string; text: string };

/** Verständliche Texte, falls die Function keinen eigenen mitschickt. */
const MELDUNGEN: Record<string, string> = {
  migration_fehlt: "Der Lotse wird gerade eingerichtet. Bitte versuch es später noch einmal.",
  zustimmung_fehlt: "Bitte lies zuerst den Hinweis zum Umgang mit KI und bestätige ihn.",
  tageslimit: "Du hast heute schon alle Fragen gestellt. Morgen geht es weiter.",
  rolle_nicht_erlaubt: "Der MORE Lotse ist für deine Rolle nicht freigeschaltet.",
  nicht_angemeldet: "Bitte melde dich neu an.",
  abgebrochen: "Abgebrochen.",
  unvollstaendig: "Die Antwort ist unvollständig, bitte frag noch einmal.",
  kundendaten: LOTSE_KUNDENDATEN_TEXT,
  kundenname: LOTSE_KUNDENNAME_TEXT,
  verbindung: "Keine Verbindung zum Lotsen. Bitte versuch es noch einmal.",
  fehler: "Der Lotse konnte gerade nicht antworten. Bitte versuch es noch einmal.",
};

/** Wie weit der Lotse ist, solange noch kein Block da ist. */
export type LotseStufe = "liest" | "unterlagen" | "formuliert";

export interface FrageAnLotse {
  /** Die AKTIVE Rolle. Die Function prüft, ob der Nutzer sie wirklich trägt. */
  rolle: string;
  objektId: string;
  wohnungId?: string | null;
  frage: string;
  kalkulation: LotseKalkulation | null;
  signal?: AbortSignal;
  /** Der Server meldet, woran er gerade arbeitet. */
  beiStufe?: (stufe: LotseStufe) => void;
  /** Ein Block der Antwort, den der Server schon geprüft und freigegeben hat. */
  beiBlock?: (block: string) => void;
}

type Rumpf = { antwort?: unknown; code?: unknown; error?: unknown } | null;

/** Die Antwort aus dem Rumpf der Function, als JSON oder als letztes Ereignis im Strom. */
function ausRumpf(rumpf: Rumpf, ok: boolean, status: number): LotseAntwort {
  if (ok && typeof rumpf?.antwort === "string" && rumpf.antwort.trim()) return { ok: true, text: rumpf.antwort };
  if (rumpf?.code === "provision") return { ok: false, code: "provision", meldung: LOTSE_PROVISION_TEXT, text: "" };
  // Eine noch nicht ausgerollte Function antwortet mit 404 ohne eigenen Code.
  const code = typeof rumpf?.code === "string" ? rumpf.code : status === 404 ? "migration_fehlt" : ok ? "unvollstaendig" : "fehler";
  const meldung = typeof rumpf?.error === "string" && rumpf.error.trim() ? rumpf.error : MELDUNGEN[code] ?? MELDUNGEN.fehler;
  return { ok: false, code, meldung, text: "" };
}

const STUFEN: readonly LotseStufe[] = ["liest", "unterlagen", "formuliert"];

/**
 * Den Ereignisstrom der Function lesen: Zeilen `data: {…}` mit Stufe, Block
 * oder zum Schluss genau einem Ergebnis. Endet der Strom ohne Ergebnis, ist
 * die Antwort unvollständig.
 */
export async function lotseStromLesen(
  strom: ReadableStream<Uint8Array>,
  f: Pick<FrageAnLotse, "beiStufe" | "beiBlock">,
): Promise<LotseAntwort> {
  const leser = strom.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  for (;;) {
    const { done, value } = await leser.read();
    rest += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const zeilen = rest.split("\n");
    rest = done ? "" : zeilen.pop() ?? "";
    for (const zeile of zeilen) {
      if (!zeile.startsWith("data:")) continue;
      let ereignis: Record<string, unknown>;
      try {
        ereignis = JSON.parse(zeile.slice(5));
      } catch {
        continue;
      }
      if (typeof ereignis.block === "string") f.beiBlock?.(ereignis.block);
      else if (STUFEN.includes(ereignis.stufe as LotseStufe)) f.beiStufe?.(ereignis.stufe as LotseStufe);
      else if ("antwort" in ereignis || "code" in ereignis) {
        leser.cancel().catch(() => undefined);
        return ausRumpf(ereignis as Rumpf, true, 200);
      }
    }
    if (done) return { ok: false, code: "unvollstaendig", meldung: MELDUNGEN.unvollstaendig, text: "" };
  }
}

function functionAdresse(): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/objekt-lotse`;
}

function kopfZeilen(token: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY };
}

/**
 * Eine Frage an `objekt-lotse`, seit dem 28.09.2026 als Strom: Unterwegs
 * kommen die Stufe und die schon geprüften Blöcke (`beiStufe`, `beiBlock`),
 * zum Schluss genau eins von fertiger, ganz geprüfter und gespeicherter
 * Antwort, festem Provisionstext (`code` „provision“) oder Fehler. Eine noch
 * nicht ausgerollte ältere Function antwortet mit einem JSON wie bisher.
 */
export async function frageLotse(f: FrageAnLotse): Promise<LotseAntwort> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false, code: "nicht_angemeldet", meldung: MELDUNGEN.nicht_angemeldet, text: "" };
    const antwort = await fetch(functionAdresse(), {
      method: "POST",
      headers: kopfZeilen(session.access_token),
      body: JSON.stringify({
        rolle: f.rolle, objektId: f.objektId, wohnungId: f.wohnungId ?? null, frage: f.frage, kalkulation: f.kalkulation,
        kalkulationFassung: LOTSE_KALKULATION_FASSUNG, strom: true,
      }),
      signal: f.signal,
    });
    if (antwort.ok && antwort.body && (antwort.headers.get("Content-Type") ?? "").includes("text/event-stream")) {
      return await lotseStromLesen(antwort.body, f);
    }
    return ausRumpf((await antwort.json().catch(() => null)) as Rumpf, antwort.ok, antwort.status);
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return { ok: false, code: "abgebrochen", meldung: MELDUNGEN.abgebrochen, text: "" };
    console.error("objekt-lotse:", e);
    return { ok: false, code: "verbindung", meldung: MELDUNGEN.verbindung, text: "" };
  }
}

/* ------------------------------------------------------------------ */
/* Vorbereiten                                                        */
/* ------------------------------------------------------------------ */

/** Einheiten, die in dieser Sitzung schon vorbereitet wurden. */
const vorbereitet = new Set<string>();

/**
 * Beim Öffnen des Lotsen die Unterlagen dieser Einheit im Hintergrund
 * einordnen und auswerten lassen, damit die erste Frage nicht darauf wartet.
 * Höchstens einmal je Einheit und Sitzung; zählt nicht zum Tageskontingent.
 * Niemand wartet auf das Ergebnis, ein Fehler bleibt still.
 */
export function bereiteLotseVor(v: { rolle: string; objektId: string; wohnungId?: string | null }): void {
  const schluessel = `${v.objektId}:${v.wohnungId ?? ""}`;
  if (vorbereitet.has(schluessel)) return;
  vorbereitet.add(schluessel);
  void (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch(functionAdresse(), {
        method: "POST",
        headers: kopfZeilen(session.access_token),
        body: JSON.stringify({ aktion: "vorbereiten", rolle: v.rolle, objektId: v.objektId, wohnungId: v.wohnungId ?? null }),
      });
    } catch {
      // Nur Vorarbeit: Die Frage selbst wertet notfalls eine Unterlage aus.
    }
  })();
}

/* ------------------------------------------------------------------ */
/* Alle Unterlagen auswerten (Admin und Inhaber, 05.10.2026)          */
/* ------------------------------------------------------------------ */

export type LotseAuswertungSchritt =
  | { ok: true; ausgewertet: number; fehler: number; gesperrt: number; geprueft: number; gesamt: number; weiter: number | null }
  | { ok: false; meldung: string };

/**
 * Ein Schritt der Auswertung aller Unterlagen ab Abschnitt `ab`. Die Seite
 * ruft ihn wiederholt mit `weiter` aus der letzten Antwort, bis `weiter`
 * leer ist. Je Schritt höchstens acht Unterlagen (Kostenbremse der Function).
 */
export async function lotseUnterlagenAuswerten(rolle: string, ab: number): Promise<LotseAuswertungSchritt> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false, meldung: MELDUNGEN.nicht_angemeldet };
    const antwort = await fetch(functionAdresse(), {
      method: "POST",
      headers: kopfZeilen(session.access_token),
      body: JSON.stringify({ aktion: "unterlagen-vorbereiten", rolle, ab }),
    });
    const rumpf = await antwort.json().catch(() => null) as Record<string, unknown> | null;
    if (!antwort.ok || !rumpf || typeof rumpf.gesamt !== "number") {
      const code = typeof rumpf?.code === "string" ? rumpf.code : "fehler";
      return { ok: false, meldung: typeof rumpf?.error === "string" ? rumpf.error : MELDUNGEN[code] ?? MELDUNGEN.fehler };
    }
    const zahl = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    return {
      ok: true, ausgewertet: zahl(rumpf.ausgewertet), fehler: zahl(rumpf.fehler), gesperrt: zahl(rumpf.gesperrt),
      geprueft: zahl(rumpf.geprueft), gesamt: zahl(rumpf.gesamt), weiter: typeof rumpf.weiter === "number" ? rumpf.weiter : null,
    };
  } catch {
    return { ok: false, meldung: MELDUNGEN.verbindung };
  }
}

/* ------------------------------------------------------------------ */
/* Kalkulation                                                        */
/* ------------------------------------------------------------------ */

const r2 = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined);

/**
 * Die Zahlen der Investmentkalkulation für den Lotsen, nur Ergebnisse und
 * Objektannahmen. Kundenname, Einkommen und Steuerdaten bleiben im Browser.
 * Durch dieselbe Prüfung wie auf dem Server (`pruefeKalkulation`).
 *
 * Beträge durchgehend aus dem Ergebnis, also mit dem Eigentumsanteil
 * gerechnet, wie der Rechner sie zeigt: Kaufpreis `kaufpreisGesamt`, Miete und
 * Kosten aus dem ersten Jahr. Vorher standen hier volle Eingabebeträge neben
 * anteiligen Ergebnissen (Befund LOTSE-R3-003). Das eingesetzte Eigenkapital
 * bleibt die Eingabe, der Rechenkern teilt es nicht.
 */
export function kalkulationAusRechner(
  eingabe: InvestmentEingabe,
  ergebnis: InvestmentErgebnis,
  annahmen: LotseKalkulation["annahmen"],
): LotseKalkulation | null {
  const erstes = ergebnis.years[0];
  const letztes = ergebnis.years[ergebnis.years.length - 1];
  /*
   * Ohne eingetragenes Einkommen rechnet der Tarif keine Steuer, der
   * Steuereffekt stünde dann als 0 da. Der Lotse soll stattdessen sagen, dass
   * er nicht vorliegt.
   */
  const steuerOffen = eingabe.taxCalculationMode === "tariff" && ergebnis.combinedTaxableIncome <= 0;
  // Dieselbe Regel wie im Rechenkern: Bei Zusammenveranlagung zählt die ganze Wohnung.
  const anteilProzent = eingabe.jointAssessment ? 100 : Math.min(100, Math.max(0, eingabe.investmentShare));
  return pruefeKalkulation({
    annahmen,
    eigentumsanteil_prozent: r2(anteilProzent),
    kaufpreis: r2(ergebnis.kaufpreisGesamt),
    kaufnebenkosten: r2(ergebnis.purchaseCosts),
    gesamtinvestition: r2(ergebnis.totalInvestment),
    eigenkapital: r2(eingabe.equity),
    darlehen: r2(ergebnis.totalDebt),
    zins_prozent: r2(eingabe.seniorInterestRate),
    tilgung_prozent: r2(eingabe.seniorRepaymentRate),
    // Die im ersten Jahr tatsächlich gezahlte Rate: Bei einem kleinen Darlehen ist sie gedeckelt (Runde 6).
    rate_monat: r2(erstes ? erstes.debtService / 12 : ergebnis.monthlyDebtService),
    kaltmiete_monat: r2(erstes ? erstes.grossRent / 12 : undefined),
    // Nur mit Leerstand, sonst ginge die Rechnung der Chip-Erklärung nicht auf.
    mietausfall_monat: r2(erstes && erstes.grossRent > erstes.effectiveRent ? (erstes.grossRent - erstes.effectiveRent) / 12 : undefined),
    nicht_umlagefaehig_monat: r2(erstes ? erstes.operatingCosts / 12 : undefined),
    ruecklage_monat: r2(erstes ? erstes.reserveContribution / 12 : undefined),
    nettorendite_prozent: r2(ergebnis.netYield * 100),
    cashflow_vor_steuer_monat: r2(erstes ? erstes.cashflowBeforeTax / 12 : undefined),
    steuereffekt_monat: r2(erstes && !steuerOffen ? erstes.taxEffect / 12 : undefined),
    cashflow_nach_steuer_monat: r2(erstes && !steuerOffen ? erstes.cashflowAfterTax / 12 : undefined),
    // Der Eigenanteil ist ein Wert nach Steuer, ohne Einkommen gibt es ihn nicht (LOTSE-005).
    eigenanteil_monat: r2(steuerOffen ? undefined : ergebnis.eigenanteilMonat),
    afa_satz_prozent: r2(eingabe.buildingDepreciationRate),
    gebaeudeanteil_prozent: r2(eingabe.buildingShare),
    mietsteigerung_prozent: r2(eingabe.annualRentGrowth),
    wertsteigerung_prozent: r2(eingabe.annualValueGrowth),
    startjahr: eingabe.startYear,
    prognose_jahre: eingabe.forecastYears,
    restschuld_ende: r2(letztes?.remainingDebt),
    vermoegen_ende: r2(letztes?.propertyEquity),
  });
}

/**
 * Die Felder der Eingabe, die aus Kundenprofil oder Selbstauskunft kommen
 * können: Name, Einkommen, Steuerklasse, Familienstand (Veranlagung),
 * Kirchensteuer und der Steuersatz. Sie gehen nie an den Lotsen, auch nicht
 * als Ergebnis (Vorgabe vom 28.09.2026).
 */
const KUNDEN_FELDER = [
  "clientName", "annualGrossIncome", "taxClass", "jointAssessment", "taxableIncomeCustomer", "taxableIncomeSpouse",
  "annualTaxableIncomeGrowth", "churchTaxRate", "includeSolidaritySurcharge", "taxCalculationMode", "marginalTaxRate",
] as const satisfies readonly (keyof InvestmentEingabe)[];

export function ohneKundendaten(eingabe: InvestmentEingabe): InvestmentEingabe {
  return { ...eingabe, ...Object.fromEntries(KUNDEN_FELDER.map((f) => [f, standardEingabe[f]])) };
}

/**
 * Die Kalkulation, die der Lotse bekommt.
 *
 * Hat der Nutzer den Reiter „Investmentkalkulation“ geöffnet, meldet der
 * Rechner seinen Stand nach oben, dann gelten dessen Werte mit den Annahmen
 * des Nutzers, ohne Einkommen und Steuerfelder neu gerechnet. Ist die
 * Rechnung kundenbezogen (Kunde gewählt oder Selbstauskunft übernommen),
 * bekommt der Lotse sie gar nicht: Auch Eigenkapital, Anteil und Finanzierung
 * können dann vom Kunden stammen (LOTSE2-002). Dann und ohne Rechnerstand
 * rechnet derselbe Rechenkern mit der Vorbelegung der Einheit, gekennzeichnet
 * als Standardannahmen.
 */
export function kalkulationFuerLotse(
  objekt: ObjektData,
  wohnung: ObjektWohnung,
  rechnerStand: { eingabe: InvestmentEingabe; ergebnis: InvestmentErgebnis; kundenbezogen?: boolean } | null,
  /** Die Seite wurde aus dem Kundenprofil geöffnet: Dann gilt jede Rechnung des Rechners als kundenbezogen (LOTSE-003). */
  kundenkontext = false,
): LotseKalkulation | null {
  if (rechnerStand && rechnerStand.kundenbezogen === false && !kundenkontext) {
    const eingabe = ohneKundendaten(rechnerStand.eingabe);
    return kalkulationAusRechner(eingabe, berechneInvestment(eingabe), "nutzer");
  }
  try {
    const { eingabe } = vorbelegungAusEinheit(objekt, wohnung, new Date());
    return kalkulationAusRechner(eingabe, berechneInvestment(eingabe), "standard");
  } catch (e) {
    console.warn("objekt-lotse: Standardkalkulation nicht möglich", e);
    return null;
  }
}
