// Meta Conversion-API: baut und sendet das serverseitige Lead-Ereignis.
//
// Warum es das gibt: Werbeblocker und strenge Browser lassen das Meta Pixel
// im Browser oft nicht durch. Deshalb meldet submit-lead denselben Lead
// zusaetzlich vom Server aus an Meta. Beide Meldungen tragen dieselbe
// event_id, Meta zaehlt das Ereignis dadurch nur einmal (Deduplizierung).
//
// Die reinen Rechenschritte (Normalisieren, Hashen, Payload bauen) liegen
// hier, damit sie von Vitest aus getestet werden koennen, so wie bei
// kontakt-dublette und standort-messung. Netzwerk und Datenbank bleiben
// duenn und bekommen ihre Abhaengigkeiten hereingereicht.
//
// Wichtig: Das Zugriffs-Token ist ein Geheimnis. Es taucht in keiner
// Fehlermeldung, keinem Log und keiner URL auf, es steht nur im
// Request-Koerper an Meta.

const GRAPH_API_VERSION = "v21.0";

/** Eine Meta-Pixel-ID ist eine reine Zahlenfolge (aktuell 15 bis 16 Stellen). */
export function istGueltigePixelId(wert: unknown): wert is string {
  return typeof wert === "string" && /^\d{5,20}$/.test(wert.trim());
}

/**
 * E-Mail-Adresse so, wie Meta sie vor dem Hashen erwartet:
 * ohne Randleerzeichen und komplett klein.
 */
export function normalisiereEmailFuerMeta(email: string | null | undefined): string {
  return String(email || "").trim().toLowerCase();
}

/**
 * Telefonnummer so, wie Meta sie vor dem Hashen erwartet: nur Ziffern,
 * mit Laendervorwahl und ohne fuehrende Nullen.
 *
 * "+49 170 1234567"  -> "491701234567"
 * "0170 1234567"     -> "491701234567" (fuehrende 0 wird zur Vorwahl 49)
 * "0043 660 123456"  -> "43660123456"  (00 ist nur das Auslandszeichen)
 *
 * Bei unter sechs Ziffern kommt ein leerer String zurueck, so eine Nummer
 * identifiziert niemanden und wird nicht an Meta gemeldet.
 */
export function normalisiereTelefonFuerMeta(
  telefon: string | null | undefined,
  standardLaendervorwahl = "49",
): string {
  let ziffern = String(telefon || "").replace(/[^0-9]/g, "");
  if (ziffern.startsWith("00")) {
    ziffern = ziffern.slice(2);
  } else if (ziffern.startsWith("0")) {
    ziffern = standardLaendervorwahl + ziffern.slice(1);
  }
  return ziffern.length >= 6 ? ziffern : "";
}

/** SHA-256 als Hex-String, wie Meta die user_data-Felder erwartet. */
export async function sha256Hex(wert: string): Promise<string> {
  const daten = new TextEncoder().encode(wert);
  const hash = await crypto.subtle.digest("SHA-256", daten);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface MetaLeadDaten {
  eventId: string;
  /** Unix-Zeit in Sekunden. */
  eventTime: number;
  eventSourceUrl: string;
  email?: string | null;
  telefon?: string | null;
}

interface MetaUserData {
  em?: string[];
  ph?: string[];
}

export interface MetaLeadEvent {
  event_name: "Lead";
  event_time: number;
  action_source: "website";
  event_source_url: string;
  event_id: string;
  user_data: MetaUserData;
}

/**
 * Baut das Lead-Ereignis fuer die Conversion-API. E-Mail und Telefonnummer
 * werden normalisiert und SHA-256-gehasht, Klartext verlaesst den Server nie.
 */
export async function baueMetaLeadEvent(daten: MetaLeadDaten): Promise<MetaLeadEvent> {
  const userData: MetaUserData = {};
  const email = normalisiereEmailFuerMeta(daten.email);
  if (email) userData.em = [await sha256Hex(email)];
  const telefon = normalisiereTelefonFuerMeta(daten.telefon);
  if (telefon) userData.ph = [await sha256Hex(telefon)];
  return {
    event_name: "Lead",
    event_time: Math.floor(daten.eventTime),
    action_source: "website",
    event_source_url: daten.eventSourceUrl,
    event_id: daten.eventId,
    user_data: userData,
  };
}

export interface MetaSendeErgebnis {
  ok: boolean;
  /** HTTP-Status der Antwort, wenn eine Antwort kam. */
  status?: number;
  /** Kurzbeschreibung fuer Logs. Enthaelt nie das Token. */
  fehler?: string;
}

/**
 * Schickt das Lead-Ereignis an die Conversion-API. Best effort: Diese
 * Funktion wirft nie, ein Fehler kommt als Ergebnis zurueck und darf den
 * Lead niemals aufhalten. Ohne gueltige Pixel-ID oder ohne Token wird
 * bewusst nichts gesendet.
 */
export async function sendeMetaLeadEvent(optionen: {
  pixelId: string;
  token: string;
  event: MetaLeadEvent;
  fetchFn?: typeof fetch;
}): Promise<MetaSendeErgebnis> {
  const { pixelId, token, event } = optionen;
  const doFetch = optionen.fetchFn ?? fetch;
  if (!istGueltigePixelId(pixelId)) return { ok: false, fehler: "pixel_id_ungueltig" };
  if (typeof token !== "string" || !token.trim()) return { ok: false, fehler: "token_fehlt" };

  try {
    // Das Token gehoert in den Koerper, nicht in die URL: URLs landen in
    // Server- und Proxy-Logs, der Request-Koerper nicht.
    const antwort = await doFetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId.trim()}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [event], access_token: token.trim() }),
      },
    );
    if (!antwort.ok) {
      // Die Antwort von Meta beschreibt den Fehler, ohne das Token zu nennen.
      let details = "";
      try {
        details = (await antwort.text()).slice(0, 300);
      } catch {
        // Antwortkoerper nicht lesbar, der Status muss reichen.
      }
      return { ok: false, status: antwort.status, fehler: details || `http_${antwort.status}` };
    }
    return { ok: true, status: antwort.status };
  } catch (e) {
    return { ok: false, fehler: e instanceof Error ? e.message : "netzwerkfehler" };
  }
}
