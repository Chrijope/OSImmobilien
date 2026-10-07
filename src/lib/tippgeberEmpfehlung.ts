/**
 * Pflichtprüfung für die Empfehlung aus dem Tippgeber-Portal.
 *
 * Pflicht sind nur Name, E-Mail und Telefon der empfohlenen Person. Alle
 * Qualifizierungsfragen (Ziel, Beruf, Einkommen, Eigenkapital, SCHUFA,
 * Zeitpunkt) sind freiwillig: Der Tippgeber kennt die Finanzen der Person oft
 * nicht, und eine Pflicht verleitet nur zum Raten. Leere Antworten gehen als
 * leere Zeichenkette an `create_tippgeber_lead`, die sie per NULLIF ablegt.
 *
 * Dazu kommt seit dem 27.09.2026 das Häkchen, mit dem der Tippgeber bestätigt,
 * dass die empfohlene Person mit der Weitergabe ihrer Kontaktdaten
 * einverstanden ist. Ohne Haken wird nicht gesendet.
 */
export interface TippgeberEmpfehlungPflicht {
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
}

/** Die Fehlermeldung, wenn eine Pflichtangabe fehlt, sonst `null`. */
export function fehlendePflichtangabe(w: TippgeberEmpfehlungPflicht): string | null {
  if (!w.vorname.trim() || !w.nachname.trim() || !w.email.trim() || !w.telefon.trim()) {
    return "Vorname, Nachname, E-Mail und Telefon sind Pflichtfelder.";
  }
  return null;
}

/**
 * Kennung der Fassung, der der Tippgeber zustimmt. Ändert sich der Wortlaut
 * unten, bekommt er eine neue Kennung, damit jede gespeicherte Bestätigung
 * ihrem Text zugeordnet bleibt.
 */
export const EINVERSTAENDNIS_FASSUNG = "2026-09-tippgeber-einverstaendnis-v1";

export const EINVERSTAENDNIS_FEHLT =
  "Bitte bestätige, dass die empfohlene Person mit der Weitergabe ihrer Kontaktdaten einverstanden ist.";

/** Der Satz am Häkchen, mit dem Vornamen, sobald einer eingetragen ist. */
export function einverstaendnisWortlaut(vorname: string): string {
  const wer = vorname.trim() || "die empfohlene Person";
  return `Ich bestätige, dass ${wer} mit der Weitergabe der hier eingetragenen Kontaktdaten an OS Immobilien und mit einer Kontaktaufnahme zur Immobilienberatung einverstanden ist.`;
}

type RpcAufruf = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ error: { code?: string; message?: string } | null }>;

function funktionFehlt(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function|function .* does not exist/i.test(error.message || "")
  );
}

/**
 * Legt die Empfehlung über `create_tippgeber_lead` an und gibt das
 * Einverständnis mit (Fassung, Wortlaut). Zeitpunkt und Nachweis setzt die
 * Datenbank selbst, siehe Migration 20260927020000.
 *
 * Übergang: Läuft die Migration noch nicht, kennt die Datenbank die drei
 * neuen Parameter nicht. Dann geht die Empfehlung wie bisher ohne sie raus,
 * das Häkchen wurde im Browser trotzdem verlangt, nur nicht gespeichert.
 */
export async function empfehlungAnlegen(
  rpc: RpcAufruf,
  felder: Record<string, string>,
  wortlaut: string,
): Promise<{ error: { code?: string; message?: string } | null }> {
  const mitEinverstaendnis = await rpc("create_tippgeber_lead", {
    ...felder,
    _einverstaendnis: true,
    _einverstaendnis_fassung: EINVERSTAENDNIS_FASSUNG,
    _einverstaendnis_wortlaut: wortlaut,
  });
  if (!mitEinverstaendnis.error || !funktionFehlt(mitEinverstaendnis.error)) return mitEinverstaendnis;
  return rpc("create_tippgeber_lead", felder);
}

/**
 * Für das Kundenprofil: „26.09.2026, 14:03“, wenn am Kontakt eine bestätigte
 * Einverständniserklärung des Tippgebers liegt, sonst `null`.
 */
export function einverstaendnisBestaetigtAm(meta: unknown): string | null {
  const e = (meta as { tippgeberEinverstaendnis?: { bestaetigt?: unknown; bestaetigtAm?: unknown } } | null)
    ?.tippgeberEinverstaendnis;
  if (!e || e.bestaetigt !== true || typeof e.bestaetigtAm !== "string") return null;
  const d = new Date(e.bestaetigtAm);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}
