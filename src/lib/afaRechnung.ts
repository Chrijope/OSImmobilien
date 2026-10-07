/**
 * Die Rechnung des AfA-Rechners, ohne Oberflaeche.
 *
 * Hier steht ausschliesslich, wie aus den Angaben eines Objekts die
 * Bemessungsgrundlage, der AfA-Satz und der Jahresbetrag entstehen. Kein React,
 * kein Zustand, keine Darstellung. Das Vorbild ist `steuerRechner.ts`.
 *
 * Warum diese Datei existiert: Die Zahlen aus diesem Rechner tragen Menschen in
 * ihre Steuererklaerung. Solange die Rechnung in einer Anzeigekomponente
 * steckt, laesst sie sich nicht einzeln pruefen, und ein Fehler darin faellt
 * niemandem auf. Jetzt haengt ein Test daran.
 *
 * Die Rechenschritte selbst sind gegenueber der vorherigen Fassung UNVERAENDERT
 * uebernommen worden. Auffaelligkeiten sind kommentiert, aber nicht stillschweigend
 * korrigiert: Was der Rechner heute ausweist, weist er nach dem Herausloesen
 * genauso aus.
 *
 * Die gesetzlichen Saetze und die Restnutzungsdauer stehen weiterhin in
 * `afaSaetze.ts` und `restnutzungsdauer.ts`. Diese Datei fuegt sie zusammen.
 */
import {
  MAX_MOD_PUNKTE,
  MOD_ELEMENTE,
  OBJEKTART_GND,
  ZEITRAUM_OPTIONEN,
  berechneRestnutzungsdauer,
  gndFuerObjektart,
  modernisierungsPunkte,
  type RndErgebnis,
  type RndParameter,
} from "@/lib/restnutzungsdauer";
import {
  afaSatzMitUntergrenze,
  anschaffungsnaheHerstellungskosten,
  type AnschaffungsnahErgebnis,
} from "@/lib/afaSaetze";

/* ── Nebenkosten je Bundesland ──────────────────────────────────────────── */

/**
 * Gesamtnebenkosten je Bundesland: Grunderwerbsteuer plus rund 2 Prozent für
 * Notar und Grundbuch. Die Maklercourtage steckt nicht darin, sie lässt sich
 * über den manuellen Satz ergänzen.
 *
 * Stand der Grunderwerbsteuer: Juli 2026. Bremen liegt seit dem 1. Juli 2025
 * bei 5,5 Prozent, Thüringen seit dem 1. Januar 2024 bei 5,0 Prozent.
 */
export const BUNDESLAND_NK: { value: string; label: string; grEst: number; pct: number }[] = [
  { value: "bw", label: "Baden-Württemberg", grEst: 5.0, pct: 7.0 },
  { value: "bayern", label: "Bayern", grEst: 3.5, pct: 5.5 },
  { value: "berlin", label: "Berlin", grEst: 6.0, pct: 8.0 },
  { value: "brandenburg", label: "Brandenburg", grEst: 6.5, pct: 8.5 },
  { value: "bremen", label: "Bremen", grEst: 5.5, pct: 7.5 },
  { value: "hamburg", label: "Hamburg", grEst: 5.5, pct: 7.5 },
  { value: "hessen", label: "Hessen", grEst: 6.0, pct: 8.0 },
  { value: "mv", label: "Mecklenburg-Vorpommern", grEst: 6.0, pct: 8.0 },
  { value: "niedersachsen", label: "Niedersachsen", grEst: 5.0, pct: 7.0 },
  { value: "nrw", label: "Nordrhein-Westfalen", grEst: 6.5, pct: 8.5 },
  { value: "rlp", label: "Rheinland-Pfalz", grEst: 5.0, pct: 7.0 },
  { value: "saarland", label: "Saarland", grEst: 6.5, pct: 8.5 },
  { value: "sachsen", label: "Sachsen", grEst: 5.5, pct: 7.5 },
  { value: "sa", label: "Sachsen-Anhalt", grEst: 5.0, pct: 7.0 },
  { value: "sh", label: "Schleswig-Holstein", grEst: 6.5, pct: 8.5 },
  { value: "thueringen", label: "Thüringen", grEst: 5.0, pct: 7.0 },
  { value: "andere", label: "Anderes / unbekannt", grEst: 0, pct: 0 },
];

/** Der hinterlegte Gesamtsatz eines Bundeslands, 0 wenn unbekannt. */
export function nebenkostensatzFuerBundesland(bundesland: string): number {
  return BUNDESLAND_NK.find((b) => b.value === bundesland)?.pct ?? 0;
}

/** Nebenkostenbetrag aus Kaufpreis und Satz, auf den Cent gerundet. */
export function nebenkostenBetrag(kaufpreis: number, pct: number): number {
  if (!(kaufpreis > 0) || !(pct > 0)) return 0;
  return Math.round(kaufpreis * (pct / 100) * 100) / 100;
}

/**
 * Grobe Zuordnung der ersten beiden PLZ-Stellen zum Bundesland.
 *
 * Bewusst nur dort, wo der Bereich eindeutig genug ist. Uneindeutige Bereiche
 * geben nichts zurück, damit der Nutzer selbst wählt, statt einen falschen
 * Steuersatz vorgesetzt zu bekommen. Der Vorschlag bleibt in jedem Fall
 * überschreibbar.
 */
export function bundeslandFromPlz(plz: string): string | null {
  const p = (plz || "").trim();
  if (p.length < 2) return null;
  const n = parseInt(p.slice(0, 2), 10);
  if (isNaN(n)) return null;
  if ([1, 2, 4, 8, 9].includes(n)) return "sachsen";
  if (n === 3) return "brandenburg";
  if (n === 6) return "sa";
  if (n === 7) return "thueringen";
  if (n >= 10 && n <= 14) return "berlin";
  if (n === 15 || n === 16) return "brandenburg";
  if (n >= 17 && n <= 19) return "mv";
  if (n === 20 || n === 22) return "hamburg";
  // 21 liegt zwischen Hamburg, Niedersachsen und Schleswig-Holstein.
  if (n >= 23 && n <= 25) return "sh";
  if (n === 28) return "bremen";
  if ([26, 27, 29, 30, 31, 37, 38, 49].includes(n)) return "niedersachsen";
  if (n === 39) return "sa";
  if ([32, 33].includes(n) || (n >= 40 && n <= 48) || (n >= 50 && n <= 53) || (n >= 57 && n <= 59)) return "nrw";
  // 54 Trier, 55 Mainz, 56 Koblenz gehören zu Rheinland-Pfalz.
  if (n >= 54 && n <= 56) return "rlp";
  if (n >= 34 && n <= 36) return "hessen";
  if (n >= 60 && n <= 65) return "hessen";
  if (n === 66) return "saarland";
  if (n === 67) return "rlp";
  if (n >= 68 && n <= 79) return "bw";
  if (n >= 80 && n <= 87) return "bayern";
  if (n === 88) return "bw";
  // 89 teilt sich Ulm (Baden-Württemberg) mit Neu-Ulm (Bayern).
  if (n >= 90 && n <= 97) return "bayern";
  if (n === 98 || n === 99) return "thueringen";
  return null;
}

/* ── Altbestand aus gespeicherten Entwürfen ─────────────────────────────── */

export const OBJEKTARTEN = OBJEKTART_GND.map((o) => o.label);

/** Alle acht Modernisierungselemente auf "über 20 Jahre", die Voreinstellung. */
export const createDefaultModZeitraeume = (): Record<string, string> =>
  Object.fromEntries(MOD_ELEMENTE.map((e) => [e.key, "ueber20"]));

/** Mappt Alt-Zeitraum-Werte (3-stufig) auf die neue 6-stufige Skala. */
const ZEITRAUM_MIGRATION: Record<string, string> = {
  unter10: "5bis10",
  "10bis20": "10bis15",
};

export const migrateZeitraeume = (z: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const k of Object.keys(z)) out[k] = ZEITRAUM_MIGRATION[z[k]] ?? z[k];
  return out;
};

/** Mappt Alt-Objektart-Labels auf das neue 6-stufige Set. */
const OBJEKTART_MIGRATION: Record<string, string> = {
  "Mietwohngrundstück": "Mehrfamilienhaus",
  "Gemischt genutztes Objekt": "Wohn-/Geschäftshaus (gemischt)",
  "Gewerbeobjekt": "Gewerbeobjekt",
};

export const migrateObjektart = (v: string): string =>
  OBJEKTART_MIGRATION[v] ?? (OBJEKTARTEN.includes(v) ? v : "Eigentumswohnung (ETW)");

/** Punkte eines einzelnen Modernisierungselements, wie sie die Oberfläche anzeigt. */
export function punkteFuerElement(maxPunkte: number, zeitraum: string): number {
  const option = ZEITRAUM_OPTIONEN.find((o) => o.value === zeitraum);
  return option ? Math.round(maxPunkte * option.faktor) : 0;
}

/* ── Die Eingaben ───────────────────────────────────────────────────────── */

export type AfaModus = "berechnen" | "gutachten";

export interface AfaEingaben {
  /** Label aus OBJEKTART_GND, bestimmt die Gesamtnutzungsdauer. */
  objektart: string;
  kaufpreis: number;
  /** Kaufnebenkosten gesamt in Euro. */
  nebenkosten: number;
  /** Grundstücksanteil am Kaufpreis in Prozent. */
  bodenAnteilPct: number;
  /** Erhaltungsaufwand gesamt in Euro. Der Feldname ist historisch. */
  sanierungskosten: number;
  /** Ursprüngliches Baujahr. 0 heißt: nicht bekannt. */
  baujahr: number;
  /** Die acht Modernisierungselemente mit ihrem Zeitraum. */
  modZeitraeume: Record<string, string>;
  kernsanierungAktiv: boolean;
  kernsanierungJahr?: number;
  afaModus: AfaModus;
  /** Nur im Modus "gutachten". */
  afaSatzManuell?: number;
  /** Nur im Modus "gutachten". Hat Vorrang vor dem AfA-Satz. */
  rndManuell?: number;
  /**
   * Bewertungsstichjahr. Ohne Angabe das laufende Jahr.
   *
   * Der Parameter existiert nur, damit sich die Rechnung testen lässt, ohne
   * dass die erwarteten Werte am 1. Januar stillschweigend falsch werden.
   */
  stichjahr?: number;
}

export interface AfaRechnung {
  /** Gebäudealter in Jahren zum Stichjahr. 0, wenn das Baujahr fehlt. */
  alter: number;
  /** Baujahr, mit dem gerechnet wird. Bei Kernsanierung deren Jahr. */
  effektivesBaujahr: number;
  /** Gesamtnutzungsdauer der gewählten Objektart. */
  gnd: number;
  modPunkte: number;
  params: RndParameter;
  rnd: number;
  rndMin: number;
  rndMax: number;
  /** Angesetzter AfA-Satz in Prozent, nach gesetzlicher Untergrenze. */
  afaSatz: number;
  /** Satz vor der Untergrenze, also 100 geteilt durch die Restnutzungsdauer. */
  afaSatzRoh: number;
  untergrenze: ReturnType<typeof afaSatzMitUntergrenze>;
  rndErgebnis: RndErgebnis;
  anschaffungsnah: AnschaffungsnahErgebnis;
  kernsaniert: boolean;
  baujahrBekannt: boolean;
  bodenwertGesamt: number;
  gebaeudewert: number;
  gebaeudePct: number;
  bodenPct: number;
  steuerlichGebaeude: number;
  steuerlichNK: number;
  afaBemessungsgrundlage: number;
  afaBetragPa: number;
}

/* ── Die Rechnung ───────────────────────────────────────────────────────── */

/**
 * Aus den Angaben eines Objekts die Abschreibung ermitteln.
 *
 * Der Weg in fünf Schritten:
 *   1. Effektives Baujahr und Gebäudealter. Eine Kernsanierung setzt das
 *      Sanierungsjahr an die Stelle des Baujahrs.
 *   2. Modernisierungspunkte nach Anlage 2 ImmoWertV, daraus die
 *      Restnutzungsdauer, daraus der rohe AfA-Satz (100 geteilt durch RND).
 *      Im Modus "gutachten" tritt die Eingabe an diese Stelle.
 *   3. Der gesetzliche Satz nach § 7 Abs. 4 EStG als Untergrenze.
 *   4. Kaufpreisaufteilung in Boden und Gebäude, anteilige Nebenkosten.
 *   5. Die 15-Prozent-Grenze des § 6 Abs. 1 Nr. 1a EStG entscheidet, ob der
 *      Erhaltungsaufwand die Bemessungsgrundlage erhöht.
 */
export function berechneAfa(e: AfaEingaben): AfaRechnung {
  const currentYear = e.stichjahr ?? new Date().getFullYear();
  const kernsaniert = !!(e.kernsanierungAktiv && e.kernsanierungJahr && e.kernsanierungJahr > 0);
  const effektivesBaujahr = kernsaniert ? e.kernsanierungJahr! : e.baujahr;
  // Ohne Baujahr gibt es kein Gebäudealter und damit keine Restnutzungsdauer.
  // Vorher wurde bei leerem Feld mit dem Jahr 0 gerechnet, was ein relatives
  // Alter von über 2.500 Prozent und eine scheinbar gültige Restnutzungsdauer
  // ergeben hat.
  const baujahrBekannt = !!effektivesBaujahr && effektivesBaujahr > 1000 && effektivesBaujahr <= currentYear;
  const alter = baujahrBekannt ? Math.max(0, currentYear - effektivesBaujahr) : 0;
  const gnd = gndFuerObjektart(e.objektart);

  let modPunkte = modernisierungsPunkte(e.modZeitraeume);
  // Kernsanierung hebt die Punkte auf das an, was zum Sanierungszeitpunkt
  // insgesamt erreichbar wäre.
  if (kernsaniert) {
    const ksAlter = currentYear - e.kernsanierungJahr!;
    const ksFaktor = ksAlter < 5 ? 1.0 : ksAlter < 10 ? 0.85 : ksAlter < 15 ? 0.6 : ksAlter < 20 ? 0.35 : 0.1;
    const maxMod = MOD_ELEMENTE.reduce((s, el) => s + Math.round(el.maxPunkte * ksFaktor), 0);
    modPunkte = Math.min(MAX_MOD_PUNKTE, Math.max(modPunkte, maxMod));
  }

  const rndErgebnis = berechneRestnutzungsdauer({ alter, gnd, modPunkte, kernsaniert });
  const params = rndErgebnis.parameter;
  const rndCalc = baujahrBekannt ? rndErgebnis.rnd : 0;
  const afaSatzCalc = rndCalc > 0 ? 100 / rndCalc : 0;

  let rnd = rndCalc;
  let afaSatzRoh = afaSatzCalc;
  if (e.afaModus === "gutachten") {
    // Bevorzugt RND, sonst aus AfA-Satz ableiten
    if (e.rndManuell && e.rndManuell > 0) {
      rnd = Math.max(1, Math.round(e.rndManuell));
      afaSatzRoh = 100 / rnd;
    } else if (e.afaSatzManuell && e.afaSatzManuell > 0) {
      afaSatzRoh = e.afaSatzManuell;
      rnd = Math.max(1, Math.round(100 / e.afaSatzManuell));
    } else {
      rnd = 0;
      afaSatzRoh = 0;
    }
  }

  // Der gesetzliche Satz ist die Untergrenze. Ein höherer Satz braucht den
  // Nachweis der kürzeren tatsächlichen Nutzungsdauer.
  // Maßgeblich ist das ursprüngliche Baujahr, nicht das Kernsanierungsjahr:
  // Eine Sanierung ist keine Fertigstellung im Sinne des § 7 Abs. 4 EStG.
  const untergrenze = afaSatzMitUntergrenze(afaSatzRoh, e.baujahr, "wohnen");
  const afaSatz = afaSatzRoh > 0 ? untergrenze.satz : 0;

  const bodenwertGesamt = Math.max(0, e.kaufpreis * (e.bodenAnteilPct / 100));
  const gebaeudewert = Math.max(e.kaufpreis - bodenwertGesamt, 0);
  const gesamtwert = e.kaufpreis > 0 ? e.kaufpreis : 1;
  const gebaeudePct = (gebaeudewert / gesamtwert) * 100;
  const bodenPct = (bodenwertGesamt / gesamtwert) * 100;
  const steuerlichGebaeude = gebaeudewert;
  const steuerlichNK = e.nebenkosten * (gebaeudePct / 100);

  // 15-Prozent-Grenze: Wird sie gerissen, ist der Erhaltungsaufwand kein
  // Erhaltungsaufwand mehr, sondern erhöht die AfA-Bemessungsgrundlage.
  const anschaffungsnah = anschaffungsnaheHerstellungskosten(
    steuerlichGebaeude + steuerlichNK,
    e.sanierungskosten,
  );
  const afaBemessungsgrundlage =
    steuerlichGebaeude + steuerlichNK + (anschaffungsnah.ueberschritten ? e.sanierungskosten : 0);
  const afaBetragPa = afaBemessungsgrundlage * (afaSatz / 100);
  const rndMin = Math.max(1, rnd - 2);
  const rndMax = rnd + 2;

  return {
    alter,
    effektivesBaujahr,
    gnd,
    modPunkte,
    params,
    rnd,
    rndMin,
    rndMax,
    afaSatz,
    afaSatzRoh,
    untergrenze,
    rndErgebnis,
    anschaffungsnah,
    kernsaniert,
    baujahrBekannt,
    bodenwertGesamt,
    gebaeudewert,
    gebaeudePct,
    bodenPct,
    steuerlichGebaeude,
    steuerlichNK,
    afaBemessungsgrundlage,
    afaBetragPa,
  };
}

/* ── Wirkung in der Steuererklärung ─────────────────────────────────────── */

/** Übliche Grenzsteuersätze für den Überschlag auf der Ergebnisseite. */
export const GRENZSTEUERSAETZE = [30, 42, 45] as const;

export interface Steuerwirkung {
  /** Jährlicher Erhaltungsaufwand nach § 82b EStDV, verteilt. */
  erhaltungsaufwandProJahr: number;
  /** AfA plus verteilter Erhaltungsaufwand im ersten Jahr. */
  absetzbarErstesJahr: number;
  /** Ersparnis im ersten Jahr beim gewählten Grenzsteuersatz. */
  ersparnisErstesJahr: number;
  /** Ersparnis allein aus der AfA, ohne Erhaltungsaufwand. */
  ersparnisAfaProJahr: number;
}

/**
 * Was die Abschreibung in der Steuererklärung wert ist, überschlägig.
 *
 * Bewusst getrennt von `berechneAfa`: Das hier ist keine Feststellung, sondern
 * eine Multiplikation mit einem angenommenen Grenzsteuersatz. Wer die Zahl
 * zeigt, muss die Annahme dazusagen.
 *
 * Der Erhaltungsaufwand zählt nur mit, wenn er die 15-Prozent-Grenze NICHT
 * gerissen hat. Sonst steckt er bereits in der Bemessungsgrundlage und wäre
 * hier ein zweites Mal gezählt.
 */
export function berechneSteuerwirkung(
  rechnung: AfaRechnung,
  erhaltungsaufwand: number,
  verteilungJahre: number,
  grenzsteuersatz: number,
): Steuerwirkung {
  const jahre = Math.max(1, Math.min(5, Math.round(verteilungJahre) || 1));
  const sofortAbsetzbar = rechnung.anschaffungsnah.ueberschritten ? 0 : Math.max(0, erhaltungsaufwand);
  const erhaltungsaufwandProJahr = sofortAbsetzbar / jahre;
  const absetzbarErstesJahr = rechnung.afaBetragPa + erhaltungsaufwandProJahr;
  const satz = Math.max(0, grenzsteuersatz) / 100;
  return {
    erhaltungsaufwandProJahr,
    absetzbarErstesJahr,
    ersparnisErstesJahr: absetzbarErstesJahr * satz,
    ersparnisAfaProJahr: rechnung.afaBetragPa * satz,
  };
}
