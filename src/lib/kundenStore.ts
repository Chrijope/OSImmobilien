import { cacheGet, cacheSet, cacheInsert, cacheUpdate, cacheDelete, onCacheChange, getCacheVersion, grosseOperationBeginnen, grosseOperationBeenden, cacheZeileSchreiben, metaUnterschied, gleicherWert } from "./dataCache";
import { supabase } from "@/integrations/supabase/client";
import { validateKontaktMetaPatch } from "./kontaktMetaSchema";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";
import { withTestFlag } from "./previewFlag";
import { freeWohnungenForKunde } from "./objekteStore";
import { vorstellungsAufgabeNachZuweisung } from "./handbuch/vorstellungsAufgabe";
// Statische Importe statt require: require existiert im Vite/ESM-Bundle nicht,
// der ReferenceError wurde vom catch verschluckt und der Empfehlungs-Sync lief
// deshalb nie. Kein Kreis: empfehlungenStore und kontaktPipeline importieren
// kundenStore nicht zur Laufzeit (kontaktPipeline nur als Typ-Import).
import { syncEmpfehlungFromPipeline } from "./empfehlungenStore";
import { getEffectivePipelineStufe } from "./kontaktPipeline";
// Gleiches Muster fuer die Follow-Up-Automatik: das require weiter unten war
// tot, die Ketten liefen nie. followUpStore importiert nur dataCache und
// dbStoreHelper, es entsteht kein Kreis.
import { generateFollowUpsFromKette, getFollowUpsByKunde, cancelStaleAutoFollowUps } from "./followUpStore";

export interface KundeData {
  id: string;
  moreId: number;
  anrede: string;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  geburtstag: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  quelle: string;
  berater: string;
  zustaendig_id?: string;
  erstellt_am: string;
  aktualisiert_am?: string;
  archiviert: boolean;
  geloescht?: boolean;
  geloeschtAm?: string;
  geloeschtVon?: string;
  geloeschtVonName?: string;
  geloeschtGrund?: string;
  status: "neu" | "kontaktiert" | "qualifiziert" | "kunde" | "verloren" | "inaktiv";
  firma: string;
  position: string;
  objekt: string;
  kaufpreis: number;
  finanzierbarkeit: string;
  pipelineStufe?: string;
  reservierungsDatum?: string;
  finanzierungsStatus?: "offen" | "bestaetigt" | "abgelehnt";
  finanzierungsBank?: string;
  finanzierungsSumme?: number;
  finanzierungsZins?: string;
  finanzierungsTilgung?: string;
  finanzierungsLaufzeit?: string;
  finanzierungsAnmerkungen?: string;
  notarTermin?: string;
  notarUhrzeit?: string;
  notarName?: string;
  notarAdresse?: string;
  notarVerkaeufervertretung?: string;
  leadTyp?: "meta" | "google" | "website" | "manuell";
  zugewiesenAm?: string;
  setter?: string;
  /** UUID des Nutzers, der den Lead angelegt hat */
  erstelltVonId?: string;
  /** Name des Nutzers, der den Lead angelegt hat */
  erstelltVonName?: string;
  qualZiel?: string;
  qualEinkommen?: string;
  qualEigenkapital?: string;
  qualBeruflicheSituation?: string;
  funnelKontaktzeit?: string;
  funnelInvestitionsvolumen?: string;
  funnelZeitrahmen?: string;
  funnelImmobilienbesitz?: string;
  funnelZiele?: string;
  setterSkriptNotizen?: string;
  setterSkript?: any;
  setterTerminGebucht?: boolean;
  setterBuchungslink?: string;
  setterChecklisteDone?: boolean;
  setterCloser?: string;
  /**
   * Kennungen neben den Namen `setter` und `setterCloser`. Namen koennen
   * doppelt vorkommen, deshalb wird ueber diese Felder zugeordnet und der Name
   * nur noch als Rueckfall fuer alte Datensaetze gelesen.
   */
  setterId?: string;
  setterCloserId?: string;
  setterTerminDatum?: string;
  setterTerminUhrzeit?: string;
  /** Ergebnis des Erstgesprächs (vom VP gesetzt) */
  terminErgebnis?: "erschienen" | "noshow" | "verschoben";
  terminErgebnisAm?: string;
  terminErgebnisVon?: string;
  /** Historie aller No-Shows für Auswertungen */
  noShowHistorie?: Array<{ datum: string; uhrzeit: string; berater: string; gemeldetAm: string; setter?: string }>;
  nichtErreichtCount?: number;
  /**
   * Zähler für die drei Mails an einen nicht erreichten Lead, je Partner.
   * Form und Grund stehen in `src/lib/nichtErreichtMails.ts`.
   */
  nichtErreichtMails?: { partnerId: string; versuche: number; gesendet: number[] };
  verstecktBis?: string;
  remindersSent?: string[];
  /** Historie der Vertriebspartner-Wechsel (chronologisch). */
  beraterHistorie?: Array<{ name: string; von: string; bis?: string; geaendertVonId?: string; geaendertVonName?: string }>;
  /**
   * ID aus dem Katalog in `src/lib/verlustgruende.ts`. Altbestand enthält hier
   * noch Freitext, deshalb wird zur Anzeige immer `verlustGrundLabel()`
   * benutzt.
   */
  verlorenGrund?: string;
  /** Zeitpunkt, zu dem der Kontakt als verloren markiert wurde (ISO). */
  verlorenAm?: string;
  /**
   * Stufe, in der der Kontakt stand, bevor er auf verloren gesetzt wurde.
   * Wird beim Wiederaufnehmen gebraucht, damit der Kontakt dort weiterlaeuft,
   * wo er aufgehoert hat, und nicht wieder ganz vorne anfaengt.
   */
  stufeVorVerlust?: string;
  /** Zeitpunkt der Wiederaufnahme (ISO). Wird in den Statistiken ausgewertet. */
  reaktiviertAm?: string;
  /**
   * Grund fürs Archivieren. Bewusst getrennt von `verlorenGrund`: Archivieren
   * ist eine Aufräumhandlung und darf die Verlustauswertung nicht verfälschen.
   */
  archivGrund?: string;
  versicherungGeeignet?: boolean;
  versicherungNotizen?: string;
  versicherungTerminDatum?: string;
  versicherungTerminUhrzeit?: string;
  versicherungCloser?: string;
  /** Steuerliche Identifikationsnummer (Single source of truth – synchronisiert SA, Reservierung & Notar) */
  steuerId?: string;
  einkuenfte: {
    gehalt: number;
    selbstaendig: number;
    renten: number;
    mieteinnahmen: number;
    zinsen: number;
    sonstige: number;
    kindergeld: number;
  };
  ausgaben: {
    miete: number;
    lebenshaltung: number;
    privateKV: number;
    zinsTilgung: number;
    autokredite: number;
    privatkredite: number;
    sonstigeKredite: number;
    unterhalt: number;
    sonstige: number;
  };
  person2?: {
    anrede: string; vorname: string; nachname: string;
    geburtsdatum: string; email: string; telefon: string;
    strasse: string; hausnummer: string; plz: string; ort: string;
    steuerId?: string;
    einkuenfte?: {
      gehalt: number; selbstaendig: number; renten: number;
      mieteinnahmen: number; zinsen: number; sonstige: number; kindergeld: number;
    };
    ausgaben?: {
      miete: number; lebenshaltung: number; privateKV: number;
      zinsTilgung: number; autokredite: number; privatkredite: number;
      sonstigeKredite: number; unterhalt: number; sonstige: number;
    };
  };
}

const DEFAULT_EINKUENFTE = {
  gehalt: 0, selbstaendig: 0, renten: 0, mieteinnahmen: 0, zinsen: 0, sonstige: 0, kindergeld: 0,
};

const DEFAULT_AUSGABEN = {
  miete: 0, lebenshaltung: 0, privateKV: 0, zinsTilgung: 0, autokredite: 0, privatkredite: 0, sonstigeKredite: 0, unterhalt: 0, sonstige: 0,
};

function resolveMoreId(meta: Record<string, any>): number {
  const raw = meta?.moreId ?? meta?.kundenNr ?? 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const parsed = Number.parseInt(String(raw).trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ── Mapping DB Row ↔ KundeData ──

export function dbRowToKunde(row: any): KundeData {
  const meta = row.meta || {};
  return {
    id: row.id,
    moreId: resolveMoreId(meta),
    anrede: row.anrede || "",
    vorname: row.vorname || "",
    nachname: row.nachname || "",
    email: row.email || "",
    telefon: row.telefon || "",
    geburtstag: meta.geburtstag || "",
    strasse: row.strasse || "",
    hausnummer: row.hausnummer || "",
    plz: row.plz || "",
    ort: row.ort || "",
    quelle: row.quelle || "",
    berater: row.berater || "",
    zustaendig_id: row.zustaendig_id || "",
    erstellt_am: row.erstellt_am || "",
    aktualisiert_am: row.aktualisiert_am || row.erstellt_am || "",
    archiviert: row.archiviert || false,
    geloescht: row.geloescht || false,
    geloeschtAm: row.geloescht_am || undefined,
    geloeschtVon: row.geloescht_von || undefined,
    geloeschtVonName: row.geloescht_von_name || undefined,
    geloeschtGrund: row.geloescht_grund || undefined,
    status: row.status || "neu",
    firma: row.firma || "",
    position: row.position || "",
    objekt: row.objekt || "",
    kaufpreis: Number(row.kaufpreis) || 0,
    finanzierbarkeit: row.finanzierbarkeit || "",
    pipelineStufe: meta.pipelineStufe,
    reservierungsDatum: meta.reservierungsDatum,
    finanzierungsStatus: meta.finanzierungsStatus,
    finanzierungsBank: meta.finanzierungsBank,
    finanzierungsSumme: meta.finanzierungsSumme,
    finanzierungsZins: meta.finanzierungsZins,
    finanzierungsTilgung: meta.finanzierungsTilgung,
    finanzierungsLaufzeit: meta.finanzierungsLaufzeit,
    finanzierungsAnmerkungen: meta.finanzierungsAnmerkungen,
    notarTermin: meta.notarTermin,
    notarUhrzeit: meta.notarUhrzeit,
    notarName: meta.notarName,
    notarAdresse: meta.notarAdresse,
    notarVerkaeufervertretung: meta.notarVerkaeufervertretung,
    leadTyp: meta.leadTyp,
    zugewiesenAm: meta.zugewiesenAm,
    setter: meta.setter,
    setterId: meta.setterId,
    erstelltVonId: meta.erstelltVonId,
    erstelltVonName: meta.erstelltVonName,
    qualZiel: meta.qualZiel || (meta.funnelData?.goals?.join(", ")),
    qualEinkommen: meta.qualEinkommen || meta.funnelData?.income,
    qualEigenkapital: meta.qualEigenkapital || meta.funnelData?.equityAmount,
    qualBeruflicheSituation: meta.qualBeruflicheSituation || meta.funnelData?.employment,
    funnelKontaktzeit: meta.funnelKontaktzeit || meta.funnelData?.preferredTime,
    funnelInvestitionsvolumen: meta.funnelInvestitionsvolumen || meta.funnelData?.investmentVolume,
    funnelZeitrahmen: meta.funnelZeitrahmen || meta.funnelData?.timeline,
    funnelImmobilienbesitz: meta.funnelImmobilienbesitz || meta.funnelData?.hasProperty,
    funnelZiele: meta.funnelZiele || (meta.funnelData?.goals?.join(", ")),
    setterSkriptNotizen: meta.setterSkriptNotizen,
    setterSkript: meta.setterSkript,
    setterTerminGebucht: meta.setterTerminGebucht,
    setterBuchungslink: meta.setterBuchungslink,
    setterChecklisteDone: meta.setterChecklisteDone,
    setterCloser: meta.setterCloser,
    setterCloserId: meta.setterCloserId,
    setterTerminDatum: meta.setterTerminDatum,
    setterTerminUhrzeit: meta.setterTerminUhrzeit,
    terminErgebnis: meta.terminErgebnis,
    terminErgebnisAm: meta.terminErgebnisAm,
    terminErgebnisVon: meta.terminErgebnisVon,
    noShowHistorie: meta.noShowHistorie || [],
    nichtErreichtCount: meta.nichtErreichtCount || 0,
    nichtErreichtMails: meta.nichtErreichtMails,
    verstecktBis: meta.verstecktBis,
    remindersSent: meta.remindersSent || [],
    verlorenGrund: meta.verlorenGrund,
    verlorenAm: meta.verlorenAm,
    stufeVorVerlust: meta.stufeVorVerlust,
    reaktiviertAm: meta.reaktiviertAm,
    archivGrund: meta.archivGrund,
    versicherungGeeignet: meta.versicherung_geeignet || false,
    versicherungNotizen: meta.versicherungNotizen,
    versicherungTerminDatum: meta.versicherungTerminDatum,
    versicherungTerminUhrzeit: meta.versicherungTerminUhrzeit,
    versicherungCloser: meta.versicherungCloser,
    einkuenfte: meta.einkuenfte || { ...DEFAULT_EINKUENFTE },
    ausgaben: meta.ausgaben || { ...DEFAULT_AUSGABEN },
    person2: meta.person2,
    steuerId: meta.steuerId,
    beraterHistorie: Array.isArray(meta.beraterHistorie) ? meta.beraterHistorie : [],
  };
}

function kundeToDbRow(k: KundeData): Record<string, any> {
  // Preserve existing meta fields (portal, auth, unterlagen, etc.) that are
  // not part of the KundeData interface but live in the meta JSONB column.
  const existingRow = cacheGet("kontakte").find((r: any) => r.id === k.id);
  const existingMeta = (existingRow?.meta && typeof existingRow.meta === "object") ? { ...existingRow.meta } : {};

  const knownMeta: Record<string, any> = {
    moreId: k.moreId,
    geburtstag: k.geburtstag,
    pipelineStufe: k.pipelineStufe,
    reservierungsDatum: k.reservierungsDatum,
    finanzierungsStatus: k.finanzierungsStatus,
    finanzierungsBank: k.finanzierungsBank,
    finanzierungsSumme: k.finanzierungsSumme,
    finanzierungsZins: k.finanzierungsZins,
    finanzierungsTilgung: k.finanzierungsTilgung,
    finanzierungsLaufzeit: k.finanzierungsLaufzeit,
    finanzierungsAnmerkungen: k.finanzierungsAnmerkungen,
    notarTermin: k.notarTermin,
    notarUhrzeit: k.notarUhrzeit,
    notarName: k.notarName,
    notarAdresse: k.notarAdresse,
    notarVerkaeufervertretung: k.notarVerkaeufervertretung,
    leadTyp: k.leadTyp,
    zugewiesenAm: k.zugewiesenAm,
    setter: k.setter,
    setterId: k.setterId,
    erstelltVonId: k.erstelltVonId,
    erstelltVonName: k.erstelltVonName,
    qualZiel: k.qualZiel,
    qualEinkommen: k.qualEinkommen,
    qualEigenkapital: k.qualEigenkapital,
    qualBeruflicheSituation: k.qualBeruflicheSituation,
    funnelKontaktzeit: k.funnelKontaktzeit,
    funnelInvestitionsvolumen: k.funnelInvestitionsvolumen,
    funnelZeitrahmen: k.funnelZeitrahmen,
    funnelImmobilienbesitz: k.funnelImmobilienbesitz,
    funnelZiele: k.funnelZiele,
    setterSkriptNotizen: k.setterSkriptNotizen,
    setterTerminGebucht: k.setterTerminGebucht,
    setterBuchungslink: k.setterBuchungslink,
    setterChecklisteDone: k.setterChecklisteDone,
    setterCloser: k.setterCloser,
    setterCloserId: k.setterCloserId,
    setterTerminDatum: k.setterTerminDatum,
    setterTerminUhrzeit: k.setterTerminUhrzeit,
    terminErgebnis: k.terminErgebnis,
    terminErgebnisAm: k.terminErgebnisAm,
    terminErgebnisVon: k.terminErgebnisVon,
    noShowHistorie: k.noShowHistorie,
    nichtErreichtCount: k.nichtErreichtCount,
    nichtErreichtMails: k.nichtErreichtMails,
    verstecktBis: k.verstecktBis,
    remindersSent: k.remindersSent,
    verlorenGrund: k.verlorenGrund,
    verlorenAm: k.verlorenAm,
    stufeVorVerlust: k.stufeVorVerlust,
    reaktiviertAm: k.reaktiviertAm,
    archivGrund: k.archivGrund,
    versicherung_geeignet: k.versicherungGeeignet,
    versicherungNotizen: k.versicherungNotizen,
    versicherungTerminDatum: k.versicherungTerminDatum,
    versicherungTerminUhrzeit: k.versicherungTerminUhrzeit,
    versicherungCloser: k.versicherungCloser,
    einkuenfte: k.einkuenfte,
    ausgaben: k.ausgaben,
    person2: k.person2,
    steuerId: k.steuerId,
    beraterHistorie: k.beraterHistorie,
  };

  return {
    id: k.id,
    vorname: k.vorname,
    nachname: k.nachname,
    email: k.email,
    telefon: k.telefon,
    anrede: k.anrede,
    firma: k.firma,
    position: k.position,
    strasse: k.strasse,
    hausnummer: k.hausnummer,
    plz: k.plz,
    ort: k.ort,
    quelle: k.quelle,
    berater: k.berater,
    zustaendig_id: k.zustaendig_id || null,
    status: k.status,
    archiviert: k.archiviert,
    objekt: k.objekt,
    kaufpreis: k.kaufpreis,
    finanzierbarkeit: k.finanzierbarkeit,
    erstellt_am: k.erstellt_am,
    meta: withTestFlag({ ...existingMeta, ...knownMeta }),
  };
}

// ── localStorage fallback for testaccount ──
const LS_KEY = "mi_kontakte";

function lsGetKontakte(): KundeData[] {
  return localGet<KundeData[]>(LS_KEY, []);
}

function lsSaveKontakte(data: KundeData[]) {
  localSet(LS_KEY, data);
}

// ── Public API (same signatures as before) ──

/**
 * Schreibt einzelne meta-Felder eines Kontakts atomar auf dem Server zusammen
 * und zieht danach den Zwischenspeicher auf den zurueckgelieferten Stand nach.
 *
 * Warum es diese Funktion gibt: `updateKontakt` baut das komplette meta-Objekt
 * neu auf und nimmt als Grundlage die Kontaktzeile aus dem Zwischenspeicher
 * (siehe `kundeToDbRow`). Ruft man stattdessen direkt
 * `supabase.rpc("merge_kontakt_meta", ...)` auf, landet das Ergebnis nur in der
 * Datenbank, der Zwischenspeicher bleibt auf dem alten Stand. Das naechste
 * `updateKontakt` schreibt dann genau diesen alten Stand als Ganzes zurueck und
 * das eben gespeicherte Feld ist wieder weg. Wird der RPC zusaetzlich ohne
 * `await` abgesetzt, geht der Wert sogar schon im selben Klick verloren, weil
 * das nachfolgende `updateKontakt` synchron laeuft.
 *
 * Rueckgabe: `true`, wenn der Merge auf dem Server durchgelaufen ist, sonst
 * `false` (Fehler des RPC oder Ausnahme). Aufrufer, die dem Nutzer einen Erfolg
 * melden oder einen Entwurf als gespeichert markieren, muessen diesen Wert
 * pruefen. Wer ihn ignoriert, verhaelt sich wie bisher.
 */
export async function mergeKontaktMeta(kontaktId: string, patch: Record<string, any>): Promise<boolean> {
  return (await mergeKontaktMetaMitGrund(kontaktId, patch)).ok;
}

/**
 * Ist die Zustaendigkeit dieses Kontakts in der Datenbank wirklich leer?
 *
 * Fuer die Rueckgabe an die Zentrale. Ein UPDATE, das wegen der
 * Zeilensicherheit keine einzige Zeile trifft, meldet keinen Fehler, der
 * Zwischenspeicher haelt es dann fuer gelungen. Deshalb danach nachlesen.
 *
 * Ist die Zeile nicht mehr lesbar, gilt die Rueckgabe als erfolgt: Ein
 * Vertriebspartner sieht einen zugeteilten Lead nach der Rueckgabe nicht
 * mehr, das ist der Normalfall. Nur eine noch lesbare Zeile mit
 * Zustaendigem beweist, dass nichts geaendert wurde.
 * ponytail: Wechselt die Zustaendigkeit zeitgleich woanders hin, zaehlt der
 * unlesbare Fall faelschlich als Erfolg; eine eigene Datenbankfunktion mit
 * Trefferzahl waere die genaue Antwort.
 */
export async function kontaktZustaendigkeitGeleert(kontaktId: string): Promise<boolean> {
  if (isTestAccount()) return !(getKontaktById(kontaktId)?.zustaendig_id || "").trim();
  const { data, error } = await supabase
    .from("kontakte")
    .select("zustaendig_id")
    .eq("id", kontaktId)
    .maybeSingle();
  if (error) return false;
  return !data || !data.zustaendig_id;
}

/**
 * Gibt einen Lead ueber die Datenbankfunktion `lead_an_zentrale_zurueckgeben`
 * an die Zentrale zurueck.
 *
 * Ein gewoehnliches UPDATE scheitert beim Vertriebspartner an seiner eigenen
 * Leseregel: Postgres prueft auch die NEUE Zeile, und die gehoert ihm nach der
 * Rueckgabe nicht mehr ("new row violates row-level security policy", bis
 * 28.09.2026 bei jedem zugeteilten Lead). Die Funktion prueft selbst, wer
 * darf (Migration 20260928190000).
 *
 * @returns true oder false nach Antwort der Datenbank; null, wenn die
 *   Funktion noch fehlt oder das Testkonto arbeitet. Dann nimmt der Aufrufer
 *   den bisherigen Weg ueber `updateKontakt`.
 */
export async function kontaktPerFunktionZurueckgeben(
  kontaktId: string,
  beraterHistorie: unknown[],
): Promise<boolean | null> {
  if (isTestAccount()) return null;
  const { data, error } = await (supabase as any).rpc("lead_an_zentrale_zurueckgeben", {
    _kontakt_id: kontaktId,
    _berater_historie: beraterHistorie,
  });
  if (error) {
    const text = String(error.message || "");
    if (error.code === "PGRST202" || error.code === "42883" || /could not find the function|does not exist/i.test(text)) {
      return null;
    }
    console.error("lead_an_zentrale_zurueckgeben:", error);
    return false;
  }
  if (data !== true) return false;

  // Zwischenspeicher nachziehen, ohne ein zweites Mal zu schreiben.
  const arr = cacheGet("kontakte");
  const idx = arr.findIndex((r: any) => r.id === kontaktId);
  if (idx >= 0) {
    const naechste = [...arr];
    const zeile = naechste[idx] as any;
    naechste[idx] = { ...zeile, zustaendig_id: null, berater: "", meta: { ...(zeile.meta || {}), beraterHistorie } };
    cacheSet("kontakte", naechste);
  }
  return true;
}

export type MergeErgebnis = { ok: true } | { ok: false; grund: string };

/**
 * Wie `mergeKontaktMeta`, nennt beim Fehlschlag aber den Grund, damit der
 * Aufrufer ihn dem Nutzer zeigen kann (etwa beim Sperren des Kundenportals).
 * Beide teilen sich diesen einen Weg zum Server und zum Zwischenspeicher.
 */
export async function mergeKontaktMetaMitGrund(kontaktId: string, patch: Record<string, unknown>): Promise<MergeErgebnis> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.rpc("merge_kontakt_meta", {
      _kontakt_id: kontaktId,
      _updates: patch as any,
    });
    if (error) {
      console.error("mergeKontaktMeta: merge_kontakt_meta error:", error);
      return { ok: false, grund: error.message || "Unbekannter Fehler" };
    }
    if (data) {
      // Ueber cacheSet zurueckschreiben, nicht am Array an Ort und Stelle:
      // cacheSet erhoeht die Tabellenversion, benachrichtigt die Zuhoerer und
      // schreibt beim Testkonto nach localStorage. Eine Aenderung direkt am
      // Array wuerde `ensureKontakteMapped` nicht ausloesen, weil dort genau
      // Array-Referenz und Version verglichen werden, und beim Testkonto sogar
      // ganz verpuffen, weil `cacheGet` dort jedes Mal frisch parst.
      const arr = cacheGet("kontakte");
      const idx = arr.findIndex((r: any) => r.id === kontaktId);
      if (idx >= 0) {
        const naechste = [...arr];
        naechste[idx] = { ...naechste[idx], meta: data };
        cacheSet("kontakte", naechste);
      }
    }
    return { ok: true };
  } catch (e) {
    console.error("mergeKontaktMeta failed:", e);
    return { ok: false, grund: e instanceof Error ? e.message : String(e) };
  }
}

export interface LeadZuweisung {
  /**
   * "vergeben" heisst: jemand anderes war schneller.
   * "abwesend" heisst: Der Partner hat fuer heute eine Abwesenheit eingetragen.
   */
  status: "ok" | "vergeben" | "fehler" | "abwesend";
  /** Bei "vergeben": wer den Lead jetzt hat, sofern lesbar. */
  belegtVon?: string;
  /** Bei "fehler" und "abwesend": der Satz fuer den Schirm. */
  meldung?: string;
}

/**
 * Weist einen Lead aus dem offenen Pool zu, ohne Wettlauf.
 *
 * Bisher lief die Zuweisung ueber ein gewoehnliches `updateKontakt`. Zwei
 * Setterinnen konnten denselben Lead gleichzeitig verschieden zuweisen, die
 * letzte gewann lautlos, und `meta.offenerLead` blieb dabei auf `true` stehen.
 *
 * Zwei Wege, weil die Datenbankfunktion `claim_lead` nur das Selbst-Annehmen
 * kann: sie setzt `zustaendig_id` fest auf `auth.uid()`. Fuer das Zuweisen an
 * Dritte taugt sie deshalb nicht.
 *
 *  - Ziel ist die aufrufende Person → `claim_lead`. Atomar, schreibt einen
 *    Eintrag ins Audit-Log und setzt `meta.offenerLead` zurueck.
 *  - Ziel ist jemand anderes → bedingtes UPDATE mit `zustaendig_id IS NULL`.
 *    Ebenfalls atomar, aber ohne Audit-Eintrag. Ein Audit-Eintrag ginge nur
 *    ueber eine eigene Datenbankfunktion, also ueber eine Migration.
 */
/**
 * Willkommensmail an den Lead nach der Zuweisung (seit 30.09.2026).
 *
 * Hier und nicht in der Lead-Verwaltung, weil jede Zuweisung durch
 * `leadZuweisenWennFrei` laeuft. Die Function prueft selbst, wer zustaendig
 * ist, und schickt je Kontakt hoechstens einmal. Scheitert sie, bleibt die
 * Zuweisung trotzdem stehen.
 */
async function willkommensMailNachZuweisung(kontaktId: string): Promise<void> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.functions.invoke("send-lead-zuweisung-mail", { body: { kontaktId } });
  } catch (e) {
    console.warn("send-lead-zuweisung-mail fehlgeschlagen", e);
  }
}

export async function leadZuweisenWennFrei(
  id: string,
  ziel: { id: string; name: string },
  optionen?: {
    /**
     * Falls true, keine Einzelmail an den Partner. Die Massenzuweisung setzt
     * das und schickt am Ende eine gebuendelte Mail ueber
     * sendeLeadPartnerSammelMail, statt je Lead eine eigene.
     */
    mailUnterdruecken?: boolean;
  },
): Promise<LeadZuweisung> {
  const { jetztAlsIsoDatum } = await import("./datumsformate");
  const zugewiesenAm = jetztAlsIsoDatum();

  /*
   * Abwesende bekommen keine Leads.
   *
   * Christians Vorgabe vom 14.09.2026. Der Grund: Ein Lead, der an einen
   * Abwesenden geht, liegt bis zu dessen Rueckkehr unbearbeitet, und das
   * faellt niemandem auf, weil er in der Liste zugewiesen aussieht.
   *
   * Die Pruefung steht hier und nicht nur in der Oberflaeche, weil hier jede
   * Zuweisung vorbeikommt: die einzelne aus dem Dialog, die Massenzuweisung
   * und jeder kuenftige Weg. Ein ausgegrauter Eintrag in einer Auswahlliste
   * waere keine Sperre.
   *
   * Faellt die Abfrage aus, etwa weil die Tabelle in Supabase noch nicht
   * angelegt ist, wird NICHT gesperrt. Eine Leadverteilung, die wegen einer
   * fehlenden Nebentabelle stehen bleibt, waere der groessere Schaden.
   */
  try {
    const { ladeAktiveAbwesenheiten, abwesenheitAmTag, abwesenheitGrundText } =
      await import("./abwesenheitStore");
    const { eintraege, migrationFehlt, fehler } = await ladeAktiveAbwesenheiten();
    // Nur sperren, wenn die Auskunft wirklich belastbar ist. Fehlt die
    // Tabelle oder antwortet sie mit einem Fehler, wissen wir nichts, und
    // Nichtwissen darf keine Sperre sein.
    if (!migrationFehlt && !fehler) {
      const laeuft = abwesenheitAmTag(eintraege, ziel.id);
      if (laeuft) {
        // Der Name der Vertretung steht hier bewusst nicht. Er waere nur
        // ueber einen Umweg ueber die Kontakte zu raten und bliebe leer,
        // sobald die Vertretung selbst keine Kontakte hat. Der Zeitraum
        // allein beantwortet die Frage, um die es geht: wann wieder.
        return { status: "abwesend", meldung: abwesenheitGrundText(laeuft) };
      }
    }
  } catch {
    /* Siehe oben: im Zweifel zuweisen lassen. */
  }

  if (isTestAccount()) {
    const vorhanden = getKontaktById(id);
    const belegt = (vorhanden?.zustaendig_id || "").trim();
    if (belegt && belegt !== ziel.id) {
      return { status: "vergeben", belegtVon: vorhanden?.berater || "" };
    }
    updateKontakt(id, { berater: ziel.name, zustaendig_id: ziel.id, zugewiesenAm } as Partial<KundeData>);
    return { status: "ok" };
  }

  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { cacheRefreshTable } = await import("./dataCache");

    let meineId: string | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      meineId = data?.user?.id || null;
    } catch { /* ohne eigene ID laeuft der Weg fuer Dritte */ }

    if (meineId && meineId === ziel.id) {
      const { data, error } = await supabase.rpc("claim_lead", {
        _kontakt_id: id,
        _via: "lead_verwaltung",
      });
      if (error) return { status: "fehler", meldung: error.message };
      const zeile = Array.isArray(data) ? data[0] : (data as any);
      if (!zeile?.success) {
        return { status: "vergeben", belegtVon: zeile?.claimed_by_name || "" };
      }
      // Erst den Zwischenspeicher nachziehen, dann `zugewiesenAm` schreiben:
      // `updateKontakt` baut meta aus dem Zwischenspeicher neu auf und wuerde
      // sonst das gerade von `claim_lead` zurueckgesetzte `offenerLead`
      // wieder auf `true` setzen. `claim_lead` selbst kennt `zugewiesenAm`
      // nicht.
      await cacheRefreshTable("kontakte");
      updateKontakt(id, { zugewiesenAm } as Partial<KundeData>);
      void vorstellungsAufgabeNachZuweisung(getKontaktById(id), ziel.id, meineId);
      void willkommensMailNachZuweisung(id);
      return { status: "ok" };
    }

    // Vor dem Schreiben festhalten: Ist die Zeile danach nicht mehr lesbar,
    // braucht die Vorstellungsaufgabe trotzdem Quelle und Kennung.
    const kontaktVorher = getKontaktById(id);
    const nachZuweisung = async () => {
      // Mail an den neuen Zustaendigen. Bei der Selbstuebernahme oben entfaellt
      // sie bewusst: wer sich einen Lead selbst nimmt, weiss davon.
      if (!optionen?.mailUnterdruecken && (!meineId || meineId !== ziel.id)) {
        const { sendeLeadPartnerMail } = await import("./beraterHistorie");
        void sendeLeadPartnerMail(id, ziel.id);
      }
      void vorstellungsAufgabeNachZuweisung(getKontaktById(id) ?? kontaktVorher, ziel.id, meineId);
      void willkommensMailNachZuweisung(id);
    };

    // Bedingtes UPDATE: gewinnt nur, solange niemand zustaendig ist.
    const { data, error } = await (supabase as any)
      .from("kontakte")
      .update({ zustaendig_id: ziel.id, berater: ziel.name })
      .eq("id", id)
      .is("zustaendig_id", null)
      .select("id, zustaendig_id");
    if (error) return { status: "fehler", meldung: error.message };

    if (Array.isArray(data) && data.length > 0 && data[0]?.zustaendig_id !== ziel.id) {
      // Geschrieben, aber ein Waechter hat die Zustaendigkeit festgehalten.
      await cacheRefreshTable("kontakte");
      return { status: "fehler", meldung: "Die Zuweisung wurde von der Datenbank nicht übernommen." };
    }

    if (!data || data.length === 0) {
      // Nichts zurueckbekommen: schon vergeben oder von der Zeilenregel
      // abgelehnt. Nachsehen, wem der Lead jetzt gehoert. Ein Lesefehler und
      // eine nicht mehr sichtbare Zeile sind kein bestaetigter Erfolg
      // (Pruefung Codex, 04.10.2026); bis dahin galt die unsichtbare Zeile als
      // erfolgte Zuweisung.
      const { data: jetzt, error: lesefehler } = await (supabase as any)
        .from("kontakte")
        .select("zustaendig_id, berater")
        .eq("id", id)
        .maybeSingle();
      if (lesefehler) return { status: "fehler", meldung: lesefehler.message || "Die Zuweisung ließ sich nicht prüfen." };
      if (!jetzt) {
        await cacheRefreshTable("kontakte");
        return { status: "fehler", meldung: "Die Zuweisung ließ sich nicht bestätigen. Bitte lade die Seite neu und prüfe den Lead." };
      }
      if (jetzt.zustaendig_id && jetzt.zustaendig_id !== ziel.id) {
        return { status: "vergeben", belegtVon: jetzt.berater || "" };
      }
      if (jetzt.zustaendig_id !== ziel.id) {
        // Lesbar und weiter ohne Zustaendigen: Die Zeilenregel hat das
        // Schreiben still abgelehnt.
        return { status: "fehler", meldung: "Keine Berechtigung, diesen Lead zuzuweisen." };
      }
    }

    await mergeKontaktMeta(id, { offenerLead: false, zugewiesenAm });
    await cacheRefreshTable("kontakte");
    await nachZuweisung();
    return { status: "ok" };
  } catch (e: any) {
    console.error("leadZuweisenWennFrei failed:", e);
    return { status: "fehler", meldung: e?.message || "Unbekannter Fehler" };
  }
}

// ── Cached kontakte mapping to avoid repeated .map(dbRowToKunde) ──
let _kontakteCacheVersion = -1;
let _kontakteCacheRef: any[] | null = null;
let _kontakteMapped: KundeData[] = [];

function ensureKontakteMapped(): KundeData[] {
  const raw = cacheGet("kontakte");
  const version = getCacheVersion("kontakte");
  // Re-map when cache version changes (covers in-place realtime UPDATE) or array ref changes.
  if (raw !== _kontakteCacheRef || version !== _kontakteCacheVersion) {
    _kontakteCacheRef = raw;
    _kontakteCacheVersion = version;
    _kontakteMapped = raw.map(dbRowToKunde);
  }
  return _kontakteMapped;
}

export function getKontakte(): KundeData[] {
  if (isTestAccount()) {
    return lsGetKontakte().filter(k => !(k as any).geloescht);
  }
  // Filter out soft-deleted kontakte from main views
  return ensureKontakteMapped().filter(k => !k.geloescht);
}

/** Liefert ALLE Kontakte inkl. soft-deleted (für Papierkorb) */
export function getAllKontakteIncludingDeleted(): KundeData[] {
  if (isTestAccount()) return lsGetKontakte();
  return ensureKontakteMapped();
}

/** Liefert nur die soft-deleted (gelöschten) Kontakte */
export function getDeletedKontakte(): KundeData[] {
  return getAllKontakteIncludingDeleted().filter(k => k.geloescht);
}

/**
 * Laedt die geloeschten Kontakte direkt aus der Datenbank.
 *
 * Der Cache enthaelt bewusst nur aktive Kontakte, sonst verdraengen die
 * Papierkorb-Leichen eines grossen Imports die echten Kontakte aus dem
 * Ladelimit. Der Papierkorb holt seine Zeilen daher selbst, RLS gilt
 * unveraendert.
 */
export async function ladeGeloeschteKontakte(): Promise<KundeData[]> {
  if (isTestAccount()) return lsGetKontakte().filter(k => (k as any).geloescht);
  const { data, error } = await supabase
    .from("kontakte")
    .select("*")
    .eq("geloescht", true)
    .order("geloescht_am", { ascending: false, nullsFirst: false })
    .limit(5000);
  if (error) {
    console.warn("Papierkorb: Laden fehlgeschlagen:", error.message);
    return [];
  }
  return (data || []).map(dbRowToKunde);
}

/** Force invalidation of the kontakte mapping cache (call after realtime updates) */
export function invalidateKontakteCache() {
  _kontakteCacheRef = null;
  _kontakteCacheVersion = -1;
}

// Auto-invalidate on realtime changes
onCacheChange((table) => {
  if (table === "kontakte") invalidateKontakteCache();
});

export function getKontaktById(id: string): KundeData | undefined {
  if (isTestAccount()) return lsGetKontakte().find(k => k.id === id);
  const row = cacheGet("kontakte").find((r: any) => r.id === id);
  return row ? dbRowToKunde(row) : undefined;
}

/**
 * Gespeicherter Kontakttyp beim Anlegen: "eigen" nur, wenn der Anlegende sich
 * selbst als zuständig einträgt und kein Setter beteiligt ist, sonst
 * "gesellschaft". Angezeigt wird ohnehin nach getKontaktTyp; der Wert hält
 * die Herkunft zum Zeitpunkt der Anlage fest.
 */
export function kontaktTypBeimAnlegen(
  erstellerId: string | null | undefined,
  zustaendigId: string | null | undefined,
  setter: string | null | undefined,
): "eigen" | "gesellschaft" {
  const ersteller = (erstellerId || "").trim();
  if (!ersteller || (setter || "").trim()) return "gesellschaft";
  return ersteller === (zustaendigId || "").trim() ? "eigen" : "gesellschaft";
}

export async function addKontakt(partial: Partial<KundeData> & { vorname: string; nachname: string }): Promise<KundeData> {
  const all = getKontakte();
  const maxMoreId = all.reduce((max, k) => Math.max(max, k.moreId || 0), 0);

  // Auto-Attribution: Wenn kein Vertriebspartner explizit gesetzt wurde (undefined),
  // wird der anlegende Nutzer automatisch als Vertriebspartner hinterlegt.
  // Wichtig: explizites "" wird respektiert (z. B. Lead-Pool für Setter/Admin).
  let resolvedBerater = partial.berater;
  let resolvedZustaendigId = partial.zustaendig_id;
  // Ersteller-Tracking: immer protokollieren, wer den Lead angelegt hat,
  // auch wenn berater bewusst leer bleibt (Pool-Leads von Setter/Admin).
  let creatorId: string | undefined;
  let creatorName: string | undefined;
  try {
    const { getCurrentUserId } = await import("./currentUser");
    const uid = getCurrentUserId();
    creatorId = uid || undefined;
    const profiles = cacheGet("profiles") as any[];
    const me = profiles?.find((p: any) => p.id === uid);
    creatorName = me?.name || undefined;
    if (resolvedZustaendigId === undefined && uid) resolvedZustaendigId = uid;
    if (resolvedBerater === undefined) resolvedBerater = creatorName || "";
  } catch {
    resolvedBerater = resolvedBerater ?? "";
    resolvedZustaendigId = resolvedZustaendigId ?? "";
  }

  const newKunde: KundeData = {
    id: crypto.randomUUID(),
    moreId: maxMoreId + 1,
    anrede: partial.anrede || "",
    vorname: partial.vorname,
    nachname: partial.nachname,
    email: partial.email || "",
    telefon: partial.telefon || "",
    geburtstag: partial.geburtstag || "",
    strasse: partial.strasse || "",
    hausnummer: partial.hausnummer || "",
    plz: partial.plz || "",
    ort: partial.ort || "",
    quelle: partial.quelle || "",
    berater: resolvedBerater || "",
    zustaendig_id: resolvedZustaendigId || "",
    erstellt_am: partial.erstellt_am || new Date().toISOString(),
    aktualisiert_am: new Date().toISOString(),
    archiviert: false,
    status: partial.status || "neu",
    firma: partial.firma || "",
    position: partial.position || "",
    objekt: partial.objekt || "",
    kaufpreis: partial.kaufpreis || 0,
    finanzierbarkeit: partial.finanzierbarkeit || "",
    pipelineStufe: partial.pipelineStufe || "neuer_lead",
    leadTyp: partial.leadTyp,
    zugewiesenAm: partial.zugewiesenAm,
    // Setter wird NUR gesetzt, wenn explizit eine Setterin den Lead aufgenommen hat.
    // Niemals automatisch auf den Berater fallen (sonst werden VPs fälschlich als Setter eingetragen).
    setter: partial.setter || "",
    setterId: partial.setterId,
    qualZiel: partial.qualZiel,
    qualEinkommen: partial.qualEinkommen,
    qualEigenkapital: partial.qualEigenkapital,
    qualBeruflicheSituation: partial.qualBeruflicheSituation,
    reservierungsDatum: partial.reservierungsDatum,
    finanzierungsStatus: partial.finanzierungsStatus,
    notarTermin: partial.notarTermin,
    notarName: partial.notarName,
    einkuenfte: partial.einkuenfte || { ...DEFAULT_EINKUENFTE },
    ausgaben: partial.ausgaben || { ...DEFAULT_AUSGABEN },
  };

  if (isTestAccount()) {
    const kontakte = lsGetKontakte();
    kontakte.push(newKunde);
    lsSaveKontakte(kontakte);
  } else {
    const dbRow = kundeToDbRow(newKunde);
    // Ersteller-Tracking immer in meta persistieren.
    // Wenn der Aufrufer explizit erstelltVonId/Name übergibt (z. B. Foto-Upload → Erleta),
    // hat das Vorrang vor dem aktuell eingeloggten Nutzer.
    const explicitCreatorId = (partial as any).erstelltVonId as string | undefined;
    const explicitCreatorName = (partial as any).erstelltVonName as string | undefined;
    dbRow.meta = {
      ...(dbRow.meta || {}),
      erstelltVonId: explicitCreatorId || creatorId || null,
      erstelltVonName: explicitCreatorName || creatorName || null,
      erstelltAm: newKunde.erstellt_am,
    };
    // Optional: Kontakt-Typ-Felder vom Aufrufer in meta übernehmen
    const extraMeta = (partial as any).meta;
    // Die Kundensprache (kundenSprache, kundenSpracheGesetztAm/-Von) geht seit
    // dem 25.09.2026 bei jedem Anlegen mit. Sie ist kein Kontakt-Typ-Feld und
    // darf den Rückfall „eigen“ deshalb nicht verdrängen.
    const nurSprache = extraMeta && typeof extraMeta === "object"
      && Object.keys(extraMeta).every((k) => k.startsWith("kundenSprache"));
    if (extraMeta && typeof extraMeta === "object") {
      dbRow.meta = { ...dbRow.meta, ...extraMeta };
    }
    if (!extraMeta || typeof extraMeta !== "object" || nurSprache) {
      // Fallback ohne explizite Meta-Felder. Eigenkontakt nur, wenn jemand
      // für sich selbst anlegt (§ 7 Absatz 3, Freigabe vom 29.09.2026),
      // sonst Kontakt der Gesellschaft.
      if (!dbRow.meta.kontaktTyp) {
        dbRow.meta.kontaktTyp = kontaktTypBeimAnlegen(dbRow.meta.erstelltVonId, newKunde.zustaendig_id, newKunde.setter);
        dbRow.meta.herkunftKanal = dbRow.meta.herkunftKanal || "Manuell";
      }
    }
    await cacheInsert("kontakte", dbRow);
  }

  // Aktivität tracken: Kontakt angelegt
  try {
    const { addAktivitaet } = await import("./aktivitaetenStore");
    addAktivitaet({ kundeId: newKunde.id, art: "notiz", beschreibung: `Kontakt angelegt: ${newKunde.vorname} ${newKunde.nachname}`, von: creatorName || "System" });
  } catch { /* silent */ }

  // Auto-Anlage „Investment 1" — im Test-Modus (localStorage) hier explizit,
  // im echten Betrieb übernimmt das ein DB-Trigger auf public.kontakte.
  // Bestandskunden (Pre-Funnel) bleiben ausgenommen, damit sie nicht
  // versehentlich in „Beratungsgespräch" springen.
  if (isTestAccount() && newKunde.pipelineStufe !== "bestandsimport") {
    try {
      const { createInvestment } = await import("./investmentsStore");
      await createInvestment(newKunde.id, "Investment 1");
    } catch (err) { console.warn("Auto-Investment-Anlage (Testmodus) fehlgeschlagen", err); }
  }

  return newKunde;
}

/**
 * Massen-Import: viele Kontakte in wenigen Stapeln anlegen.
 *
 * `addKontakt` schickt pro Zeile eine eigene Anfrage. Bei 10.000 Zeilen sind
 * das 10.000 Roundtrips, das laeuft in einen Abbruch, bevor es fertig ist.
 * Hier gehen 500 Zeilen pro Insert raus, also 20 Anfragen statt 10.000.
 *
 * Die fortlaufende Kundennummer wird bewusst NICHT mitgeschickt. Sie kommt
 * aus der Sequenz `kontakt_more_id_seq` in der Datenbank. Im Browser
 * gerechnet gaebe es beim Stapel-Insert zwangslaeufig Doubletten.
 */
export const IMPORT_STAPEL_GROESSE = 500;

export interface ImportErgebnis {
  angelegt: number;
  fehler: number;
  meldungen: string[];
  importBatchId: string;
  /** Die tatsaechlich geschriebenen Datenbankzeilen, inklusive neuer IDs. */
  zeilen: any[];
}

export async function addKontakteBulk(
  zeilen: (Partial<KundeData> & { vorname: string; nachname: string })[],
  opts: {
    importBatchId: string;
    /** Zusatzfelder fuer meta, gelten fuer alle Zeilen. */
    metaBasis?: Record<string, any>;
    onFortschritt?: (fertig: number, gesamt: number) => void;
  },
): Promise<ImportErgebnis> {
  const ergebnis: ImportErgebnis = { angelegt: 0, fehler: 0, meldungen: [], importBatchId: opts.importBatchId, zeilen: [] };
  if (zeilen.length === 0) return ergebnis;

  // Im Testmodus laeuft alles ueber localStorage, dort ist der Einzelweg
  // schnell genug und die Sonderbehandlungen bleiben erhalten.
  if (isTestAccount()) {
    for (const zeile of zeilen) {
      try {
        await addKontakt(zeile);
        ergebnis.angelegt++;
      } catch (e: any) {
        ergebnis.fehler++;
        if (ergebnis.meldungen.length < 3) ergebnis.meldungen.push(e?.message || "Fehler");
      }
      opts.onFortschritt?.(ergebnis.angelegt + ergebnis.fehler, zeilen.length);
    }
    return ergebnis;
  }

  let creatorId: string | undefined;
  let creatorName: string | undefined;
  try {
    const { getCurrentUserId } = await import("./currentUser");
    creatorId = getCurrentUserId() || undefined;
    const profiles = cacheGet("profiles") as any[];
    creatorName = profiles?.find((p: any) => p.id === creatorId)?.name || undefined;
  } catch { /* ohne Zuordnung weiter */ }
  // Der Auslöser des Imports ist immer der zugewiesene Partner. Werte aus der
  // Datei (Spalten "Berater"/"Eigentümer") werden bewusst ignoriert, sonst
  // landen importierte Leads bei fremden Nutzern oder im Pool.
  if (!creatorId) {
    ergebnis.fehler = zeilen.length;
    ergebnis.meldungen.push("Kein angemeldeter Nutzer erkannt, Import abgebrochen.");
    return ergebnis;
  }
  const jetzt = new Date().toISOString();
  const dbZeilen = zeilen.map((partial) => {
    const kunde: KundeData = {
      id: crypto.randomUUID(),
      // Platzhalter, die Datenbank setzt die echte Nummer.
      moreId: 0,
      anrede: partial.anrede || "",
      vorname: partial.vorname,
      nachname: partial.nachname,
      email: partial.email || "",
      telefon: partial.telefon || "",
      geburtstag: partial.geburtstag || "",
      strasse: partial.strasse || "",
      hausnummer: partial.hausnummer || "",
      plz: partial.plz || "",
      ort: partial.ort || "",
      quelle: partial.quelle || "",
      berater: creatorName ?? "",
      zustaendig_id: creatorId,
      erstellt_am: partial.erstellt_am || jetzt,
      aktualisiert_am: jetzt,
      archiviert: false,
      status: partial.status || "neu",
      firma: partial.firma || "",
      position: partial.position || "",
      objekt: partial.objekt || "",
      kaufpreis: partial.kaufpreis || 0,
      finanzierbarkeit: partial.finanzierbarkeit || "",
      pipelineStufe: partial.pipelineStufe || "neuer_lead",
      leadTyp: partial.leadTyp,
      setter: "",
      qualZiel: partial.qualZiel,
      qualEinkommen: partial.qualEinkommen,
      qualEigenkapital: partial.qualEigenkapital,
      qualBeruflicheSituation: partial.qualBeruflicheSituation,
      einkuenfte: { ...DEFAULT_EINKUENFTE },
      ausgaben: { ...DEFAULT_AUSGABEN },
    };
    const row = kundeToDbRow(kunde);
    delete (row.meta as any).moreId;
    row.meta = {
      ...(row.meta || {}),
      ...(opts.metaBasis || {}),
      ...(((partial as any).meta && typeof (partial as any).meta === "object") ? (partial as any).meta : {}),
      importBatchId: opts.importBatchId,
      erstelltVonId: creatorId || null,
      erstelltVonName: creatorName || null,
      erstelltAm: kunde.erstellt_am,
    };
    if (!row.meta.kontaktTyp) row.meta.kontaktTyp = kontaktTypBeimAnlegen(creatorId, row.zustaendig_id, "");
    if (!row.zustaendig_id) delete row.zustaendig_id;
    return row;
  });

  const neueZeilen: any[] = [];
  // Waehrend des Laufs die eigenen Realtime-Ereignisse fuer kontakte und
  // investments (DB-Trigger legt je Kontakt eines an) aussetzen. Der
  // Flutschutz wuerde ohnehin greifen, aber der eigene Tab weiss es vorher
  // und muss gar nicht erst zaehlen.
  grosseOperationBeginnen(["kontakte", "investments"]);
  try {
    for (let i = 0; i < dbZeilen.length; i += IMPORT_STAPEL_GROESSE) {
      const stapel = dbZeilen.slice(i, i + IMPORT_STAPEL_GROESSE);
      const { data, error } = await supabase.from("kontakte").insert(stapel as any).select();
      if (error) {
        ergebnis.fehler += stapel.length;
        if (ergebnis.meldungen.length < 3) {
          ergebnis.meldungen.push(`Stapel ab Zeile ${i + 1}: ${error.message}`);
        }
      } else {
        const zurueck = data || [];
        neueZeilen.push(...zurueck);
        ergebnis.angelegt += zurueck.length;
      }
      opts.onFortschritt?.(Math.min(i + IMPORT_STAPEL_GROESSE, dbZeilen.length), dbZeilen.length);
    }

    // Cache einmal am Ende ergaenzen, nicht pro Zeile. Ein Rundruf pro Kontakt
    // wuerde die Oberflaeche bei mehreren tausend Zeilen einfrieren.
    if (neueZeilen.length > 0) {
      cacheSet("kontakte", [...neueZeilen, ...cacheGet("kontakte")]);
    }
  } finally {
    // Auch wenn der Import mittendrin scheitert, MUSS das Aussetzen wieder
    // aufgehoben werden. `grosseOperationBeenden` laedt beide Tabellen genau
    // einmal neu und benachrichtigt die Listener; damit landen auch die vom
    // DB-Trigger erzeugten Investments im Cache.
    await grosseOperationBeenden(["kontakte", "investments"]);
  }
  ergebnis.zeilen = neueZeilen;
  return ergebnis;
}

/**
 * Nimmt einen kompletten CSV-Import zurueck: Alle Kontakte mit dieser
 * Stapel-Kennung wandern in den Papierkorb (weiches Loeschen, wie beim
 * normalen Einzel-Loeschen) und bleiben dort wiederherstellbar.
 *
 * Die automatisch erzeugten Investments bleiben wie beim Einzel-Loeschen
 * unangetastet: Die Ansichten haengen an `getKontakte()` (filtert geloeschte
 * heraus), damit sind die Investments unsichtbar und kommen bei einer
 * Wiederherstellung des Kontakts wieder mit.
 */
export async function importZuruecknehmen(
  importBatchId: string,
  opts: {
    geloeschtVon?: string;
    geloeschtVonName?: string;
    onFortschritt?: (fertig: number, gesamt: number) => void;
  } = {},
): Promise<{ verschoben: number; fehler: number }> {
  if (isTestAccount()) {
    const kontakte = lsGetKontakte();
    let verschoben = 0;
    for (const k of kontakte) {
      if ((k as any).meta?.importBatchId === importBatchId && !(k as any).geloescht) {
        (k as any).geloescht = true;
        (k as any).geloeschtAm = new Date().toISOString();
        (k as any).geloeschtGrund = "Import zurückgenommen";
        verschoben++;
      }
    }
    lsSaveKontakte(kontakte);
    return { verschoben, fehler: 0 };
  }

  // Betroffene IDs seitenweise direkt aus der Datenbank holen. Der Cache
  // reicht hier nicht: Nach einem Neuladen der Seite oder einem Teilausfall
  // koennte er unvollstaendig sein, und dann blieben Reste stehen.
  const ids: string[] = [];
  const SEITE = 1000;
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await supabase
      .from("kontakte")
      .select("id")
      .eq("meta->>importBatchId", importBatchId)
      .or("geloescht.is.null,geloescht.eq.false")
      .order("id", { ascending: true })
      .range(von, von + SEITE - 1);
    if (error) throw new Error(error.message);
    ids.push(...(data || []).map((r: any) => r.id));
    if (!data || data.length < SEITE) break;
  }

  const ergebnis = { verschoben: 0, fehler: 0 };
  if (ids.length === 0) return ergebnis;

  // Wer zurueckgenommen hat, landet wie beim Einzel-Loeschen im Papierkorb.
  let geloeschtVon = opts.geloeschtVon;
  let geloeschtVonName = opts.geloeschtVonName;
  if (!geloeschtVon) {
    try {
      const { getCurrentUserId } = await import("./currentUser");
      geloeschtVon = getCurrentUserId() || undefined;
      const profiles = cacheGet("profiles") as any[];
      geloeschtVonName = geloeschtVonName
        || profiles?.find((p: any) => p.id === geloeschtVon)?.name
        || undefined;
    } catch { /* ohne Zuordnung weiter */ }
  }

  // Gleicher Flutschutz wie beim Import: eigene Realtime-Ereignisse aussetzen,
  // am Ende einmal neu laden (auch im Fehlerfall, deshalb try/finally).
  grosseOperationBeginnen(["kontakte"]);
  try {
    const jetzt = new Date().toISOString();
    for (let i = 0; i < ids.length; i += IMPORT_STAPEL_GROESSE) {
      const stapel = ids.slice(i, i + IMPORT_STAPEL_GROESSE);
      const { error } = await supabase
        .from("kontakte")
        .update({
          geloescht: true,
          geloescht_am: jetzt,
          geloescht_von: geloeschtVon || null,
          geloescht_von_name: geloeschtVonName || null,
          geloescht_grund: "Import zurückgenommen",
        } as any)
        .in("id", stapel);
      if (error) {
        ergebnis.fehler += stapel.length;
        console.warn("Import zuruecknehmen: Stapel fehlgeschlagen:", error.message);
      } else {
        ergebnis.verschoben += stapel.length;
      }
      opts.onFortschritt?.(Math.min(i + IMPORT_STAPEL_GROESSE, ids.length), ids.length);
    }
  } finally {
    await grosseOperationBeenden(["kontakte"]);
  }
  return ergebnis;
}

/**
 * Leitet den letzten CSV-Import aus den Daten selbst her: Die Stapel-Kennung
 * steht an jedem importierten Kontakt in `meta.importBatchId`. Damit
 * funktioniert "Diesen Import zuruecknehmen" auch ohne den Browser-Merkzettel,
 * etwa von einem anderen Rechner aus oder nach geleertem Browser-Speicher.
 * Bereits in den Papierkorb verschobene Kontakte zaehlen nicht mit.
 */
export function letzterImportAusDaten(): { batchId: string; anzahl: number; datum: string } | null {
  const rohzeilen: any[] = isTestAccount() ? lsGetKontakte() : cacheGet("kontakte");
  const stapel = new Map<string, { anzahl: number; datum: string }>();
  for (const zeile of rohzeilen || []) {
    const batchId = zeile?.meta?.importBatchId;
    if (typeof batchId !== "string" || !batchId || zeile.geloescht) continue;
    const datum = zeile.erstellt_am || "";
    const bisher = stapel.get(batchId);
    if (!bisher) stapel.set(batchId, { anzahl: 1, datum });
    else {
      bisher.anzahl++;
      if (datum > bisher.datum) bisher.datum = datum;
    }
  }
  let neuester: { batchId: string; anzahl: number; datum: string } | null = null;
  stapel.forEach((wert, batchId) => {
    if (!neuester || wert.datum > neuester.datum) neuester = { batchId, ...wert };
  });
  return neuester;
}

/**
 * Schreibt einen Kontakt, sofort im Zwischenspeicher, danach in der Datenbank.
 *
 * Die meisten Aufrufer warten nicht, und das bleibt so. Wer wissen muss, ob
 * die Datenbank den Wert angenommen hat, wartet auf das Versprechen: Es wird
 * bei Erfolg erfuellt und verwirft sich, wenn die Datenbank ablehnt (etwa die
 * Zeilensicherheit). Seit dem 28.09.2026, weil die Rueckgabe an die Zentrale
 * sonst „zurückgegeben“ meldete, waehrend die Datenbank sie abgelehnt hatte.
 */
/**
 * Schreibt nur, was sich gegenüber dem Zwischenspeicher geändert hat: die
 * geänderten Spalten direkt, die geänderten meta-Schlüssel über
 * `merge_kontakt_meta` (H11, 04.10.2026). Vorher ging das ganze meta aus dem
 * Speicher zurück und konnte frischere Werte aus einem anderen Tab, einer
 * Function oder dem Portal überschreiben. Die Anzeige zeigt wie bisher sofort
 * den neuen Stand; scheitert ein Teil, sagt es die Meldung, siehe `cacheZeileSchreiben`.
 */
function kontaktZeileSchreiben(id: string, dbUpdates: Record<string, any>): Promise<boolean> {
  const row: Record<string, any> = cacheGet("kontakte").find((r: any) => r.id === id) || {};
  const { meta: neuMeta, ...spalten } = dbUpdates;
  const geaendert: Record<string, any> = {};
  for (const [k, v] of Object.entries(spalten)) {
    if (v === undefined) continue;
    if (!gleicherWert(v, row[k])) geaendert[k] = v;
  }
  // Unterobjekte nur mit den geänderten Blättern, merge_kontakt_meta führt tief zusammen.
  const patch = metaUnterschied(row.meta, neuMeta, { tief: true });
  // Erst Spalten, dann meta; nichts wird zurückgeschrieben (cacheZeileSchreiben).
  return cacheZeileSchreiben("kontakte", id, geaendert, patch);
}

export function updateKontakt(id: string, updates: Partial<KundeData>): Promise<boolean> {
  if (isTestAccount()) {
    const kontakte = lsGetKontakte();
    const idx = kontakte.findIndex(k => k.id === id);
    if (idx >= 0) {
      kontakte[idx] = { ...kontakte[idx], ...updates };
      lsSaveKontakte(kontakte);
    }
    return Promise.resolve(idx >= 0);
  }

  // For DB: merge updates into the existing row, rebuilding meta
  const existing = getKontaktById(id);
  if (!existing) return Promise.resolve(false);
  const merged = { ...existing, ...updates };
  const dbRow = kundeToDbRow(merged);
  // Remove id from updates sent to DB
  const { id: _id, ...dbUpdates } = dbRow;
  // ⚠️ Schutz vor ungewollter Auto-Zuweisung:
  // Nur die Ownership-Felder (`zustaendig_id`, `berater`) mitschicken, wenn sie
  // explizit im Patch enthalten sind. Andernfalls würde ein Update mit einem
  // veralteten Cache-Snapshot eine frisch geänderte Zuständigkeit (z. B. durch
  // einen anderen Admin) überschreiben und den Lead auf den alten VP zurücksetzen.
  if (!("zustaendig_id" in updates)) delete (dbUpdates as any).zustaendig_id;
  if (!("berater" in updates)) delete (dbUpdates as any).berater;
  const gespeichert = kontaktZeileSchreiben(id, dbUpdates);

  // Empfehlungsstatus abgleichen, wenn sich die Pipeline aendern kann. Neben
  // pipelineStufe zaehlen auch status und archiviert, weil die effektive Stufe
  // daraus abgeleitet wird (verloren/archiviert schlagen alles).
  const rawMeta = (existing as any).meta || (cacheGet("kontakte").find((r: any) => r.id === id) as any)?.meta;
  const empfehlungId = rawMeta?.empfehlungId;
  const pipelineRelevant = updates.pipelineStufe !== undefined
    || updates.status !== undefined
    || updates.archiviert !== undefined;
  if (pipelineRelevant && empfehlungId) {
    try {
      // Massgeblich ist die EFFEKTIVE Stufe (Investment gewinnt, verloren
      // gewinnt), nicht der rohe meta-Wert.
      const effektiveStufe = getEffectivePipelineStufe(merged);
      syncEmpfehlungFromPipeline({ empfehlungId }, effektiveStufe);
    } catch (fehler) {
      // Der Sync darf das Speichern des Kontakts nicht verhindern, aber ein
      // Fehlschlag soll sichtbar sein (frueher hat ein leerer catch den toten
      // require-Aufruf jahrelang verborgen).
      console.error("Empfehlungs-Sync fehlgeschlagen:", fehler);
    }
  }

  // Auto-Generierung der Follow-Up-Ketten bei Pipeline-Stufen-Wechsel.
  // Der fruehere require-Aufruf existierte im Vite/ESM-Bundle nicht, der
  // leere catch hat das jahrelang verborgen; jetzt statischer Import (oben).
  if (updates.pipelineStufe && updates.pipelineStufe !== existing.pipelineStufe) {
    try {
      // 1) Alte automatische, noch offene FUs aus früheren Stufen stornieren
      cancelStaleAutoFollowUps(id, updates.pipelineStufe);
      // 2) Nur OFFENE auto-FUs der neuen Stufe blockieren ein Re-Seeding
      const offeneNeueStufe = getFollowUpsByKunde(id).filter((f) =>
        f.automatisch
          && f.pipelineStufe === updates.pipelineStufe
          && (f.status === "offen" || f.status === "ueberfallig")
      );
      if (offeneNeueStufe.length === 0) {
        const name = `${merged.vorname || ""} ${merged.nachname || ""}`.trim();
        generateFollowUpsFromKette(id, name, merged.berater || "", updates.pipelineStufe);
      }
    } catch (fehler) {
      // Die Follow-Up-Automatik darf das Speichern nicht verhindern, ein
      // Fehlschlag soll aber sichtbar sein statt still zu verschwinden.
      console.error("Follow-Up-Automatik fehlgeschlagen:", fehler);
    }
  }

  return gespeichert;
}

export interface DeleteKontaktOptions {
  /** Wenn true: Hartlöschung inkl. Cascade (alle abhängigen Daten). Wenn false (default): Soft-Delete – Kunde wird in Papierkorb verschoben und ist wiederherstellbar. */
  dsgvo?: boolean;
  grund?: string;
  geloeschtVon?: string;
  geloeschtVonName?: string;
}

/** Standardlöschung: Soft-Delete in Papierkorb. Bei dsgvo=true: Hartlöschung. */
export async function deleteKontakt(id: string, options: DeleteKontaktOptions = {}) {
  const { dsgvo = false, grund, geloeschtVon, geloeschtVonName } = options;

  // Eigene Inbox-Tasks für diesen Kunden direkt entfernen (verhindert verwaiste
  // Tasks im eigenen User-Setting). Inbox-Tasks anderer User werden vom
  // zentralen Cleanup in useInvestmentInboxTriggers beim nächsten Login entfernt.
  try {
    const { getInboxTasks, setInboxTasks } = await import("@/lib/aktivitaetenStore");
    const tasks = getInboxTasks();
    const cleaned = tasks.filter((t) => t.kundeId !== id);
    if (cleaned.length !== tasks.length) setInboxTasks(cleaned);
  } catch { /* ignore */ }

  // Test-Account: keine Persistenz, einfach entfernen
  if (isTestAccount()) {
    if (dsgvo) {
      const kontakte = lsGetKontakte();
      lsSaveKontakte(kontakte.filter(k => k.id !== id));
      return;
    }
    // Soft-Delete: nur markieren
    const kontakte = lsGetKontakte();
    const idx = kontakte.findIndex(k => k.id === id);
    if (idx >= 0) {
      (kontakte[idx] as any).geloescht = true;
      (kontakte[idx] as any).geloeschtAm = new Date().toISOString();
      (kontakte[idx] as any).geloeschtVon = geloeschtVon;
      (kontakte[idx] as any).geloeschtVonName = geloeschtVonName;
      (kontakte[idx] as any).geloeschtGrund = grund;
      lsSaveKontakte(kontakte);
    }
    return;
  }

  if (dsgvo) {
    // ── DSGVO: Hartlöschung mit Cascade ──
    await freeWohnungenForKunde(id);
    try {
      const cleanup = async (table: string, predicate: (r: any) => boolean) => {
        const rows = cacheGet(table).filter(predicate);
        for (const r of rows) {
          try { await cacheDelete(table, r.id); } catch { /* ignore */ }
        }
      };
      await Promise.all([
        cleanup("empfehlungsprogramme", (r) => (r.meta?.kontaktId === id) || (r.meta?.investmentId && cacheGet("investments").some((i: any) => i.id === r.meta.investmentId && i.kunde_id === id))),
        cleanup("empfehlungen", (r) => (r.meta?.kontaktId === id)),
        cleanup("aktivitaeten", (r) => r.kunde_id === id),
        cleanup("follow_ups", (r) => r.kunde_id === id),
        cleanup("investments", (r) => r.kunde_id === id),
        cleanup("finanzierungen", (r) => {
          const invs = cacheGet("investments").filter((i: any) => i.kunde_id === id).map((i: any) => i.id);
          return invs.includes(r.kunde_id);
        }),
        cleanup("kunden_bewertungen", (r) => r.kunde_id === id),
        cleanup("aufgaben", (r) => r.kontakt_id === id),
        cleanup("anrufe", (r) => r.kontakt_id === id),
        cleanup("emails", (r) => r.kontakt_id === id),
        cleanup("pipeline", (r) => r.kontakt_id === id),
      ]);
    } catch (err) {
      console.error("Cleanup beim DSGVO-Löschen des Kontakts fehlgeschlagen:", err);
    }
    await cacheDelete("kontakte", id);
    return;
  }

  // ── Normale Löschung: Soft-Delete ──
  // Wir setzen nur Flags. Abhängige Daten bleiben erhalten für Wiederherstellung.
  // Kunde wird aus Pipeline/Listen automatisch entfernt (siehe getKontakte filter).
  // Wohnungs-Reservierungen werden ebenfalls vorerst gehalten – kann admin manuell freigeben.
  await cacheUpdate("kontakte", id, {
    geloescht: true,
    geloescht_am: new Date().toISOString(),
    geloescht_von: geloeschtVon || null,
    geloescht_von_name: geloeschtVonName || null,
    geloescht_grund: grund || null,
  } as any);
}

/** Wiederherstellung eines soft-deleted Kontakts */
export async function restoreKontakt(
  id: string,
  assignTo?: { userId: string; name: string }
) {
  if (isTestAccount()) {
    const kontakte = lsGetKontakte();
    const idx = kontakte.findIndex(k => k.id === id);
    if (idx >= 0) {
      delete (kontakte[idx] as any).geloescht;
      delete (kontakte[idx] as any).geloeschtAm;
      delete (kontakte[idx] as any).geloeschtVon;
      delete (kontakte[idx] as any).geloeschtVonName;
      delete (kontakte[idx] as any).geloeschtGrund;
      // Auch offene Löschanfrage zurücksetzen
      const meta = (kontakte[idx] as any).meta || {};
      delete meta.deleteRequested;
      delete meta.deleteRequestedBy;
      delete meta.deleteRequestedAt;
      delete meta.deleteGrund;
      delete meta.deleteDsgvo;
      (kontakte[idx] as any).meta = meta;
      if (assignTo) {
        (kontakte[idx] as any).berater = assignTo.name;
        (kontakte[idx] as any).zustaendigId = assignTo.userId;
      }
      lsSaveKontakte(kontakte);
    }
    return;
  }
  const patch: any = {
    geloescht: false,
    geloescht_am: null,
    geloescht_von: null,
    geloescht_von_name: null,
    geloescht_grund: null,
  };
  if (assignTo) {
    patch.berater = assignTo.name;
    patch.zustaendig_id = assignTo.userId;
  }
  await cacheUpdate("kontakte", id, patch);

  // Offene Löschanfrage atomar aus meta entfernen (null = key wird entfernt by merge_kontakt_meta)
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.rpc("merge_kontakt_meta", {
      _kontakt_id: id,
      _updates: {
        deleteRequested: null,
        deleteRequestedBy: null,
        deleteRequestedAt: null,
        deleteGrund: null,
        deleteDsgvo: null,
      },
    });
    if (error) {
      console.error("restoreKontakt: merge_kontakt_meta error:", error);
    } else if (data) {
      const arr = cacheGet("kontakte");
      const idx = arr.findIndex((r: any) => r.id === id);
      if (idx >= 0) arr[idx] = { ...arr[idx], meta: data };
    }
  } catch (e) {
    console.error("restoreKontakt: meta cleanup failed:", e);
  }
}

/** Hart-Löschung eines bereits soft-deleted Kontakts (manuell aus Papierkorb oder Auto-Purge) */
export async function purgeKontakt(id: string) {
  return deleteKontakt(id, { dsgvo: true });
}


export async function deleteKontakte(ids: string[], options: DeleteKontaktOptions = {}) {
  for (const id of ids) {
    await deleteKontakt(id, options);
  }
}

