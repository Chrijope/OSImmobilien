import { oeffentlicheAdresse, terminToken } from "./oeffentlicheBasis";
import { supabase } from "@/integrations/supabase/client";

/**
 * Datenzugriff für das eigene Buchungssystem.
 *
 * Der Mitarbeiter arbeitet über die Tabellen, dort greift RLS. Der Buchende
 * hat kein Konto und läuft ausschliesslich über die RPCs aus der Migration
 * `20260804090000_buchung_grundlage.sql`, die Tabellen selbst sind für `anon`
 * gesperrt. Dasselbe Muster wie beim Videoraum.
 *
 * Solange die Migration in Supabase noch nicht gelaufen ist, geben die
 * Lesefunktionen leere Listen zurück und die Schreibfunktionen `null` oder
 * `false`. Nichts davon wirft, damit eine Oberfläche darüber nicht abstürzt.
 */

/**
 * `bewerbergespraech` ist der Anlass des Bewerberprozesses. Seine Terminart
 * steht auf `oeffentlich = false` und erscheint deshalb nie im offenen
 * Buchungslink; gebucht wird sie ausschliesslich vom Bewerber selbst, über
 * `bewerberTerminStore.ts`.
 */
export type BuchungAnlass = "erstgespraech" | "beratung" | "objektvorstellung" | "finanzierungsgespraech" | "bewerbergespraech" | "sonstiges";
export type BuchungStatus = "offen" | "abgesagt" | "wahrgenommen" | "nicht_erschienen";
export type BuchungQuelle = "persoenlich" | "offen" | "intern";

export interface BuchungEinstellungen {
  mitarbeiter_id: string;
  /** Kürzel des offenen Links, etwa "christian-peetz". */
  slug: string | null;
  /** Der offene Link lässt sich jederzeit abschalten. */
  offen_aktiv: boolean;
  zeitzone: string;
  begruessung: string | null;
  hinweis: string | null;
  meta: Record<string, unknown>;
}

export interface Terminart {
  id: string;
  mitarbeiter_id: string;
  bezeichnung: string;
  beschreibung: string | null;
  dauer_minuten: number;
  puffer_vor_minuten: number;
  puffer_nach_minuten: number;
  vorlauf_minuten: number;
  vorausschau_tage: number;
  raster_minuten: number;
  aktiv: boolean;
  /** Ob die Terminart auch am offenen Link erscheint. */
  oeffentlich: boolean;
  anlass: BuchungAnlass;
  sortierung: number;
  created_at: string;
  updated_at: string;
}

/**
 * Eine Zeile ist entweder eine Wochenregel (`wochentag` gesetzt) oder eine
 * Ausnahme für einen einzelnen Tag (`datum` gesetzt). Eine Ausnahme ersetzt
 * die Wochenregel dieses Tages vollständig, `geschlossen` ist der Urlaubstag.
 */
export interface VerfuegbarkeitZeile {
  id: string;
  mitarbeiter_id: string;
  wochentag: number | null;
  datum: string | null;
  von: string | null;
  bis: string | null;
  geschlossen: boolean;
  bemerkung: string | null;
}

export interface BuchungLink {
  id: string;
  token: string;
  mitarbeiter_id: string;
  kontakt_id: string;
  kontakt_snapshot: { name?: string; email?: string };
  terminart_id: string | null;
  /** Investment, zu dem der Termin gehoert. Fehlt bei alten Links. */
  investment_id?: string | null;
  aktiv: boolean;
  einmalig: boolean;
  gueltig_bis: string | null;
  created_at: string;
  /**
   * Wohin der Link fuehrt: "intern" ist unsere Buchungsstrecke mit Videoraum
   * (nur mit Videocall-Freigabe), "extern" die Terminseite mit dem eigenen
   * Kalender des Partners (Calendly und Co.), die nie einen Videoraum
   * erzeugt. Fehlt bei Links vor Migration 20260927120000.
   */
  ziel?: "intern" | "extern";
}

/**
 * Fuehrt dieser Link auf den externen Kalender?
 *
 * Massgeblich ist `ziel`. Nur bei alten Links ohne die Spalte gilt die
 * fruehere Regel: ohne Terminart die Terminseite.
 */
export function istExternerLink(l: Pick<BuchungLink, "terminart_id" | "ziel">): boolean {
  return l.ziel ? l.ziel === "extern" : !l.terminart_id;
}

export interface Buchung {
  id: string;
  mitarbeiter_id: string;
  terminart_id: string | null;
  link_id: string | null;
  quelle: BuchungQuelle;
  kontakt_id: string | null;
  /** Die Aktivität, die aus dieser Buchung entstanden ist. */
  aktivitaet_id: string | null;
  /** Der Videoraum, der bei der Buchung entstanden ist. */
  videoraum_id?: string | null;
  name: string;
  email: string;
  telefon: string | null;
  nachricht: string | null;
  /**
   * Optionale Begleitperson des Termins, etwa der Ehepartner. Sie bekommt
   * dieselben Buchungsmails wie der Kunde. Fehlt bei alten Buchungen und
   * solange die Migration 20260827160000 noch nicht gelaufen ist.
   */
  begleitung?: { name?: string; email?: string } | null;
  start_at: string;
  ende_at: string;
  dauer_minuten: number;
  puffer_vor_minuten: number;
  puffer_nach_minuten: number;
  bezeichnung: string | null;
  anlass: BuchungAnlass;
  status: BuchungStatus;
  created_at: string;
}

/** Was der Buchende ohne Konto zu sehen bekommt. */
export interface BuchungZugang {
  art: "persoenlich" | "offen";
  /**
   * Ansprechpartner fuer das Kaestchen auf der Buchungsseite. Position, Ort
   * und Zitat kommen aus dem Nutzerprofil und koennen fehlen, wenn dort
   * nichts gepflegt ist.
   */
  berater: {
    name: string;
    email: string | null;
    telefon: string | null;
    bild: string | null;
    position?: string | null;
    ort?: string | null;
    zitat?: string | null;
  };
  zeitzone: string;
  begruessung: string | null;
  hinweis: string | null;
  kontakt_bekannt: boolean;
  vorbelegung: { name?: string; email?: string };
  terminarten: Array<{
    id: string;
    bezeichnung: string;
    beschreibung: string | null;
    dauer_minuten: number;
    /**
     * Wie weit im Voraus diese Terminart buchbar ist.
     *
     * Fehlt, solange die Migration 20260804180000 noch nicht gelaufen ist.
     * Dann gilt der Standard aus `TERMINART_STANDARD`.
     */
    vorausschau_tage?: number;
    anlass: BuchungAnlass;
  }>;
}

export interface BuchungAnsicht {
  id: string;
  status: BuchungStatus;
  start_at: string;
  ende_at: string;
  dauer_minuten: number;
  bezeichnung: string | null;
  anlass: BuchungAnlass;
  /**
   * Die Terminart des Termins. Fehlt, solange die Migration 20260804180000
   * noch nicht gelaufen ist, und ist leer, wenn die Terminart inzwischen
   * gelöscht wurde.
   */
  terminart_id?: string | null;
  name: string;
  email: string;
  berater: { name: string; email: string | null; telefon: string | null };
  zeitzone: string;
}

// Die Tabellen stehen noch nicht in den erzeugten Supabase-Typen, siehe
// videoraumStore.ts.
const db = supabase as any;

/** Standardwerte einer neuen Terminart. Ein Beratungsgespräch dauert 60 Minuten. */
export const TERMINART_STANDARD = {
  dauerMinuten: 60,
  pufferVorMinuten: 0,
  pufferNachMinuten: 15,
  vorlaufMinuten: 240,
  vorausschauTage: 60,
  rasterMinuten: 15,
} as const;

// ---------------------------------------------------------------------------
// Einstellungen des Mitarbeiters
// ---------------------------------------------------------------------------

export async function ladeEinstellungen(mitarbeiterId?: string): Promise<BuchungEinstellungen | null> {
  const id = mitarbeiterId ?? (await eigeneId());
  if (!id) return null;
  const { data, error } = await db
    .from("buchung_einstellungen")
    .select("*")
    .eq("mitarbeiter_id", id)
    .maybeSingle();
  if (error) { console.error("ladeEinstellungen:", error); return null; }
  return (data as BuchungEinstellungen) ?? null;
}

/**
 * Ergebnis eines Schreibversuchs, der einen benennbaren Grund haben kann.
 *
 * Der Rohfehler geht bewusst mit zurück, statt hier zu einem blossen `false`
 * zu verkümmern. Die Maske soll sagen können, WARUM es nicht ging: Ein
 * fehlendes Schreibrecht verlangt einen anderen nächsten Schritt als ein
 * Netzfehler. Gedeutet wird er in `buchungZeitenMeldung.ts`.
 */
export interface SchreibErgebnis {
  ok: boolean;
  /** Der Rohfehler aus Supabase, sofern es einen gibt. */
  fehler: unknown;
}

/** Ergebnis eines Speicherversuchs, der einen benennbaren Grund haben kann. */
export interface EinstellungenErgebnis {
  daten: BuchungEinstellungen | null;
  /** Das Kürzel gehört bereits jemand anderem. */
  kuerzelVergeben: boolean;
  /** Der Rohfehler, für die Deutung in `buchungZeitenMeldung.ts`. */
  fehler: unknown;
}

/** Postgres meldet eine verletzte Eindeutigkeit mit diesem Code. */
const CODE_DOPPELT = "23505";

/**
 * Einstellungen anlegen oder ändern. `offen_aktiv` ist der Schalter für den
 * öffentlichen Link, `slug` sein Kürzel.
 *
 * `slug` bewusst nur mitschicken, wenn es sich ändern soll: Ein `null` löscht
 * das gespeicherte Kürzel, und damit brechen alle bereits verschickten Links.
 */
export async function speichereEinstellungen(felder: {
  slug?: string | null;
  offenAktiv?: boolean;
  zeitzone?: string;
  begruessung?: string | null;
  hinweis?: string | null;
}): Promise<EinstellungenErgebnis> {
  const id = await eigeneId();
  if (!id) return { daten: null, kuerzelVergeben: false, fehler: new Error("Nicht angemeldet") };

  const zeile: Record<string, unknown> = { mitarbeiter_id: id };
  if (felder.slug !== undefined) zeile.slug = normalisiereSlug(felder.slug);
  if (felder.offenAktiv !== undefined) zeile.offen_aktiv = felder.offenAktiv;
  if (felder.zeitzone !== undefined) zeile.zeitzone = felder.zeitzone;
  if (felder.begruessung !== undefined) zeile.begruessung = felder.begruessung || null;
  if (felder.hinweis !== undefined) zeile.hinweis = felder.hinweis || null;

  const { data, error } = await db
    .from("buchung_einstellungen")
    .upsert(zeile, { onConflict: "mitarbeiter_id" })
    .select()
    .single();
  if (error) {
    console.error("speichereEinstellungen:", error);
    return { daten: null, kuerzelVergeben: error.code === CODE_DOPPELT, fehler: error };
  }
  return { daten: data as BuchungEinstellungen, kuerzelVergeben: false, fehler: null };
}

/** Aus "Christian Peetz" wird "christian-peetz". */
export function normalisiereSlug(text: string | null | undefined): string | null {
  if (!text) return null;
  const sauber = text
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return sauber.length >= 2 ? sauber : null;
}

// ---------------------------------------------------------------------------
// Terminarten
// ---------------------------------------------------------------------------

export async function ladeTerminarten(mitarbeiterId?: string): Promise<Terminart[]> {
  const id = mitarbeiterId ?? (await eigeneId());
  if (!id) return [];
  const { data, error } = await db
    .from("buchung_terminarten")
    .select("*")
    .eq("mitarbeiter_id", id)
    .order("sortierung", { ascending: true })
    .order("bezeichnung", { ascending: true });
  if (error) { console.error("ladeTerminarten:", error); return []; }
  return (data ?? []) as Terminart[];
}

export async function erstelleTerminart(params: {
  bezeichnung: string;
  beschreibung?: string | null;
  dauerMinuten?: number;
  pufferVorMinuten?: number;
  pufferNachMinuten?: number;
  vorlaufMinuten?: number;
  vorausschauTage?: number;
  rasterMinuten?: number;
  aktiv?: boolean;
  oeffentlich?: boolean;
  anlass?: BuchungAnlass;
  sortierung?: number;
}): Promise<{ art: Terminart | null; fehler: unknown }> {
  const id = await eigeneId();
  if (!id) return { art: null, fehler: new Error("Nicht angemeldet") };

  const { data, error } = await db.from("buchung_terminarten").insert({
    mitarbeiter_id: id,
    bezeichnung: params.bezeichnung.trim(),
    beschreibung: params.beschreibung?.trim() || null,
    dauer_minuten: params.dauerMinuten ?? TERMINART_STANDARD.dauerMinuten,
    puffer_vor_minuten: params.pufferVorMinuten ?? TERMINART_STANDARD.pufferVorMinuten,
    puffer_nach_minuten: params.pufferNachMinuten ?? TERMINART_STANDARD.pufferNachMinuten,
    vorlauf_minuten: params.vorlaufMinuten ?? TERMINART_STANDARD.vorlaufMinuten,
    vorausschau_tage: params.vorausschauTage ?? TERMINART_STANDARD.vorausschauTage,
    raster_minuten: params.rasterMinuten ?? TERMINART_STANDARD.rasterMinuten,
    aktiv: params.aktiv ?? true,
    oeffentlich: params.oeffentlich ?? true,
    anlass: params.anlass ?? "beratung",
    sortierung: params.sortierung ?? 0,
  }).select().single();

  if (error) { console.error("erstelleTerminart:", error); return { art: null, fehler: error }; }
  return { art: data as Terminart, fehler: null };
}

/**
 * Der Satz an Terminarten, den jeder Gastgeber von Haus aus bekommt.
 *
 * Bisher stand ein neuer Vertriebspartner vor einem leeren Buchungskalender:
 * ohne Terminart kein Ereignis, ohne Ereignis keine Buchung. Deshalb legt die
 * Seite beim ersten Aufruf denselben Satz an, den Christian Peetz hat.
 *
 * Das Bewerbergespraech gehoert bewusst nicht dazu, es steht in
 * `BEWERBER_TERMINART` und bekommt ausschliesslich die Rolle hr.
 */
export const STANDARD_TERMINARTEN: Array<Parameters<typeof erstelleTerminart>[0]> = [
  { bezeichnung: "Telefonisches Erstgespräch", dauerMinuten: 15, anlass: "erstgespraech", sortierung: 1 },
  { bezeichnung: "Beratungsgespräch", dauerMinuten: 45, anlass: "beratung", sortierung: 2 },
  { bezeichnung: "Objektvorstellung", dauerMinuten: 45, anlass: "objektvorstellung", sortierung: 3 },
  { bezeichnung: "Finanzierungsgespräch", dauerMinuten: 45, anlass: "finanzierungsgespraech", sortierung: 4 },
];

/** Nur fuer die Rolle hr: das Kennenlern- beziehungsweise Bewerbergespraech. */
export const BEWERBER_TERMINART: Parameters<typeof erstelleTerminart>[0] = {
  bezeichnung: "Persönliches Gespräch",
  dauerMinuten: 35,
  vorausschauTage: 14,
  anlass: "bewerbergespraech",
  sortierung: 5,
};

/**
 * Den Standardsatz anlegen, aber nur wenn noch gar nichts da ist.
 *
 * Sobald jemand eigene Terminarten gepflegt oder bewusst geloescht hat, wird
 * hier nichts mehr nachgelegt; sonst kaeme eine geloeschte Art beim naechsten
 * Seitenaufruf zurueck.
 */
export async function stelleStandardTerminartenSicher(
  istHr: boolean,
  vorhandene: Terminart[],
): Promise<Terminart[]> {
  if (vorhandene.length > 0) return [];
  const vorlagen = istHr ? [...STANDARD_TERMINARTEN, BEWERBER_TERMINART] : STANDARD_TERMINARTEN;
  const neu: Terminart[] = [];
  for (const vorlage of vorlagen) {
    const { art } = await erstelleTerminart(vorlage);
    if (art) neu.push(art);
  }
  return neu;
}


export async function aktualisiereTerminart(
  id: string,
  felder: Partial<Omit<Terminart, "id" | "mitarbeiter_id" | "created_at" | "updated_at">>,
): Promise<SchreibErgebnis> {
  const { error } = await db.from("buchung_terminarten").update(felder).eq("id", id);
  if (error) { console.error("aktualisiereTerminart:", error); return { ok: false, fehler: error }; }
  return { ok: true, fehler: null };
}

export async function loescheTerminart(id: string): Promise<SchreibErgebnis> {
  const { error } = await db.from("buchung_terminarten").delete().eq("id", id);
  if (error) { console.error("loescheTerminart:", error); return { ok: false, fehler: error }; }
  return { ok: true, fehler: null };
}

// ---------------------------------------------------------------------------
// Verfügbarkeiten
// ---------------------------------------------------------------------------

export async function ladeVerfuegbarkeiten(mitarbeiterId?: string): Promise<VerfuegbarkeitZeile[]> {
  const id = mitarbeiterId ?? (await eigeneId());
  if (!id) return [];
  const { data, error } = await db
    .from("buchung_verfuegbarkeiten")
    .select("*")
    .eq("mitarbeiter_id", id)
    .order("wochentag", { ascending: true, nullsFirst: false })
    .order("von", { ascending: true });
  if (error) { console.error("ladeVerfuegbarkeiten:", error); return []; }
  return (data ?? []) as VerfuegbarkeitZeile[];
}

/**
 * Den kompletten Wochenplan ersetzen.
 *
 * Bewusst als Ganzes und nicht Zeile für Zeile: Ein halb gespeicherter
 * Wochenplan wäre schlimmer als der alte, weil dann Zeiten freigegeben
 * wären, die der Mitarbeiter gerade entfernt hat. Ausnahmen und Urlaub
 * bleiben unberührt, die haben ein `datum`.
 *
 * Ersetzt wird über die Datenbankfunktion `buchung_wochenplan_setzen`, damit
 * Löschen und Einfügen in einer Transaktion liegen. Fehlt die Funktion,
 * bleibt der bisherige Plan erhalten; es gibt keinen unvollständigen Rückfall.
 *
 * Der Rohfehler geht mit zurück, statt hier zu einem blossen `false` zu
 * verkümmern, siehe `SchreibErgebnis`.
 */
export type WochenplanErgebnis = SchreibErgebnis;

export async function setzeWochenplan(
  zeilen: Array<{ wochentag: number; von: string; bis: string }>,
): Promise<WochenplanErgebnis> {
  const id = await eigeneId();
  if (!id) return { ok: false, fehler: new Error("Nicht angemeldet") };

  const { error: rpcFehler } = await supabase.rpc("buchung_wochenplan_setzen" as any, {
    _zeilen: zeilen.map((z) => ({ wochentag: z.wochentag, von: z.von, bis: z.bis })),
  });
  if (!rpcFehler) return { ok: true, fehler: null };
  console.error("setzeWochenplan:", rpcFehler);
  return { ok: false, fehler: rpcFehler };
}

/** Ergebnis beim Sperren eines Tages. */
export interface AusnahmeErgebnis {
  zeile: VerfuegbarkeitZeile | null;
  /** Für diesen Tag gibt es bereits eine Ausnahme. */
  schonGesperrt: boolean;
  /**
   * Der Rohfehler, für die Deutung in `buchungZeitenMeldung.ts`.
   *
   * Das Sperren eines Tages schreibt in dieselbe Tabelle wie der Wochenplan
   * und hängt an derselben Einfügeregel. Vor der Migration 20260914140000
   * scheiterte es aus demselben Grund, meldete das aber nicht.
   */
  fehler: unknown;
}

/** Ein einzelner abweichender Tag, mit `geschlossen` auch ein Urlaubstag. */
export async function setzeAusnahme(params: {
  datum: string;
  von?: string;
  bis?: string;
  geschlossen?: boolean;
  bemerkung?: string | null;
}): Promise<AusnahmeErgebnis> {
  const id = await eigeneId();
  if (!id) return { zeile: null, schonGesperrt: false, fehler: new Error("Nicht angemeldet") };

  const { data, error } = await db.from("buchung_verfuegbarkeiten").insert({
    mitarbeiter_id: id,
    datum: params.datum,
    von: params.geschlossen ? null : params.von,
    bis: params.geschlossen ? null : params.bis,
    geschlossen: params.geschlossen ?? false,
    bemerkung: params.bemerkung?.trim() || null,
  }).select().single();

  if (error) {
    console.error("setzeAusnahme:", error);
    return { zeile: null, schonGesperrt: error.code === CODE_DOPPELT, fehler: error };
  }
  return { zeile: data as VerfuegbarkeitZeile, schonGesperrt: false, fehler: null };
}

export async function loescheVerfuegbarkeit(id: string): Promise<SchreibErgebnis> {
  const { error } = await db.from("buchung_verfuegbarkeiten").delete().eq("id", id);
  if (error) { console.error("loescheVerfuegbarkeit:", error); return { ok: false, fehler: error }; }
  return { ok: true, fehler: null };
}

// ---------------------------------------------------------------------------
// Persönliche Buchungslinks
// ---------------------------------------------------------------------------

export async function ladeLinks(kontaktId?: string): Promise<BuchungLink[]> {
  let abfrage = db.from("buchung_links").select("*").order("created_at", { ascending: false });
  if (kontaktId) abfrage = abfrage.eq("kontakt_id", kontaktId);
  const { data, error } = await abfrage;
  if (error) { console.error("ladeLinks:", error); return []; }
  return (data ?? []) as BuchungLink[];
}

/**
 * Persönlichen Link für genau einen Kontakt anlegen.
 *
 * Der Kontaktbezug steht damit von vornherein fest und muss nicht später aus
 * Name oder E-Mail geraten werden.
 *
 * `ziel` trennt seit dem 27.09.2026 den externen Kalender vom internen
 * Videocall. Einen Link mit `ziel: "extern"` (ohne Terminart) darf jeder
 * interne Nutzer fuer einen Kontakt anlegen, den er sieht; einen internen nur,
 * wer `darf_videocall` erfuellt. Der Rohfehler muss mit zurueck.
 */
export async function erstelleLink(params: {
  kontaktId: string;
  kontaktName?: string;
  kontaktEmail?: string;
  terminartId?: string | null;
  /** Bezeichnung der Terminart, macht den Link lesbar ("beratungsgespraech-..."). */
  terminartName?: string;
  /** Investment, zu dem der Termin gehoert. */
  investmentId?: string | null;
  einmalig?: boolean;
  gueltigBis?: string | null;
  /** Interne Strecke oder externer Kalender, siehe `BuchungLink.ziel`. */
  ziel: "intern" | "extern";
  /** Nur fuer den Rueckfall ohne Migration, siehe unten. */
  ohneZielSpalte?: boolean;
}): Promise<{ link: BuchungLink | null; fehler: unknown }> {
  const id = await eigeneId();
  if (!id) return { link: null, fehler: new Error("Nicht angemeldet") };

  const { data, error } = await db.from("buchung_links").insert({
    token: terminToken(params.terminartName || "termin"),
    mitarbeiter_id: id,
    kontakt_id: params.kontaktId,
    kontakt_snapshot: {
      name: params.kontaktName?.trim() || undefined,
      email: params.kontaktEmail?.trim() || undefined,
    },
    // Ein externer Link traegt nie eine Terminart. Die Datenbank prueft das
    // ebenfalls.
    terminart_id: params.ziel === "extern" ? null : params.terminartId ?? null,
    ...(params.ohneZielSpalte ? {} : { ziel: params.ziel }),
    einmalig: params.einmalig ?? false,
    gueltig_bis: params.gueltigBis ?? null,
    ...(params.investmentId ? { investment_id: params.investmentId } : {}),
  }).select().single();

  if (error) {
    // Solange die Migration 20260827130000 nicht gelaufen ist, gibt es die
    // Investment-Spalte noch nicht. Dann ohne Investment anlegen statt gar
    // nicht.
    const text = String((error as { message?: string }).message ?? "");
    if (params.investmentId && /investment_id/.test(text)) {
      return erstelleLink({ ...params, investmentId: null });
    }
    // Solange Migration 20260927120000 nicht gelaufen ist, fehlt die Spalte
    // `ziel`. Dann ohne sie anlegen, es gilt die bisherige Regel.
    if (!params.ohneZielSpalte && /\bziel\b/.test(text)) {
      return erstelleLink({ ...params, ohneZielSpalte: true });
    }
    console.error("erstelleLink:", error);
    return { link: null, fehler: error };
  }
  return { link: data as BuchungLink, fehler: null };
}

export async function setzeLinkAktiv(id: string, aktiv: boolean): Promise<boolean> {
  const { error } = await db.from("buchung_links").update({ aktiv }).eq("id", id);
  if (error) { console.error("setzeLinkAktiv:", error); return false; }
  return true;
}

/**
 * Wie viele noch gültige persönliche Links hängen an dieser Terminart?
 *
 * Wird eine Terminart gelöscht, setzt die Datenbank `terminart_id` der Links
 * auf `NULL`. Sie bleiben gültig, bieten dem Kunden danach aber alle
 * Terminarten an statt der einen, für die sie gedacht waren. Vor dem Löschen
 * gehört die Zahl auf den Tisch.
 */
export async function zaehleLinksMitTerminart(terminartId: string): Promise<number> {
  const { count, error } = await db
    .from("buchung_links")
    .select("id", { count: "exact", head: true })
    .eq("terminart_id", terminartId)
    .eq("aktiv", true);
  if (error) { console.error("zaehleLinksMitTerminart:", error); return 0; }
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Buchungen aus Sicht des Mitarbeiters
// ---------------------------------------------------------------------------

export async function ladeBuchungen(params?: {
  vonISO?: string;
  bisISO?: string;
  kontaktId?: string;
  /**
   * Nur die Buchungen über die eigenen Links.
   *
   * Ohne das sieht ein Administrator alles, was im Haus gebucht wurde, denn
   * die RLS-Regel lässt ihn absichtlich alles lesen. Auf einer Seite, die
   * "deine Links" verspricht, ist das die falsche Menge.
   */
  nurEigene?: boolean;
  limit?: number;
  offset?: number;
  vergangen?: boolean;
  fehlerWerfen?: boolean;
}): Promise<Buchung[]> {
  let abfrage = db.from("buchungen").select("*").order("start_at", { ascending: !params?.vergangen }).order("id");
  if (params?.nurEigene) {
    const id = await eigeneId();
    if (!id) return [];
    abfrage = abfrage.eq("mitarbeiter_id", id);
  }
  if (params?.vonISO) abfrage = abfrage.gte("start_at", params.vonISO);
  if (params?.bisISO) abfrage = abfrage.lte("start_at", params.bisISO);
  if (params?.kontaktId) abfrage = abfrage.eq("kontakt_id", params.kontaktId);
  const offset = params?.offset ?? 0;
  abfrage = abfrage.range(offset, offset + (params?.limit ?? 200) - 1);

  const { data, error } = await abfrage;
  if (error) { console.error("ladeBuchungen:", error); if (params?.fehlerWerfen) throw error; return []; }
  return (data ?? []) as Buchung[];
}

/**
 * Eine Buchung absagen oder als wahrgenommen kennzeichnen.
 *
 * Über die Datenbankfunktion, weil eine Absage mehr ist als ein Statuswort:
 * Der Videoraum muss geschlossen und der Termin in der Kundenakte abgehakt
 * werden, sonst bleibt die Zeit gesperrt und der Termin gilt weiter als der
 * nächste des Kunden.
 *
 * Fehlt die Datenbankfunktion, wird sicher abgebrochen. Ein isolierter
 * Status-Update würde Raum und Aktivität zurücklassen.
 */
export async function setzeBuchungStatus(
  id: string,
  status: BuchungStatus,
): Promise<SchreibErgebnis & { ersatzweg?: boolean }> {
  const { error: rpcFehler } = await supabase.rpc("buchung_status_setzen" as any, {
    _buchung_id: id,
    _status: status,
  });
  if (!rpcFehler) return { ok: true, fehler: null };
  console.error("setzeBuchungStatus:", rpcFehler);

  /*
   * Ersatzweg fuer die beiden Ergebnis-Antworten (01.10.2026): Bei einem
   * Termin von der Terminseite meldete die Funktion einen Fehler, und
   * "Stattgefunden" liess sich gar nicht mehr speichern. Die Funktion schreibt
   * neben dem Status auch Termin-Zeile, Aufgabe und Raum; scheitert einer
   * dieser Folgeschritte, faellt alles zurueck. Der Status allein geht ueber
   * die Zeilenregel "Buchungen aendern", die dieselben Personen zulaesst wie
   * die Funktion (Mitarbeiter der Buchung, Admin, Inhaber). Die Termin-Zeile
   * hakt dann der Aufrufer ab. Absagen bleibt bei der Funktion, dort haengt
   * die Raumschliessung dran.
   */
  if (status !== "wahrgenommen" && status !== "nicht_erschienen") return { ok: false, fehler: rpcFehler };
  const { data, error } = await db.from("buchungen").update({ status }).eq("id", id).select("id");
  if (error || !data?.length) {
    console.error("setzeBuchungStatus (Ersatzweg):", error || "keine Zeile geaendert");
    return { ok: false, fehler: rpcFehler };
  }
  return { ok: true, fehler: rpcFehler, ersatzweg: true };
}

/**
 * Die erzeugte Aktivität an der Buchung vermerken.
 *
 * Eine Buchung soll später dieselbe Kette auslösen wie ein von Hand angelegter
 * Termin: Eintrag in der Kundenhistorie, nächster geplanter Kontakt, Farbe der
 * Pipeline-Kachel. Diese Verknüpfung wird noch nicht gezogen, das Feld hält
 * nur schon den Platz dafür frei.
 */
export async function verknuepfeAktivitaet(buchungId: string, aktivitaetId: string): Promise<boolean> {
  const { error } = await db.from("buchungen").update({ aktivitaet_id: aktivitaetId }).eq("id", buchungId);
  if (error) { console.error("verknuepfeAktivitaet:", error); return false; }
  return true;
}

/**
 * Die offene Buchung hinter einem Termin in der Kundenakte.
 *
 * Die Verbindung ist `buchungen.aktivitaet_id`, dieselbe, ueber die auch
 * `ladeErgebnisTermine` beide Seiten zusammenbringt. Gebraucht wird sie
 * ueberall dort, wo ein Termin verschoben wird: Ein selbst gebuchter Termin
 * gehoert zu einer Buchung, und die Buchung muss mitziehen, sonst bleibt die
 * alte Zeit gesperrt und im Buchungskalender steht sie weiter.
 *
 * Ein von Hand angelegtes Meeting hat keine Buchung, dort kommt `null`.
 */
export async function ladeBuchungZuAktivitaet(aktivitaetId: string): Promise<Buchung | null> {
  if (!aktivitaetId) return null;
  const { data, error } = await db
    .from("buchungen")
    .select("*")
    .eq("aktivitaet_id", aktivitaetId)
    .eq("status", "offen")
    .limit(1);
  if (error) { console.error("ladeBuchungZuAktivitaet:", error); return null; }
  return ((data ?? [])[0] as Buchung) || null;
}

/**
 * Einen Termin von Mitarbeiterseite verschieben.
 *
 * Der Kunde verschiebt ueber seinen Absagelink, der Mitarbeiter direkt hier.
 * Neben der Buchung wird auch der Termin in der Kundenakte umgetragen, sonst
 * zeigte das Profil weiter die alte Zeit.
 */
export async function verschiebeBuchungIntern(
  buchung: Buchung,
  startISO: string,
): Promise<boolean> {
  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) return false;
  // Funktion noch nicht in den erzeugten Typen enthalten, daher ungetypter Aufruf.
  const { error } = await (supabase as any).rpc("buchung_intern_verschieben", {
    _buchung_id: buchung.id, _start: start.toISOString(),
  });
  if (error) { console.error("verschiebeBuchungIntern:", error); return false; }
  return true;
}

/**
 * Sagt die offene Buchung eines Videoraums ab, falls es eine gibt.
 *
 * Wird ein Raum in Meine Gespraeche geloescht, der aus einer Selbstbuchung
 * stammt, raeumt die Absage Buchung, Raum und Termin in der Kundenakte in
 * einem Zug ab. Liefert true, wenn eine Buchung abgesagt wurde.
 */
export async function sageRaumBuchungAb(videoraumId: string): Promise<boolean> {
  const { data, error } = await db
    .from("buchungen")
    .select("id")
    .eq("videoraum_id", videoraumId)
    .eq("status", "offen")
    .limit(1);
  if (error) throw error;
  if (!data?.length) return false;
  if (!(await setzeBuchungStatus(data[0].id as string, "abgesagt")).ok) throw new Error("Buchung konnte nicht abgesagt werden.");
  return true;
}

/** Den Kontaktbezug nachtragen, etwa wenn aus einer offenen Buchung ein Lead wurde. */
export async function verknuepfeKontakt(buchungId: string, kontaktId: string): Promise<boolean> {
  const { error } = await db.from("buchungen").update({ kontakt_id: kontaktId }).eq("id", buchungId);
  if (error) { console.error("verknuepfeKontakt:", error); return false; }
  return true;
}

// ---------------------------------------------------------------------------
// Der Buchende, ohne Konto. Ausschliesslich über die RPCs.
// ---------------------------------------------------------------------------

export async function ladeZugang(token: string): Promise<BuchungZugang | null> {
  const { data, error } = await supabase.rpc("buchung_zugang" as any, { _token: token });
  if (error) { console.error("ladeZugang:", error); return null; }
  return (data as BuchungZugang) ?? null;
}

/**
 * Die freien Startzeiten, wie die Datenbank sie sieht.
 *
 * Sie ist die maßgebliche Quelle, denn nur sie kennt die Termine anderer
 * Kunden. `buchungZeitfenster.ts` rechnet dieselbe Regel im Browser nach, für
 * Vorschau und Prüfbarkeit.
 */
export async function ladeFreieZeiten(params: {
  token: string;
  terminartId: string;
  vonTag: string;
  bisTag: string;
}): Promise<string[]> {
  const { data, error } = await supabase.rpc("buchung_freie_zeiten" as any, {
    _token: params.token,
    _terminart_id: params.terminartId,
    _von: params.vonTag,
    _bis: params.bisTag,
  });
  if (error) { console.error("ladeFreieZeiten:", error); return []; }
  return (data as string[]) ?? [];
}

export async function buche(params: {
  token: string;
  terminartId: string;
  startISO: string;
  name: string;
  email: string;
  telefon?: string;
  nachricht?: string;
  /** Optionale Begleitperson. Bekommt dieselbe Bestätigungsmail wie der Kunde. */
  begleitung?: { name: string; email: string };
  /**
   * Sprache der Buchungsseite, nur wenn sie ausdrücklich gewählt ist. Ein
   * neu angelegter Kontakt bekommt sie, damit Bestätigung und Erinnerungen
   * in dieser Sprache kommen (Migration 20261004180000).
   */
  sprache?: "de" | "en";
}): Promise<{
  id: string;
  absageToken: string;
  startAt: string;
  endeAt: string;
  /**
   * Dauer und Bezeichnung so, wie die Datenbank sie festgeschrieben hat.
   *
   * Bewusst aus der Antwort und nicht aus dem, was der Browser beim Laden der
   * Seite gesehen hat: Ändert der Partner die Terminart, während der Kunde noch
   * im Formular sitzt, gilt der Stand der Datenbank. Sonst stünde auf der
   * Bestätigung eine andere Dauer als im Kalender.
   */
  dauerMinuten?: number;
  bezeichnung?: string | null;
  /** Token des Videoraums, den die Buchung mit angelegt hat. */
  raumToken?: string;
  /**
   * Ob die Begleitperson auch wirklich gespeichert wurde. `false`, wenn der
   * Aufruf auf den alten Weg ohne Begleitung zurückfallen musste.
   */
  begleitungUebernommen?: boolean;
} | null> {
  const argumente = {
    _token: params.token,
    _terminart_id: params.terminartId,
    _start: params.startISO,
    _name: params.name,
    _email: params.email,
    _telefon: params.telefon ?? null,
    _nachricht: params.nachricht ?? null,
  };
  const rufeAn = (args: Record<string, unknown>) =>
    supabase.rpc("buchung_anlegen" as any, args);
  let begleitungUebernommen = Boolean(params.begleitung);
  const mitBegleitung = params.begleitung ? { ...argumente, _begleitung: params.begleitung } : argumente;
  let { data, error } = await rufeAn(
    params.sprache ? { ...mitBegleitung, _sprache: params.sprache } : mitBegleitung,
  );
  if (error && params.sprache && funktionFehlt(error)) {
    // Solange die Migration 20261004180000 nicht gelaufen ist, kennt die
    // Datenbank `_sprache` nicht. Dann ohne Sprache buchen statt gar nicht;
    // der Kontakt gilt dann wie bisher als Deutsch.
    console.warn("buche: Migration 20261004180000 fehlt noch, Buchung ohne Sprache.");
    ({ data, error } = await rufeAn(mitBegleitung));
  }
  if (error && params.begleitung && funktionFehlt(error)) {
    // Solange die Migration 20260827160000 nicht gelaufen ist, kennt die
    // Datenbank den Parameter _begleitung nicht. Dann ohne Begleitung buchen
    // statt gar nicht.
    console.warn("buche: Migration 20260827160000 fehlt noch, Buchung ohne Begleitung.");
    begleitungUebernommen = false;
    ({ data, error } = await rufeAn(argumente));
  }
  if (error) { console.error("buche:", error); throw error; }
  const antwort = data as {
    id: string; absage_token: string; start_at: string; ende_at: string;
    dauer_minuten?: number; bezeichnung?: string | null; raum_token?: string;
  } | null;
  if (!antwort?.absage_token) return null;

  /*
   * Bestätigung an den Kunden und Meldung an den Vertriebspartner anstoßen.
   *
   * Übergeben wird ausschliesslich der Absagetoken, niemals Name oder
   * E-Mail aus dem Browser: sonst wäre der Aufruf ein Versandwerkzeug, mit
   * dem sich Mails an Fremde auslösen liessen. Alles Weitere holt sich die
   * Function selbst aus der Datenbank.
   *
   * Bewusst ohne `await` und ohne `throw`. Geht die Mail nicht hinaus, ist
   * der Termin trotzdem gebucht, und der Kunde soll deswegen keine
   * Fehlermeldung sehen.
   */
  void supabase.functions
    .invoke("send-buchung-bestaetigung", { body: { absageToken: antwort.absage_token } })
    .then(({ error: mailFehler }) => {
      if (mailFehler) console.error("send-buchung-bestaetigung:", mailFehler);
    })
    .catch((fehler) => console.error("send-buchung-bestaetigung:", fehler));

  return {
    id: antwort.id,
    absageToken: antwort.absage_token,
    startAt: antwort.start_at,
    endeAt: antwort.ende_at,
    dauerMinuten: typeof antwort.dauer_minuten === "number" ? antwort.dauer_minuten : undefined,
    bezeichnung: antwort.bezeichnung ?? undefined,
    // Fehlt, solange die Migration 20260804110000 nicht gelaufen ist.
    raumToken: antwort.raum_token,
    begleitungUebernommen,
  };
}

export async function ladeBuchungMitToken(absageToken: string): Promise<BuchungAnsicht | null> {
  const { data, error } = await supabase.rpc("buchung_ansicht" as any, { _absage_token: absageToken });
  if (error) { console.error("ladeBuchungMitToken:", error); return null; }
  return (data as BuchungAnsicht) ?? null;
}

export async function sageAb(absageToken: string, grund?: string): Promise<boolean> {
  const { error } = await supabase.rpc("buchung_absagen" as any, {
    _absage_token: absageToken,
    _grund: grund ?? null,
  });
  if (error) { console.error("sageAb:", error); return false; }
  return true;
}

export async function verschiebe(absageToken: string, startISO: string): Promise<boolean> {
  const { error } = await supabase.rpc("buchung_verschieben" as any, {
    _absage_token: absageToken,
    _start: startISO,
  });
  if (error) { console.error("verschiebe:", error); throw error; }
  return true;
}

// ---------------------------------------------------------------------------
// Links zusammenbauen
// ---------------------------------------------------------------------------

/** Der Link, den der Kunde bekommt. Für beide Arten derselbe Aufbau. */
export function buchungUrl(tokenOderSlug: string): string {
  // Immer die veroeffentlichte Adresse, nie die Vorschau, siehe oeffentlicheBasis.
  return oeffentlicheAdresse(`/termin/${tokenOderSlug}`);
}

/**
 * Der Link, mit dem der Kunde selbst absagen oder verschieben kann.
 *
 * Der Zugangstoken darf angehängt werden, weil die Verwaltungsseite sonst
 * keine freien Zeiten holen kann: `buchung_ansicht` gibt weder die Terminart
 * noch einen Zugang heraus, und `buchung_freie_zeiten` verlangt beides. Ohne
 * den Anhang bleibt dem Kunden nur das Absagen. Beide Token stehen ohnehin in
 * der Adresszeile, der Anhang gibt also nichts preis, was der Empfänger des
 * Links nicht schon hätte.
 */
export function absageUrl(absageToken: string, zugangToken?: string): string {
  const basis = oeffentlicheAdresse(`/termin/verwalten/${absageToken}`);
  return zugangToken ? `${basis}?zugang=${encodeURIComponent(zugangToken)}` : basis;
}

// ---------------------------------------------------------------------------
// Kleinkram
// ---------------------------------------------------------------------------

async function eigeneId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Fehlt die aufgerufene Datenbankfunktion, weil ihre Migration noch nicht
 * gelaufen ist?
 *
 * PostgREST meldet das mit `PGRST202`, Postgres selbst mit `42883`. Beides
 * unterscheidet sich klar von einem echten Fehler beim Ausführen, und nur in
 * diesem Fall darf auf den alten Weg zurückgefallen werden.
 *
 * ## Warum das Muster so eng ist
 *
 * Bis zum 21.09.2026 stand hier `/schema cache|does not exist/i`, ohne das
 * Wort „function" davor. Eine **fehlende Spalte** meldet Postgres aber mit
 * demselben Wortlaut: `column "updated_at" of relation "bewerbungen" does not
 * exist`. Der Aufrufer hielt das für eine nicht gelaufene Migration und fiel
 * beruhigt zurück, statt den Fehler zu melden.
 *
 * Genau das ist passiert: Eine neue Datenbankfunktion schrieb auf eine Spalte,
 * die es nicht gibt. Der Bewerber las auf der Terminseite „wir notieren uns
 * den Termin selbst", und notiert wurde nichts. Der Fehler war weder in der
 * Konsole noch sonst irgendwo zu sehen.
 *
 * Für den Spaltenfall gibt es jetzt `spalteFehlt` weiter unten. Er ist nie ein
 * Grund zurückzufallen, sondern immer ein Fehler, den jemand sehen muss.
 *
 * Am 29.09.2026 zwei weitere Fehltreffer entfernt:
 * - `42883` allein reicht nicht. Postgres meldet damit auch einen fehlenden
 *   Operator (`operator does not exist: text = uuid`), also einen Fehler in
 *   einer vorhandenen Funktion. Zählt nur mit „function … does not exist".
 * - „schema cache" allein reicht nicht. `PGRST002` (HTTP 503) meldet „Could
 *   not query the database for the schema cache": Die Datenbank war kurz nicht
 *   erreichbar, die Funktion gibt es aber.
 */
export function funktionFehlt(fehler: unknown): boolean {
  if (!fehler || typeof fehler !== "object") return false;
  const f = fehler as { code?: unknown; message?: unknown };
  if (f.code === "PGRST202") return true;
  if (typeof f.message !== "string") return false;
  return /could not find the function|function [^"]*does not exist/i.test(f.message);
}

/**
 * Fehlt eine Spalte, auf die die Datenbankfunktion zugreift?
 *
 * Postgres meldet das mit `42703`, PostgREST mit `PGRST204`. Anders als eine
 * fehlende Funktion ist das nie ein Zustand, den man abwarten kann: Die
 * Migration ist gelaufen, aber sie passt nicht zur Tabelle. Wer das abfängt,
 * ohne es zu melden, versteckt einen Fehler, der sich nicht von selbst löst.
 */
export function spalteFehlt(fehler: unknown): boolean {
  if (!fehler || typeof fehler !== "object") return false;
  const f = fehler as { code?: unknown; message?: unknown };
  if (f.code === "42703" || f.code === "PGRST204") return true;
  return typeof f.message === "string" && /\bcolumn\b[\s\S]*does not exist/i.test(f.message);
}

