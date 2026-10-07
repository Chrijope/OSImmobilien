/**
 * Rechenkern des Exposés je Wohneinheit (Konzept Abschnitt 7).
 *
 * Eine reine Funktion, keine Oberfläche, keine Datenbank: Aus Objektdaten und
 * Annahmen entsteht ein vollständiges Ergebnis mit Kaufpreisblock,
 * Finanzierung, Steuerwirkung, Jahresreihe, Monatsrechnung und
 * Vermögensaufbau. Exposé-Seite und PDF rufen dieselbe Funktion auf und
 * zeigen deshalb dieselben Zahlen.
 *
 * Wiederverwendet wird, was es schon gibt:
 *   grunderwerbsteuer.ts   Sätze je Bundesland
 *   notarGrundbuch.ts      Notar und Grundbuch nach GNotKG, Tabelle B
 *   einkommensteuer.ts     Tarif nach § 32a EStG, Grenzsteuersatz, Splitting
 *   steuerHelper.ts        Steuerersparnis nach Differenzmethode
 *   afaSaetze.ts           linearer AfA-Satz nach Baujahr, Sonder-AfA § 7b
 *
 * Bewusste Festlegungen:
 *   - Das Darlehen bezieht sich auf die Gesamtinvestition (Kaufpreis plus
 *     Stellplatz). Die Nebenkosten trägt der Kunde immer aus Eigenkapital,
 *     genau wie in der Vorlage (0 Prozent Eigenkapital = 100 Prozent
 *     Finanzierung, Eigenkapitaleinsatz = Nebenkosten).
 *   - Der Tilgungsplan rechnet monatlich (Zins auf die jeweilige Restschuld,
 *     gleichbleibende Rate). Das entspricht der Bankpraxis und der Vorlage;
 *     berechneTilgungsplan in eigeneInvestmentBerechnungen.ts rechnet
 *     jährlich und weicht über zehn Jahre um einige hundert Euro ab.
 *   - Rendite ist genau eine Zahl: Jahreskaltmiete geteilt durch Kaufpreis
 *     inklusive Stellplatz (Entscheidung Christian).
 *   - Die einmalige Steuerersparnis aus einer Sanierung wird gesondert
 *     ausgewiesen und fließt nicht in Monatsrechnung, Vermögensaufbau und
 *     Eigenkapitalrendite ein (wie in der Vorlage).
 */

import {
  bundeslandById,
  kaufnebenkostenProzent,
  NOTAR_GRUNDBUCH_PROZENT,
} from "@/lib/grunderwerbsteuer";
import { notarGrundbuchKosten, type NotarGrundbuchKosten } from "@/lib/notarGrundbuch";
import { renditeProzent } from "@/lib/objektKennzahlen";
import { nebenkostenBasis } from "@/lib/kaufnebenkosten";
import {
  aktuellesSteuerjahr,
  grenzsteuersatzProzent,
  type Steuerjahr,
  type Veranlagung,
} from "@/lib/einkommensteuer";
import { berechneSteuerersparnis } from "@/lib/steuerHelper";
import {
  linearerAfaSatz,
  sonderabschreibung7b,
  SONDER_7B_JAHRE,
  SONDER_7B_SATZ,
} from "@/lib/afaSaetze";
// Nur Typen, damit der Rechenkern keine Store-Abhängigkeiten der Annahmen-Vorbelegung mitzieht.
import type { ExposeAnnahmen, Tilgungsmodus, ZweitesDarlehenErsetzt } from "@/lib/exposeAnnahmen";

export type { ExposeAnnahmen, Instandhaltungsart, Tilgungsmodus, ZweitesDarlehenErsetzt } from "@/lib/exposeAnnahmen";

/** Gebäudeanteil am Kaufpreis, wenn das Objekt keine Kaufpreisaufteilung kennt. */
export const STANDARD_GEBAEUDEANTEIL_PROZENT = 80;

// ── Eingaben ────────────────────────────────────────────────────────────────

export type SonderAfaBasis = "gebaeudeanteil" | "sanierungsanteil";

export interface ExposeObjektdaten {
  /** Kaufpreis der Wohnung ohne Stellplatz in Euro. */
  kaufpreis: number;
  stellplatzpreis?: number;
  wohnflaeche?: number | null;
  /** Kaltmiete je Monat in Euro, mit Stellplatzmiete. */
  kaltmieteMonat: number;
  /** Davon die Stellplatzmiete je Monat. Zählt für die Mietrendite nicht mit. */
  stellplatzMieteMonat?: number;
  /** Hausgeld gesamt je Monat, nur zur Anzeige und für den umlegbaren Rest. */
  hausgeldGesamtMonat?: number;
  /** Nicht umlegbarer Anteil des Hausgelds je Monat (Verwaltung, Kontoführung), steuerlich abziehbar. */
  hausgeldNichtUmlegbarMonat?: number;
  /** Zuführung zur Erhaltungsrücklage je Monat, Ausgabe, aber nicht abziehbar. */
  ruecklageMonat?: number;
  /** Kosten der Mietverwaltung je Monat, abziehbar; über die Annahmen abschaltbar. */
  mietverwaltungMonat?: number;
  /** Bundesland als Kürzel aus grunderwerbsteuer.ts, zum Beispiel "by". */
  bundeslandId?: string | null;
  /**
   * Nebenkosten in Prozent ohne Makler (Grunderwerbsteuer plus Notar und
   * Grundbuch), falls am Objekt gepflegt. Überschreibt das Bundesland.
   */
  kaufnebenkostenProzent?: number | null;
  baujahr?: number | null;
  /** Gebäudeanteil am Kaufpreis in Prozent (Kaufpreisaufteilung), Grundlage der AfA. */
  gebaeudeanteilProzent?: number | null;
  /** Kosten der beschlossenen Maßnahme am Gemeinschaftseigentum in Euro, gesamt. */
  sanierungskostenGesamt?: number;
  /** Miteigentumsanteil in Prozent, mit dem die Maßnahme auf die Einheit entfällt. */
  miteigentumsanteilProzent?: number;
  /** Sanierungsanteil der Einheit in Euro, wenn er direkt bekannt ist. Geht vor Kosten mal Anteil. */
  sanierungsanteilEuro?: number;
  /** Kalenderjahr der Fertigstellung, ab dem der Erhaltungsaufwand wirkt. Ohne Angabe das Startjahr. */
  sanierungFertigstellungJahr?: number | null;
  /** Satz der Sonder-AfA in Prozent je Jahr. Ohne Angabe gilt § 7b EStG mit seinen Grenzen. */
  sonderAfaProzent?: number | null;
  /** Dauer der Sonder-AfA in Jahren. Ohne Angabe vier Jahre wie § 7b EStG. */
  sonderAfaJahre?: number | null;
  /** Worauf die Sonder-AfA gerechnet wird. Standard Gebäudeanteil (§ 7b), sonst erhöhte AfA auf den Sanierungsanteil. */
  sonderAfaBasis?: SonderAfaBasis;
  /** Jahre mit Mietgarantie, in denen kein Leerstand angesetzt wird. */
  mietgarantieJahre?: number;
  /** Datum (ISO) einer noch ausstehenden Mieterhöhung. Ab dann gilt mieterhoehungKaltmieteMonat. */
  mieterhoehungAb?: string | null;
  /** Kaltmiete je Monat nach der Mieterhöhung, gleiche Zusammensetzung wie kaltmieteMonat. */
  mieterhoehungKaltmieteMonat?: number | null;
}

// ── Ergebnis ────────────────────────────────────────────────────────────────

export type NebenkostenQuelle = "bundesland" | "manuell" | "mittelwert";

export interface ExposeNebenkosten {
  grunderwerbsteuerProzent: number;
  grunderwerbsteuer: number;
  /** Notar und Grundbuch zusammen in Prozent der Basis, aus der Gebührentabelle zurückgerechnet. */
  notarGrundbuchProzent: number;
  notarGrundbuch: number;
  /** Einzelpositionen nach GNotKG, Geschäftswert die Basis, Grundschuld auf das Bankdarlehen. */
  gebuehren: NotarGrundbuchKosten;
  maklerProzent: number;
  makler: number;
  /**
   * Worauf die Nebenkosten laufen: die Gesamtinvestition ohne Sanierungsanteil
   * (seit dem 30.09.2026, siehe `nebenkostenBasis`). Ohne Sanierung ist das
   * die Gesamtinvestition. Alle Prozentangaben hier beziehen sich darauf.
   */
  basis: number;
  /** Summe der Sätze in Prozent der Basis. */
  prozentGesamt: number;
  summe: number;
  quelle: NebenkostenQuelle;
  bundeslandName: string | null;
}

export interface ExposeKauf {
  kaufpreis: number;
  preisanpassungProzent: number;
  /** Kaufpreis nach Rabatt oder Aufschlag. */
  kaufpreisAngepasst: number;
  stellplatz: number;
  /** Kaufpreis angepasst plus Stellplatz, Bezugsgröße für Darlehen und Rendite. */
  gesamtinvestition: number;
  nebenkosten: ExposeNebenkosten;
  /** true, wenn der Verkäufer die Nebenkosten übernimmt. */
  nebenkostenTraegtVerkaeufer: boolean;
  /** Nebenkosten, die der Kunde zahlt: die Summe, oder 0 wenn der Verkäufer sie übernimmt. */
  nebenkostenKunde: number;
  /** Gesamtinvestition plus Nebenkosten des Kunden, zugleich AfA-Grundlage vor Gebäudeanteil. */
  anschaffungskosten: number;
  /** Alle Darlehen zusammen: Bankdarlehen plus zweites Darlehen. */
  darlehen: number;
  /** Eigenkapital, das in die Gesamtinvestition fließt (ohne Nebenkosten). */
  eigenkapitalInvestition: number;
  /** Eigenkapital gesamt: Nebenkosten des Kunden plus Eigenkapital an der Investition, abzüglich Eigenkapitalersatz. */
  eigenkapitaleinsatz: number;
  /** Anteil aller Darlehen an der Gesamtinvestition in Prozent, über 100 bei Eigenkapitalersatz. */
  finanzierungsquoteProzent: number;
}

export interface TilgungsJahr {
  /** 1 = erstes Jahr. */
  jahr: number;
  kalenderjahr: number;
  zinsen: number;
  tilgung: number;
  /** Tatsächlich gezahlte Rate im Jahr, nach Volltilgung kleiner als die Annuität. */
  rate: number;
  restschuldEnde: number;
}

export interface ExposeZweitesDarlehen {
  betrag: number;
  zinsProzent: number;
  tilgungProzent: number;
  monatsrate: number;
  ersetzt: ZweitesDarlehenErsetzt;
  tilgungsplan: TilgungsJahr[];
}

export interface ExposeFinanzierung {
  /** Sollzins des Bankdarlehens. */
  zinsProzent: number;
  /** Anfängliche Tilgung des Bankdarlehens, im Laufzeitmodus aus der Laufzeit berechnet. */
  tilgungProzent: number;
  tilgungsmodus: Tilgungsmodus;
  /** Laufzeit des Bankdarlehens bis zur Volltilgung in Jahren: vorgegeben oder aus Zins und Tilgung berechnet, null ohne Darlehen. */
  laufzeitJahre: number | null;
  bankdarlehen: number;
  /** Rate des Bankdarlehens je Monat. */
  bankMonatsrate: number;
  zweitesDarlehen: ExposeZweitesDarlehen | null;
  /** Rate aller Darlehen je Monat. */
  monatsrate: number;
  jahresannuitaet: number;
  /** Tilgungsplan aller Darlehen zusammen. */
  tilgungsplan: TilgungsJahr[];
  /** Jahr, in dem alle Darlehen getilgt sind, null wenn innerhalb der Haltedauer nicht erreicht. */
  volltilgungImJahr: number | null;
}

export interface ExposeSteuer {
  steuerjahr: Steuerjahr;
  veranlagung: Veranlagung;
  /** Grenzsteuersatz zur Anzeige, aus dem Tarif oder manuell. */
  grenzsteuersatzProzent: number;
  grenzsteuersatzManuell: boolean;
  gebaeudeanteilProzent: number;
  /** true, wenn der Gebäudeanteil nicht am Objekt steht und der Standardwert gilt. */
  gebaeudeanteilAngenommen: boolean;
  /** Gebäudeanteil der Anschaffungskosten; ein als Erhaltungsaufwand abgezogener Sanierungsanteil ist herausgerechnet. */
  afaBasis: number;
  afaProzent: number;
  afaJahr: number;
  sonderAfaAktiv: boolean;
  sonderAfaBasis: number;
  sonderAfaProzent: number;
  sonderAfaJahre: number;
  sonderAfaJahr: number;
  sonderAfaHinweis: string;
  /** Sanierungsanteil der Einheit in Euro. */
  sanierungsanteil: number;
  /** Kalenderjahr, ab dem der Erhaltungsaufwand wirkt. */
  sanierungAbJahr: number;
  /** Steuerersparnis aus dem Sanierungsanteil über alle Jahre, gesondert ausgewiesen. */
  einmaligeSteuerersparnisSanierung: number;
}

export interface ExposeJahr {
  /** 0 = Startjahr. */
  index: number;
  kalenderjahr: number;
  mieteBrutto: number;
  leerstand: number;
  mieteNetto: number;
  hausgeldNichtUmlegbar: number;
  ruecklage: number;
  mietverwaltung: number;
  zinsen: number;
  tilgung: number;
  rate: number;
  afa: number;
  sonderAfa: number;
  erhaltungsaufwand: number;
  werbungskosten: number;
  /** Einkünfte aus Vermietung, negativ = Verlust. */
  ergebnisVermietung: number;
  /** Steuerwirkung des Jahres, positiv = Ersparnis, inklusive Sanierung. */
  steuerwirkung: number;
  /** Steuerwirkung ohne den Sanierungsanteil, Grundlage für Monatsrechnung und Vermögensaufbau. */
  steuerwirkungOhneSanierung: number;
  /** Zufluss im Jahr: mit Lohnsteuerermäßigung sofort, sonst die Erstattung des Vorjahres. */
  steuerwirkungZahlungswirksam: number;
  /** Cashflow des Jahres ohne Sanierungseffekt, negativ = Zuzahlung. */
  cashflow: number;
  kumCashflow: number;
  restschuldEnde: number;
  immobilienwertEnde: number;
  /** Monatlicher Eigenanteil, positiv = der Kunde zahlt zu. */
  eigenanteilMonat: number;
}

export interface ExposeMonat {
  kalenderjahr: number;
  miete: number;
  steuervorteil: number;
  einnahmen: number;
  zins: number;
  tilgung: number;
  zinsUndTilgung: number;
  hausgeldNichtUmlegbar: number;
  ruecklage: number;
  mietverwaltung: number;
  leerstand: number;
  ausgaben: number;
  /** Positiv = der Kunde zahlt zu, negativ = Überschuss. */
  eigenanteil: number;
}

export interface ExposeHorizont {
  jahre: number;
  kalenderjahr: number;
  kaufpreisHeute: number;
  immobilienwert: number;
  restschuld: number;
  ertragBeiVerkauf: number;
  kumCashflow: number;
  /** Ertrag bei Verkauf plus kumulierter Cashflow. */
  vermoegen: number;
  eigenkapitaleinsatz: number;
  /** Aufgebautes Vermögen je eingesetztem Euro, null ohne Eigenkapital. */
  faktorJeEuro: number | null;
  /** Jährliche Eigenkapitalrendite in Prozent, null wenn nicht bestimmbar. */
  eigenkapitalrenditeProzent: number | null;
}

export interface ExposeKennzahlen {
  /** Jahreskaltmiete geteilt durch Kaufpreis inklusive Stellplatz, in Prozent. */
  mietrenditeProzent: number;
  /** Jahreskaltmiete abzüglich nicht umlegbarer Kosten, geteilt durch die Anschaffungskosten, in Prozent. */
  nettomietrenditeProzent: number;
  /** Erstes Kalenderjahr, in dem der Cashflow nach Steuern nicht mehr negativ ist, null wenn nie. */
  breakEvenJahr: number | null;
  jahreskaltmiete: number;
  preisJeQm: number | null;
  mieteJeQm: number | null;
  hausgeldUmlegbarMonat: number;
}

export interface ExposeErgebnis {
  kauf: ExposeKauf;
  finanzierung: ExposeFinanzierung;
  steuer: ExposeSteuer;
  kennzahlen: ExposeKennzahlen;
  jahresreihe: ExposeJahr[];
  monat: ExposeMonat;
  vermoegensaufbau: ExposeHorizont[];
  /** Angewandte Annahmen und Ausweichregeln in Klartext. */
  hinweise: string[];
}

export const VERMOEGENS_HORIZONTE = [10, 20, 30, 40] as const;

// ── Hilfen ──────────────────────────────────────────────────────────────────

function zahl(v: number | null | undefined, standard = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : standard;
}

function begrenzt(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Tarifjahr für ein Kalenderjahr, außerhalb der hinterlegten Tarife das nächstliegende. */
function steuerjahrFuer(kalenderjahr: number): Steuerjahr {
  return aktuellesSteuerjahr(new Date(kalenderjahr, 0, 1));
}

interface Steuerregel {
  zvE: number;
  veranlagung: Veranlagung;
  verheiratet: boolean;
  manuellProzent: number | null;
}

/**
 * Steuerwirkung eines Vermietungsergebnisses, positiv = Ersparnis.
 * Mit manuellem Satz flach, sonst Differenzmethode nach Tarif.
 */
function steuerwirkung(ergebnis: number, kalenderjahr: number, regel: Steuerregel): number {
  if (ergebnis === 0) return 0;
  if (regel.manuellProzent != null) return -ergebnis * (regel.manuellProzent / 100);
  if (regel.zvE <= 0) return 0;
  return berechneSteuerersparnis(regel.zvE, -ergebnis, regel.verheiratet, steuerjahrFuer(kalenderjahr)).ersparnis;
}

/** Monatliche Annuität: Zins auf die Restschuld, Rest der Rate tilgt. */
function tilgungsplanMonatlich(
  darlehen: number,
  zinsProzent: number,
  tilgungProzent: number,
  jahre: number,
  startjahr: number,
): { plan: TilgungsJahr[]; monatsrate: number } {
  const monatsrate = (darlehen * (zinsProzent + tilgungProzent)) / 100 / 12;
  const zinsMonat = zinsProzent / 100 / 12;
  const plan: TilgungsJahr[] = [];
  let rest = darlehen;
  for (let j = 0; j < jahre; j++) {
    let zinsen = 0;
    let tilgung = 0;
    let rate = 0;
    for (let m = 0; m < 12; m++) {
      if (rest <= 0) break;
      const z = rest * zinsMonat;
      const t = Math.min(Math.max(0, monatsrate - z), rest);
      rest -= t;
      // Gleitkommareste unter einem halben Cent gelten als getilgt.
      if (rest < 0.005) rest = 0;
      zinsen += z;
      tilgung += t;
      rate += z + t;
    }
    plan.push({ jahr: j + 1, kalenderjahr: startjahr + j, zinsen, tilgung, rate, restschuldEnde: Math.max(0, rest) });
  }
  return { plan, monatsrate };
}

/** Zwei Tilgungspläne gleicher Länge Jahr für Jahr addieren. */
function summierePlaene(a: TilgungsJahr[], b: TilgungsJahr[]): TilgungsJahr[] {
  return a.map((z, i) => {
    const y = b[i];
    if (!y) return z;
    return {
      jahr: z.jahr,
      kalenderjahr: z.kalenderjahr,
      zinsen: z.zinsen + y.zinsen,
      tilgung: z.tilgung + y.tilgung,
      rate: z.rate + y.rate,
      restschuldEnde: z.restschuldEnde + y.restschuldEnde,
    };
  });
}

/**
 * Anfängliche Tilgung in Prozent, mit der ein Darlehen bei monatlicher
 * Annuität nach `jahre` Jahren getilgt ist (Annuitätenformel).
 */
export function tilgungAusLaufzeit(zinsProzent: number, jahre: number): number {
  const j = Math.max(1 / 12, jahre);
  if (zinsProzent <= 0) return 100 / j;
  const i = zinsProzent / 100 / 12;
  const n = Math.round(j * 12);
  const rateJeEuro = i / (1 - Math.pow(1 + i, -n));
  return Math.max(0, rateJeEuro * 12 * 100 - zinsProzent);
}

/**
 * Laufzeit in Jahren bis zur Volltilgung bei monatlicher Annuität aus Zins
 * und anfänglicher Tilgung, null ohne Tilgung.
 */
export function laufzeitAusTilgung(zinsProzent: number, tilgungProzent: number): number | null {
  if (tilgungProzent <= 0) return null;
  if (zinsProzent <= 0) return 100 / tilgungProzent;
  const i = zinsProzent / 100 / 12;
  const rateJeEuro = (zinsProzent + tilgungProzent) / 100 / 12;
  const monate = -Math.log(1 - i / rateJeEuro) / Math.log(1 + i);
  return monate / 12;
}

/** Jahr und Monat (1 bis 12) aus einem ISO-Datum, null wenn unlesbar. */
function jahrMonatAus(iso: string | null | undefined): { jahr: number; monat: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return null;
  const jahr = Number(m[1]);
  const monat = Number(m[2]);
  if (!Number.isFinite(jahr) || monat < 1 || monat > 12) return null;
  return { jahr, monat };
}

// ── Rechnung ────────────────────────────────────────────────────────────────

export function berechneExpose(objekt: ExposeObjektdaten, annahmen: ExposeAnnahmen): ExposeErgebnis {
  const hinweise: string[] = [];
  const haltedauer = Math.round(begrenzt(zahl(annahmen.haltedauerJahre, 40), 1, 60));
  const startjahr = Math.round(zahl(annahmen.startjahr, new Date().getFullYear()));

  // Kaufpreisblock
  const kaufpreis = Math.max(0, zahl(objekt.kaufpreis));
  const preisanpassungProzent = zahl(annahmen.preisanpassungProzent);
  const kaufpreisAngepasst = kaufpreis * (1 + preisanpassungProzent / 100);
  const stellplatz = Math.max(0, zahl(objekt.stellplatzpreis));
  const gesamtinvestition = kaufpreisAngepasst + stellplatz;

  /*
    Sanierungsanteil der Einheit. Er steckt im Kaufpreis und ist bei uns eine
    gesonderte, im Notarvertrag eigens ausgewiesene Leistung. Deshalb laufen
    seit dem 30.09.2026 alle Kaufnebenkosten nur auf die Gesamtinvestition
    ohne ihn, dieselbe Regel wie im Investmentrechner (`nebenkostenBasis`).
    Vorher liefen sie auf die ganze Gesamtinvestition.
  */
  const sanierungsanteil = Math.max(
    0,
    typeof objekt.sanierungsanteilEuro === "number" && objekt.sanierungsanteilEuro > 0
      ? objekt.sanierungsanteilEuro
      : zahl(objekt.sanierungskostenGesamt) * (zahl(objekt.miteigentumsanteilProzent) / 100),
  );
  // Einen Möbelanteil kennt der Exposé-Rechner nicht (kein Feld am Objekt, das er liest), deshalb 0.
  const basis = nebenkostenBasis(gesamtinvestition, sanierungsanteil, 0);

  // Notar und Grundbuch nach Gebührentabelle: Geschäftswert ist die Basis,
  // die Grundschuld wird auf das Bankdarlehen bestellt (Eigenkapitalanteil abgezogen).
  const eigenkapitalProzent = begrenzt(zahl(annahmen.eigenkapitalProzent), 0, 100);
  const bankdarlehenSoll = gesamtinvestition * (1 - eigenkapitalProzent / 100);
  const gebuehren = notarGrundbuchKosten(basis, bankdarlehenSoll);

  const bundesland = bundeslandById(objekt.bundeslandId);
  const manuell = objekt.kaufnebenkostenProzent;
  let quelle: NebenkostenQuelle;
  let grunderwerbsteuer: number;
  let notarGrundbuch = gebuehren.summe;
  if (typeof manuell === "number" && Number.isFinite(manuell) && manuell > 0) {
    // Am Objekt steht die Summe ohne Makler: Gebühren nach Tabelle, der Rest ist Grunderwerbsteuer.
    quelle = "manuell";
    const summeManuell = basis * (manuell / 100);
    notarGrundbuch = Math.min(notarGrundbuch, summeManuell);
    grunderwerbsteuer = summeManuell - notarGrundbuch;
    hinweise.push(`Nebenkosten ${manuell} % wie am Objekt gepflegt.`);
  } else if (bundesland) {
    quelle = "bundesland";
    grunderwerbsteuer = basis * (bundesland.grunderwerbsteuer / 100);
  } else {
    quelle = "mittelwert";
    grunderwerbsteuer = basis * ((kaufnebenkostenProzent(null) - NOTAR_GRUNDBUCH_PROZENT) / 100);
    hinweise.push("Bundesland unbekannt, Grunderwerbsteuer als Mittelwert aller Länder angesetzt.");
  }
  const prozentVon = (betrag: number) => (basis > 0 ? (betrag / basis) * 100 : 0);
  const grunderwerbsteuerProzent = prozentVon(grunderwerbsteuer);
  const notarGrundbuchProzent = prozentVon(notarGrundbuch);
  const maklerProzent = Math.max(0, zahl(annahmen.maklerProzent));
  const makler = basis * (maklerProzent / 100);
  const nebenkosten: ExposeNebenkosten = {
    grunderwerbsteuerProzent,
    grunderwerbsteuer,
    notarGrundbuchProzent,
    notarGrundbuch,
    gebuehren,
    maklerProzent,
    makler,
    basis,
    prozentGesamt: grunderwerbsteuerProzent + notarGrundbuchProzent + maklerProzent,
    summe: grunderwerbsteuer + notarGrundbuch + makler,
    quelle,
    bundeslandName: bundesland?.name ?? null,
  };

  const nebenkostenTraegtVerkaeufer = !!annahmen.nebenkostenTraegtVerkaeufer;
  const nebenkostenKunde = nebenkostenTraegtVerkaeufer ? 0 : nebenkosten.summe;
  if (nebenkostenTraegtVerkaeufer) {
    hinweise.push("Kaufnebenkosten übernimmt der Verkäufer: kein Eigenkapital dafür, sie erhöhen auch nicht die AfA-Grundlage.");
  }

  let bankdarlehen = bankdarlehenSoll;
  let eigenkapitaleinsatz = nebenkostenKunde + (gesamtinvestition - bankdarlehenSoll);

  // Zweites Darlehen: ersetzt einen Teil des Bankdarlehens (KfW) oder das Eigenkapital (Eigenkapitalersatz).
  const zweitesErsetzt: ZweitesDarlehenErsetzt = annahmen.zweitesDarlehenErsetzt === "eigenkapital" ? "eigenkapital" : "bankdarlehen";
  const zweitesGewuenscht = annahmen.zweitesDarlehenAktiv ? Math.max(0, zahl(annahmen.zweitesDarlehenBetrag)) : 0;
  let zweitesBetrag = 0;
  if (zweitesGewuenscht > 0) {
    if (zweitesErsetzt === "eigenkapital") {
      zweitesBetrag = Math.min(zweitesGewuenscht, eigenkapitaleinsatz);
      eigenkapitaleinsatz -= zweitesBetrag;
    } else {
      zweitesBetrag = Math.min(zweitesGewuenscht, bankdarlehenSoll);
      bankdarlehen = bankdarlehenSoll - zweitesBetrag;
    }
    if (zweitesBetrag < zweitesGewuenscht) {
      hinweise.push(zweitesErsetzt === "eigenkapital"
        ? "Zweites Darlehen auf den Eigenkapitaleinsatz begrenzt, mehr gibt es nicht zu ersetzen."
        : "Zweites Darlehen auf das Bankdarlehen begrenzt, mehr gibt es nicht zu ersetzen.");
    }
  }
  const darlehen = bankdarlehen + zweitesBetrag;
  const eigenkapitalInvestition = Math.max(0, gesamtinvestition - darlehen);
  const anschaffungskosten = gesamtinvestition + nebenkostenKunde;
  const kauf: ExposeKauf = {
    kaufpreis,
    preisanpassungProzent,
    kaufpreisAngepasst,
    stellplatz,
    gesamtinvestition,
    nebenkosten,
    nebenkostenTraegtVerkaeufer,
    nebenkostenKunde,
    anschaffungskosten,
    darlehen,
    eigenkapitalInvestition,
    eigenkapitaleinsatz,
    finanzierungsquoteProzent: gesamtinvestition > 0 ? (darlehen / gesamtinvestition) * 100 : 0,
  };

  // Finanzierung: Tilgung vorgegeben oder aus der Laufzeit abgeleitet
  const zinsProzent = Math.max(0, zahl(annahmen.zinsProzent));
  const tilgungsmodus: Tilgungsmodus = annahmen.tilgungsmodus === "laufzeit" ? "laufzeit" : "tilgung";
  let tilgungProzent: number;
  let laufzeitJahre: number | null;
  if (tilgungsmodus === "laufzeit") {
    laufzeitJahre = Math.round(begrenzt(zahl(annahmen.laufzeitJahre, 30), 1, 60));
    tilgungProzent = tilgungAusLaufzeit(zinsProzent, laufzeitJahre);
  } else {
    tilgungProzent = Math.max(0, zahl(annahmen.tilgungProzent));
    laufzeitJahre = laufzeitAusTilgung(zinsProzent, tilgungProzent);
  }
  if (bankdarlehen <= 0) laufzeitJahre = null;
  const bank = tilgungsplanMonatlich(bankdarlehen, zinsProzent, tilgungProzent, haltedauer, startjahr);
  let plan = bank.plan;
  let monatsrate = bank.monatsrate;
  let zweitesDarlehen: ExposeZweitesDarlehen | null = null;
  if (zweitesBetrag > 0) {
    const zZins = Math.max(0, zahl(annahmen.zweitesDarlehenZinsProzent));
    const zTilgung = Math.max(0, zahl(annahmen.zweitesDarlehenTilgungProzent));
    const zweites = tilgungsplanMonatlich(zweitesBetrag, zZins, zTilgung, haltedauer, startjahr);
    zweitesDarlehen = { betrag: zweitesBetrag, zinsProzent: zZins, tilgungProzent: zTilgung, monatsrate: zweites.monatsrate, ersetzt: zweitesErsetzt, tilgungsplan: zweites.plan };
    plan = summierePlaene(bank.plan, zweites.plan);
    monatsrate += zweites.monatsrate;
  }
  const volltilgung = plan.find((z) => z.restschuldEnde <= 0.005 && darlehen > 0);
  const finanzierung: ExposeFinanzierung = {
    zinsProzent,
    tilgungProzent,
    tilgungsmodus,
    laufzeitJahre,
    bankdarlehen,
    bankMonatsrate: bank.monatsrate,
    zweitesDarlehen,
    monatsrate,
    jahresannuitaet: monatsrate * 12,
    tilgungsplan: plan,
    volltilgungImJahr: volltilgung ? volltilgung.kalenderjahr : null,
  };

  // Steuer: Grundlagen
  const gebaeudeanteilAngenommen = !(typeof objekt.gebaeudeanteilProzent === "number" && objekt.gebaeudeanteilProzent > 0);
  const gebaeudeanteilProzent = gebaeudeanteilAngenommen
    ? STANDARD_GEBAEUDEANTEIL_PROZENT
    : begrenzt(objekt.gebaeudeanteilProzent as number, 0, 100);
  if (gebaeudeanteilAngenommen) {
    hinweise.push(`Gebäudeanteil nicht am Objekt gepflegt, ${STANDARD_GEBAEUDEANTEIL_PROZENT} % angenommen.`);
  }
  const instandhaltungsart = sanierungsanteil > 0 ? annahmen.instandhaltungsart : "keine";
  /*
    Gebäudeteil der Anschaffungskosten, seit dem 30.09.2026 ohne Doppelzählung
    des Sanierungsanteils, wie im Investmentrechner.

    Der Anteil steckt im Kaufpreis und damit schon im Gebäudeteil. Vorher
    wirkte er doppelt: Als Erhaltungsaufwand wurde er sofort abgezogen und
    zugleich über den Kaufpreis abgeschrieben, als Werkvertrag kam er ein
    zweites Mal auf die AfA-Grundlage obendrauf. Jetzt verlässt er den
    Gebäudeteil, wenn er als Erhaltungsaufwand abgezogen wird, und bleibt
    sonst genau einmal darin. Er mindert nur das Gebäude, nie den Boden, und
    höchstens um den Gebäudeteil selbst, damit die Grundlage nicht negativ
    wird. Nebenkosten entfallen auf ihn ohnehin keine mehr, siehe oben.
  */
  const gebaeudeVorSanierung = anschaffungskosten * (gebaeudeanteilProzent / 100);
  const gebaeudeAnschaffungskosten =
    instandhaltungsart === "erhaltungsaufwand"
      ? gebaeudeVorSanierung - Math.min(sanierungsanteil, gebaeudeVorSanierung)
      : gebaeudeVorSanierung;
  const instandhaltungJahre = Math.round(begrenzt(zahl(annahmen.instandhaltungJahre, 1), 1, 5));
  const sanierungAbJahr = Math.max(startjahr, Math.round(zahl(objekt.sanierungFertigstellungJahr, startjahr)));

  const afaProzent = Math.max(0, zahl(annahmen.afaProzent, linearerAfaSatz(objekt.baujahr).satz));
  const afaBasis = gebaeudeAnschaffungskosten;
  const afaJahr = afaBasis * (afaProzent / 100);
  if (instandhaltungsart === "werkvertrag") {
    hinweise.push("Sanierung als Werkvertrag: Herstellungskosten, erhöhen die AfA-Grundlage statt sofort abziehbar zu sein.");
  }

  let sonderAfaBasisBetrag = 0;
  let sonderAfaProzent = 0;
  let sonderAfaJahre = 0;
  let sonderAfaHinweis = "";
  if (annahmen.sonderAfa) {
    const basisArt: SonderAfaBasis = objekt.sonderAfaBasis ?? "gebaeudeanteil";
    const satzManuell = typeof objekt.sonderAfaProzent === "number" && objekt.sonderAfaProzent > 0;
    sonderAfaJahre = Math.round(Math.max(1, zahl(objekt.sonderAfaJahre, SONDER_7B_JAHRE)));
    if (basisArt === "sanierungsanteil") {
      sonderAfaBasisBetrag = sanierungsanteil;
      sonderAfaProzent = satzManuell ? (objekt.sonderAfaProzent as number) : SONDER_7B_SATZ;
      sonderAfaHinweis = sanierungsanteil > 0
        ? `Erhöhte AfA ${sonderAfaProzent} % auf den Sanierungsanteil über ${sonderAfaJahre} Jahre.`
        : "Sonder-AfA nicht angesetzt: kein Sanierungsanteil bekannt.";
    } else if (satzManuell) {
      sonderAfaBasisBetrag = gebaeudeAnschaffungskosten;
      sonderAfaProzent = objekt.sonderAfaProzent as number;
      sonderAfaHinweis = `Sonder-AfA ${sonderAfaProzent} % auf den Gebäudeanteil über ${sonderAfaJahre} Jahre.`;
    } else {
      const erg7b = sonderabschreibung7b(gebaeudeAnschaffungskosten, zahl(objekt.wohnflaeche));
      if (erg7b.moeglich) {
        sonderAfaBasisBetrag = erg7b.bemessungsgrundlage;
        sonderAfaProzent = SONDER_7B_SATZ;
        sonderAfaJahre = SONDER_7B_JAHRE;
        sonderAfaHinweis = `Sonder-AfA § 7b EStG: ${erg7b.hinweis}.`;
      } else {
        sonderAfaHinweis = `Sonder-AfA § 7b EStG nicht angesetzt: ${erg7b.hinweis}.`;
      }
    }
    if (sonderAfaHinweis) hinweise.push(sonderAfaHinweis);
  }
  const sonderAfaJahrBetrag = sonderAfaBasisBetrag * (sonderAfaProzent / 100);

  const zvE = Math.max(0, zahl(annahmen.zvE));
  const verheiratet = !!annahmen.verheiratet;
  const veranlagung: Veranlagung = verheiratet ? "splitting" : "grund";
  const manuellSatz = annahmen.grenzsteuersatzManuellProzent;
  const grenzsteuersatzManuell = typeof manuellSatz === "number" && Number.isFinite(manuellSatz) && manuellSatz > 0;
  const regel: Steuerregel = {
    zvE,
    veranlagung,
    verheiratet,
    manuellProzent: grenzsteuersatzManuell ? (manuellSatz as number) : null,
  };
  if (grenzsteuersatzManuell) {
    hinweise.push(`Steuerwirkung flach mit ${manuellSatz} % Grenzsteuersatz statt nach Tarif.`);
  } else if (zvE <= 0) {
    hinweise.push("Kein zu versteuerndes Einkommen angegeben, Steuerwirkung 0.");
  }

  // Jahresreihe
  const kaltmieteMonat = Math.max(0, zahl(objekt.kaltmieteMonat));
  const kaltmieteJahr = kaltmieteMonat * 12;
  // Ausstehende Mieterhöhung: ab ihrem Monat gilt die neue Miete, im Übergangsjahr anteilig.
  const erhoehungDatum = jahrMonatAus(objekt.mieterhoehungAb);
  const erhoehungMiete = Math.max(0, zahl(objekt.mieterhoehungKaltmieteMonat));
  const erhoehung = erhoehungDatum && erhoehungMiete > 0 && erhoehungDatum.jahr >= startjahr
    ? { ...erhoehungDatum, miete: erhoehungMiete }
    : null;
  if (erhoehung) {
    hinweise.push(`Mieterhöhung ab ${String(erhoehung.monat).padStart(2, "0")}/${erhoehung.jahr} berücksichtigt.`);
  }
  const kaltmieteImJahr = (kalenderjahr: number): number => {
    if (!erhoehung || kalenderjahr < erhoehung.jahr) return kaltmieteJahr;
    if (kalenderjahr > erhoehung.jahr) return erhoehung.miete * 12;
    return kaltmieteMonat * (erhoehung.monat - 1) + erhoehung.miete * (13 - erhoehung.monat);
  };
  const hausgeldNichtUmlegbarJahr = Math.max(0, zahl(objekt.hausgeldNichtUmlegbarMonat)) * 12;
  const ruecklageJahr = Math.max(0, zahl(objekt.ruecklageMonat)) * 12;
  const mietverwaltungJahr = annahmen.mietverwaltungEinrechnen
    ? Math.max(0, zahl(objekt.mietverwaltungMonat)) * 12
    : 0;
  const leerstandProzent = begrenzt(zahl(annahmen.leerstandProzent), 0, 100);
  const mietgarantieJahre = Math.max(0, Math.round(zahl(objekt.mietgarantieJahre)));
  const mietsteigerung = zahl(annahmen.mietsteigerungProzent) / 100;
  const kostensteigerung = zahl(annahmen.kostensteigerungProzent) / 100;
  const wertsteigerung = zahl(annahmen.wertsteigerungProzent) / 100;
  const lohnsteuer = !!annahmen.lohnsteuerermaessigung;

  const jahresreihe: ExposeJahr[] = [];
  let kumCashflow = 0;
  let einmaligeSteuerersparnisSanierung = 0;
  for (let j = 0; j < haltedauer; j++) {
    const kalenderjahr = startjahr + j;
    const wachstumMiete = Math.pow(1 + mietsteigerung, j);
    const wachstumKosten = Math.pow(1 + kostensteigerung, j);
    const mieteBrutto = kaltmieteImJahr(kalenderjahr) * wachstumMiete;
    const leerstand = j < mietgarantieJahre ? 0 : mieteBrutto * (leerstandProzent / 100);
    const mieteNetto = mieteBrutto - leerstand;
    const hausgeldNichtUmlegbar = hausgeldNichtUmlegbarJahr * wachstumKosten;
    const ruecklage = ruecklageJahr * wachstumKosten;
    const mietverwaltung = mietverwaltungJahr * wachstumKosten;
    const t = plan[j];
    const sonderAfa = j < sonderAfaJahre ? sonderAfaJahrBetrag : 0;
    const sanierungIndex = j - (sanierungAbJahr - startjahr);
    const erhaltungsaufwand =
      instandhaltungsart === "erhaltungsaufwand" && sanierungIndex >= 0 && sanierungIndex < instandhaltungJahre
        ? sanierungsanteil / instandhaltungJahre
        : 0;
    const werbungskosten = t.zinsen + afaJahr + sonderAfa + hausgeldNichtUmlegbar + mietverwaltung + erhaltungsaufwand;
    const ergebnisVermietung = mieteNetto - werbungskosten;
    const wirkung = steuerwirkung(ergebnisVermietung, kalenderjahr, regel);
    const wirkungOhneSanierung = erhaltungsaufwand > 0
      ? steuerwirkung(ergebnisVermietung + erhaltungsaufwand, kalenderjahr, regel)
      : wirkung;
    einmaligeSteuerersparnisSanierung += wirkung - wirkungOhneSanierung;
    const vorjahr = jahresreihe[j - 1];
    const zahlungswirksam = lohnsteuer ? wirkungOhneSanierung : (vorjahr?.steuerwirkungOhneSanierung ?? 0);
    const cashflow = mieteNetto - t.rate - hausgeldNichtUmlegbar - ruecklage - mietverwaltung + zahlungswirksam;
    kumCashflow += cashflow;
    jahresreihe.push({
      index: j,
      kalenderjahr,
      mieteBrutto,
      leerstand,
      mieteNetto,
      hausgeldNichtUmlegbar,
      ruecklage,
      mietverwaltung,
      zinsen: t.zinsen,
      tilgung: t.tilgung,
      rate: t.rate,
      afa: afaJahr,
      sonderAfa,
      erhaltungsaufwand,
      werbungskosten,
      ergebnisVermietung,
      steuerwirkung: wirkung,
      steuerwirkungOhneSanierung: wirkungOhneSanierung,
      steuerwirkungZahlungswirksam: zahlungswirksam,
      cashflow,
      kumCashflow,
      restschuldEnde: t.restschuldEnde,
      immobilienwertEnde: gesamtinvestition * Math.pow(1 + wertsteigerung, j + 1),
      eigenanteilMonat: -cashflow / 12,
    });
  }
  if (!lohnsteuer) {
    hinweise.push("Ohne Lohnsteuerermäßigung kommt der Steuervorteil als Erstattung im Folgejahr an.");
  }

  // Monatsrechnung des Betrachtungsjahres
  const betrachtungsjahr = Math.round(zahl(annahmen.betrachtungsjahr, startjahr));
  const monatIndex = Math.round(begrenzt(betrachtungsjahr - startjahr, 0, haltedauer - 1));
  const monat = monatsrechnung(jahresreihe[monatIndex]);

  // Steuerblock zur Anzeige, bezogen auf das Betrachtungsjahr
  const steuerjahr = steuerjahrFuer(jahresreihe[monatIndex].kalenderjahr);
  const steuer: ExposeSteuer = {
    steuerjahr,
    veranlagung,
    grenzsteuersatzProzent: grenzsteuersatzManuell
      ? (manuellSatz as number)
      : Math.round(grenzsteuersatzProzent(zvE, steuerjahr, veranlagung) * 10) / 10,
    grenzsteuersatzManuell,
    gebaeudeanteilProzent,
    gebaeudeanteilAngenommen,
    afaBasis,
    afaProzent,
    afaJahr,
    sonderAfaAktiv: sonderAfaJahrBetrag > 0,
    sonderAfaBasis: sonderAfaBasisBetrag,
    sonderAfaProzent,
    sonderAfaJahre: sonderAfaJahrBetrag > 0 ? sonderAfaJahre : 0,
    sonderAfaJahr: sonderAfaJahrBetrag,
    sonderAfaHinweis,
    sanierungsanteil,
    sanierungAbJahr,
    einmaligeSteuerersparnisSanierung,
  };

  // Kennzahlen
  const wohnflaeche = zahl(objekt.wohnflaeche);
  const hausgeldGesamtMonat = Math.max(0, zahl(objekt.hausgeldGesamtMonat));
  const nichtUmlegbarJahr = hausgeldNichtUmlegbarJahr + ruecklageJahr + mietverwaltungJahr;
  const breakEven = jahresreihe.find((j) => j.cashflow >= 0);
  const kennzahlen: ExposeKennzahlen = {
    // Eine Regel überall (M20, renditeProzent): Miete der Wohnung durch den
    // Kaufpreis der Wohnung, ohne Stellplatz. Bis zum 04.10.2026 Miete mit
    // Stellplatz durch Kaufpreis mit Stellplatz.
    mietrenditeProzent: renditeProzent(kaltmieteMonat - Math.max(0, zahl(objekt.stellplatzMieteMonat)), kaufpreisAngepasst),
    nettomietrenditeProzent: anschaffungskosten > 0 ? ((kaltmieteJahr - nichtUmlegbarJahr) / anschaffungskosten) * 100 : 0,
    breakEvenJahr: breakEven ? breakEven.kalenderjahr : null,
    jahreskaltmiete: kaltmieteJahr,
    preisJeQm: wohnflaeche > 0 ? kaufpreisAngepasst / wohnflaeche : null,
    mieteJeQm: wohnflaeche > 0 ? kaltmieteJahr / 12 / wohnflaeche : null,
    hausgeldUmlegbarMonat: Math.max(
      0,
      hausgeldGesamtMonat - hausgeldNichtUmlegbarJahr / 12 - ruecklageJahr / 12,
    ),
  };

  const ergebnisOhneHorizonte: Omit<ExposeErgebnis, "vermoegensaufbau"> = {
    kauf,
    finanzierung,
    steuer,
    kennzahlen,
    jahresreihe,
    monat,
    hinweise,
  };
  const vermoegensaufbau = VERMOEGENS_HORIZONTE
    .filter((n) => n <= haltedauer)
    .map((n) => vermoegensaufbauNachJahren(ergebnisOhneHorizonte, n));

  return { ...ergebnisOhneHorizonte, vermoegensaufbau };
}

/** Monatsrechnung eines Jahres: Jahreswerte geteilt durch zwölf. */
export function monatsrechnung(jahr: ExposeJahr): ExposeMonat {
  const miete = jahr.mieteBrutto / 12;
  const leerstand = jahr.leerstand / 12;
  const steuervorteil = jahr.steuerwirkungZahlungswirksam / 12;
  const zins = jahr.zinsen / 12;
  const tilgung = jahr.tilgung / 12;
  const hausgeldNichtUmlegbar = jahr.hausgeldNichtUmlegbar / 12;
  const ruecklage = jahr.ruecklage / 12;
  const mietverwaltung = jahr.mietverwaltung / 12;
  const einnahmen = miete + steuervorteil;
  const ausgaben = zins + tilgung + hausgeldNichtUmlegbar + ruecklage + mietverwaltung + leerstand;
  return {
    kalenderjahr: jahr.kalenderjahr,
    miete,
    steuervorteil,
    einnahmen,
    zins,
    tilgung,
    zinsUndTilgung: zins + tilgung,
    hausgeldNichtUmlegbar,
    ruecklage,
    mietverwaltung,
    leerstand,
    ausgaben,
    eigenanteil: ausgaben - einnahmen,
  };
}

/**
 * Vermögensaufbau nach n vollen Jahren: Immobilienwert mit Wertsteigerung
 * minus Restschuld plus kumulierter Cashflow, dazu Faktor je Euro und
 * Eigenkapitalrendite als jährliche Wachstumsrate. n muss innerhalb der
 * Jahresreihe liegen.
 */
export function vermoegensaufbauNachJahren(
  ergebnis: Pick<ExposeErgebnis, "kauf" | "jahresreihe">,
  n: number,
): ExposeHorizont {
  const jahre = Math.round(begrenzt(n, 1, ergebnis.jahresreihe.length));
  const zeile = ergebnis.jahresreihe[jahre - 1];
  const eigenkapitaleinsatz = ergebnis.kauf.eigenkapitaleinsatz;
  const ertragBeiVerkauf = zeile.immobilienwertEnde - zeile.restschuldEnde;
  const vermoegen = ertragBeiVerkauf + zeile.kumCashflow;
  const faktorJeEuro = eigenkapitaleinsatz > 0 ? vermoegen / eigenkapitaleinsatz : null;
  const eigenkapitalrenditeProzent =
    faktorJeEuro != null && faktorJeEuro > 0 ? (Math.pow(faktorJeEuro, 1 / jahre) - 1) * 100 : null;
  return {
    jahre,
    kalenderjahr: zeile.kalenderjahr,
    kaufpreisHeute: ergebnis.kauf.gesamtinvestition,
    immobilienwert: zeile.immobilienwertEnde,
    restschuld: zeile.restschuldEnde,
    ertragBeiVerkauf,
    kumCashflow: zeile.kumCashflow,
    vermoegen,
    eigenkapitaleinsatz,
    faktorJeEuro,
    eigenkapitalrenditeProzent,
  };
}

// ── Aufbereitung nach der Vorlage ───────────────────────────────────────────
//
// Keine neue Rechnung: Die beiden Funktionen ordnen vorhandene Ergebnisse so,
// wie das Exposé sie zeigt (Business Case, Monatsübersicht). Sie stehen hier,
// damit Seite und PDF dieselbe Zeilenfolge und dieselben Summen bekommen.

export type BusinessCaseZeileId =
  | "kaufpreis"
  | "preisanpassung"
  | "stellplatz"
  | "gesamtinvestition"
  | "nebenkosten"
  | "eigenkapital"
  | "eigenkapitalersatz"
  | "gesamteigenkapital";

export interface BusinessCaseZeile {
  id: BusinessCaseZeileId;
  /** Summenzeile, in der Vorlage hervorgehoben. */
  summe: boolean;
  betrag: number;
}

export interface BusinessCase {
  /** Anteil aller Darlehen an der Gesamtinvestition, für die Überschrift „… % Finanzierung". */
  finanzierungsquoteProzent: number;
  darlehen: number;
  zeilen: BusinessCaseZeile[];
}

/**
 * Business Case wie in der Vorlage: Kaufpreis und Stellplatz ergeben die
 * Gesamtinvestition, Kaufnebenkosten und Eigenkapital den
 * Gesamteigenkapitaleinsatz. Die Positionen über einer Summe ergeben genau
 * diese Summe.
 *
 * Eigenkapital ist der Anteil laut Regler (Gesamtinvestition minus
 * Bankdarlehen vor einem zweiten Darlehen). Ersetzt ein zweites Darlehen
 * Eigenkapital, steht es als eigene Minuszeile darunter, damit der Leser sieht,
 * warum der Gesamteinsatz kleiner ist.
 */
export function businessCase(ergebnis: Pick<ExposeErgebnis, "kauf" | "finanzierung">): BusinessCase {
  const k = ergebnis.kauf;
  const zweites = ergebnis.finanzierung.zweitesDarlehen;
  const ersatz = zweites && zweites.ersetzt === "eigenkapital" ? zweites.betrag : 0;
  // Darlehen ohne den Eigenkapitalersatz ist das Bankdarlehen laut Regler.
  const eigenkapitalAnteil = Math.max(0, k.gesamtinvestition - (k.darlehen - ersatz));
  const zeilen: BusinessCaseZeile[] = [{ id: "kaufpreis", summe: false, betrag: k.kaufpreis }];
  if (k.kaufpreisAngepasst !== k.kaufpreis) {
    zeilen.push({ id: "preisanpassung", summe: false, betrag: k.kaufpreisAngepasst - k.kaufpreis });
  }
  if (k.stellplatz > 0) zeilen.push({ id: "stellplatz", summe: false, betrag: k.stellplatz });
  zeilen.push({ id: "gesamtinvestition", summe: true, betrag: k.gesamtinvestition });
  zeilen.push({ id: "nebenkosten", summe: false, betrag: k.nebenkostenKunde });
  // Unter einem halben Cent ist kein Eigenkapital, nur ein Gleitkommarest.
  if (eigenkapitalAnteil >= 0.005) zeilen.push({ id: "eigenkapital", summe: false, betrag: eigenkapitalAnteil });
  if (ersatz > 0) zeilen.push({ id: "eigenkapitalersatz", summe: false, betrag: -ersatz });
  zeilen.push({ id: "gesamteigenkapital", summe: true, betrag: k.eigenkapitaleinsatz });
  return { finanzierungsquoteProzent: k.finanzierungsquoteProzent, darlehen: k.darlehen, zeilen };
}

/**
 * Posten der Monatsübersicht.
 *   hausgeld  nicht umlegbares Hausgeld, wenn es keine getrennte Rücklage gibt.
 *             Im CRM steckt die Rücklage darin (siehe exposeObjektdatenAus),
 *             deshalb heißt die Zeile dann „Rücklagen und Bewirtschaftung".
 */
export type MonatspostenId =
  | "miete"
  | "steuervorteil"
  | "finanzierung"
  | "ruecklagen"
  | "bewirtschaftung"
  | "hausgeld"
  | "mietverwaltung"
  | "mietausfall";

export interface Monatsposten {
  id: MonatspostenId;
  betrag: number;
}

export interface Monatsuebersicht {
  kalenderjahr: number;
  einnahmen: Monatsposten[];
  ausgaben: Monatsposten[];
  summeEinnahmen: number;
  summeAusgaben: number;
  /** Monatliche Eigeninvestition: positiv = der Kunde zahlt zu, negativ = Überschuss. */
  eigeninvestition: number;
}

/**
 * Monatsübersicht wie in der Vorlage: links Miete und Steuervorteil, rechts
 * Finanzierung und Kosten. Miete, Steuervorteil und Finanzierung stehen immer
 * da; die Kostenzeilen nur mit Betrag, weil eine Zeile mit 0 € nach einer
 * Angabe aussähe, die in Wahrheit fehlt. Die Summen sind die der
 * Monatsrechnung, weggelassene Zeilen sind 0 und ändern sie nicht.
 */
export function monatsuebersicht(monat: ExposeMonat): Monatsuebersicht {
  const ausgaben: Monatsposten[] = [{ id: "finanzierung", betrag: monat.zinsUndTilgung }];
  const kosten: Monatsposten[] = monat.ruecklage > 0
    ? [{ id: "ruecklagen", betrag: monat.ruecklage }, { id: "bewirtschaftung", betrag: monat.hausgeldNichtUmlegbar }]
    : [{ id: "hausgeld", betrag: monat.hausgeldNichtUmlegbar }];
  kosten.push({ id: "mietverwaltung", betrag: monat.mietverwaltung }, { id: "mietausfall", betrag: monat.leerstand });
  for (const posten of kosten) if (posten.betrag > 0) ausgaben.push(posten);
  return {
    kalenderjahr: monat.kalenderjahr,
    einnahmen: [
      { id: "miete", betrag: monat.miete },
      { id: "steuervorteil", betrag: monat.steuervorteil },
    ],
    ausgaben,
    summeEinnahmen: monat.einnahmen,
    summeAusgaben: monat.ausgaben,
    eigeninvestition: monat.eigenanteil,
  };
}
