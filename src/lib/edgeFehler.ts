/**
 * Den echten Grund aus einer Fehlerantwort einer Edge Function holen.
 *
 * `supabase.functions.invoke` wirft bei jedem Status ab 400 einen Fehler mit
 * immer demselben Satz: „Edge Function returned a non-2xx status code“. Der
 * eigentliche Grund steht im Rumpf der Antwort, und den liest supabase-js
 * nicht. Die Antwort selbst hängt ungelesen als `context` am Fehler
 * (`@supabase/functions-js`, Klasse `FunctionsHttpError`).
 *
 * Damit sahen bisher alle Fehlschläge gleich aus: das stündliche Versandlimit,
 * eine abgelaufene Anmeldung und ein fehlendes Pflichtfeld. Der Bearbeiter las
 * einen englischen Satz ohne Aussage, und niemand konnte am Bildschirm
 * erkennen, was zu tun ist. Genau dieser Satz steht sonst auch in der
 * Fehlermeldung, die der Nutzer bestätigen muss.
 *
 * Diese Datei ändert nichts am Ablauf. Sie liest nur den Rumpf nach und gibt
 * einen Fehler mit sprechendem Text zurück. Lässt sich nichts lesen, bleibt
 * alles wie zuvor.
 */

/** Die Felder, in denen unsere Edge Functions ihren Grund ablegen. */
function grundAusRumpf(rumpf: unknown): string {
  if (typeof rumpf === "string") return rumpf.trim();
  if (!rumpf || typeof rumpf !== "object") return "";
  const o = rumpf as Record<string, unknown>;
  for (const feld of ["error", "message", "grund", "reason"]) {
    const wert = o[feld];
    if (typeof wert === "string" && wert.trim()) return wert.trim();
  }
  return "";
}

/*
 * Wenn nicht unsere Function antwortet, sondern die Plattform davor.
 *
 * Anlass, Christian am 23.09.2026: „Kundenlink senden“, dann „Link kopieren“
 * brachte eine 404. Eine nicht ausgerollte Function beantwortet Supabase mit
 * 404 und einem eigenen Rumpf (`{"code":"NOT_FOUND","message":"Requested
 * function was not found"}`). Oft kommt davon im Browser gar nichts an: Die
 * Vorabfrage (CORS) bekommt dieselbe 404 ohne Freigabe, der Browser verwirft
 * die Antwort, und supabase-js meldet `FunctionsFetchError`. Beides sah am
 * Bildschirm aus wie ein Fehler im CRM.
 *
 * Unsere Functions legen ihren Grund immer in `error` ab, auch bei einer
 * eigenen 404 („Das Objekt gibt es nicht mehr.“). Eine 404 ohne `error` kommt
 * deshalb von der Plattform: Die Function ist nicht ausgerollt.
 */

/** Die Meldung, wenn Supabase die Function nicht kennt. */
export function functionNichtAusgerolltText(functionName: string): string {
  return `Die Function ${functionName} ist noch nicht ausgerollt. Roll sie in Lovable aus, dann klappt es.`;
}

/** Die Meldung, wenn die Function ausgerollt ist, aber nicht startet (`BOOT_ERROR`). */
export function functionStartetNichtText(functionName: string): string {
  return `Die Function ${functionName} ist ausgerollt, startet aber nicht. Roll sie in Lovable neu aus und sieh in ihr Protokoll.`;
}

/** Die Meldung, wenn gar keine Antwort ankommt. */
export function functionNichtErreichbarText(functionName: string): string {
  return `Die Function ${functionName} ist nicht erreichbar. Meist ist sie noch nicht ausgerollt, sonst fehlt gerade die Internetverbindung.`;
}

export interface EdgeFehlerOptionen {
  /**
   * Der Name der aufgerufenen Function. Nur mit Namen unterscheidet der
   * Helfer die Antwort der Plattform von der Antwort der Function und sagt
   * dann, dass die Function nicht ausgerollt ist, nicht startet oder nicht
   * erreichbar ist. Ohne Namen bleibt alles wie vorher.
   */
  functionName?: string;
}

function neuerFehler(text: string, kontext: unknown): Error {
  const neu = new Error(text);
  (neu as { context?: unknown }).context = kontext;
  return neu;
}

/**
 * Gibt denselben Fehler zurück, nur mit dem Grund aus der Antwort.
 *
 * Ohne lesbaren Rumpf kommt der ursprüngliche Fehler unverändert zurück, damit
 * sich das Verhalten an keiner Stelle verschlechtert. Mit `functionName`
 * kommen die Meldungen oben dazu.
 */
export async function edgeFehlerMitGrund(fehler: unknown, optionen: EdgeFehlerOptionen = {}): Promise<unknown> {
  if (!fehler) return fehler;
  const name = optionen.functionName?.trim() || "";
  const kontext = (fehler as { context?: unknown }).context as
    | { text?: () => Promise<string>; clone?: () => { text: () => Promise<string> }; status?: number }
    | undefined;
  if (!kontext || typeof kontext.text !== "function") {
    // Keine Antwort: supabase-js meldet dann `FunctionsFetchError`.
    if (name && (fehler as { name?: unknown }).name === "FunctionsFetchError") {
      return neuerFehler(functionNichtErreichbarText(name), kontext);
    }
    return fehler;
  }

  let roh = "";
  try {
    // Über eine Kopie lesen, damit der Rumpf für andere Leser offen bleibt.
    const quelle = typeof kontext.clone === "function" ? kontext.clone() : kontext;
    roh = await quelle.text();
  } catch {
    return fehler;
  }

  let json: unknown = undefined;
  try {
    json = JSON.parse(roh);
  } catch {
    // Kein JSON, siehe unten.
  }

  if (name) {
    const o = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
    const eigenerGrund = typeof o.error === "string" && o.error.trim() !== "";
    const status = typeof kontext.status === "number" ? kontext.status : 0;
    if (!eigenerGrund && status === 404) return neuerFehler(functionNichtAusgerolltText(name), kontext);
    if (!eigenerGrund && o.code === "BOOT_ERROR") return neuerFehler(functionStartetNichtText(name), kontext);
  }

  let grund = "";
  if (json !== undefined) {
    grund = grundAusRumpf(json);
  } else {
    // Kein JSON, etwa eine HTML-Seite eines Zwischenservers. Dann hilft der
    // Rumpf nicht weiter, ein abgeschnittener Brocken HTML erst recht nicht.
    grund = roh.trim().startsWith("<") ? "" : roh.trim();
  }

  if (!grund) {
    const status = typeof kontext.status === "number" ? kontext.status : 0;
    if (!status) return fehler;
    grund = `Die Serverfunktion hat mit Status ${status} geantwortet.`;
  }

  // Auf eine brauchbare Länge kürzen, der Text landet in einem Dialog.
  const text = grund.length > 300 ? `${grund.slice(0, 300)}…` : grund;
  return neuerFehler(text, kontext);
}
