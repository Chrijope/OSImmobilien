/**
 * Einkommensteuertarif nach § 32a EStG.
 *
 * Eine Stelle für alle Rechner. Vorher lag der Tarif mehrfach im Code, und die
 * Fassungen wichen voneinander ab: Der Grundfreibetrag 2024 wurde durch das
 * Gesetz zur steuerlichen Freistellung des Existenzminimums rückwirkend von
 * 11.604 auf 11.784 Euro angehoben, nicht überall war das nachgezogen.
 *
 * Enthalten sind die Tarife 2024, 2025 und 2026 (2025 und 2026 in der Fassung
 * des Steuerfortentwicklungsgesetzes vom 30. Dezember 2024), dazu der
 * Solidaritätszuschlag mit Freigrenze und Milderungszone nach dem SolZG sowie
 * die Kirchensteuer als Zuschlag auf die tarifliche Einkommensteuer.
 */

export type Steuerjahr = 2024 | 2025 | 2026;
export type Veranlagung = "grund" | "splitting";

export const STEUERJAHRE: Steuerjahr[] = [2026, 2025, 2024];

interface TarifZone {
  /** Grundfreibetrag, bis hierhin fällt keine Steuer an. */
  gfb: number;
  /** Obere Grenze der ersten Progressionszone. */
  b2: number;
  /** Obere Grenze der zweiten Progressionszone. */
  b3: number;
  /** Obere Grenze der ersten Proportionalzone (42 Prozent). */
  b4: number;
  /** Koeffizienten der ersten Progressionszone. */
  z2: [number, number];
  /** Koeffizienten der zweiten Progressionszone. */
  z3: [number, number, number];
  /** Lineare Formel der 42-Prozent-Zone. */
  l4: [number, number];
  /** Lineare Formel der 45-Prozent-Zone. */
  l5: [number, number];
  /** Freigrenze des Solidaritätszuschlags, bezogen auf die Einkommensteuer. */
  soliFreigrenze: number;
}

const TARIF: Record<Steuerjahr, TarifZone> = {
  2024: {
    gfb: 11784,
    b2: 17005,
    b3: 66760,
    b4: 277825,
    z2: [954.8, 1400],
    z3: [181.19, 2397, 991.21],
    l4: [0.42, 10636.31],
    l5: [0.45, 18971.06],
    soliFreigrenze: 18130,
  },
  2025: {
    gfb: 12096,
    b2: 17443,
    b3: 68480,
    b4: 277825,
    z2: [932.3, 1400],
    z3: [176.64, 2397, 1015.13],
    l4: [0.42, 10911.92],
    l5: [0.45, 19246.67],
    soliFreigrenze: 19950,
  },
  2026: {
    gfb: 12348,
    b2: 17799,
    b3: 69878,
    b4: 277825,
    z2: [914.51, 1400],
    z3: [173.1, 2397, 1034.87],
    l4: [0.42, 11135.63],
    l5: [0.45, 19470.38],
    soliFreigrenze: 20350,
  },
};

/** Tarifliche Einkommensteuer im Grundtarif, abgerundet auf volle Euro. */
export function grundtarif(zvE: number, jahr: Steuerjahr): number {
  const t = TARIF[jahr];
  const x = Math.floor(Math.max(0, zvE));
  if (x <= t.gfb) return 0;
  if (x <= t.b2) {
    const y = (x - t.gfb) / 10000;
    return Math.floor((t.z2[0] * y + t.z2[1]) * y);
  }
  if (x <= t.b3) {
    const z = (x - t.b2) / 10000;
    return Math.floor((t.z3[0] * z + t.z3[1]) * z + t.z3[2]);
  }
  if (x <= t.b4) return Math.floor(t.l4[0] * x - t.l4[1]);
  return Math.floor(t.l5[0] * x - t.l5[1]);
}

/** Tarifliche Einkommensteuer, im Splitting nach § 32a Abs. 5 EStG. */
export function tariflicheEst(zvE: number, jahr: Steuerjahr, veranlagung: Veranlagung): number {
  const x = Math.max(0, zvE);
  if (veranlagung === "splitting") return 2 * grundtarif(x / 2, jahr);
  return grundtarif(x, jahr);
}

/**
 * Solidaritätszuschlag: 5,5 Prozent der Einkommensteuer, aber höchstens
 * 11,9 Prozent des Betrags, um den die Steuer die Freigrenze übersteigt
 * (Milderungszone). Bei Zusammenveranlagung gilt die doppelte Freigrenze.
 */
export function solidaritaetszuschlag(
  est: number,
  jahr: Steuerjahr,
  veranlagung: Veranlagung,
  aktiv = true,
): number {
  if (!aktiv || est <= 0) return 0;
  const basis = TARIF[jahr].soliFreigrenze;
  const freigrenze = veranlagung === "splitting" ? basis * 2 : basis;
  if (est <= freigrenze) return 0;
  return Math.min(est * 0.055, (est - freigrenze) * 0.119);
}

export interface SteuerBelastung {
  est: number;
  soli: number;
  kirchensteuer: number;
  gesamt: number;
}

export interface SteuerOptionen {
  jahr: Steuerjahr;
  veranlagung: Veranlagung;
  /** Kirchensteuersatz in Prozent, üblich 8 oder 9, sonst 0. */
  kirchensteuerProzent: number;
  soli: boolean;
}

/** Gesamte Steuerbelastung aus Einkommensteuer, Soli und Kirchensteuer. */
export function steuerbelastung(zvE: number, opt: SteuerOptionen): SteuerBelastung {
  const est = Math.max(0, tariflicheEst(zvE, opt.jahr, opt.veranlagung));
  const soli = solidaritaetszuschlag(est, opt.jahr, opt.veranlagung, opt.soli);
  const kirchensteuer = est * ((opt.kirchensteuerProzent || 0) / 100);
  return { est, soli, kirchensteuer, gesamt: est + soli + kirchensteuer };
}

/** Grundfreibetrag des Jahres, für Anzeigen und Prüfungen. */
export function grundfreibetrag(jahr: Steuerjahr): number {
  return TARIF[jahr].gfb;
}

/**
 * Aktuelles Steuerjahr, begrenzt auf die hinterlegten Tarife.
 * Liegt das Kalenderjahr außerhalb, wird der nächstliegende Tarif genommen.
 */
export function aktuellesSteuerjahr(datum: Date = new Date()): Steuerjahr {
  const j = datum.getFullYear();
  const bekannt = [...STEUERJAHRE].sort((a, b) => a - b);
  if (j <= bekannt[0]) return bekannt[0];
  const letztes = bekannt[bekannt.length - 1];
  if (j >= letztes) return letztes;
  return (bekannt.includes(j as Steuerjahr) ? j : letztes) as Steuerjahr;
}

/**
 * Grenzsteuersatz in Prozent, analytisch als Ableitung des Tarifs nach
 * § 32a EStG. Im Splitting entspricht der Grenzsatz dem Grundtarif-Grenzsatz
 * beim halben zvE. Ohne Soli und Kirchensteuer.
 */
export function grenzsteuersatzProzent(
  zvE: number,
  jahr: Steuerjahr,
  veranlagung: Veranlagung = "grund",
): number {
  const t = TARIF[jahr];
  const x = Math.max(0, veranlagung === "splitting" ? zvE / 2 : zvE);
  if (x <= t.gfb) return 0;
  if (x <= t.b2) {
    const y = (x - t.gfb) / 10000;
    return (2 * t.z2[0] * y + t.z2[1]) / 100;
  }
  if (x <= t.b3) {
    const z = (x - t.b2) / 10000;
    return (2 * t.z3[0] * z + t.z3[1]) / 100;
  }
  if (x <= t.b4) return 42;
  return 45;
}

/**
 * Kleinstes zvE der Grundtabelle, bei dem der gegebene Grenzsteuersatz
 * erreicht wird (Umkehrung von grenzsteuersatzProzent). In den beiden
 * Proportionalzonen (42 und 45 Prozent) ist die Umkehrung nicht eindeutig,
 * dort wird die Zonenuntergrenze geliefert. Nur eine Näherung für Anzeigen
 * und Vorbelegungen, keine Grundlage für exakte Steuerbeträge.
 */
export function zvEFuerGrenzsteuersatz(satzP: number, jahr: Steuerjahr): number {
  const t = TARIF[jahr];
  const eingangssatz = t.z2[1] / 100;
  const endeZone2 = grenzsteuersatzProzent(t.b2, jahr);
  if (satzP < eingangssatz) return t.gfb;
  if (satzP <= endeZone2) {
    const y = (satzP * 100 - t.z2[1]) / (2 * t.z2[0]);
    return Math.round(t.gfb + y * 10000);
  }
  if (satzP < 42) {
    const z = (satzP * 100 - t.z3[1]) / (2 * t.z3[0]);
    return Math.round(t.b2 + z * 10000);
  }
  if (satzP < 45) return t.b3 + 1;
  return t.b4 + 1;
}
