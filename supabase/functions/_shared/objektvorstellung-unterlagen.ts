/**
 * Nachfassplan rund um die Objektvorstellung, für die Functions (seit
 * 16.10.2026, Strategie Vertrieb, Abschnitt 8).
 *
 *   - `buchungsVorlage`: welche Bestätigung send-buchung-bestaetigung an den
 *     Kunden schickt. Dieselbe Wahl wie `meetingVorlage` in
 *     `src/lib/meetingEinladung.ts`.
 *   - `ovErinnerungFaellig` und Co.: die Kundenmail zwei Tage vor der
 *     Objektvorstellung, wenn Ausweis oder Gehaltsabrechnung fehlen.
 *     Verschickt von check-document-reminders, je Termin einmal (Sperre über
 *     `buchung_mail_claim` mit `ovSperrSchluessel`).
 *
 * Reine Funktionen ohne Datenbank, getestet in
 * `src/lib/objektvorstellungUnterlagen.test.ts`.
 */
import { fehlendeMindestunterlagenAusMeta } from "./reservierung-voraussetzungen.ts";
import { berlinerZeitNachUtc } from "./notar-zeitpunkt.ts";

export function buchungsVorlage(anlass: unknown): string {
  if (anlass === "beratung") return "termin-beratungspraesentation";
  if (anlass === "objektvorstellung") return "einladung-objektvorstellung";
  return "buchung-bestaetigung";
}

/** Wie `STUFEN_VOR_OBJEKTVORSTELLUNG` in `src/lib/mindestunterlagen.ts`, ein Test hält beide gleich. */
export const OV_STUFEN = ["selbstauskunft", "objektauswahl", "follow_up_objekt"];

/** Zwei Tage vorher, wie `VORLAUF_OBJEKTVORSTELLUNG_MS`. */
export const OV_VORLAUF_MS = 2 * 24 * 60 * 60 * 1000;

export interface OvTermin {
  id: string;
  kunde_id: string | null;
  beschreibung: string | null;
  faellig_am: string | null;
  uhrzeit: string | null;
  erledigt_am: string | null;
}

/** Der Zeitpunkt einer offenen Objektvorstellung in den nächsten zwei Tagen, sonst null. */
export function ovTerminFaellig(t: OvTermin, jetzt: Date): Date | null {
  if (t.erledigt_am || !t.kunde_id) return null;
  if (!/objektvorstellung/i.test(t.beschreibung || "")) return null;
  const zeit = berlinerZeitNachUtc(String(t.faellig_am || ""), String(t.uhrzeit || ""));
  if (!zeit) return null;
  const bis = zeit.getTime() - jetzt.getTime();
  return bis > 0 && bis <= OV_VORLAUF_MS ? zeit : null;
}

/**
 * Das Investment, um das es geht, und was ihm fehlt. Nur Investments vor
 * der Objektvorstellung zählen; fehlt keinem etwas, ist nichts zu tun.
 */
export function ovFehlendeUnterlagen(
  investments: Array<{ id: string; meta?: unknown }>,
): { investmentId: string; fehlend: string[] } | null {
  for (const inv of investments) {
    const meta = (inv.meta && typeof inv.meta === "object" ? inv.meta : {}) as Record<string, unknown>;
    if (!OV_STUFEN.includes(String(meta.pipelineStufe || ""))) continue;
    const fehlend = fehlendeMindestunterlagenAusMeta(meta);
    if (fehlend.length > 0) return { investmentId: inv.id, fehlend };
  }
  return null;
}

/** Je Termin eine Mail, auch wenn er verschoben wird: Schlüssel mit dem Zeitpunkt. */
export function ovSperrSchluessel(aktivitaetId: string, termin: Date): string {
  return `ov-unterlagen:${aktivitaetId}:${termin.toISOString().slice(0, 16)}`;
}

/** "25.03.2026" und "15:00" für die Vorlage, in Berliner Zeit. */
export function ovDatumUhrzeit(termin: Date): { datum: string; uhrzeit: string } {
  const teile = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(termin).reduce<Record<string, string>>((a, p) => { a[p.type] = p.value; return a; }, {});
  return { datum: `${teile.day}.${teile.month}.${teile.year}`, uhrzeit: `${teile.hour}:${teile.minute}` };
}
