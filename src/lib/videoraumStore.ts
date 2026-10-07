import { oeffentlicheAdresse, terminToken } from "./oeffentlicheBasis";
import { supabase } from "@/integrations/supabase/client";
import { DU_TEXTE, gastTexte, mitWerten } from "@/lib/videoraumAnrede";
import type { Sprache } from "@/lib/seitenSprache";

/**
 * Datenzugriff fuer den eigenen Videoraum.
 *
 * Der Gastgeber arbeitet ueber die Tabellen (RLS greift), der Gast hat kein
 * Konto und laeuft ausschliesslich ueber die vier RPCs aus der Migration
 * `20260803220000_videoraeume_grundlage.sql`.
 */

/**
 * `bewerbergespraech` ist die Raumart des Bewerberprozesses. Sie entsteht
 * ausschliesslich aus `bewerber_termin_buchen` und gehoert nicht zum Vertrieb:
 * Im Raum sitzt kein Kunde, sondern jemand, der bei uns anfangen moechte.
 */
export type VideoraumArt =
  | "erstgespraech"
  | "beratung"
  | "objektvorstellung"
  | "bewerbergespraech"
  | "sonstiges";
export type VideoraumStatus = "offen" | "laufend" | "beendet";
export type TeilnehmerStatus = "wartet" | "eingelassen" | "im_gespraech" | "beendet" | "abgewiesen";

/**
 * Platzhalter, wenn am Raum kein Name des Gastgebers haengt. Steht hier an
 * einer Stelle, weil der Warteraum ihn erkennen muss: Aus einem echten Namen
 * wird dort der Vorname, aus dem Platzhalter wuerde sonst "Ihr ist gleich fuer
 * Sie da".
 *
 * Der Wortlaut kommt aus `videoraumAnrede`, weil es ihn im Bewerberprozess ein
 * zweites Mal gibt ("Dein Ansprechpartner"). Wer beide Fassungen erkennen
 * muss, nimmt dort `istPlatzhalterName`.
 */
export const GASTGEBER_UNBEKANNT = DU_TEXTE.ansprechpartnerPlatzhalter;

export interface GastgeberSnapshot {
  name: string;
  position?: string;
  telefon?: string;
  email?: string;
  bild?: string | null;
  ort?: string;
  zitat?: string;
}

export interface AgendaPunkt {
  titel: string;
  text?: string;
  minuten?: number;
}

export interface Videoraum {
  id: string;
  token: string;
  art: VideoraumArt;
  titel: string | null;
  gastgeber_id: string;
  gastgeber_snapshot: GastgeberSnapshot;
  kontakt_id: string | null;
  investment_id: string | null;
  objekt_id: string | null;
  wohnung_id: string | null;
  termin_at: string | null;
  dauer_minuten: number;
  agenda: AgendaPunkt[];
  hinweis: string | null;
  status: VideoraumStatus;
  transkript_angeboten: boolean;
  /**
   * Notiz des Gastgebers zum Gespraech. Kommt aus der Migration
   * `20260804190000` und fehlt deshalb, solange die nicht gelaufen ist.
   */
  notiz?: string | null;
  /** Geheimnis des Signalkanals, siehe videoraumVerbindung. Nie an den Gast. */
  signal_geheimnis?: string | null;
  meta: Record<string, unknown>;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface VideoraumTeilnehmer {
  id: string;
  raum_id: string;
  name: string;
  rolle: string;
  status: TeilnehmerStatus;
  transkript_zustimmung: boolean;
  technik: Record<string, unknown>;
  beigetreten_at: string;
  eingelassen_at: string | null;
  verlassen_at: string | null;
}

/** Was der Gast vom Raum zu sehen bekommt. Kein Kontaktbezug, keine Notizen. */
export interface VideoraumGastAnsicht {
  art: VideoraumArt;
  titel: string | null;
  status: VideoraumStatus;
  termin_at: string | null;
  dauer_minuten: number;
  agenda: AgendaPunkt[];
  hinweis: string | null;
  transkript_angeboten: boolean;
  gastgeber: GastgeberSnapshot;
  objekt: Record<string, unknown>;
}

const db = supabase as any;

function zufallsToken(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Gastgeber
// ---------------------------------------------------------------------------

/**
 * Die eigenen Raeume, nicht die aller Administratoren.
 *
 * Die Lesepolicy laesst `is_admin_role` bewusst alles sehen, damit sich ein
 * fremder Raum im Zweifel aufraeumen laesst. Die Uebersicht heisst aber
 * "meine Raeume", und ein Inhaber sah dort die Raeume aller Administratoren.
 * Deshalb filtert die Abfrage zusaetzlich nach dem angemeldeten Nutzer.
 */
export async function listMeineRaeume(limit = 40, offset = 0, beendet = false): Promise<Videoraum[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await db
    .from("videoraeume")
    .select("*")
    .eq("gastgeber_id", user.id)
    .in("status", beendet ? ["beendet"] : ["offen", "laufend"])
    .order("termin_at", { ascending: !beendet, nullsFirst: true })
    .order("id")
    .range(offset, offset + limit - 1);
  if (error) { console.error("listMeineRaeume:", error); throw error; }
  return (data ?? []) as Videoraum[];
}

export async function ladeRaum(id: string): Promise<Videoraum | null> {
  const { data, error } = await db.from("videoraeume").select("*").eq("id", id).maybeSingle();
  if (error) { console.error("ladeRaum:", error); return null; }
  return (data as Videoraum) ?? null;
}

export async function erstelleRaum(params: {
  art: VideoraumArt;
  titel?: string;
  gastgeber: GastgeberSnapshot;
  kontaktId?: string | null;
  investmentId?: string | null;
  objektId?: string | null;
  wohnungId?: string | null;
  terminAt?: string | null;
  dauerMinuten?: number;
  agenda?: AgendaPunkt[];
  hinweis?: string | null;
  transkriptAngeboten?: boolean;
  meta?: Record<string, unknown>;
}): Promise<Videoraum | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await db.from("videoraeume").insert({
    // Lesbarer Link: Ereignis plus kurzer Schluessel, siehe oeffentlicheBasis.
    token: terminToken(params.titel?.trim() || params.art),
    art: params.art,
    titel: params.titel?.trim() || null,
    gastgeber_id: user.id,
    gastgeber_snapshot: params.gastgeber,
    kontakt_id: params.kontaktId ?? null,
    investment_id: params.investmentId ?? null,
    objekt_id: params.objektId ?? null,
    wohnung_id: params.wohnungId ?? null,
    termin_at: params.terminAt ?? null,
    dauer_minuten: params.dauerMinuten ?? 45,
    agenda: params.agenda ?? [],
    hinweis: params.hinweis ?? null,
    // Standardmaessig aus. Es gibt keine Mitschrift, also wird auch keine
    // Einwilligung dafuer eingeholt. Das Feld bleibt nur stehen, damit es
    // spaeter ohne Umbau wieder eingeschaltet werden kann.
    transkript_angeboten: params.transkriptAngeboten ?? false,
    meta: params.meta ?? {},
  }).select().single();

  if (error) { console.error("erstelleRaum:", error); return null; }
  return data as Videoraum;
}

export async function setzeRaumStatus(id: string, status: VideoraumStatus): Promise<boolean> {
  const { error } = await db.from("videoraeume").update({ status }).eq("id", id);
  if (error) { console.error("setzeRaumStatus:", error); return false; }
  return true;
}

/** Notiz des Gastgebers am Raum sichern. */
export async function speichereRaumNotiz(id: string, notiz: string): Promise<boolean> {
  const { error } = await db.from("videoraeume").update({ notiz: notiz || null }).eq("id", id);
  // Ohne die Migration `20260804190000` gibt es die Spalte noch nicht. Dann
  // wird nicht gespeichert, die Seite laeuft aber weiter und sagt es dem
  // Gastgeber.
  if (error) { console.error("speichereRaumNotiz:", error); return false; }
  return true;
}

/**
 * Das `meta` des Raums ersetzen.
 *
 * `meta` ist der Notizzettel am Raum fuer alles, was keine eigene Spalte
 * verdient. Hier haengt unter anderem die Merkmarke der Gespraechsnotiz,
 * siehe `videoraumNotizAkte`. Der Aufrufer uebergibt das vollstaendige,
 * bereits zusammengefuehrte Objekt, sonst gingen fremde Felder verloren.
 */
export async function speichereRaumMeta(id: string, meta: Record<string, unknown>): Promise<boolean> {
  const { error } = await db.from("videoraeume").update({ meta }).eq("id", id);
  if (error) { console.error("speichereRaumMeta:", error); return false; }
  return true;
}

function zufallsGeheimnis(): string {
  return zufallsToken(16);
}

/**
 * Das Geheimnis des Signalkanals, siehe videoraumVerbindung.
 *
 * `erneuern` setzt ein neues. Das gehoert genau an eine Stelle: an das
 * Einlassen eines Gastes, und nur dann, wenn noch kein Gespraech laeuft. Wer
 * einmal drin war, kommt mit dem alten Geheimnis nicht in das naechste
 * Gespraech desselben Raumes.
 *
 * Gibt `null` zurueck, wenn die Spalte fehlt (Migration `20260804190000` noch
 * nicht gelaufen). Der Aufrufer faellt dann auf den Raumtoken zurueck.
 */
export async function holeSignalGeheimnis(raumId: string, erneuern = false): Promise<string | null> {
  if (!erneuern) {
    const { data, error } = await db
      .from("videoraeume").select("signal_geheimnis").eq("id", raumId).maybeSingle();
    if (error) { console.warn("holeSignalGeheimnis:", error); return null; }
    const vorhanden = (data as { signal_geheimnis?: string | null } | null)?.signal_geheimnis;
    if (vorhanden) return vorhanden;
  }

  const neu = zufallsGeheimnis();
  const { error } = await db.from("videoraeume").update({ signal_geheimnis: neu }).eq("id", raumId);
  if (error) { console.warn("holeSignalGeheimnis, konnte nicht setzen:", error); return null; }
  return neu;
}

/**
 * Beendet den Raum zu einem Link-Schluessel.
 *
 * Gebraucht vom Papierkorb auf der Termin-Karte im Kundenprofil: Dort ist
 * nur der Raumlink bekannt, nicht die Raum-Kennung. Ein bereits beendeter
 * oder geloeschter Raum ist kein Fehler.
 */
export async function beendeRaumMitToken(token: string): Promise<void> {
  if (!token) return;
  const { error } = await db
    .from("videoraeume")
    .update({ status: "beendet" })
    .eq("token", token)
    .neq("status", "beendet");
  if (error) console.error("beendeRaumMitToken:", error);
}

export async function loescheRaum(id: string): Promise<boolean> {
  const { error } = await db.from("videoraeume").delete().eq("id", id);
  if (error) { console.error("loescheRaum:", error); return false; }
  return true;
}

export async function ladeTeilnehmer(raumId: string): Promise<VideoraumTeilnehmer[]> {
  const { data, error } = await db
    .from("videoraum_teilnehmer")
    .select("*")
    .eq("raum_id", raumId)
    .order("beigetreten_at", { ascending: true });
  if (error) { console.error("ladeTeilnehmer:", error); return []; }
  return (data ?? []) as VideoraumTeilnehmer[];
}

/** Einlassen, abweisen oder hinauswerfen. Nur der Gastgeber darf das. */
export async function setzeTeilnehmerStatus(
  teilnehmerId: string,
  status: TeilnehmerStatus,
): Promise<boolean> {
  const felder: Record<string, unknown> = { status };
  if (status === "eingelassen") felder.eingelassen_at = new Date().toISOString();
  if (status === "beendet" || status === "abgewiesen") felder.verlassen_at = new Date().toISOString();

  const { error } = await db.from("videoraum_teilnehmer").update(felder).eq("id", teilnehmerId);
  if (error) { console.error("setzeTeilnehmerStatus:", error); return false; }
  return true;
}

/**
 * Wer im Gespraech war, ist danach beendet.
 *
 * Beim Auflegen muss das passieren, egal von wo aufgelegt wurde. Vorher lief
 * das nur ueber die Gastgeberseite: wer aus der Leiste heraus auflegte, liess
 * seine Gaeste als "eingelassen" in der Liste stehen.
 *
 * Wartende bleiben dabei ausdruecklich stehen. Der Raum traegt hoechstens
 * vier Teilnehmer, wer noch wartet, ist nach dem Auflegen dran und darf nicht
 * mit hinausgeworfen werden. Nur beim endgueltigen Schliessen des Raumes
 * gehen auch sie mit, dafuer `auchWartende`.
 */
export async function beendeTeilnehmerImRaum(raumId: string, auchWartende = false): Promise<boolean> {
  const betroffen = auchWartende
    ? ["wartet", "eingelassen", "im_gespraech"]
    : ["eingelassen", "im_gespraech"];

  const { error } = await db
    .from("videoraum_teilnehmer")
    .update({ status: "beendet", verlassen_at: new Date().toISOString() })
    .eq("raum_id", raumId)
    .in("status", betroffen);
  if (error) { console.error("beendeTeilnehmerImRaum:", error); return false; }
  return true;
}

/** Liefert die Teilnehmerliste bei jeder Aenderung neu. */
export function beobachteTeilnehmer(
  raumId: string,
  beiAenderung: (teilnehmer: VideoraumTeilnehmer[]) => void,
): () => void {
  let aktiv = true;

  const laden = async () => {
    const liste = await ladeTeilnehmer(raumId);
    if (aktiv) beiAenderung(liste);
  };
  void laden();

  const channel = supabase
    .channel(`videoraum-teilnehmer-${raumId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "videoraum_teilnehmer", filter: `raum_id=eq.${raumId}` },
      () => { void laden(); },
    )
    .subscribe();

  // Notnagel: wenn Realtime klemmt, faellt die Warteliste nicht aus, sie
  // wird nur langsamer. Lieber alle acht Sekunden nachsehen als einen
  // wartenden Kunden uebersehen.
  const takt = window.setInterval(() => { void laden(); }, 8000);

  return () => {
    aktiv = false;
    window.clearInterval(takt);
    void supabase.removeChannel(channel);
  };
}

export function raumUrl(token: string): string {
  // Immer die veroeffentlichte Adresse, nie die Vorschau, siehe oeffentlicheBasis.
  return oeffentlicheAdresse(`/raum/${token}`);
}

/**
 * Der Gast hat kein Konto und darf die Teilnehmertabelle deshalb nicht lesen.
 * Realtime auf der Tabelle scheidet damit aus. Der Einlass laeuft also ueber
 * einen Broadcast-Ruf, und die Statusabfrage per RPC bleibt als Notnagel.
 */
export function sendeEinlass(token: string, teilnehmerId: string, einlassen: boolean): void {
  const kanal = supabase.channel(`videoraum-warte-${token}`);
  kanal.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    void kanal
      .send({ type: "broadcast", event: "einlass", payload: { teilnehmerId, einlassen } })
      .then(() => { void supabase.removeChannel(kanal); });
  });
}

/*
 * Der Hinweis auf die laufende Mitschrift.
 *
 * Eine Mitschrift ohne sichtbaren Hinweis waere eine heimliche Aufzeichnung.
 * Der Gastgeber bestaetigt zwar, dass er gefragt hat, aber der Gast muss es
 * auch waehrend des Gespraechs sehen koennen. Deshalb dieser eigene Kanal.
 *
 * Der Gast fragt beim Beitreten einmal nach ("frage"), damit er den Stand auch
 * dann kennt, wenn die Mitschrift schon vor ihm lief.
 */
const MITSCHRIFT_KANAL = (token: string) => `videoraum-mitschrift-${token}`;

/** Meldet den Stand an die Gegenstelle. Antwortet auch auf deren Nachfrage. */
export function sendeMitschriftHinweis(token: string, laeuft: boolean): void {
  const kanal = supabase.channel(MITSCHRIFT_KANAL(token));
  kanal.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    void kanal
      .send({ type: "broadcast", event: "stand", payload: { laeuft } })
      .then(() => { void supabase.removeChannel(kanal); });
  });
}

/**
 * Der Gast hoert zu, der Gastgeber beantwortet die Nachfrage.
 *
 * @param aufStand wird beim Gast gerufen, sobald sich der Stand aendert.
 * @param aufNachfrage nur beim Gastgeber gesetzt: der Gast will den Stand wissen.
 */
export function beobachteMitschriftHinweis(
  token: string,
  aufStand?: (laeuft: boolean) => void,
  aufNachfrage?: () => void,
): () => void {
  const kanal = supabase
    .channel(MITSCHRIFT_KANAL(token))
    .on("broadcast", { event: "stand" }, ({ payload }) => {
      aufStand?.((payload as { laeuft?: boolean })?.laeuft === true);
    })
    .on("broadcast", { event: "frage" }, () => { aufNachfrage?.(); })
    .subscribe();
  return () => { void supabase.removeChannel(kanal); };
}

/** Der Gast fragt einmal nach dem aktuellen Stand. */
export function frageMitschriftStand(token: string): void {
  const kanal = supabase.channel(MITSCHRIFT_KANAL(token));
  kanal.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    void kanal
      .send({ type: "broadcast", event: "frage", payload: {} })
      .then(() => { void supabase.removeChannel(kanal); });
  });
}

export function beobachteEinlass(
  token: string,
  teilnehmerId: string,
  beiEinlass: (einlassen: boolean) => void,
): () => void {
  const kanal = supabase
    .channel(`videoraum-warte-${token}`)
    .on("broadcast", { event: "einlass" }, ({ payload }) => {
      const daten = payload as { teilnehmerId?: string; einlassen?: boolean };
      if (daten?.teilnehmerId === teilnehmerId) beiEinlass(daten.einlassen !== false);
    })
    .subscribe();
  return () => { void supabase.removeChannel(kanal); };
}

// ---------------------------------------------------------------------------
// Gast, ohne Konto
// ---------------------------------------------------------------------------

export async function ladeGastAnsicht(token: string): Promise<VideoraumGastAnsicht | null> {
  const { data, error } = await supabase.rpc("videoraum_ansicht" as any, { _token: token });
  if (error) { console.error("ladeGastAnsicht:", error); return null; }
  if (!data) return null;
  return data as VideoraumGastAnsicht;
}

export async function betreteRaumAlsGast(params: {
  token: string;
  name: string;
  /**
   * Zustimmung zur Mitschrift. Es gibt keine Mitschrift, deshalb steht hier
   * bis auf Weiteres immer `false`. Das Feld bleibt, damit die Zustimmung
   * spaeter ohne Umbau wieder eingeholt werden kann.
   */
  transkript?: boolean;
  technik?: Record<string, unknown>;
}): Promise<{ gastToken: string; teilnehmerId: string } | null> {
  const { data, error } = await supabase.rpc("videoraum_beitreten" as any, {
    _token: params.token,
    _name: params.name,
    _transkript: params.transkript ?? false,
    _technik: params.technik ?? {},
  });
  if (error) { console.error("betreteRaumAlsGast:", error); throw error; }
  const antwort = data as { gast_token: string; teilnehmer_id: string } | null;
  if (!antwort?.gast_token) return null;
  return { gastToken: antwort.gast_token, teilnehmerId: antwort.teilnehmer_id };
}

export interface GastStand {
  status: TeilnehmerStatus;
  raumStatus: VideoraumStatus;
  teilnehmerId: string;
  /**
   * Geheimnis des Signalkanals. Die Datenbank gibt es nur heraus, wenn dieser
   * Gast eingelassen ist. Wer im Warteraum steht, bekommt `null` und kann sich
   * deshalb nicht in ein laufendes Gespraech einhaengen.
   */
  signalGeheimnis: string | null;
  /** Platz in der Warteschlange. 1 heisst: als Naechster dran. 0: unbekannt. */
  warteposition: number;
  /** Ist gerade jemand anderes im Gespraech? */
  gespraechLaeuft: boolean;
}

/**
 * Stand des Gastes. Drei Ausgaenge, und die Unterscheidung ist wichtig: der
 * Stand selbst, `null` bei einer Stoerung (dann wird gleich nochmal gefragt)
 * und `"weg"`, wenn es den Teilnehmer nicht mehr gibt. Letzteres passiert,
 * wenn der Gastgeber den Raum loescht, waehrend jemand wartet. Ohne diese
 * Unterscheidung wartet der Gast bis in alle Ewigkeit.
 */
export async function frageGastStatus(gastToken: string): Promise<GastStand | "weg" | null> {
  const { data, error } = await supabase.rpc("videoraum_gast_status" as any, { _gast_token: gastToken });
  if (error) { console.error("frageGastStatus:", error); return null; }
  const antwort = data as {
    status: TeilnehmerStatus;
    raum_status: VideoraumStatus;
    teilnehmer_id: string;
    signal_geheimnis?: string | null;
    warteposition?: number | null;
    gespraech_laeuft?: boolean | null;
  } | null;
  if (!antwort?.status) return "weg";
  return {
    status: antwort.status,
    raumStatus: antwort.raum_status,
    teilnehmerId: antwort.teilnehmer_id,
    // Die drei Felder kommen erst mit der Migration `20260804190000`. Bis
    // dahin bleibt es beim alten Verhalten, statt dass die Seite stehenbleibt.
    signalGeheimnis: antwort.signal_geheimnis ?? null,
    warteposition: Number(antwort.warteposition ?? 0) || 0,
    gespraechLaeuft: Boolean(antwort.gespraech_laeuft),
  };
}

export async function meldeGast(
  gastToken: string,
  status?: TeilnehmerStatus,
  technik?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc("videoraum_gast_melden" as any, {
    _gast_token: gastToken,
    _status: status ?? null,
    _technik: technik ?? null,
  });
  if (error) console.error("meldeGast:", error);
}

/**
 * Aus der Datenbankmeldung einen Satz machen, den ein Kunde versteht.
 *
 * Die RPCs werfen Ausnahmen mit Text aus der Datenbank, ohne Umlaute und im
 * Technikton. Der stand vorher wortwoertlich auf der Gastseite.
 */
export function gastFehlerText(fehler: unknown, art?: VideoraumArt | null, sprache: Sprache = "de"): string {
  const roh = (fehler as { message?: unknown })?.message;
  const text = typeof roh === "string" ? roh.toLowerCase() : "";
  // Der Anlass darf fehlen: Wer keinen Raum laden konnte, weiß auch nicht,
  // ob am anderen Ende ein Kunde oder ein Bewerber sitzt. Geduzt werden beide.
  // Die Datenbankmeldung bleibt deutsch, sie wird nur erkannt, nie gezeigt.
  const t = gastTexte(art, sprache);

  if (text.includes("nicht gefunden") && text.includes("raum")) return t.linkUngueltig;
  if (text.includes("abgelaufen")) return t.linkAbgelaufen;
  if (text.includes("bereits beendet")) return t.schonBeendet;
  if (text.includes("namen angeben")) return t.nameFehlt;
  if (text.includes("zu viele")) return t.zuOft;
  return t.betretenFehlgeschlagen;
}

/**
 * Was im Warteraum unten steht. Der Wartende soll sehen, dass er nicht
 * vergessen wurde, auch wenn gerade schon ein Gespraech laeuft.
 */
export function warteHinweisText(
  warteposition: number,
  gespraechLaeuft: boolean,
  art?: VideoraumArt | null,
  sprache: Sprache = "de",
): string {
  const t = gastTexte(art, sprache);
  if (gespraechLaeuft && warteposition <= 1) return t.wartenNaechster;
  if (warteposition > 1) return mitWerten(t.wartenPosition, { position: warteposition });
  return t.wartenGleich;
}

// ---------------------------------------------------------------------------
// Sitzung des Gastes im Browser
// ---------------------------------------------------------------------------

/**
 * Wer die Seite neu laedt, war vorher ein neuer Mensch: das Gastgeheimnis lag
 * nur im Arbeitsspeicher, der alte Eintrag blieb fuer immer auf "wartet" und
 * der Gastgeber sah denselben Kunden zweimal in der Liste.
 *
 * Deshalb liegt die Sitzung im `sessionStorage`, gebunden an den Raumtoken.
 * `sessionStorage` und nicht `localStorage`: Der Eintrag soll mit dem
 * Schliessen des Fensters vergehen, nicht Wochen spaeter noch dort stehen.
 */
export interface GastSitzung {
  gastToken: string;
  teilnehmerId: string;
  name: string;
}

function sitzungsSchluessel(token: string): string {
  return `videoraum-gast:${token}`;
}

export function merkeGastSitzung(token: string, sitzung: GastSitzung): void {
  try {
    window.sessionStorage.setItem(sitzungsSchluessel(token), JSON.stringify(sitzung));
  } catch { /* privater Modus, dann eben ohne Gedaechtnis */ }
}

export function ladeGastSitzung(token: string): GastSitzung | null {
  try {
    const roh = window.sessionStorage.getItem(sitzungsSchluessel(token));
    if (!roh) return null;
    const daten = JSON.parse(roh) as Partial<GastSitzung>;
    if (!daten?.gastToken || !daten?.teilnehmerId) return null;
    return { gastToken: daten.gastToken, teilnehmerId: daten.teilnehmerId, name: daten.name ?? "" };
  } catch {
    return null;
  }
}

export function vergissGastSitzung(token: string): void {
  try {
    window.sessionStorage.removeItem(sitzungsSchluessel(token));
  } catch { /* dann bleibt sie eben stehen */ }
}
