/**
 * Regeln der Follow-Up-Eskalation, ohne Datenbank, damit Browser-Tests sie
 * pruefen koennen. Benutzt von `follow-up-eskalation/index.ts`; die
 * Textanfaenge der Planungseintraege auch vom Browser beim Anlegen.
 */

/**
 * Anfang der Verlaufseintraege, die beim Anlegen eines Follow-ups automatisch
 * entstehen (KundenDetail, SetterSkript). Sie sind keine Reaktion des
 * Partners. `aktivitaeten` hat keine Spalte fuer eine Kennung, und der
 * Altbestand traegt nur diesen Text; deshalb legen die Aufrufer den Text mit
 * genau diesen Anfaengen an.
 */
export const FOLLOW_UP_GEPLANT = "Follow-Up geplant:";
export const ERSTGESPRAECH_VEREINBART = "Erstgesprächs-Termin vereinbart:";
const PLANUNGS_ANFAENGE = [FOLLOW_UP_GEPLANT, ERSTGESPRAECH_VEREINBART];

function berlinVersatzMs(zeitpunkt: number): number {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(zeitpunkt));
  const wert = (typ: string) => Number(teile.find((t) => t.type === typ)?.value);
  const wand = Date.UTC(wert("year"), wert("month") - 1, wert("day"), wert("hour"), wert("minute"), wert("second"));
  return wand - (zeitpunkt - (zeitpunkt % 1000));
}

/**
 * Datum und Uhrzeit, wie Partner sie eingeben (deutsche Ortszeit), als
 * Zeitpunkt. Sommer- und Winterzeit richtig; `null` bei unlesbarer Angabe.
 */
export function berlinZeitpunkt(datum: string, uhrzeit: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(datum || ""));
  const u = /^(\d{1,2}):(\d{2})/.exec(String(uhrzeit || ""));
  if (!d || !u) return null;
  const wand = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(u[1]), Number(u[2]));
  if (Number.isNaN(wand)) return null;
  // Zweimal, damit ein Termin kurz nach der Zeitumstellung den Versatz des
  // Zielzeitpunkts bekommt und nicht den der Schaetzung.
  const erste = wand - berlinVersatzMs(wand);
  return new Date(wand - berlinVersatzMs(erste));
}

/**
 * Ab wann eine Aktivitaet als Reaktion zaehlt: das spaetere von Anlegen des
 * Follow-ups und Faelligkeit. Was vor der Faelligkeit geschah, ist keine
 * Reaktion auf ein faelliges Follow-up.
 */
export function reaktionAb(gesetztAm: string | null | undefined, faellig: Date): Date {
  const gesetzt = gesetztAm ? new Date(gesetztAm).getTime() : NaN;
  return new Date(Number.isNaN(gesetzt) ? faellig.getTime() : Math.max(gesetzt, faellig.getTime()));
}

export type AktivitaetKurz = { datum?: string | null; beschreibung?: string | null };

/** Gibt es nach `ab` eine Aktivitaet, die nicht bloss die Planung vermerkt? */
export function hatReaktion(aktivitaeten: AktivitaetKurz[], ab: Date): boolean {
  return aktivitaeten.some((a) => {
    const zeit = new Date(String(a.datum || "")).getTime();
    if (Number.isNaN(zeit) || zeit <= ab.getTime()) return false;
    const text = String(a.beschreibung || "");
    return !PLANUNGS_ANFAENGE.some((anfang) => text.startsWith(anfang));
  });
}

export type EskalationsStufe = "followUpEsk1Sent" | "followUpEsk2Sent" | "followUpEsk3Sent";

/** Welche Stufen jetzt hinausgehen: 1 bei Faelligkeit, 2 nach 3 h, 3 nach 24 h ohne Reaktion. */
export function faelligeStufen(
  meta: Record<string, unknown>,
  minutenUeberfaellig: number,
  reaktion: boolean,
): EskalationsStufe[] {
  const stufen: EskalationsStufe[] = [];
  if (minutenUeberfaellig < 0) return stufen;
  if (!meta.followUpEsk1Sent) stufen.push("followUpEsk1Sent");
  if (minutenUeberfaellig >= 180 && !meta.followUpEsk2Sent && !reaktion) stufen.push("followUpEsk2Sent");
  if (minutenUeberfaellig >= 1440 && !meta.followUpEsk3Sent && !reaktion) stufen.push("followUpEsk3Sent");
  return stufen;
}
