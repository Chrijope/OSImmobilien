/**
 * Zugriff auf die echte Investagon-API.
 *
 * Ersetzt die abgeschriebene Zwischenlösung in `daten.ts`. Die Zwischenlösung
 * ist nur explizit nutzbar; API-Fehler lösen keinen Ersatzimport aus.
 *
 * Zwei Unbekannte sind bewusst nachgiebig behandelt:
 *
 *   Der Kopf für die Anmeldung. Investagon nimmt je nach Zugang `Bearer`,
 *   `X-AUTH-TOKEN` oder `X-API-KEY`. Welcher gilt, probiert `holeJson` einmal
 *   aus und merkt sich den, der durchkommt. Das kostet beim ersten Aufruf
 *   höchstens zwei zusätzliche Anfragen und erspart eine Fehlkonfiguration,
 *   die sonst wie fehlende Rechte aussähe.
 *
 *   Die Feldnamen. Die Antwort wird über Aliaslisten gelesen, nicht über eine
 *   festgeschriebene Form. Ein umbenanntes Feld lässt dann einen Wert leer,
 *   statt den ganzen Import abzubrechen.
 */

const STANDARD_BASIS = "https://api.investagon.com";

function saubereBasis(wert: string | undefined | null): string {
  return (wert || "").trim().replace(/\/+$/, "");
}

export interface ApiZugang {
  token: string;
  orgId: string;
  /** Eigene Endpunkt-URL des Zugangs. Leer = Standard-Investagon-API. */
  basis: string;
  /**
   * Der Bautraeger im Klartext, fuer Protokoll und Fehlermeldungen.
   *
   * Vorher stand dort "Zugang 3", also die Position in der Liste. Zwei
   * Probleme: Man musste im Quelltext nachsehen, welcher Bautraeger gemeint
   * ist, und beim Entfernen eines Zugangs rutschten alle anderen eine Nummer
   * hoch, sodass jedes aeltere Protokoll auf den Falschen zeigte. Christian
   * hat am 16.09.2026 gefragt, warum Einheiten fehlen; die Antwort stand im
   * Protokoll, war aber nicht lesbar.
   */
  name: string;
  /** Das Namenskuerzel der Secrets, also "" , "_2" bis "_5". */
  slot: string;
  /** Der Platz als Zahl, also 1 bis 6. Fuer Protokoll und Objekt-Meta. */
  platz: number;
}

/** Wer auf welchem Platz liegt. Reihenfolge wie in `zugaenge`. */
const BAUTRAEGER: Record<string, string> = {
  "": "Lehner",
  "_2": "IGC",
  "_3": "Erfolg mit...",
  "_4": "Immoheld",
  "_5": "Solidum",
  "_6": "OS Immobilien (eigener Bestand)",
};

/**
 * Alle hinterlegten Organisationen, eine je Bautraeger.
 *
 * Der erste Zugang heisst INVESTAGON_API_TOKEN ohne Nummer, weitere haengen
 * _2 bis _5 an. Luecken sind erlaubt: Wer nur _1 und _3 pflegt, bekommt beide.
 * Fuenf ist bewusst mehr als heute gebraucht wird, damit ein neuer Bautraeger
 * nur zwei Secrets braucht und keinen neuen Rollout.
 *
 * Feste Belegung der Slots (bitte beim Eintragen der Secrets einhalten):
 *   Slot 1 (ohne Nummer) = Lehner        (Token + Org-ID)
 *   Slot 2 (_2)          = IGC           (Token + eigene Endpunkt-URL, keine Org-ID)
 *   Slot 3 (_3)          = Erfolg mit... (Token + Org-ID)
 *   Slot 4 (_4)          = Immoheld      (Token + Org-ID)
 *   Slot 5 (_5)          = Solidum       (Token + Org-ID)
 *   Slot 6 (_6)          = OS Immobilien     (Token + Org-ID), der eigene Bestand
 *
 * Slot 6 kam am 16.09.2026 dazu. Anlass: In der Investagon-Organisation von
 * OS Immobilien stehen die Projekte der Bautraeger ohnehin nebeneinander, auch die
 * von Lehner und Solidum, deren eigene Zugaenge abgewiesen werden, und
 * zusaetzlich die von FMD Invest und Dinglreiter Heise, fuer die es gar keinen
 * Platz gibt. Der eigene Zugang fehlte als einziger. Ob er die Fremdzugaenge
 * ueberfluessig macht, zeigt der erste Lauf: Das Protokoll nennt je Zugang die
 * gelieferte Menge.
 *
 * Je Slot sind drei Secrets moeglich, gebraucht wird immer nur der Token:
 *   INVESTAGON_API_TOKEN[_n]  Pflicht
 *   INVESTAGON_ORG_ID[_n]     optional, nur wenn der Zugang eine Org-ID hat
 *   INVESTAGON_API_BASE[_n]   optional, eigene Endpunkt-URL des Bautraegers
 *                             (z. B. bei IGC), sonst api.investagon.com
 */
export function zugaenge(
  env: { get(name: string): string | undefined },
): ApiZugang[] {
  const liste: ApiZugang[] = [];
  for (const nr of ["", "_2", "_3", "_4", "_5", "_6"]) {
    const token = env.get(`INVESTAGON_API_TOKEN${nr}`);
    if (!token) continue;
    liste.push({
      token: token.trim(),
      orgId: (env.get(`INVESTAGON_ORG_ID${nr}`) || "").trim(),
      basis: saubereBasis(env.get(`INVESTAGON_API_BASE${nr}`)) ||
        saubereBasis(env.get("INVESTAGON_API_BASE")) || STANDARD_BASIS,
      name: BAUTRAEGER[nr] || `Unbekannt${nr}`,
      slot: nr,
      platz: nr ? Number(nr.slice(1)) : 1,
    });
  }
  return liste;
}

type KopfArt = "bearer" | "auth-token" | "api-key";
const KOPF_ARTEN: KopfArt[] = ["bearer", "auth-token", "api-key"];

/**
 * Die Organisationskennung an die Adresse haengen.
 *
 * Sie gehoert dorthin und nicht in eine Kopfzeile. Investagon kennt
 * `X-Organization-Id` nicht, ignoriert die Kopfzeile stillschweigend und
 * behandelt die Anfrage dann wie die eines nicht angemeldeten Besuchers.
 * Die Antwort lautet in dem Fall `Access Denied. The user doesn't have
 * ROLE_PERMISSION_PROPERTY_VIEW`, und genau die kam bei uns monatelang an.
 *
 * Der Rollenname darin wird aus der angefragten Adresse abgeleitet und sagt
 * nichts ueber unser Konto. Nachgemessen am 26.08.2026: Dieselbe Meldung
 * kommt bei einem Aufruf voellig ohne Schluessel.
 */
function mitOrg(url: string, orgId: string): string {
  if (!orgId) return url;
  const trenner = url.includes("?") ? "&" : "?";
  return `${url}${trenner}organization_id=${encodeURIComponent(orgId)}`;
}

function kopf(art: KopfArt, z: ApiZugang): Record<string, string> {
  const gemeinsam: Record<string, string> = { Accept: "application/json" };
  if (art === "bearer") {
    return { ...gemeinsam, Authorization: `Bearer ${z.token}` };
  }
  if (art === "auth-token") return { ...gemeinsam, "X-AUTH-TOKEN": z.token };
  return { ...gemeinsam, "X-API-KEY": z.token };
}

/** Einmal ermittelt, dann für alle weiteren Aufrufe verwendet. */
const gemerkt = new Map<string, KopfArt>();

export class ApiFehler extends Error {
  constructor(public status: number, public pfad: string, text: string) {
    super(`${pfad}: HTTP ${status} ${text.slice(0, 300)}`);
  }
}

/**
 * Eine Antwort mit ausgehandeltem Anmeldekopf holen. Gemeinsamer Kern von
 * `holeJson` und `holeBytes`, damit die Kopf-Aushandlung nur einmal existiert.
 */
async function holeAntwort(
  z: ApiZugang,
  pfad: string,
  timeoutMs: number,
): Promise<Response> {
  const basis = saubereBasis(z.basis) || STANDARD_BASIS;
  const roheUrl = pfad.startsWith("http")
    ? pfad
    : `${basis}${pfad.startsWith("/") ? "" : "/"}${pfad}`;
  if (new URL(roheUrl).origin !== new URL(basis).origin) {
    throw new Error(
      "Investagon-Anmeldedaten dürfen nur an den konfigurierten API-Host gesendet werden.",
    );
  }
  const url = mitOrg(roheUrl, z.orgId);
  const arten = gemerkt.has(z.token) ? [gemerkt.get(z.token)!] : KOPF_ARTEN;
  let letzte: ApiFehler | null = null;

  for (const art of arten) {
    const antwort = await fetch(url, {
      redirect: "error",
      headers: kopf(art, z),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (antwort.ok) {
      gemerkt.set(z.token, art);
      return antwort;
    }
    letzte = new ApiFehler(
      antwort.status,
      pfad,
      (await antwort.text()).slice(0, 300),
    );
    // Nur bei Anmeldefehlern lohnt ein anderer Kopf. Alles andere ist ein
    // echter Fehler und würde durch Wiederholen nur dreimal auftreten.
    if (antwort.status !== 401 && antwort.status !== 403) break;
  }
  throw letzte ?? new ApiFehler(0, pfad, "kein Ergebnis");
}

/**
 * Die vollstaendigen Kurzlisten (`pagination=false`) brauchen bei grossen
 * Bestaenden deutlich laenger als ein Detailabruf. Fuer sie gilt deshalb eine
 * groessere Zeitgrenze, sonst faellt der einzige funktionierende Zugang mit
 * "Signal timed out" heraus.
 */
function zeitgrenzeFuer(pfad: string): number {
  return pfad.includes("pagination=false") ? 60_000 : 15_000;
}

export async function holeJson<T = unknown>(
  z: ApiZugang,
  pfad: string,
): Promise<T> {
  const antwort = await holeAntwort(z, pfad, zeitgrenzeFuer(pfad));
  const text = await antwort.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiFehler(antwort.status, pfad, "Antwort ist kein JSON");
  }
}

/**
 * Eine Binärdatei holen, etwa das Dokumentenpaket einer Einheit. Bricht ab,
 * wenn die Datei größer ist als `maxBytes`, bevor sie den Speicher der
 * Function sprengt.
 */
export async function holeBytes(
  z: ApiZugang,
  pfad: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const antwort = await holeAntwort(z, pfad, 25_000);
  const angekuendigt = Number(antwort.headers.get("content-length") || 0);
  if (angekuendigt > maxBytes) {
    throw new ApiFehler(
      antwort.status,
      pfad,
      `Datei zu groß (${angekuendigt} Bytes, erlaubt ${maxBytes})`,
    );
  }
  const puffer = new Uint8Array(await antwort.arrayBuffer());
  if (puffer.byteLength > maxBytes) {
    throw new ApiFehler(
      antwort.status,
      pfad,
      `Datei zu groß (${puffer.byteLength} Bytes, erlaubt ${maxBytes})`,
    );
  }
  return puffer;
}

/** Aus einer Antwort die Liste holen, egal ob sie flach oder eingepackt kommt. */
export function liste(rohdaten: unknown): Record<string, unknown>[] {
  if (Array.isArray(rohdaten)) return rohdaten as Record<string, unknown>[];
  const o = (rohdaten || {}) as Record<string, unknown>;
  for (
    const schluessel of [
      "data",
      "items",
      "results",
      "hydra:member",
      "properties",
      "projects",
      "content",
    ]
  ) {
    const wert = o[schluessel];
    if (Array.isArray(wert)) return wert as Record<string, unknown>[];
  }
  return [];
}

export function text(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (v && typeof v === "object") {
      const n = (v as Record<string, unknown>).name ??
        (v as Record<string, unknown>).title;
      if (typeof n === "string" && n.trim()) return n.trim();
    }
  }
  return "";
}

export function zahl(o: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      if (!/\d/.test(v)) continue;
      const n = Number(
        v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(
          ",",
          ".",
        ),
      );
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

/** Verschachtelte Adressobjekte mit einbeziehen. */
export function mitAdresse(
  o: Record<string, unknown>,
): Record<string, unknown> {
  const a = (o.address ?? o.adresse ?? o.location) as
    | Record<string, unknown>
    | undefined;
  return a && typeof a === "object" ? { ...a, ...o, __adresse: a } : o;
}
