import { supabase } from "@/integrations/supabase/client";
import { normalisiereSprache, type Sprache } from "../../supabase/functions/_shared/kunden-sprache.ts";
import { exposePayloadZuObjekt, ansprechpartnerAusAntwort } from "@/lib/exposePublicDaten";
import { functionNichtAusgerolltText } from "@/lib/edgeFehler";
import type { ObjektData } from "@/lib/objekteStore";
import type { Person } from "@/lib/exposeInhalt";
import type { EinheitUnterlage } from "@/lib/objektUnterlagenRegeln";
import type {
  DokumentVerweis, EinstiegZustand, KundenDokument, KundenansichtAntwort, Struktur, Zurueckgehalten,
} from "../../supabase/functions/get-kundenansicht/antwort.ts";

export type { EinstiegZustand, KundenDokument, Struktur, Zurueckgehalten };

/**
 * Die Kundenansicht („Objektübersicht“) im Browser: laden, umbauen, Dateien
 * holen.
 *
 * Beide Seiten nehmen diese Datei, der Kundenlink (`KundenansichtPublic`) und
 * die Vorschau im CRM (`KundenansichtVorschau`). Die Daten kommen in beiden
 * Fällen von `get-kundenansicht` und laufen dort durch die Positivliste. Die
 * Vorschau liest bewusst NICHT aus dem Zwischenspeicher des CRM: Sonst sähe
 * man im Termin mehr, als der Kunde später bekommt.
 */

/** Wie die Seite geladen wird: über den Schlüssel des Kunden oder als Vorschau im CRM. */
export type KundenansichtZugang =
  | { art: "link"; token: string }
  | { art: "vorschau"; objektId: string; wohnungId: string | null; investmentId: string | null; wohnungAuswahl?: string[] | null };

export interface KundenansichtDaten {
  struktur: Struktur;
  /** Das Objekt; `wohnungen` sind genau die, die der Kunde sieht. */
  objekt: ObjektData;
  /** Die Zeilen der Einheiten wie geliefert, für die Anbieterangaben aus `meta`. */
  einheitenRoh: Record<string, Record<string, unknown>>;
  /** Die Wohnung, die für genau diesen Kunden reserviert ist. */
  fuerDichId: string | null;
  einstieg: { wohnungId: string | null; zustand: EinstiegZustand };
  dokumente: KundenDokument[];
  zurueckgehalten: Zurueckgehalten[];
  partner?: Person;
  stand: Date;
  /** Die Sprache des Kunden am Link, vom Server (Kundensprache, Etappe 3). Fehlt ohne Kontakt oder bei alter Function. */
  sprache?: Sprache;
}

export type LadeErgebnis =
  | { art: "ok"; daten: KundenansichtDaten }
  /** Das Haus oder die eine Wohnung ist vergeben, es gibt nichts mehr zu zeigen. */
  | { art: "vergeben"; partner?: Person; sprache?: Sprache }
  | { art: "abgelaufen"; partner?: Person; sprache?: Sprache }
  | { art: "nicht_gefunden" }
  /** Nur in der Vorschau: Anmeldung fehlt, Rolle fehlt oder das Objekt ist ausgeblendet. */
  | { art: "hinweis"; meldung: string }
  | { art: "fehler" };

const KUNDENANSICHT_FUNCTION = "get-kundenansicht";
const ENDPUNKT = () => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${KUNDENANSICHT_FUNCTION}`;

/** Die Kopfzeilen: immer der öffentliche Schlüssel, in der Vorschau dazu die Anmeldung. */
async function kopfzeilen(zugang: KundenansichtZugang): Promise<Record<string, string>> {
  const kopf: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
  if (zugang.art === "vorschau") {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) kopf.Authorization = `Bearer ${token}`;
  }
  return kopf;
}

function rumpf(zugang: KundenansichtZugang): Record<string, unknown> {
  return zugang.art === "link"
    ? { token: zugang.token }
    : {
      objektId: zugang.objektId, wohnungId: zugang.wohnungId, investmentId: zugang.investmentId,
      ...(zugang.wohnungAuswahl ? { wohnungAuswahl: zugang.wohnungAuswahl } : {}),
    };
}

/**
 * Die Antwort in die Form bringen, mit der die Bausteine des CRM rechnen.
 * Derselbe Umbau wie beim öffentlichen Exposé (`exposePayloadZuObjekt`), er
 * greift nie auf den Zwischenspeicher zu.
 */
export function antwortZuDaten(a: KundenansichtAntwort): KundenansichtDaten {
  const wohnungen = Array.isArray(a.wohnungen) ? a.wohnungen : [];
  const objekt = exposePayloadZuObjekt({ objekt: a.objekt, bilder: a.bilder || [], dokumente: [], wohnungen });
  const einheitenRoh: Record<string, Record<string, unknown>> = {};
  for (const w of wohnungen) if (typeof w.id === "string") einheitenRoh[w.id] = w;
  const fuerDich = wohnungen.find((w) => w.fuerDich === true);
  const stand = new Date(a.stand);
  return {
    struktur: a.struktur,
    objekt,
    einheitenRoh,
    fuerDichId: typeof fuerDich?.id === "string" ? fuerDich.id : null,
    einstieg: a.einstieg ?? { wohnungId: null, zustand: "keiner" },
    dokumente: Array.isArray(a.dokumente) ? a.dokumente : [],
    zurueckgehalten: Array.isArray(a.zurueckgehalten) ? a.zurueckgehalten : [],
    partner: ansprechpartnerAusAntwort(a.ansprechpartner),
    stand: Number.isNaN(stand.getTime()) ? new Date() : stand,
    ...(normalisiereSprache(a.sprache) ? { sprache: normalisiereSprache(a.sprache)! } : {}),
  };
}

/**
 * Die Kundenansicht laden. `aufruf` meldet das erste Laden des Kundenlinks,
 * nur das zählt. Die Vorschau zählt nie, das entscheidet der Server.
 */
export async function ladeKundenansicht(zugang: KundenansichtZugang, optionen: { aufruf?: boolean; signal?: AbortSignal } = {}): Promise<LadeErgebnis> {
  let antwort: Response;
  try {
    antwort = await fetch(ENDPUNKT(), {
      method: "POST",
      headers: await kopfzeilen(zugang),
      body: JSON.stringify({ aktion: "laden", ...rumpf(zugang), ...(zugang.art === "link" && optionen.aufruf ? { aufruf: true } : {}) }),
      cache: "no-store",
      signal: optionen.signal,
    });
  } catch (e) {
    if (optionen.signal?.aborted) throw e;
    return { art: "fehler" };
  }
  let daten: Record<string, unknown> | null = null;
  try {
    const roh = await antwort.json();
    daten = roh && typeof roh === "object" ? (roh as Record<string, unknown>) : {};
  } catch {
    daten = null;
  }
  /*
   * Eine 404 ohne `error` kommt nicht von `get-kundenansicht`, sondern von
   * Supabase: Die Function ist nicht ausgerollt. Der Link ist dann nicht
   * ungültig, die Seite lädt nur gerade nicht. Der Kunde bekommt deshalb
   * „Erneut laden“ statt „nicht mehr gültig“, die Vorschau im CRM den Grund.
   */
  if (antwort.status === 404 && typeof daten?.error !== "string") {
    return zugang.art === "vorschau" ? { art: "hinweis", meldung: functionNichtAusgerolltText(KUNDENANSICHT_FUNCTION) } : { art: "fehler" };
  }
  if (!daten) return { art: "fehler" };
  const sprache = normalisiereSprache(daten.sprache) ?? undefined;
  if (daten.abgelaufen === true) return { art: "abgelaufen", partner: ansprechpartnerAusAntwort(daten.ansprechpartner), sprache };
  if (antwort.status === 404) return { art: "nicht_gefunden" };
  if (zugang.art === "vorschau" && [401, 403, 409].includes(antwort.status)) {
    return { art: "hinweis", meldung: typeof daten.error === "string" ? daten.error : "Die Vorschau ist gerade nicht möglich." };
  }
  if (!antwort.ok) return { art: "fehler" };
  if (daten.vergeben === true) return { art: "vergeben", partner: ansprechpartnerAusAntwort(daten.ansprechpartner), sprache };
  if (daten.art !== "objektuebersicht" || !daten.objekt) return { art: "fehler" };
  return { art: "ok", daten: antwortZuDaten(daten as unknown as KundenansichtAntwort) };
}

/**
 * Die befristete Adresse einer Unterlage, erst beim Anklicken. Der Server
 * prüft Schlüssel, Wohnung und Ampel noch einmal. `null`, wenn es die Datei
 * nicht (mehr) gibt.
 */
export async function ladeDateiAdresse(zugang: KundenansichtZugang, dokument: DokumentVerweis): Promise<string | null> {
  try {
    const antwort = await fetch(ENDPUNKT(), {
      method: "POST",
      headers: await kopfzeilen(zugang),
      body: JSON.stringify({ aktion: "datei", ...rumpf(zugang), dokument }),
      cache: "no-store",
    });
    if (!antwort.ok) return null;
    const daten = (await antwort.json()) as { url?: unknown };
    return typeof daten.url === "string" && /^https:\/\//i.test(daten.url) ? daten.url : null;
  } catch {
    return null;
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Unterlagen für die Dokumentenansicht
 * ──────────────────────────────────────────────────────────────────────── */

/** Die eindeutige Kennung einer Unterlage in der Liste: Bereich, Wohnung, Kennung. */
export function dokumentSchluessel(d: Pick<KundenDokument, "bereich" | "wohnungId" | "id">): string {
  return `${d.bereich === "objekt" ? "o" : "w"}~${d.wohnungId ?? ""}~${d.id}`;
}

/**
 * Eine Unterlage als Zeile für `DokumenteAnsicht` im Kundenmodus.
 *
 * Eine Adresse gibt es bewusst nicht. An ihrer Stelle steht ein Platzhalter
 * mit der Dateiendung, daran wählt die Liste das Symbol. Die echte Adresse
 * holt `adresseLaden` erst beim Anklicken, über die Kennung.
 *
 * Freigabe und Schwärzung reisen mit, weil die Ansicht im Kundenmodus die
 * Ampel noch einmal prüft. Der Server hat sie da schon geprüft.
 */
export function alsUnterlage(d: KundenDokument): EinheitUnterlage {
  const schluessel = dokumentSchluessel(d);
  return {
    id: schluessel,
    name: d.name,
    url: `kundenansicht:${schluessel}${d.endung ? `.${d.endung}` : ""}`,
    art: d.bereich === "objekt" ? "Objektunterlagen" : "Wohnungsunterlagen",
    kundeSieht: true,
    tabelle: d.bereich === "objekt" ? "objekt_dokumente" : "wohnungs_dokumente",
    ...(d.investagonKategorie ? { investagonKategorie: d.investagonKategorie } : {}),
    kundenFreigabe: d.kundenFreigabe ?? null,
    geschwaerzt: d.geschwaerzt === true,
  };
}

/** Die Unterlagen des Hauses. */
export function hausUnterlagen(dokumente: KundenDokument[]): KundenDokument[] {
  return dokumente.filter((d) => d.bereich === "objekt");
}

/** Die Unterlagen genau einer Wohnung. */
export function wohnungsUnterlagen(dokumente: KundenDokument[], wohnungId: string): KundenDokument[] {
  return dokumente.filter((d) => d.bereich === "wohnung" && d.wohnungId === wohnungId);
}

/**
 * Hält der Server in diesem Bereich Mietvertrag oder Grundbuch zurück? Dann
 * sagt die Dokumentenansicht, dass der Ansprechpartner sie persönlich gibt.
 * Namen kennt die Seite dafür nicht, nur dieses Kennzeichen.
 */
export function rotZurueckgehalten(liste: Zurueckgehalten[], bereich: "objekt" | "wohnung", wohnungId: string | null = null): boolean {
  return liste.some((z) => z.rot && z.bereich === bereich && (bereich === "objekt" || z.wohnungId === wohnungId));
}
