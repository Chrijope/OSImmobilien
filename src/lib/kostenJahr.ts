/**
 * Kosten-Jahresübersicht je Objekt aus Eigentümersicht (Christian,
 * 17.10.2026): Was kommt je Monat herein, was geht hinaus, bis alles
 * verkauft und übergeben ist?
 *
 * Bis zur Übergabe an den Käufer (Übergabetermin aus der Abwicklung) gehört
 * die Wohnung uns: Wir bekommen die Ist-Miete und tragen bei Vermietung die
 * Eigentümerlast (nicht umlagefähiges Hausgeld plus Rücklage), bei Leerstand
 * das ganze Hausgeld. Ab der Übergabe zahlen wir die Mietsubvention über ihre
 * Laufzeit, die Garagen-Subvention über ihre Monate und einen Einmalanteil im
 * Übergabemonat. Wohnungen ohne Übergabetermin gelten das ganze Jahr als
 * unsere.
 */

export interface KostenEinheit {
  istMiete: number | null;
  eigentuemerlast: number | null;
  hausgeldGesamt: number | null;
  /** ISO-Datum der Übergabe an den Käufer, leer ohne. */
  uebergabe: string;
  subventionMonat: number;
  subventionMonate: number;
  garagenSubventionMonat: number;
  garagenSubventionMonate: number;
  einmalSubvention: number;
}

export const KOSTEN_ZEILEN = [
  { schluessel: "miete", titel: "Mieteinnahmen bis zur Übergabe", vorzeichen: 1 },
  { schluessel: "eigentuemerlast", titel: "Eigentümerlast vermieteter Wohnungen", vorzeichen: -1 },
  { schluessel: "leerstand", titel: "Hausgeld leerstehender Wohnungen", vorzeichen: -1 },
  { schluessel: "subvention", titel: "Mietsubvention an Käufer", vorzeichen: -1 },
  { schluessel: "garage", titel: "Garagen-Subvention", vorzeichen: -1 },
  { schluessel: "einmal", titel: "Einmalige Mietsubvention", vorzeichen: -1 },
] as const;
export type KostenSchluessel = (typeof KOSTEN_ZEILEN)[number]["schluessel"];

export interface KostenJahr {
  /** Je Zeile zwölf Monatswerte (positiv, das Vorzeichen steht in KOSTEN_ZEILEN). */
  monate: Record<KostenSchluessel, number[]>;
  summe: Record<KostenSchluessel, number>;
  saldoMonat: number[];
  saldo: number;
  ohneUebergabe: number;
}

const monatsIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const cent = (n: number) => Math.round(n * 100) / 100;

export function kostenJahr(einheiten: KostenEinheit[], jahr: number): KostenJahr {
  const leer = () => Array.from({ length: 12 }, () => 0);
  const monate = Object.fromEntries(KOSTEN_ZEILEN.map((z) => [z.schluessel, leer()])) as Record<KostenSchluessel, number[]>;
  let ohneUebergabe = 0;
  for (const e of einheiten) {
    const uebergabe = /^\d{4}-\d{2}/.test(e.uebergabe) ? monatsIndex(e.uebergabe) : null;
    if (uebergabe === null) ohneUebergabe++;
    for (let m = 0; m < 12; m++) {
      const index = jahr * 12 + m;
      if (uebergabe === null || index < uebergabe) {
        if (e.istMiete) {
          monate.miete[m] += e.istMiete;
          monate.eigentuemerlast[m] += e.eigentuemerlast ?? 0;
        } else {
          monate.leerstand[m] += e.hausgeldGesamt ?? e.eigentuemerlast ?? 0;
        }
      } else {
        const seit = index - uebergabe;
        if (seit < e.subventionMonate) monate.subvention[m] += e.subventionMonat;
        if (seit < e.garagenSubventionMonate) monate.garage[m] += e.garagenSubventionMonat;
        if (seit === 0) monate.einmal[m] += e.einmalSubvention;
      }
    }
  }
  const summe = Object.fromEntries(KOSTEN_ZEILEN.map((z) => [z.schluessel, cent(monate[z.schluessel].reduce((a, b) => a + b, 0))])) as Record<KostenSchluessel, number>;
  const saldoMonat = leer().map((_, m) => cent(KOSTEN_ZEILEN.reduce((s, z) => s + z.vorzeichen * monate[z.schluessel][m], 0)));
  return { monate, summe, saldoMonat, saldo: cent(saldoMonat.reduce((a, b) => a + b, 0)), ohneUebergabe };
}
