/**
 * Lesezugang der digitalen Personas zu den Objektdaten, als drei Werkzeuge
 * des MCP-Servers `kennzahlen-mcp`: `objekte_liste`, `objekt_details` und
 * `objekt_dokumente`.
 *
 * Seit dem 28.09.2026 liegt die Datei unter `_shared/`, weil auch der MORE
 * Lotse (`objekt-lotse`) die Positivliste für Objekt und Einheit nutzt. Am
 * Verhalten von `kennzahlen-mcp` ändert das nichts.
 *
 * WARUM IN DIESER FUNCTION UND NICHT IN EINER EIGENEN
 *
 * `kennzahlen-mcp` ist in claude.ai schon als Connector angebunden und durch
 * ein Geheimnis im Header geschützt. Drei weitere Werkzeuge hier brauchen
 * keinen neuen Connector und kein neues Geheimnis, nur das Ausrollen. Welche
 * Persona welches Werkzeug benutzen darf, steuert die `tools:`-Zeile ihrer
 * Datei unter `.claude/agents/`.
 *
 * WARUM SCHREIBEN KONSTRUKTIV UNMÖGLICH IST
 *
 *   - Die Werkzeuge bekommen keinen Supabase-Client, sondern `nurLesen(...)`.
 *     Das ist ein Gerüst mit genau einer Methode: `from(tabelle).select(...)`.
 *     Nach `select` liefert supabase-js nur noch einen Filterbaustein, der
 *     weder `insert` noch `update`, `delete` oder `upsert` kennt. `rpc` gibt
 *     es in diesem Gerüst gar nicht.
 *   - Die Tabellen stehen fest in `ERLAUBTE_TABELLEN`. Eine andere lehnt das
 *     Gerüst ab, bevor die Datenbank gefragt wird.
 *   - Spalten und Filter sind fest im Code. Der Aufrufer wählt nur eine
 *     Objektkennung (geprüft als UUID), eine Seitenzahl, einen Ortsnamen
 *     (auf Buchstaben, Ziffern und wenige Zeichen gekürzt) und ob nur
 *     sichtbare Objekte kommen sollen. Kein freies SQL.
 *
 * DATENSCHUTZ, POSITIVLISTE
 *
 * Mit Anthropic besteht kein Auftragsverarbeitungsvertrag. Deshalb geht keine
 * Person hinaus: keine Kunden, keine Käufer, keine Reservierungsinhaber, keine
 * Mieter, keine Verkäufer, keine Berater, keine Kennungen von Personen. Der
 * Verkaufsstand geht nur als Zustand hinaus („frei", „reserviert", „verkauft").
 *
 * Doppelt gesichert: Die Abfrage liest nur die erlaubten Spalten, und die
 * Antwort wird danach noch einmal über die Positivliste gebaut. Wer hier eine
 * Spalte ergänzt, prüft zuerst: Kann darin eine Person stehen?
 *
 * `meta` geht nur gefiltert hinaus. Grundlage ist die geprüfte Liste des
 * öffentlichen Exposés (`_shared/expose-oeffentlich.ts`); was ein Fremder
 * sehen darf, darf die interne Persona auch. Dazu kommen einige interne
 * Zahlen, die keine Person tragen (`INTERNE_META_ZAHLEN`,
 * `INTERNE_ROHDATEN_ZAHLEN`). Bewusst NICHT dabei sind unter anderem
 * `verkaeuferDaten`, `beraterName`, `exklusivNutzer`, `hausverwaltung`,
 * `dokumente`, `unterlagenLink`, `bilder`, `afaDraft` sowie aus den
 * Investagon-Rohdaten `seller`, `seller_rep`, `files` und `commission`.
 *
 * DOKUMENTE
 *
 * Nur Metadaten: Titel, Gruppe, Ampel, Kategorie, Art, Datum und ob eine Datei
 * hinterlegt ist. Keine Adresse, kein Inhalt. Rote Unterlagen (Mietverhältnis,
 * Grundbuch) nennen Personen schon im Dateinamen, ebenso Kauf- und
 * Reservierungsunterlagen und Unbestimmtes; bei ihnen bleibt der Titel leer.
 *
 * Reine Funktionen ohne Deno-Bezug, geprüft in
 * `src/lib/kennzahlenMcpObjektdaten.test.ts`.
 */
import { oeffentlicheRohdaten, oeffentlichesMeta } from "./expose-oeffentlich.ts";
import { dokumentAmpel, dokumentOberbegriff, istInvestagonDatei, type Ampel } from "./dokument-freigabe.ts";
import { DOKUMENT_OBERBEGRIFFE, investagonKategorieAusRohdaten } from "./dokument-gruppen.ts";
import { istUebernahmeKopie } from "./grundriss-erkennung.ts";

/* ------------------------------------------------------------------ */
/* Das Lesegerüst                                                     */
/* ------------------------------------------------------------------ */

/** Die einzigen Tabellen, die die Werkzeuge lesen. */
export const ERLAUBTE_TABELLEN = ["objekte", "wohnungen", "objekt_dokumente", "wohnungs_dokumente"] as const;
export type ErlaubteTabelle = (typeof ERLAUBTE_TABELLEN)[number];

export interface LeseErgebnis {
  data: unknown;
  error: { message?: string; code?: string } | null;
  count?: number | null;
}

/** Was nach `select` noch geht: filtern, sortieren, begrenzen. Nichts davon schreibt. */
export interface LeseAbfrage extends PromiseLike<LeseErgebnis> {
  eq(spalte: string, wert: unknown): LeseAbfrage;
  in(spalte: string, werte: readonly unknown[]): LeseAbfrage;
  ilike(spalte: string, muster: string): LeseAbfrage;
  order(spalte: string, optionen?: { ascending?: boolean }): LeseAbfrage;
  range(von: number, bis: number): LeseAbfrage;
  maybeSingle(): PromiseLike<LeseErgebnis>;
}

export interface LeseClient {
  from(tabelle: ErlaubteTabelle): { select(spalten: string, optionen?: { count?: "exact" }): LeseAbfrage };
}

/** Die Form des echten Clients, soweit das Gerüst ihn anfasst. */
export interface RohClient {
  from(tabelle: string): { select(spalten: string, optionen?: unknown): unknown };
}

/**
 * Den Supabase-Client auf Lesen beschränken.
 *
 * Der Service-Role-Schlüssel umgeht die Zeilenrechte. Deshalb reicht es
 * nicht, im Code einfach nichts Schreibendes aufzurufen: Das Gerüst gibt den
 * Werkzeugen gar nicht erst die Möglichkeit dazu.
 */
export function nurLesen(client: RohClient): LeseClient {
  return {
    from(tabelle: ErlaubteTabelle) {
      if (!(ERLAUBTE_TABELLEN as readonly string[]).includes(tabelle)) {
        throw new Error("Tabelle ist für den Lesezugang nicht freigegeben.");
      }
      const abfrage = client.from(tabelle);
      return {
        select: (spalten: string, optionen?: { count?: "exact" }) => abfrage.select(spalten, optionen) as LeseAbfrage,
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Positivlisten                                                      */
/* ------------------------------------------------------------------ */

/** Spalten eines Objekts in der Übersicht. */
export const OBJEKT_LISTE_SPALTEN = [
  "id", "titel", "adresse", "plz", "ort", "status", "sichtbar", "global_objekt",
  "preis_von", "preis_bis", "groesse_von", "groesse_bis", "rendite_von", "rendite_bis",
  "global_baujahr", "erstellt_am", "aktualisiert_am",
] as const;

/**
 * Spalten eines Objekts in der Einzelansicht, ohne `meta`.
 *
 * Bewusst NICHT dabei: `belegung_kunde_id`, `belegung_kunde_name`,
 * `belegung_von`, `vorgemerkt_kunde_id`, `vorgemerkt_kunde_name`,
 * `vorgemerkt_berater_name`, `vorgemerkt_von`, `erstellt_von`,
 * `exklusiv_partner` (Personen) und `cloud_ordner_url` (Sammelordner mit allen
 * Unterlagen). `bild_url` und `video_url` sind Adressen, die niemandem beim
 * Lesen helfen.
 */
export const OBJEKT_DETAIL_SPALTEN = [
  "id", "titel", "adresse", "plz", "ort", "beschreibung", "badge", "status", "sichtbar", "highlights",
  "preis_von", "preis_bis", "groesse_von", "groesse_bis", "rendite_von", "rendite_bis",
  "afa_modell", "afa_satz", "restnutzungsdauer", "sanierungskosten",
  "erhaltungsaufwand", "erhaltungsaufwand_jahre", "bodenrichtwert", "grundstueck_anteil",
  "global_objekt", "global_baujahr", "global_etagen", "global_gesamt_qm",
  "global_grundstueck_qm", "global_rendite", "global_verkaufspreis",
  "global_jahresnettomiete", "global_hausgeld_monat", "global_kaufnebenkosten",
  "global_stellplaetze", "global_vermietungsstand", "global_zustand",
  "global_energieeffizienzklasse", "erstellt_am", "aktualisiert_am",
] as const;

/**
 * Der Zustand eines Globalobjekts (frei, reserviert, verkauft). Die Spalte
 * kommt aus der Migration 20260923152000. Fehlt sie, wird ohne sie gelesen.
 */
const OBJEKT_OPTIONALE_SPALTEN = ["belegung"] as const;

/**
 * Spalten einer Einheit, ohne `meta`.
 *
 * Bewusst NICHT dabei: `kunde_id`, `kunde_name`, `reserviert_von`,
 * `gesetzt_am`, `gesetzt_bis`, `vorgemerkt_kunde_id`, `vorgemerkt_kunde_name`,
 * `vorgemerkt_berater_name`, `vorgemerkt_von`, `vorgemerkt_bis`. Der Status
 * geht nur als Zustand hinaus, `reserviert_am` nur als Datum ohne wer.
 */
export const EINHEIT_SPALTEN = [
  "id", "objekt_id", "we_nr", "etage", "lage", "groesse", "zimmer",
  "miete_gesamt", "vk_gesamt", "qm_preis", "rendite", "vermietet", "status",
  "reserviert_am", "erstellt_am",
] as const;

/**
 * Interne Angaben aus `meta` zusätzlich zur Liste des öffentlichen Exposés.
 * Nur schlichte Werte (Text, Zahl, Wahrheitswert), alle ohne Person: Sie
 * stammen aus dem Pflegedialog des Objekts (`src/pages/ObjektNeu.tsx`).
 */
export const INTERNE_META_ZAHLEN = [
  "anlageklasse", "verwaltungsart", "verwaltungskostenWeg", "verwaltungskostenSev",
  "verwaltungskostenSonstige", "ruecklageWeg", "garantierteErstvermietungKalt",
] as const;

/**
 * Interne Zahlen aus den Investagon-Rohdaten zusätzlich zur öffentlichen
 * Liste. Genau die, die der Import auswertet
 * (`supabase/functions/investagon-import/mapping.ts`), also bekannte Preise,
 * Mieten und Kosten. Nur schlichte Werte.
 */
export const INTERNE_ROHDATEN_ZAHLEN = [
  "purchase_price_apartment", "purchase_price_furniture", "purchase_price_parking",
  "rent_apartment_month", "rent_operating_costs", "rent_parking_month",
  "operation_cost_landlord_apartment", "property_management_fee", "property_management_fee_sev",
] as const;

/** Aus dem öffentlichen `meta` fällt für die Personas heraus: Bilderadressen helfen beim Lesen nicht. */
const NICHT_FUER_PERSONAS = ["bilder"] as const;

/** Die Kategorien, die im CRM vergeben werden. Alles andere heißt „sonstige". */
const DOKUMENT_KATEGORIEN = ["objektunterlagen", "wohnungsunterlagen", "intern"] as const;
const DOKUMENT_ARTEN = ["standard", "custom"] as const;

/**
 * Gruppen, bei denen der Titel hinausgeht. Nicht dabei: Mietverhältnis und
 * Grundbuch (rot, sie nennen Mieter und Eigentümer), Vertragsunterlagen
 * (Reservierung und Kaufvertrag tragen den Käufer oft im Dateinamen) und
 * Sonstiges (dort landet, was niemand einordnen konnte, etwa „Scan_Meier.pdf").
 */
const GRUPPEN_MIT_TITEL = new Set<string>([
  "Exposé und Beschreibung", "Grundrisse und Pläne", "Flächen", "Teilungserklärung",
  "Energie", "Versicherung", "WEG und Hausgeld", "Behördliche Auskünfte",
]);

/* ------------------------------------------------------------------ */
/* Grenzen je Abruf                                                   */
/* ------------------------------------------------------------------ */

export const OBJEKTE_JE_SEITE = 50;
export const EINHEITEN_JE_SEITE = 25;
export const DOKUMENTE_JE_SEITE = 100;
/** Höchste Seitenzahl, die angenommen wird. Schützt vor sinnlos teuren Sprüngen. */
const HOECHSTE_SEITE = 1000;
/** Zeilen je Datenbankabruf beim Nachladen (Supabase liefert höchstens 1000). */
const BLOCK = 1000;
/** Höchstens so viele Blöcke je Nachladen, danach wird abgeschnitten und das gemeldet. */
const HOECHSTENS_BLOECKE = 20;

/* ------------------------------------------------------------------ */
/* Hilfen                                                             */
/* ------------------------------------------------------------------ */

/** Ein Fehler in der Eingabe. Seine Meldung darf an den Aufrufer. */
export class EingabeFehler extends Error {}

function alsObjekt(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function istSchlicht(v: unknown): boolean {
  return typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

function nurErlaubte(quelle: unknown, erlaubt: readonly string[]): Record<string, unknown> {
  const q = alsObjekt(quelle);
  const ziel: Record<string, unknown> = {};
  if (!q) return ziel;
  for (const schluessel of erlaubt) {
    if (schluessel in q) ziel[schluessel] = q[schluessel];
  }
  return ziel;
}

function nurSchlichte(quelle: unknown, erlaubt: readonly string[]): Record<string, unknown> {
  const q = alsObjekt(quelle);
  const ziel: Record<string, unknown> = {};
  if (!q) return ziel;
  for (const schluessel of erlaubt) {
    if (istSchlicht(q[schluessel])) ziel[schluessel] = q[schluessel];
  }
  return ziel;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function objektIdAus(v: unknown): string {
  const id = typeof v === "string" ? v.trim() : "";
  if (!UUID.test(id)) throw new EingabeFehler("objekt_id fehlt oder ist keine gültige Kennung.");
  return id;
}

export function seiteAus(v: unknown): number {
  if (v === undefined || v === null || v === "") return 1;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < 1 || n > HOECHSTE_SEITE) {
    throw new EingabeFehler(`seite muss eine ganze Zahl von 1 bis ${HOECHSTE_SEITE} sein.`);
  }
  return n;
}

/**
 * Den Ortsfilter säubern: nur Buchstaben, Ziffern, Leerzeichen, Punkt und
 * Bindestrich, höchstens 60 Zeichen. `%` und `_` fallen weg, damit der
 * Aufrufer das Suchmuster nicht selbst bauen kann.
 */
export function ortAus(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const sauber = v.normalize("NFC").replace(/[^\p{L}\p{N} .-]/gu, "").trim().slice(0, 60);
  return sauber || null;
}

/** Dieselbe Einordnung wie `einheitStatus` in `src/lib/objektSpeichernAbgleich.ts`. */
export function verkaufsstand(roh: unknown): "frei" | "reserviert" | "verkauft" {
  const status = String(roh ?? "").trim().toLowerCase();
  if (status === "reserviert" || status === "gesetzt") return "reserviert";
  if (status === "verkauft") return "verkauft";
  return "frei";
}

function belegungAus(roh: unknown): "frei" | "reserviert" | "verkauft" | null {
  return roh === "frei" || roh === "reserviert" || roh === "verkauft" ? roh : null;
}

function spalteFehlt(fehler: { message?: string; code?: string } | null): boolean {
  if (!fehler) return false;
  return fehler.code === "42703" || /column .* does not exist/i.test(fehler.message ?? "");
}

/** Ein Datenbankfehler. Die Meldung bleibt im Protokoll, hinaus geht nur ein allgemeiner Satz. */
export class DatenFehler extends Error {}

function pruefe(ergebnis: LeseErgebnis, wo: string): LeseErgebnis {
  if (ergebnis.error) throw new DatenFehler(`${wo}: ${ergebnis.error.message ?? "unbekannt"}`);
  return ergebnis;
}

function zeilen(data: unknown): Array<Record<string, unknown>> {
  return (Array.isArray(data) ? data : []).map(alsObjekt).filter((z): z is Record<string, unknown> => !!z);
}

/**
 * Erst mit den optionalen Spalten lesen, fehlen sie in der Datenbank, ohne.
 * So stürzt nichts ab, solange eine Migration noch nicht gelaufen ist.
 */
async function mitRueckfall(
  bauen: (spalten: string) => PromiseLike<LeseErgebnis>,
  spalten: readonly string[],
  optional: readonly string[],
  wo: string,
): Promise<LeseErgebnis> {
  const voll = await bauen([...spalten, ...optional].join(", "));
  if (!voll.error || !spalteFehlt(voll.error)) return pruefe(voll, wo);
  return pruefe(await bauen(spalten.join(", ")), wo);
}

/** Alle Zeilen einer Abfrage in Blöcken zu 1000, höchstens `HOECHSTENS_BLOECKE`. */
async function alleZeilen(
  bauen: () => LeseAbfrage,
  wo: string,
): Promise<{ zeilen: Array<Record<string, unknown>>; abgeschnitten: boolean }> {
  const alle: Array<Record<string, unknown>> = [];
  for (let block = 0; block < HOECHSTENS_BLOECKE; block++) {
    const von = block * BLOCK;
    const teil = zeilen(pruefe(await bauen().range(von, von + BLOCK - 1), wo).data);
    alle.push(...teil);
    if (teil.length < BLOCK) return { zeilen: alle, abgeschnitten: false };
  }
  return { zeilen: alle, abgeschnitten: true };
}

function stueckeln<T>(liste: T[], groesse: number): T[][] {
  const teile: T[][] = [];
  for (let i = 0; i < liste.length; i += groesse) teile.push(liste.slice(i, i + groesse));
  return teile;
}

function seitenangaben(seite: number, jeSeite: number, gesamt: number | null | undefined, geliefert: number) {
  const von = (seite - 1) * jeSeite;
  return {
    seite,
    je_seite: jeSeite,
    gesamt: typeof gesamt === "number" ? gesamt : null,
    weitere_seiten: typeof gesamt === "number" ? von + geliefert < gesamt : geliefert === jeSeite,
  };
}

const HINWEIS =
  "Nur lesend. Personenbezogene Angaben sind ausgeblendet: keine Kunden, Käufer, Reservierungsinhaber, Mieter, Verkäufer oder Berater. Der Verkaufsstand erscheint nur als Zustand.";

/* ------------------------------------------------------------------ */
/* Antwort aus einer Zeile bauen                                      */
/* ------------------------------------------------------------------ */

/**
 * `meta` für die Personas. Grundlage ist das öffentliche Exposé, dazu die
 * internen Zahlen. Bilderadressen fallen heraus.
 */
export function personasMeta(meta: unknown): Record<string, unknown> {
  const ergebnis = oeffentlichesMeta(meta);
  for (const schluessel of NICHT_FUER_PERSONAS) delete ergebnis[schluessel];
  Object.assign(ergebnis, nurSchlichte(meta, INTERNE_META_ZAHLEN));

  const roh = alsObjekt(meta)?.investagonRaw;
  const rohdaten = { ...(oeffentlicheRohdaten(roh) ?? {}), ...nurSchlichte(roh, INTERNE_ROHDATEN_ZAHLEN) };
  if (Object.keys(rohdaten).length) ergebnis.investagonRaw = rohdaten;
  else delete ergebnis.investagonRaw;
  return ergebnis;
}

export function listenObjekt(zeile: Record<string, unknown>): Record<string, unknown> {
  return { ...nurErlaubte(zeile, OBJEKT_LISTE_SPALTEN), belegung: belegungAus(zeile.belegung) };
}

export function detailObjekt(zeile: Record<string, unknown>): Record<string, unknown> {
  return {
    ...nurErlaubte(zeile, OBJEKT_DETAIL_SPALTEN),
    belegung: belegungAus(zeile.belegung),
    meta: personasMeta(zeile.meta),
  };
}

export function personasEinheit(zeile: Record<string, unknown>): Record<string, unknown> {
  return {
    ...nurErlaubte(zeile, EINHEIT_SPALTEN),
    status: verkaufsstand(zeile.status),
    meta: personasMeta(zeile.meta),
  };
}

export interface PersonasDokument {
  ebene: "objekt" | "einheit";
  einheit_id: string | null;
  we_nr: string | null;
  titel: string | null;
  titel_ausgeblendet: boolean;
  gruppe: string;
  ampel: Ampel;
  kategorie: string;
  art: string | null;
  datum: string | null;
  datei_vorhanden: boolean;
  quelle: "investagon" | "crm";
}

/**
 * Eine Unterlage als Metadaten. Die Adresse wird nur gelesen, um zu sagen, ob
 * eine Datei da ist und woher sie kommt; hinaus geht sie nicht.
 */
export function personasDokument(
  zeile: Record<string, unknown>,
  bezug: { ebene: "objekt" | "einheit"; einheitId?: string | null; weNr?: string | null },
  investagonKategorie?: string | null,
): PersonasDokument {
  const name = text(zeile.name);
  const freigabe = { name, investagonKategorie: investagonKategorie ?? null };
  const gruppe = dokumentOberbegriff(freigabe);
  const ampel = dokumentAmpel(freigabe);
  const titelErlaubt = !!name && ampel !== "rot" && GRUPPEN_MIT_TITEL.has(gruppe) && !name.includes("@");
  const kategorie = text(zeile.kategorie);
  const art = text(zeile.typ);
  const url = text(zeile.url);
  return {
    ebene: bezug.ebene,
    einheit_id: bezug.einheitId ?? null,
    we_nr: bezug.weNr ?? null,
    titel: titelErlaubt ? name : null,
    titel_ausgeblendet: !titelErlaubt,
    gruppe,
    ampel,
    kategorie: (DOKUMENT_KATEGORIEN as readonly string[]).includes(kategorie) ? kategorie : "sonstige",
    art: (DOKUMENT_ARTEN as readonly string[]).includes(art) ? art : null,
    datum: text(zeile.erstellt_am) || null,
    datei_vorhanden: !!url,
    quelle: istInvestagonDatei(url) ? "investagon" : "crm",
  };
}

/* ------------------------------------------------------------------ */
/* Die drei Werkzeuge                                                 */
/* ------------------------------------------------------------------ */

export const OBJEKT_WERKZEUGE = [
  {
    name: "objekte_liste",
    description:
      "Liste der Objekte im Bestand mit Lage, Preis-, Flächen- und Renditespanne, Baujahr und dem Verkaufsstand der Einheiten (frei, reserviert, verkauft). Nur lesend, ohne Personen. Höchstens 50 Objekte je Abruf, weitere über seite.",
    inputSchema: {
      type: "object",
      properties: {
        seite: { type: "integer", minimum: 1, description: "Seitenzahl, beginnt bei 1." },
        ort: { type: "string", description: "Optional: nur Objekte, deren Ort diesen Text enthält." },
        nur_sichtbar: { type: "boolean", description: "Optional: nur Objekte, die im CRM sichtbar geschaltet sind." },
      },
    },
  },
  {
    name: "objekt_details",
    description:
      "Alle freigegebenen Zahlen, Daten und Fakten zu einem Objekt und seinen Einheiten: Preise, Mieten, Flächen, Hausgeld, Rücklage, AfA, Baujahr, Energie, Sanierungen, Lage, Verkaufsstand je Einheit. Nur lesend, ohne Personen. Höchstens 25 Einheiten je Abruf, weitere über seite.",
    inputSchema: {
      type: "object",
      properties: {
        objekt_id: { type: "string", description: "Kennung des Objekts aus objekte_liste." },
        seite: { type: "integer", minimum: 1, description: "Seite der Einheitenliste, beginnt bei 1." },
      },
      required: ["objekt_id"],
    },
  },
  {
    name: "objekt_dokumente",
    description:
      "Die Unterlagen eines Objekts und seiner Einheiten als Liste: Titel, Gruppe, Ampelfarbe, Kategorie, Datum und ob eine Datei hinterlegt ist. Keine Inhalte und keine Links. Bei roten Unterlagen, Vertragsunterlagen und Sonstigem bleibt der Titel leer, weil er Personen nennen kann. Höchstens 100 Unterlagen je Abruf.",
    inputSchema: {
      type: "object",
      properties: {
        objekt_id: { type: "string", description: "Kennung des Objekts aus objekte_liste." },
        seite: { type: "integer", minimum: 1, description: "Seitenzahl, beginnt bei 1." },
      },
      required: ["objekt_id"],
    },
  },
] as const;

export type ObjektWerkzeugName = (typeof OBJEKT_WERKZEUGE)[number]["name"];

export function istObjektWerkzeug(name: unknown): name is ObjektWerkzeugName {
  return OBJEKT_WERKZEUGE.some((w) => w.name === name);
}

type Zaehler = { gesamt: number; frei: number; reserviert: number; verkauft: number };

async function einheitenZaehlen(db: LeseClient, objektIds: string[]): Promise<{ je: Map<string, Zaehler>; abgeschnitten: boolean }> {
  const je = new Map<string, Zaehler>();
  let abgeschnitten = false;
  for (const teil of stueckeln(objektIds, 100)) {
    const ergebnis = await alleZeilen(
      () => db.from("wohnungen").select("id, objekt_id, status").in("objekt_id", teil).order("id"),
      "wohnungen zaehlen",
    );
    abgeschnitten ||= ergebnis.abgeschnitten;
    for (const z of ergebnis.zeilen) {
      const id = text(z.objekt_id);
      const zaehler = je.get(id) ?? { gesamt: 0, frei: 0, reserviert: 0, verkauft: 0 };
      zaehler.gesamt += 1;
      zaehler[verkaufsstand(z.status)] += 1;
      je.set(id, zaehler);
    }
  }
  return { je, abgeschnitten };
}

async function objekteListe(db: LeseClient, args: Record<string, unknown>) {
  const seite = seiteAus(args.seite);
  const ort = ortAus(args.ort);
  const nurSichtbar = args.nur_sichtbar === true;
  const von = (seite - 1) * OBJEKTE_JE_SEITE;

  const ergebnis = await mitRueckfall(
    (spalten) => {
      let q = db.from("objekte").select(spalten, { count: "exact" });
      if (ort) q = q.ilike("ort", `%${ort}%`);
      if (nurSichtbar) q = q.eq("sichtbar", true);
      return q.order("titel").order("id").range(von, von + OBJEKTE_JE_SEITE - 1);
    },
    OBJEKT_LISTE_SPALTEN,
    OBJEKT_OPTIONALE_SPALTEN,
    "objekte",
  );
  const liste = zeilen(ergebnis.data);
  const ids = liste.map((z) => text(z.id)).filter(Boolean);
  const zaehler = await einheitenZaehlen(db, ids);
  const leer: Zaehler = { gesamt: 0, frei: 0, reserviert: 0, verkauft: 0 };

  return {
    hinweis: HINWEIS,
    ...seitenangaben(seite, OBJEKTE_JE_SEITE, ergebnis.count, liste.length),
    ...(zaehler.abgeschnitten ? { einheiten_unvollstaendig: true } : {}),
    objekte: liste.map((z) => ({ ...listenObjekt(z), einheiten: zaehler.je.get(text(z.id)) ?? leer })),
  };
}

async function objektDetails(db: LeseClient, args: Record<string, unknown>) {
  const objektId = objektIdAus(args.objekt_id);
  const seite = seiteAus(args.seite);
  const von = (seite - 1) * EINHEITEN_JE_SEITE;

  const objekt = await mitRueckfall(
    (spalten) => db.from("objekte").select(spalten).eq("id", objektId).maybeSingle(),
    [...OBJEKT_DETAIL_SPALTEN, "meta"],
    OBJEKT_OPTIONALE_SPALTEN,
    "objekte",
  );
  const zeile = alsObjekt(objekt.data);
  if (!zeile) throw new EingabeFehler("Objekt nicht gefunden.");

  const einheiten = pruefe(
    await db
      .from("wohnungen")
      .select([...EINHEIT_SPALTEN, "meta"].join(", "), { count: "exact" })
      .eq("objekt_id", objektId)
      .order("we_nr")
      .order("id")
      .range(von, von + EINHEITEN_JE_SEITE - 1),
    "wohnungen",
  );
  const liste = zeilen(einheiten.data);

  return {
    hinweis: HINWEIS,
    objekt: detailObjekt(zeile),
    einheiten: {
      ...seitenangaben(seite, EINHEITEN_JE_SEITE, einheiten.count, liste.length),
      liste: liste.map(personasEinheit),
    },
  };
}

const GRUPPEN_RANG = new Map<string, number>(DOKUMENT_OBERBEGRIFFE.map((g, i) => [g, i]));

async function objektDokumente(db: LeseClient, args: Record<string, unknown>) {
  const objektId = objektIdAus(args.objekt_id);
  const seite = seiteAus(args.seite);

  const objekt = pruefe(await db.from("objekte").select("id, meta").eq("id", objektId).maybeSingle(), "objekte");
  const objektZeile = alsObjekt(objekt.data);
  if (!objektZeile) throw new EingabeFehler("Objekt nicht gefunden.");
  const objektKategorie = investagonKategorieAusRohdaten(alsObjekt(objektZeile.meta)?.investagonRaw);

  const [objektDoks, einheiten] = await Promise.all([
    alleZeilen(
      () => db.from("objekt_dokumente").select("id, name, kategorie, typ, erstellt_am, url").eq("objekt_id", objektId).order("id"),
      "objekt_dokumente",
    ),
    alleZeilen(() => db.from("wohnungen").select("id, we_nr, meta").eq("objekt_id", objektId).order("id"), "wohnungen"),
  ]);
  let abgeschnitten = objektDoks.abgeschnitten || einheiten.abgeschnitten;

  const dokumente: PersonasDokument[] = objektDoks.zeilen.map((z) =>
    personasDokument(z, { ebene: "objekt" }, objektKategorie(text(z.name))),
  );

  const einheitNach = new Map(einheiten.zeilen.map((w) => [text(w.id), w]));
  const tabellenZeilen: Array<Record<string, unknown>> = [];
  for (const teil of stueckeln([...einheitNach.keys()].filter(Boolean), 100)) {
    const ergebnis = await alleZeilen(
      () => db.from("wohnungs_dokumente").select("id, wohnung_id, name, kategorie, erstellt_am, url").in("wohnung_id", teil).order("id"),
      "wohnungs_dokumente",
    );
    abgeschnitten ||= ergebnis.abgeschnitten;
    tabellenZeilen.push(...ergebnis.zeilen);
  }

  for (const [einheitId, w] of einheitNach) {
    const meta = alsObjekt(w.meta);
    const kategorieFuer = investagonKategorieAusRohdaten(meta?.investagonRaw);
    const bezug = { ebene: "einheit" as const, einheitId, weNr: text(w.we_nr) || null };
    const ausTabelle = tabellenZeilen.filter((z) => text(z.wohnung_id) === einheitId);
    const bekannteAdressen = new Set(ausTabelle.map((z) => text(z.url)).filter(Boolean));
    const bekannteIds = new Set(ausTabelle.map((z) => text(z.id)).filter(Boolean));
    for (const z of ausTabelle) dokumente.push(personasDokument(z, bezug, kategorieFuer(text(z.name))));
    // Von Hand hochgeladene Wohnungsunterlagen stehen nur in `meta.dokumente`. Die Tabellenzeile gewinnt.
    for (const roh of Array.isArray(meta?.dokumente) ? meta.dokumente : []) {
      const z = alsObjekt(roh);
      if (!z) continue;
      const url = text(z.url);
      if ((url && bekannteAdressen.has(url)) || bekannteIds.has(text(z.id)) || istUebernahmeKopie(url)) continue;
      dokumente.push(personasDokument(z, bezug, kategorieFuer(text(z.name))));
    }
  }

  dokumente.sort((a, b) =>
    (a.ebene === b.ebene ? 0 : a.ebene === "objekt" ? -1 : 1)
    || (a.we_nr ?? "").localeCompare(b.we_nr ?? "", "de", { numeric: true })
    || (GRUPPEN_RANG.get(a.gruppe) ?? 99) - (GRUPPEN_RANG.get(b.gruppe) ?? 99)
    || (a.datum ?? "").localeCompare(b.datum ?? ""),
  );

  const von = (seite - 1) * DOKUMENTE_JE_SEITE;
  const seitenListe = dokumente.slice(von, von + DOKUMENTE_JE_SEITE);
  const ampeln = { gruen: 0, gelb: 0, rot: 0 };
  for (const d of dokumente) ampeln[d.ampel] += 1;

  return {
    hinweis: HINWEIS,
    objekt_id: objektId,
    ...seitenangaben(seite, DOKUMENTE_JE_SEITE, dokumente.length, seitenListe.length),
    ampeln,
    ...(abgeschnitten ? { liste_unvollstaendig: true } : {}),
    dokumente: seitenListe,
  };
}

/**
 * Ein Werkzeug ausführen. Die Antwort trägt immer den Abrufzeitpunkt, damit
 * jede Zahl ihren Stand hat.
 */
export async function objektWerkzeugAufrufen(
  name: ObjektWerkzeugName,
  args: Record<string, unknown>,
  db: LeseClient,
): Promise<Record<string, unknown>> {
  const abgerufenAm = new Date().toISOString();
  let ergebnis: Record<string, unknown>;
  if (name === "objekte_liste") ergebnis = await objekteListe(db, args);
  else if (name === "objekt_details") ergebnis = await objektDetails(db, args);
  else ergebnis = await objektDokumente(db, args);
  return { abgerufen_am: abgerufenAm, ...ergebnis };
}
