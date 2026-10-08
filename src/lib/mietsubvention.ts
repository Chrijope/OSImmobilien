/**
 * Mietsubvention: Beim Verkauf wird die Miete angehoben (Kappungsgrenze im
 * Berliner Umland 20 %, in Berlin 15 %). Die Differenz zwischen Ist- und
 * Soll-Miete zahlt OS Immobilien als Subvention an die Hausverwaltung.
 *
 * Prozentwerte stehen hier als Anteil (0,2 = 20 %). `null` heißt jeweils
 * „nicht überschrieben“, dann gilt der berechnete bzw. globale Wert.
 */

export const KAPPUNGSGRENZE_UMLAND = 0.2;
export const KAPPUNGSGRENZE_BERLIN = 0.15;

export interface SubventionsZeile {
  id: string;
  weNr: string;
  istWohnung: number;
  istGarage: number;
  /** Eigene Steigerung dieser Einheit, sonst die globale. */
  steigerung: number | null;
  /** Soll-Miete direkt eingetragen, sonst Ist × (1 + Steigerung). */
  sollWohnung: number | null;
  sollGarage: number | null;
}

export interface SubventionsEingaben {
  objektName: string;
  objektId: string | null;
  hausverwaltung: string;
  stichtag: string; // ISO-Datum
  steigerung: number;
  monate: number;
  zeilen: SubventionsZeile[];
}

export interface ZeilenErgebnis {
  steigerung: number;
  istGesamt: number;
  sollWohnung: number;
  sollGarage: number;
  sollGesamt: number;
  differenz: number;
}

export interface SubventionsErgebnis {
  zeilen: ZeilenErgebnis[];
  summeIstWohnung: number;
  summeIstGarage: number;
  summeIst: number;
  summeSollWohnung: number;
  summeSollGarage: number;
  summeSoll: number;
  differenzMonat: number;
  differenzJahr: number;
  /** Betrag an die Hausverwaltung über die ganze Laufzeit. */
  subventionGesamt: number;
}

/** Auf Cent runden; EPSILON gleicht Fließkommareste wie 1,005 aus. */
export const cent = (n: number) => Math.round((n + Math.sign(n) * Number.EPSILON) * 100) / 100;

/** Leere oder unsinnige Eingaben zählen als 0. */
const zahl = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

export function berechneZeile(z: SubventionsZeile, globaleSteigerung: number): ZeilenErgebnis {
  const steigerung = z.steigerung ?? zahl(globaleSteigerung);
  const istWohnung = zahl(z.istWohnung);
  const istGarage = zahl(z.istGarage);
  const sollWohnung = cent(z.sollWohnung ?? istWohnung * (1 + steigerung));
  const sollGarage = cent(z.sollGarage ?? istGarage * (1 + steigerung));
  const istGesamt = cent(istWohnung + istGarage);
  const sollGesamt = cent(sollWohnung + sollGarage);
  return { steigerung, istGesamt, sollWohnung, sollGarage, sollGesamt, differenz: cent(sollGesamt - istGesamt) };
}

export function berechneSubvention(e: SubventionsEingaben): SubventionsErgebnis {
  const zeilen = e.zeilen.map((z) => berechneZeile(z, e.steigerung));
  const summe = (f: (i: number) => number) => cent(zeilen.reduce((s, _r, i) => s + f(i), 0));
  const differenzMonat = summe((i) => zeilen[i].differenz);
  return {
    zeilen,
    summeIstWohnung: summe((i) => zahl(e.zeilen[i].istWohnung)),
    summeIstGarage: summe((i) => zahl(e.zeilen[i].istGarage)),
    summeIst: summe((i) => zeilen[i].istGesamt),
    summeSollWohnung: summe((i) => zeilen[i].sollWohnung),
    summeSollGarage: summe((i) => zeilen[i].sollGarage),
    summeSoll: summe((i) => zeilen[i].sollGesamt),
    differenzMonat,
    differenzJahr: cent(differenzMonat * 12),
    subventionGesamt: cent(differenzMonat * Math.max(0, zahl(e.monate))),
  };
}

/** Deutsche Zahleneingabe („1.234,56“, „12,5“) lesen; leer ergibt null. */
export function leseZahl(text: string): number | null {
  const roh = text.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(roh)) return null;
  // Punkt ohne Komma: bis zwei Nachkommastellen Dezimalpunkt, sonst Tausender.
  const normal = roh.includes(",") ? roh.replace(/\./g, "").replace(",", ".")
    : /^-?\d*\.\d{1,2}$/.test(roh) ? roh : roh.replace(/\./g, "");
  const n = Number.parseFloat(normal);
  return Number.isFinite(n) ? n : null;
}

export const neueZeile = (weNr = ""): SubventionsZeile => ({
  id: crypto.randomUUID(), weNr, istWohnung: 0, istGarage: 0, steigerung: null, sollWohnung: null, sollGarage: null,
});

export const SUBVENTION_STANDARD = (): SubventionsEingaben => ({
  objektName: "",
  objektId: null,
  hausverwaltung: "",
  stichtag: new Date().toISOString().slice(0, 10),
  steigerung: KAPPUNGSGRENZE_UMLAND,
  monate: 24,
  zeilen: [neueZeile("1")],
});

/** Eine gespeicherte Rechnung. Liegt je Nutzer in `user_settings`. */
export interface SubventionsVersion {
  id: string;
  name: string;
  gespeichertAm: string;
  eingaben: SubventionsEingaben;
}

export const SUBVENTION_VERSIONEN_SCHLUESSEL = "mietsubvention_versionen";
