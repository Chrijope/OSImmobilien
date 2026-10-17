/**
 * Fristen je Objekt (Christian, 17.10.2026): alle Termine aus Objektdaten,
 * Mietern und Abwicklung an einer Stelle, ohne Benachrichtigung. Die Liste
 * rechnet nichts Neues aus, sie sammelt nur, was an anderer Stelle steht.
 */

export type FristArt =
  | "Befristung endet" | "Mieterhöhung möglich" | "Garage gekündigt zum" | "Notartermin" | "Kaufpreisfälligkeit"
  | "Übergabe" | "Mietsubvention endet" | "Garagen-Subvention endet" | "Energieausweis läuft ab";

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
}

const gueltig = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}/.test(s);
const plusMonate = (s: string, m: number) => {
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + m);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
const eur = (n: number) => `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export function fristenSammeln(einheiten: FristQuelle[], energieausweisBis?: string): Frist[] {
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
  }
  dazu(energieausweisBis, "Energieausweis läuft ab", "");
  return f.sort((a, b) => a.datum.localeCompare(b.datum));
}
