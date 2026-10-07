/**
 * Den echten Grund aus dem Fehler eines Function-Aufrufs holen.
 *
 * `admin.functions.invoke` wirft bei jedem Status ab 400 denselben Satz:
 * "Edge Function returned a non-2xx status code". Der eigentliche Grund
 * steht im Rumpf der Antwort, und die haengt ungelesen als `context` am
 * Fehler. Damit sahen 401 (Geheimnis stimmt nicht), 403 (keine Rolle),
 * 400 (Feld fehlt) und 500 alle gleich aus, und im roten Briefsymbol des
 * Bewerbers stand ein englischer Satz ohne Aussage. So bei Eric Schoof am
 * 14.09.2026, und vorher bei Jonathan Klug.
 *
 * Das ist die Deno-Fassung von src/lib/edgeFehler.ts. Eine Edge Function
 * kann `src/lib/` nicht mitbenutzen, deshalb liegt es doppelt. Aendert sich
 * die Regel, gehoert sie an beiden Stellen geaendert.
 */

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

/**
 * Liefert den Grund im Klartext, mit dem Statuscode davor, wenn er lesbar ist.
 * Ohne lesbaren Rumpf kommt die urspruengliche Meldung zurueck, damit nichts
 * schlechter wird als vorher.
 */
export async function fehlerGrund(fehler: unknown, ersatz = "unbekannt"): Promise<string> {
  const meldung = (fehler as { message?: string } | null)?.message || ersatz;
  const kontext = (fehler as { context?: unknown } | null)?.context as
    | { text?: () => Promise<string>; clone?: () => { text: () => Promise<string> }; status?: number }
    | undefined;
  if (!kontext || typeof kontext.text !== "function") return meldung;

  let roh = "";
  try {
    // Ueber eine Kopie lesen, damit der Rumpf fuer andere Leser offen bleibt.
    // Die Kopie und das Original sind verschieden typisiert, deshalb wird
    // der Leser erst herausgeloest und dann mit seinem Objekt aufgerufen.
    const quelle = typeof kontext.clone === "function" ? kontext.clone() : kontext;
    const lesen = quelle.text;
    if (typeof lesen !== "function") return meldung;
    roh = await lesen.call(quelle);
  } catch {
    return meldung;
  }
  let grund = "";
  try {
    grund = grundAusRumpf(JSON.parse(roh));
  } catch {
    grund = roh.trim().startsWith("<") ? "" : roh.trim();
  }
  const status = typeof kontext.status === "number" ? kontext.status : 0;
  if (!grund) return status ? `${meldung} (Status ${status})` : meldung;
  const text = grund.length > 300 ? `${grund.slice(0, 300)}…` : grund;
  return status ? `Status ${status}: ${text}` : text;
}
