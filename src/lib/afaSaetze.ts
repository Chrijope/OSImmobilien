/**
 * Abschreibung von Gebäuden nach dem EStG.
 *
 * Eine Stelle für alles, was der Gesetzgeber vorgibt. Der AfA-Rechner hat
 * vorher ausschließlich 100 geteilt durch die Restnutzungsdauer gebildet und
 * die gesetzlichen Sätze gar nicht gekannt. Bei einem Neubau kam dabei ein
 * Satz unter einem Prozent heraus, während § 7 Abs. 4 EStG drei Prozent
 * hergibt.
 *
 * Enthalten sind:
 *   § 7 Abs. 4 EStG    lineare AfA, gestaffelt nach Fertigstellung
 *   § 7 Abs. 5a EStG   degressive AfA für Wohngebäude, 5 Prozent vom Restwert
 *   § 7b EStG          Sonderabschreibung Mietwohnungsneubau
 *   § 7i und § 7h      Denkmal und Sanierungsgebiet, vermietet
 *   § 10f EStG         dieselben Objekte bei Eigennutzung
 *   § 6 Abs. 1 Nr. 1a  anschaffungsnahe Herstellungskosten, 15-Prozent-Grenze
 */

export type Gebaeudenutzung = "wohnen" | "betrieb";

export interface LinearerSatz {
  satz: number;
  /** Kurze Begründung, die in der Oberfläche stehen kann. */
  grund: string;
  paragraf: string;
}

/**
 * Linearer AfA-Satz nach § 7 Abs. 4 EStG.
 *
 * 2,5 Prozent bei Fertigstellung vor 1925, 2,0 Prozent von 1925 bis 2022,
 * 3,0 Prozent ab 2023. Für Betriebsgebäude, die nicht Wohnzwecken dienen,
 * gilt bei Zugehörigkeit zum Betriebsvermögen und Bauantrag nach dem
 * 31. März 1985 ebenfalls 3 Prozent.
 */
export function linearerAfaSatz(
  fertigstellungsjahr?: number | null,
  nutzung: Gebaeudenutzung = "wohnen",
): LinearerSatz {
  if (nutzung === "betrieb") {
    return {
      satz: 3,
      grund: "Betriebsgebäude im Betriebsvermögen",
      paragraf: "§ 7 Abs. 4 Satz 1 Nr. 1 EStG",
    };
  }
  const jahr = fertigstellungsjahr && fertigstellungsjahr > 0 ? fertigstellungsjahr : null;
  if (jahr === null) {
    return { satz: 2, grund: "Baujahr unbekannt, Regelsatz", paragraf: "§ 7 Abs. 4 Satz 1 Nr. 2 EStG" };
  }
  if (jahr < 1925) {
    return { satz: 2.5, grund: "Fertigstellung vor 1925", paragraf: "§ 7 Abs. 4 Satz 1 Nr. 2 c EStG" };
  }
  if (jahr >= 2023) {
    return { satz: 3, grund: "Fertigstellung ab 2023", paragraf: "§ 7 Abs. 4 Satz 1 Nr. 2 a EStG" };
  }
  return { satz: 2, grund: "Fertigstellung 1925 bis 2022", paragraf: "§ 7 Abs. 4 Satz 1 Nr. 2 b EStG" };
}

/**
 * Ein aus der Restnutzungsdauer abgeleiteter Satz darf den gesetzlichen nie
 * unterschreiten: Niemand schreibt freiwillig langsamer ab, als das Gesetz
 * erlaubt. Nach oben ist er nur mit Nachweis der kürzeren tatsächlichen
 * Nutzungsdauer zulässig (§ 7 Abs. 4 Satz 2 EStG).
 */
export function afaSatzMitUntergrenze(
  abgeleiteterSatz: number,
  fertigstellungsjahr?: number | null,
  nutzung: Gebaeudenutzung = "wohnen",
): { satz: number; gesetzlich: LinearerSatz; untergrenzeGreift: boolean; nachweisNoetig: boolean } {
  const gesetzlich = linearerAfaSatz(fertigstellungsjahr, nutzung);
  const untergrenzeGreift = abgeleiteterSatz < gesetzlich.satz;
  const satz = untergrenzeGreift ? gesetzlich.satz : abgeleiteterSatz;
  return {
    satz,
    gesetzlich,
    untergrenzeGreift,
    nachweisNoetig: satz > gesetzlich.satz + 1e-9,
  };
}

// ── Degressive AfA § 7 Abs. 5a EStG ─────────────────────────────────────────

export const DEGRESSIV_SATZ = 5;
export const DEGRESSIV_BAUBEGINN_VON = "2023-10-01";
export const DEGRESSIV_BAUBEGINN_BIS = "2029-09-30";

/** Fällt der Baubeginn in das Fenster für die degressive AfA? */
export function degressivMoeglich(baubeginn?: string | null): boolean {
  if (!baubeginn) return false;
  const d = new Date(baubeginn);
  if (Number.isNaN(d.getTime())) return false;
  return d >= new Date(DEGRESSIV_BAUBEGINN_VON) && d <= new Date(DEGRESSIV_BAUBEGINN_BIS);
}

export interface AfaJahr {
  jahr: number;
  /** Bemessungsgrundlage, auf die im Jahr abgeschrieben wird. */
  basis: number;
  betrag: number;
  restbuchwert: number;
  /** Bei Wahlrecht: In diesem Jahr wurde zur linearen AfA gewechselt. */
  gewechselt?: boolean;
}

/**
 * Degressive AfA mit dem gesetzlich vorgesehenen Wechsel zur linearen AfA.
 *
 * Gewechselt wird, sobald die lineare AfA auf den Restbuchwert über die
 * verbleibende Nutzungsdauer den degressiven Betrag übersteigt. Das ist das
 * übliche Vorgehen und maximiert die Abschreibung.
 */
export function degressiverVerlauf(
  bemessungsgrundlage: number,
  jahre: number,
  linearSatz: number,
  degressivSatz = DEGRESSIV_SATZ,
): AfaJahr[] {
  const verlauf: AfaJahr[] = [];
  let restbuchwert = Math.max(0, bemessungsgrundlage);
  const gesamtdauer = linearSatz > 0 ? 100 / linearSatz : jahre;
  let gewechselt = false;

  for (let t = 1; t <= jahre && restbuchwert > 0.01; t++) {
    const degressiv = restbuchwert * (degressivSatz / 100);
    const restdauer = Math.max(1, gesamtdauer - (t - 1));
    const linear = restbuchwert / restdauer;
    const wechseltJetzt = !gewechselt && linear > degressiv;
    if (wechseltJetzt) gewechselt = true;

    const betrag = Math.min(gewechselt ? linear : degressiv, restbuchwert);
    verlauf.push({
      jahr: t,
      basis: restbuchwert,
      betrag,
      restbuchwert: restbuchwert - betrag,
      gewechselt: wechseltJetzt || undefined,
    });
    restbuchwert -= betrag;
  }
  return verlauf;
}

// ── Sonderabschreibung § 7b EStG ────────────────────────────────────────────

export const SONDER_7B_SATZ = 5;
export const SONDER_7B_JAHRE = 4;
/** Baukostenobergrenze je Quadratmeter Wohnfläche. Wird sie gerissen, entfällt die Förderung. */
export const SONDER_7B_BAUKOSTEN_MAX = 5200;
/** Höchste förderfähige Bemessungsgrundlage je Quadratmeter Wohnfläche. */
export const SONDER_7B_BEMESSUNG_MAX = 4000;

export interface Sonder7bErgebnis {
  moeglich: boolean;
  /** Grund, wenn es nicht möglich ist. */
  hinweis: string;
  baukostenJeQm: number;
  /** Gedeckelte Bemessungsgrundlage. */
  bemessungsgrundlage: number;
  betragProJahr: number;
  /** Summe über die vier Jahre. */
  summe: number;
}

/**
 * Sonderabschreibung für den Mietwohnungsneubau.
 *
 * Fünf Prozent pro Jahr in den ersten vier Jahren zusätzlich zur linearen
 * AfA. Die Baukostenobergrenze wirkt als Fallbeil: Wird sie überschritten,
 * entfällt die Förderung vollständig, sie wird nicht nur gekürzt. Die
 * Bemessungsgrundlage selbst ist zusätzlich gedeckelt.
 */
export function sonderabschreibung7b(
  anschaffungskostenGebaeude: number,
  wohnflaeche: number,
): Sonder7bErgebnis {
  const leer: Sonder7bErgebnis = {
    moeglich: false,
    hinweis: "Wohnfläche erforderlich",
    baukostenJeQm: 0,
    bemessungsgrundlage: 0,
    betragProJahr: 0,
    summe: 0,
  };
  if (!wohnflaeche || wohnflaeche <= 0) return leer;

  const baukostenJeQm = anschaffungskostenGebaeude / wohnflaeche;
  if (baukostenJeQm > SONDER_7B_BAUKOSTEN_MAX) {
    return {
      ...leer,
      baukostenJeQm,
      hinweis: `Baukosten je m² über der Obergrenze von ${SONDER_7B_BAUKOSTEN_MAX.toLocaleString("de-DE")} Euro, die Förderung entfällt vollständig`,
    };
  }
  const bemessungsgrundlage = Math.min(anschaffungskostenGebaeude, SONDER_7B_BEMESSUNG_MAX * wohnflaeche);
  const betragProJahr = bemessungsgrundlage * (SONDER_7B_SATZ / 100);
  return {
    moeglich: true,
    hinweis:
      bemessungsgrundlage < anschaffungskostenGebaeude
        ? `Bemessungsgrundlage auf ${SONDER_7B_BEMESSUNG_MAX.toLocaleString("de-DE")} Euro je m² gekürzt`
        : "Innerhalb beider Grenzen",
    baukostenJeQm,
    bemessungsgrundlage,
    betragProJahr,
    summe: betragProJahr * SONDER_7B_JAHRE,
  };
}

// ── Denkmal und Sanierungsgebiet ────────────────────────────────────────────

export type DenkmalModell = "vermietet" | "eigengenutzt";

/**
 * Erhöhte Absetzungen auf den Sanierungsanteil.
 *
 * Vermietet nach § 7i (Baudenkmal) und § 7h (Sanierungsgebiet): acht Jahre
 * je 9 Prozent, danach vier Jahre je 7 Prozent, zusammen 100 Prozent.
 * Eigengenutzt nach § 10f: zehn Jahre je 9 Prozent als Sonderausgaben,
 * zusammen 90 Prozent. Der Altbauanteil läuft daneben mit der normalen
 * linearen AfA, bei Eigennutzung gar nicht.
 */
export function denkmalVerlauf(sanierungskosten: number, modell: DenkmalModell): AfaJahr[] {
  const basis = Math.max(0, sanierungskosten);
  const saetze =
    modell === "vermietet"
      ? [...Array(8).fill(9), ...Array(4).fill(7)]
      : Array(10).fill(9);
  let rest = basis;
  return saetze.map((satz, i) => {
    const betrag = basis * (satz / 100);
    rest -= betrag;
    return { jahr: i + 1, basis, betrag, restbuchwert: Math.max(0, rest) };
  });
}

// ── Anschaffungsnahe Herstellungskosten § 6 Abs. 1 Nr. 1a EStG ──────────────

export const ANSCHAFFUNGSNAH_GRENZE = 0.15;
export const ANSCHAFFUNGSNAH_ZEITRAUM_JAHRE = 3;

export interface AnschaffungsnahErgebnis {
  grenze: number;
  aufwand: number;
  ueberschritten: boolean;
  /** Wie weit darüber oder darunter, in Euro. */
  abstand: number;
  auslastung: number;
}

/**
 * Prüft die 15-Prozent-Grenze.
 *
 * Übersteigen Instandsetzungs- und Modernisierungsaufwendungen innerhalb von
 * drei Jahren nach der Anschaffung 15 Prozent der Gebäude-Anschaffungskosten
 * ohne Umsatzsteuer, werden sie zwingend zu Herstellungskosten. Sie sind dann
 * nicht mehr sofort absetzbar, sondern erhöhen die AfA-Bemessungsgrundlage.
 */
export function anschaffungsnaheHerstellungskosten(
  gebaeudeAnschaffungskosten: number,
  aufwandNettoDreiJahre: number,
): AnschaffungsnahErgebnis {
  const grenze = Math.max(0, gebaeudeAnschaffungskosten) * ANSCHAFFUNGSNAH_GRENZE;
  const aufwand = Math.max(0, aufwandNettoDreiJahre);
  return {
    grenze,
    aufwand,
    ueberschritten: grenze > 0 && aufwand > grenze,
    abstand: aufwand - grenze,
    auslastung: grenze > 0 ? aufwand / grenze : 0,
  };
}

// ── Bewegliche Wirtschaftsgüter ─────────────────────────────────────────────

/** Übliche Nutzungsdauern nach der amtlichen AfA-Tabelle für allgemein verwendbare Anlagegüter. */
export const BEWEGLICH_NUTZUNGSDAUER: { key: string; label: string; jahre: number }[] = [
  { key: "einbaukueche", label: "Einbauküche", jahre: 10 },
  { key: "moebel", label: "Möblierung", jahre: 10 },
  { key: "markise", label: "Markise", jahre: 10 },
  { key: "waschmaschine", label: "Waschmaschine, Trockner", jahre: 10 },
];

/** Lineare AfA eines beweglichen Wirtschaftsguts. */
export function beweglichVerlauf(anschaffungskosten: number, nutzungsdauer: number): AfaJahr[] {
  const jahre = Math.max(1, Math.round(nutzungsdauer));
  const betrag = Math.max(0, anschaffungskosten) / jahre;
  return Array.from({ length: jahre }, (_, i) => ({
    jahr: i + 1,
    basis: anschaffungskosten,
    betrag,
    restbuchwert: Math.max(0, anschaffungskosten - betrag * (i + 1)),
  }));
}
