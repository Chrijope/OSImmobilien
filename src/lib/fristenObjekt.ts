/**
 * Fristen je Objekt (Christian, 17.10.2026): alle Termine aus Objektdaten,
 * Mietern und Abwicklung an einer Stelle, ohne Benachrichtigung. Die Liste
 * rechnet nichts Neues aus, sie sammelt nur, was an anderer Stelle steht.
 */

export type FristArt =
  | "Befristung endet" | "Mieterhöhung möglich" | "Garage gekündigt zum" | "Notartermin" | "Kaufpreisfälligkeit"
  | "Übergabe" | "Mietsubvention endet" | "Garagen-Subvention endet" | "Energieausweis läuft ab"
  | "Reservierung läuft ab" | "Vorkaufsrecht Mieter endet" | "Kündigungssperre endet" | "Gewährleistung endet";

export interface Frist {
  datum: string;
  art: FristArt;
  /** WE-Nummer, leer bei Fristen des ganzen Objekts. */
  einheit: string;
  detail?: string;
}

export interface FristQuelle {
  weNr: string;
  befristetBis?: string;
  erhoehungAb?: string;
  erhoehungPlus?: number;
  garageGekuendigtZum?: string;
  notartermin?: string;
  faelligkeit?: string;
  uebergabe?: string;
  subventionMonate?: number;
  garagenSubventionMonate?: number;
  /** Reservierung seit, mit der Dauer aus den Projektangaben des Objekts. */
  reserviertAm?: string;
  reservierungTage?: number;
  /** Tag, an dem dem Mieter der Kaufvertrag mitgeteilt wurde (§ 577 BGB: zwei Monate Frist). */
  vorkaufMitgeteilt?: string;
  /** Vermietet beim Verkauf: Sperrfrist für Eigenbedarf ab Notartermin (§ 577a BGB). */
  vermietet?: boolean;
  sperrfristJahre?: number;
}

const gueltig = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}/.test(s);
const plusMonate = (s: string, m: number) => {
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + m);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
const eur = (n: number) => `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const plusTage = (s: string, t: number) => {
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + t);
  return d.toISOString().slice(0, 10);
};

// Rechtsfristen enden am Tag mit derselben Zahl (§ 188 Abs. 2 BGB), nicht am Vortag wie eine Laufzeit.
const fristende = (s: string, m: number) => plusTage(plusMonate(s, m), 1);

/** `abnahme`: Abnahme des Gemeinschaftseigentums; die Gewährleistung des Bauträgers läuft fünf Jahre (§ 634a BGB). */
export function fristenSammeln(einheiten: FristQuelle[], energieausweisBis?: string, abnahme?: string): Frist[] {
  const f: Frist[] = [];
  const dazu = (datum: string | undefined, art: FristArt, einheit: string, detail?: string) => { if (gueltig(datum)) f.push({ datum: datum.slice(0, 10), art, einheit, detail }); };
  for (const e of einheiten) {
    dazu(e.befristetBis, "Befristung endet", e.weNr);
    if (e.erhoehungPlus) dazu(e.erhoehungAb, "Mieterhöhung möglich", e.weNr, `plus ${eur(e.erhoehungPlus)} im Monat`);
    dazu(e.garageGekuendigtZum, "Garage gekündigt zum", e.weNr);
    dazu(e.notartermin, "Notartermin", e.weNr);
    dazu(e.faelligkeit, "Kaufpreisfälligkeit", e.weNr);
    dazu(e.uebergabe, "Übergabe", e.weNr);
    if (gueltig(e.uebergabe) && e.subventionMonate) dazu(plusMonate(e.uebergabe, e.subventionMonate), "Mietsubvention endet", e.weNr, `${e.subventionMonate} Monate ab Übergabe`);
    if (gueltig(e.uebergabe) && e.garagenSubventionMonate) dazu(plusMonate(e.uebergabe, e.garagenSubventionMonate), "Garagen-Subvention endet", e.weNr);
    if (gueltig(e.reserviertAm) && e.reservierungTage) dazu(plusTage(e.reserviertAm, e.reservierungTage), "Reservierung läuft ab", e.weNr, `${e.reservierungTage} Tage ab Reservierung`);
    if (gueltig(e.vorkaufMitgeteilt)) dazu(fristende(e.vorkaufMitgeteilt, 2), "Vorkaufsrecht Mieter endet", e.weNr, "zwei Monate ab Mitteilung, § 577 BGB");
    if (e.vermietet && gueltig(e.notartermin) && e.sperrfristJahre) dazu(fristende(e.notartermin, 12 * e.sperrfristJahre), "Kündigungssperre endet", e.weNr, `Eigenbedarf frühestens danach, ${e.sperrfristJahre} Jahre, § 577a BGB`);
  }
  dazu(energieausweisBis, "Energieausweis läuft ab", "");
  if (gueltig(abnahme)) dazu(fristende(abnahme, 60), "Gewährleistung endet", "", "fünf Jahre ab Abnahme, § 634a BGB");
  return f.sort((a, b) => a.datum.localeCompare(b.datum));
}
