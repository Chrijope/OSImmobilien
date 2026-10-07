/**
 * Monatliche Provisionsabrechnung pro Vertriebspartner.
 *
 * Pro VP und Monat gibt es genau einen Abrechnungsdatensatz. Status-Ablauf:
 *   offen  →  freigegeben  →  ausgezahlt
 *
 * Persistenz: die Tabelle `provisionsabrechnungen` in Supabase, gelesen über
 * den dataCache.
 *
 * Vorher lag alles im localStorage. Das hiess: die Buchhaltung erstellte einen
 * Bescheid, der Vertriebspartner sah ihn nie, weil die Daten den Browser der
 * Buchhaltung nicht verliessen. Ein anderer Rechner, ein anderer Browser oder
 * ein geleerter Cache und die Abrechnungen waren ersatzlos weg.
 *
 * Solange die Migration 20260729080000 noch nicht eingespielt ist, fällt der
 * Store auf den alten localStorage-Bestand zurück, damit die Seite
 * weiterhin bedienbar bleibt. `abrechnungenPersistenz()` sagt, welcher der
 * beiden Wege gerade greift.
 *
 * Seit dem 04.10.2026 nur noch, wenn die Tabelle wirklich fehlt. Vorher
 * schaltete jeder Schreibfehler (Rechte, Netz, Sperre) still auf den
 * Browser-Speicher um; die Buchhaltung sah „gespeichert“, der Partner nie
 * etwas. Jeder andere Fehler wird jetzt geworfen und auf der Seite gemeldet.
 *
 * Ebenfalls seit dem 04.10.2026: Ein Bescheid mit Status ungleich „offen“
 * behält seine Zahlen. Das prüft dieser Store und, unabhängig davon, der
 * Trigger aus Migration 20261004170000.
 */

import { cacheGet, cacheUpsert, cacheRefreshTable, cacheLadefehler } from "./dataCache";
import { supabase } from "@/integrations/supabase/client";
import type { Satzart } from "./karriereStufeHelper";

export type AbrechnungStatus = "offen" | "freigegeben" | "ausgezahlt";

export interface AbrechnungDeal {
  /**
   * Das abgerechnete Investment. Seit dem 04.10.2026 rechnet der Bescheid je
   * Investment; ältere Posten tragen nur die Kontakt-Kennung.
   */
  investmentId?: string;
  kontaktId: string;
  kundeName: string;
  objekt: string;
  kaufpreis: number;
  satz: number;
  betrag: number;
  /**
   * Woher der Satz kommt: "eigen" = selbst angelegter Kontakt, "zugewiesen" =
   * zugewiesener Lead, "locked" = beim Anlegen des Vorgangs festgeschrieben,
   * "stufe" = Satz der Karrierestufe, weil kein eigener gepflegt ist.
   */
  satzTyp?: Satzart;
  /** Name der Setterin, falls es bei einem Altdatensatz noch einen gibt. */
  setterName?: string;
}

export interface AbrechnungOverride {
  kontaktId: string;
  juniorUserId: string;
  juniorName: string;
  kundeName: string;
  kaufpreis: number;
  overridePercent: number;
  betrag: number;
}

export interface AbrechnungOverhead {
  anUserId: string;
  anName: string;
  objekt: string;
  kaufpreis: number;
  overheadRate: number;
  betrag: number;
}

export interface Provisionsabrechnung {
  id: string;
  monat: string;             // YYYY-MM
  userId: string;
  userName: string;
  karriereStufe?: string;
  eigeneDeals: AbrechnungDeal[];
  overridesErhalten: AbrechnungOverride[];
  overheadsAbgezogen: AbrechnungOverhead[];
  summeEigen: number;
  summeOverridesErhalten: number;
  summeOverhead: number;
  netto: number;
  status: AbrechnungStatus;
  freigegebenAm?: string;
  freigegebenVon?: string;
  ausgezahltAm?: string;
  ausgezahltVon?: string;
  pdfErstelltAm?: string;
  erstelltAm: string;
}

const TABELLE = "provisionsabrechnungen";
const KEY = "mi_provisionsabrechnungen";

// ── Umwandlung zwischen Datenbankzeile und Objekt ────────────────────────

function ausZeile(r: any): Provisionsabrechnung {
  return {
    id: r.id,
    monat: r.monat,
    userId: r.user_id,
    userName: r.user_name || "",
    karriereStufe: r.karrierestufe || undefined,
    eigeneDeals: Array.isArray(r.eigene_deals) ? r.eigene_deals : [],
    overridesErhalten: Array.isArray(r.overrides_erhalten) ? r.overrides_erhalten : [],
    overheadsAbgezogen: Array.isArray(r.overheads_abgezogen) ? r.overheads_abgezogen : [],
    summeEigen: Number(r.summe_eigen) || 0,
    summeOverridesErhalten: Number(r.summe_overrides_erhalten) || 0,
    summeOverhead: Number(r.summe_overhead) || 0,
    netto: Number(r.netto) || 0,
    status: (r.status as AbrechnungStatus) || "offen",
    freigegebenAm: r.freigegeben_am || undefined,
    freigegebenVon: r.freigegeben_von || undefined,
    ausgezahltAm: r.ausgezahlt_am || undefined,
    ausgezahltVon: r.ausgezahlt_von || undefined,
    pdfErstelltAm: r.pdf_erstellt_am || undefined,
    erstelltAm: r.erstellt_am || new Date().toISOString(),
  };
}

function zuZeile(a: Provisionsabrechnung): Record<string, any> {
  return {
    id: a.id,
    monat: a.monat,
    user_id: a.userId,
    user_name: a.userName,
    karrierestufe: a.karriereStufe ?? null,
    eigene_deals: a.eigeneDeals,
    overrides_erhalten: a.overridesErhalten,
    overheads_abgezogen: a.overheadsAbgezogen,
    summe_eigen: a.summeEigen,
    summe_overrides_erhalten: a.summeOverridesErhalten,
    summe_overhead: a.summeOverhead,
    netto: a.netto,
    status: a.status,
    freigegeben_am: a.freigegebenAm ?? null,
    freigegeben_von: a.freigegebenVon ?? null,
    ausgezahlt_am: a.ausgezahltAm ?? null,
    ausgezahlt_von: a.ausgezahltVon ?? null,
    pdf_erstellt_am: a.pdfErstelltAm ?? null,
    erstellt_am: a.erstelltAm,
    aktualisiert_am: new Date().toISOString(),
  };
}

// ── Notbehelf, solange die Tabelle fehlt ─────────────────────────────────

function lokalLesen(): Provisionsabrechnung[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Provisionsabrechnung[]) : [];
  } catch {
    return [];
  }
}

function lokalSchreiben(rows: Provisionsabrechnung[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
    window.dispatchEvent(new Event("mi_provisionsabrechnungen_changed"));
  } catch (e) {
    console.warn("[abrechnung] lokales Speichern fehlgeschlagen", e);
  }
}

/** Wird gesetzt, sobald die Datenbank meldet, dass die Tabelle fehlt. */
let nurLokal = false;

/**
 * Fehlt die Tabelle? Nur dann darf der Store auf den Browser-Speicher
 * ausweichen. PostgREST meldet das als `PGRST205`, Postgres als `42P01`.
 */
export function istTabelleFehlt(fehler: unknown): boolean {
  const f = (fehler ?? {}) as { code?: unknown; message?: unknown };
  const code = String(f.code ?? "");
  if (code === "PGRST205" || code === "42P01") return true;
  return /could not find the table|relation .*provisionsabrechnungen.* does not exist/i.test(String(f.message ?? ""));
}

/** Fehler beim Speichern eines Bescheids, mit lesbarer Meldung für die Seite. */
export class AbrechnungSpeicherFehler extends Error {
  constructor(public ursache: unknown) {
    const text = String((ursache as { message?: unknown })?.message ?? "");
    super(
      /gesperrt/i.test(text)
        ? "Der Bescheid ist schon freigegeben oder ausgezahlt, seine Zahlen bleiben unverändert."
        : /permission|row-level|42501/i.test(text + String((ursache as { code?: unknown })?.code ?? ""))
          ? "Dafür fehlt dir das Schreibrecht."
          : /doppelt abgerechnet|23505/i.test(text + String((ursache as { code?: unknown })?.code ?? ""))
            ? "Ein Abschluss oder Bescheid ist schon anderweitig gespeichert. Bitte lade die Seite neu und prüfe die Bescheide."
          : "Der Bescheid konnte nicht gespeichert werden. Bitte noch einmal versuchen.",
    );
    this.name = "AbrechnungSpeicherFehler";
  }
}

/**
 * Darf ein Bescheid neu berechnet werden? Nur solange er „offen“ ist. Danach
 * ist er ein Beleg, siehe den Kommentar in der Tabellenmigration.
 */
export function bescheidVeraenderbar(a: Pick<Provisionsabrechnung, "status"> | undefined): boolean {
  return !a || a.status === "offen";
}

/**
 * Wo liegen die Abrechnungen gerade? Die Seite blendet damit einen Hinweis
 * ein, solange die Migration noch nicht gelaufen ist. Ein stiller Rückfall auf
 * den Browser-Speicher wäre genau der Fehler, den wir gerade beheben.
 */
export function abrechnungenPersistenz(): "datenbank" | "lokal" {
  return nurLokal ? "lokal" : "datenbank";
}

// ── Öffentliche API ──────────────────────────────────────────────────────

export function getAbrechnungen(): Provisionsabrechnung[] {
  if (nurLokal) return lokalLesen();
  const zeilen = cacheGet<any>(TABELLE);
  if (!zeilen || zeilen.length === 0) {
    // Leer kann heissen: es gibt wirklich nichts, oder die Tabelle fehlt noch.
    // In beiden Fällen ist ein vorhandener lokaler Altbestand die bessere
    // Antwort als eine leere Liste.
    const lokal = lokalLesen();
    if (lokal.length > 0) return lokal;
    return [];
  }
  return zeilen.map(ausZeile);
}

/**
 * Lädt die Tabelle neu, etwa beim Öffnen der Seite.
 *
 * Fehlt die Tabelle, schaltet der Store auf den Browser-Speicher um, und die
 * Seite zeigt den Hinweis. Jeden anderen Lesefehler gibt die Funktion als
 * Text zurück, damit die Seite ihn meldet, statt mit leeren Bescheiden zu
 * rechnen. Ohne Fehler: null.
 */
export async function refreshAbrechnungen(): Promise<string | null> {
  try {
    await cacheRefreshTable(TABELLE);
  } catch (e) {
    if (istTabelleFehlt(e)) { nurLokal = true; return null; }
    return String((e as { message?: unknown })?.message ?? e);
  }
  const fehler = cacheLadefehler(TABELLE);
  if (!fehler) return null;
  if (istTabelleFehlt({ message: fehler })) {
    nurLokal = true;
    window.dispatchEvent(new Event("mi_provisionsabrechnungen_changed"));
    return null;
  }
  return fehler;
}

export async function upsertAbrechnung(a: Provisionsabrechnung, nachKonflikt = false): Promise<Provisionsabrechnung> {
  const vorhanden = getAbrechnungen().find(
    (r) => r.userId === a.userId && r.monat === a.monat,
  );
  // Status und Id bleiben immer die des vorhandenen Bescheids. Ist er schon
  // freigegeben oder ausgezahlt, bleiben auch seine Zahlen; nur der Vermerk
  // über das erzeugte PDF darf dazukommen.
  const zusammen: Provisionsabrechnung = !vorhanden
    ? a
    : bescheidVeraenderbar(vorhanden)
      ? { ...vorhanden, ...a, id: vorhanden.id, status: vorhanden.status }
      : { ...vorhanden, pdfErstelltAm: vorhanden.pdfErstelltAm ?? a.pdfErstelltAm };

  if (!nurLokal) {
    try {
      await cacheUpsert(TABELLE, zuZeile(zusammen), { silent: true });
      window.dispatchEvent(new Event("mi_provisionsabrechnungen_changed"));
      return zusammen;
    } catch (e) {
      /*
       * 23505: Für Partner und Monat gibt es schon einen Bescheid, den dieser
       * Browser noch nicht kannte. Nachladen und mit dem gespeicherten Stand
       * neu prüfen, einmal. Bis zum 04.10.2026 galt das still als gespeichert.
       */
      if (istKonflikt(e) && !nachKonflikt) {
        await refreshAbrechnungen();
        return upsertAbrechnung(a, true);
      }
      if (!istTabelleFehlt(e)) throw new AbrechnungSpeicherFehler(e);
      console.warn("[abrechnung] Tabelle fehlt, weiche lokal aus", e);
      nurLokal = true;
    }
  }

  const rows = lokalLesen();
  const idx = rows.findIndex((r) => r.userId === a.userId && r.monat === a.monat);
  if (idx >= 0) rows[idx] = zusammen;
  else rows.push(zusammen);
  lokalSchreiben(rows);
  return zusammen;
}

export async function updateAbrechnungStatus(
  id: string,
  status: AbrechnungStatus,
  actorName: string,
): Promise<Provisionsabrechnung | null> {
  const a = getAbrechnungen().find((r) => r.id === id);
  if (!a) return null;
  if (status !== "offen") pruefeKeinDoppelterAbschluss(a);

  const jetzt = new Date().toISOString();
  const neu: Provisionsabrechnung = { ...a, status };
  if (status === "freigegeben") {
    neu.freigegebenAm = jetzt;
    neu.freigegebenVon = actorName;
  }
  if (status === "ausgezahlt") {
    neu.ausgezahltAm = jetzt;
    neu.ausgezahltVon = actorName;
    if (!neu.freigegebenAm) {
      neu.freigegebenAm = jetzt;
      neu.freigegebenVon = actorName;
    }
  }

  if (!nurLokal) {
    try {
      await cacheUpsert(TABELLE, zuZeile(neu), { silent: true });
      window.dispatchEvent(new Event("mi_provisionsabrechnungen_changed"));
      return neu;
    } catch (e) {
      if (!istTabelleFehlt(e)) throw new AbrechnungSpeicherFehler(e);
      console.warn("[abrechnung] Tabelle fehlt, Statuswechsel lokal gespeichert", e);
      nurLokal = true;
    }
  }

  const rows = lokalLesen();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx >= 0) rows[idx] = neu;
  else rows.push(neu);
  lokalSchreiben(rows);
  return neu;
}

/** Eindeutigkeitsverstoss der Datenbank. */
function istKonflikt(fehler: unknown): boolean {
  return String((fehler as { code?: unknown })?.code ?? "") === "23505";
}

/** Ein Investment steht schon in einem anderen freigegebenen oder ausgezahlten Bescheid. */
export class AbschlussDoppelt extends Error {
  constructor(public monate: string[]) {
    super(
      `Mindestens ein Abschluss steht schon in einem freigegebenen oder ausgezahlten Bescheid (${monate.map(monatLabel).join(", ")}). ` +
        "Ein Abschluss darf nur einmal abgerechnet werden, es wurde nichts geändert.",
    );
    this.name = "AbschlussDoppelt";
  }
}

/**
 * Kein Investment in zwei Monaten: Wer einen Bescheid freigibt oder auszahlt,
 * darf kein Investment enthalten, das schon in einem anderen freigegebenen
 * oder ausgezahlten Bescheid desselben Partners steht. Dieselbe Regel hält
 * der Auslöser aus Migration 20261004170000 in der Datenbank fest.
 */
export function pruefeKeinDoppelterAbschluss(
  bescheid: Pick<Provisionsabrechnung, "id" | "userId" | "eigeneDeals">,
  alle: Provisionsabrechnung[] = getAbrechnungen(),
): void {
  const ids = new Set(bescheid.eigeneDeals.map((d) => d.investmentId).filter((x): x is string => !!x));
  if (ids.size === 0) return;
  const monate = alle
    .filter((b) => b.id !== bescheid.id && b.userId === bescheid.userId && (b.status === "freigegeben" || b.status === "ausgezahlt"))
    .filter((b) => b.eigeneDeals.some((d) => d.investmentId && ids.has(d.investmentId)))
    .map((b) => b.monat);
  if (monate.length > 0) throw new AbschlussDoppelt([...new Set(monate)]);
}

/**
 * Ein offener Bescheid, zu dem es beim Neuberechnen keinen Abschluss mehr
 * gibt, wird entfernt. Sonst stünde ein veralteter Betrag da, den jemand
 * freigeben könnte. Freigegebene und ausgezahlte bleiben immer.
 *
 * Gelöscht wird nur mit der Bedingung „noch offen“ in derselben Anfrage, und
 * nur eine von der Datenbank bestätigte Löschung gilt. Löschen dürfen laut
 * Zugriffsregel nur Admin und Inhaber; lehnt die Datenbank still ab (etwa für
 * die Buchhaltung), wird der Bescheid stattdessen geleert: keine Posten,
 * Summen null. Das braucht keine neue Regel, Ändern darf die Buchhaltung.
 */
export async function entferneLeerenBescheid(a: Provisionsabrechnung): Promise<"entfernt" | "geleert" | "unveraendert"> {
  if (!bescheidVeraenderbar(a)) return "unveraendert";
  if (nurLokal) {
    lokalSchreiben(lokalLesen().filter((r) => r.id !== a.id));
    return "entfernt";
  }
  const { data, error } = await (supabase as any)
    .from(TABELLE)
    .delete()
    .eq("id", a.id)
    .eq("status", "offen")
    .select("id");
  if (error) throw new AbrechnungSpeicherFehler(error);
  await cacheRefreshTable(TABELLE);
  window.dispatchEvent(new Event("mi_provisionsabrechnungen_changed"));
  if ((data || []).length > 0) return "entfernt";

  // Nicht gelöscht: kein Recht, oder inzwischen nicht mehr offen.
  const aktuell = getAbrechnungen().find((r) => r.id === a.id);
  if (!aktuell || !bescheidVeraenderbar(aktuell)) return "unveraendert";
  await upsertAbrechnung({
    ...aktuell,
    eigeneDeals: [],
    overridesErhalten: [],
    overheadsAbgezogen: [],
    summeEigen: 0,
    summeOverridesErhalten: 0,
    summeOverhead: 0,
    netto: 0,
  });
  return "geleert";
}

export function newId(): string {
  // Die Datenbankspalte ist eine uuid, der Ersatz muss also ebenfalls eine
  // uuid sein und darf keine eigene Kennung erfinden.
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function monatLabel(monat: string): string {
  const [y, m] = monat.split("-");
  const monate = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  return `${monate[Number(m) - 1] || ""} ${y}`;
}

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);

export { fmtEUR };

// ── Rechnungsstatus ──────────────────────────────────────────────────────
//
// Die Partner stellen ihre Provision selbst in Rechnung. Die Buchhaltung
// braucht daher nur eine Angabe: ist diese Rechnung bezahlt oder nicht.
//
// Vorher stand an dieser Stelle eine Gutschrift-Mechanik mit vier Haken, einem
// Bestätigungsdialog und dem Upload eines Zahlungsbelegs. Sie lag in der
// persoenlichen Einstellungszeile derjenigen Buchhalterin, die sie gesetzt
// hatte: eine zweite Person in der Buchhaltung sah davon nichts, der
// Vertriebspartner erst recht nicht. Gebraucht wurde sie ohnehin nicht, weil
// niemand Gutschriften ausstellt.

export interface RechnungsStatus {
  bezahlt: boolean;
  am?: string;
  von?: string;
  betrag: number;
}

/** Die Abrechnung eines Partners für einen Monat, falls es sie schon gibt. */
export function rechnungFuer(userId: string, monat: string): Provisionsabrechnung | undefined {
  if (!userId) return undefined;
  return getAbrechnungen().find((r) => r.userId === userId && r.monat === monat);
}

export function rechnungsStatus(userId: string, monat: string, betrag: number): RechnungsStatus {
  const r = rechnungFuer(userId, monat);
  return {
    bezahlt: r?.status === "ausgezahlt",
    am: r?.ausgezahltAm,
    von: r?.ausgezahltVon,
    betrag: r?.netto ?? betrag,
  };
}

/**
 * Rechnung als bezahlt oder wieder als offen markieren.
 *
 * Gibt es für den Monat noch keine Abrechnung, wird eine angelegt. Damit
 * sehen Partner und Buchhaltung denselben Stand, und die Seite
 * Provisionsabrechnung zeigt ihn ebenfalls.
 *
 * `deals` sind die Geschäfte, die mit dieser Zahlung abgegolten sind. Sie
 * stehen im neuen Bescheid, damit „Fällig“ sie danach nicht mehr zählt.
 */
export async function setzeRechnungBezahlt(
  partner: { userId: string; name: string; karriere?: string },
  monat: string,
  betrag: number,
  bezahlt: boolean,
  actorName: string,
  deals: AbrechnungDeal[] = [],
): Promise<Provisionsabrechnung | null> {
  if (!partner.userId) return null;
  const vorhanden = rechnungFuer(partner.userId, monat);

  if (!vorhanden) {
    if (!bezahlt) return null;
    const neu: Provisionsabrechnung = {
      id: newId(),
      monat,
      userId: partner.userId,
      userName: partner.name,
      karriereStufe: partner.karriere,
      eigeneDeals: deals,
      overridesErhalten: [],
      overheadsAbgezogen: [],
      summeEigen: betrag,
      summeOverridesErhalten: 0,
      summeOverhead: 0,
      netto: betrag,
      status: "offen",
      erstelltAm: new Date().toISOString(),
    };
    // Vor dem Anlegen prüfen, damit kein offener Bescheid übrig bleibt.
    pruefeKeinDoppelterAbschluss(neu);
    /*
     * Den Rückgabewert nehmen: Kannte dieser Browser einen Bescheid des Monats
     * noch nicht (23505), hat `upsertAbrechnung` nachgeladen und in den
     * gespeicherten Bescheid geschrieben, oder ihn unverändert gelassen, wenn
     * er schon freigegeben war. Ausgezahlt wird nur dieser, und nur, wenn er
     * genau die Positionen und den Betrag trägt.
     */
    const gespeichert = await upsertAbrechnung(neu);
    if (gespeichert.id !== neu.id) {
      if (gespeichert.status === "ausgezahlt" && bescheidPasst(gespeichert, deals, betrag)) return gespeichert;
      if (!bescheidPasst(gespeichert, deals, betrag)) throw new BescheidWeichtAb(gespeichert, betrag);
      pruefeKeinDoppelterAbschluss(gespeichert);
    }
    return updateAbrechnungStatus(gespeichert.id, "ausgezahlt", actorName);
  }

  if (!bezahlt) return updateAbrechnungStatus(vorhanden.id, "offen", actorName);
  if (vorhanden.status === "ausgezahlt") return vorhanden;
  /*
   * Ein vorhandener Monatsbescheid wird nur dann als ausgezahlt markiert,
   * wenn er genau diese Geschäfte und genau diesen Betrag enthält. Bis zum
   * 04.10.2026 setzte „Rechnung bezahlt“ jeden Bescheid des Monats pauschal
   * auf ausgezahlt, auch wenn er andere Posten oder eine andere Summe trug.
   */
  if (!bescheidPasst(vorhanden, deals, betrag)) throw new BescheidWeichtAb(vorhanden, betrag);
  return updateAbrechnungStatus(vorhanden.id, "ausgezahlt", actorName);
}

/** Enthält der Bescheid genau diese Investments und genau diesen Betrag (auf den Cent)? */
export function bescheidPasst(
  bescheid: Pick<Provisionsabrechnung, "eigeneDeals" | "netto">,
  deals: Pick<AbrechnungDeal, "investmentId" | "betrag">[],
  betrag: number,
): boolean {
  // Jede Position je Investment auf den Cent, dazu die Summe.
  const posten = (liste: { investmentId?: string; betrag?: number }[]) =>
    liste.map((d) => `${d.investmentId || ""}:${Math.round((Number(d.betrag) || 0) * 100)}`).sort().join("|");
  const ohneKennung = bescheid.eigeneDeals.some((d) => !d.investmentId) || deals.some((d) => !d.investmentId);
  if (ohneKennung) return false;
  return posten(bescheid.eigeneDeals) === posten(deals)
    && Math.round((Number(bescheid.netto) || 0) * 100) === Math.round((Number(betrag) || 0) * 100);
}

/** Der Monatsbescheid passt nicht zur Zahlung, es wurde nichts geändert. */
export class BescheidWeichtAb extends Error {
  constructor(public bescheid: Provisionsabrechnung, public betrag: number) {
    super(
      `Der Bescheid für ${monatLabel(bescheid.monat)} weicht ab (${fmtEUR(bescheid.netto)} im Bescheid, ` +
        `${fmtEUR(betrag)} fällig). Bitte prüfe ihn unter Provisionsabrechnung, es wurde nichts geändert.`,
    );
    this.name = "BescheidWeichtAb";
  }
}

/**
 * Was ein Partner von uns bisher tatsächlich bekommen hat.
 *
 * Die Übersicht in `/abrechnungen` zeigte in der Spalte „Gesamt" bis zum
 * 14.09.2026 die erwartete Provision samt Overhead, also eine Prognose. Auf
 * Christians Vorgabe steht dort jetzt das tatsächlich Ausgezahlte.
 *
 * Gezählt wird nur, was den Status `ausgezahlt` trägt. „Freigegeben" heißt
 * bewusst nicht „geflossen": Zwischen Freigabe und Überweisung liegen bei
 * einer Monatsabrechnung Tage, und eine Summe, die Geld verspricht, das noch
 * nicht da ist, ist in genau dieser Spalte am schädlichsten.
 *
 * Gefüllt wird die Tabelle nur, wenn auf `/provisionsabrechnung` jemand
 * „Abrechnungen neu berechnen" gedrückt hat. Steht hier null, heißt das also
 * entweder wirklich nichts ausgezahlt, oder es wurde nie abgerechnet.
 */
export function bisherErhalten(userId?: string | null): number {
  const id = (userId || "").trim();
  if (!id) return 0;
  return getAbrechnungen()
    .filter((a) => a.userId === id && a.status === "ausgezahlt")
    .reduce((summe, a) => summe + (Number(a.netto) || 0), 0);
}
