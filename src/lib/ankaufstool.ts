/**
 * Ankaufstool: Bauträger-Kalkulator „Lohnt sich das Objekt?“.
 *
 * Nachbau des Blatts „Kalkulation“ aus Ankaufstool.xlsx, Formel für Formel.
 * Prozentwerte stehen hier als Anteil (0,05 = 5 %), wie in der Excel. Die
 * Zellbezüge stehen jeweils dahinter, damit sich jede Zahl in der Datei
 * wiederfinden lässt.
 */

export interface AnkaufEingaben {
  // Ampel-Schwellen (Marge vom Verkaufserlös)
  schwelleGruen: number; // B3
  schwelleGelb: number; // B4
  // Objektdaten
  wohnflaeche: number; // B7, m²
  wohneinheiten: number; // B8
  laufzeitMonate: number; // B9
  // Verkaufserlös
  abgabepreisProQm: number; // B12
  // 1. Ankauf
  kaufpreis: number; // B17
  grunderwerbsteuer: number; // B18
  notarAnkauf: number; // B19
  maklerEinkauf: number; // B20
  // 2. Sanierung & Aufteilung
  sanierungProQm: number; // B24
  sanierungGemeinschaft: number; // B25
  pufferSanierung: number; // B26
  aufteilung: number; // B27
  gutachtenSonstiges: number; // B28
  // 3. Vertrieb & Mietsubvention
  vertriebsprovision: number; // B32
  garantiemieteProQm: number; // B33
  marktmieteProQm: number; // B34
  subventionMonate: number; // B35
  marketing: number; // B37
  // 4. Finanzierung
  fremdkapitalquote: number; // B41
  zinssatz: number; // B44
  inanspruchnahme: number; // B45
  bankgebuehren: number; // B47
  // Ab hier nicht in der Excel: Angaben aus dem Exposé. Alle 0 = Rechnung wie die Excel.
  gewerbeflaeche: number; // m², wird wie Wohnen aufgeteilt und je m² verkauft
  gesamtflaecheManuell: number; // m², 0 = Wohn- + Gewerbefläche
  grundstuecksflaeche: number; // m², nur Info
  gewerbeeinheiten: number;
  stellplaetze: number;
  abgabepreisGewerbeProQm: number;
  abgabepreisStellplatz: number; // € je Stellplatz
  sanierungGewerbeProQm: number;
  istMieteWohnenJahr: number; // Nettokaltmiete p. a., Leerstand = 0
  istMieteGewerbeJahr: number;
  istMieteStellplaetzeJahr: number;
  bewirtschaftungJahr: number; // nicht umlagefähige Kosten p. a.
}

/** Beschreibende Angaben aus dem Exposé; fließen nicht in die Rechnung. */
export interface AnkaufObjekt {
  objektart: string;
  baujahr: string;
  zustand: string;
  vermietung: string;
  energie: string;
  makler: string;
  lage: string;
}

export const OBJEKT_LEER: AnkaufObjekt = {
  objektart: "", baujahr: "", zustand: "", vermietung: "", energie: "", makler: "", lage: "",
};

/** Die Eingaben der Excel-Vorlage. */
export const ANKAUF_STANDARD: AnkaufEingaben = {
  schwelleGruen: 0.2,
  schwelleGelb: 0.15,
  wohnflaeche: 560,
  wohneinheiten: 8,
  laufzeitMonate: 18,
  abgabepreisProQm: 4900,
  kaufpreis: 1_400_000,
  grunderwerbsteuer: 0.05,
  notarAnkauf: 0.02,
  maklerEinkauf: 0.0357,
  sanierungProQm: 650,
  sanierungGemeinschaft: 120_000,
  pufferSanierung: 0.1,
  aufteilung: 15_000,
  gutachtenSonstiges: 5_000,
  vertriebsprovision: 0.08,
  garantiemieteProQm: 12,
  marktmieteProQm: 9.5,
  subventionMonate: 24,
  marketing: 10_000,
  fremdkapitalquote: 0.8,
  zinssatz: 0.055,
  inanspruchnahme: 0.7,
  bankgebuehren: 5_000,
  gewerbeflaeche: 0,
  gesamtflaecheManuell: 0,
  grundstuecksflaeche: 0,
  gewerbeeinheiten: 0,
  stellplaetze: 0,
  abgabepreisGewerbeProQm: 0,
  abgabepreisStellplatz: 0,
  sanierungGewerbeProQm: 0,
  istMieteWohnenJahr: 0,
  istMieteGewerbeJahr: 0,
  istMieteStellplaetzeJahr: 0,
  bewirtschaftungJahr: 0,
};

export type AnkaufUrteil = "LOHNT SICH" | "GRENZWERTIG" | "LOHNT SICH NICHT";

export interface AnkaufErgebnis {
  verkaufserloes: number; // C13
  erloesWohnen: number;
  erloesGewerbe: number;
  erloesStellplaetze: number;
  abgabepreisJeWohnung: number; // C14, mit Gewerbe: je Einheit (Wohnen + Gewerbe)
  // 1. Ankauf
  grunderwerbsteuer: number; // C18
  notarAnkauf: number; // C19
  maklerEinkauf: number; // C20
  summeAnkauf: number; // C21
  // 2. Sanierung & Aufteilung
  sanierungWohnungen: number; // C24
  sanierungGewerbe: number;
  pufferSanierung: number; // C26
  summeSanierung: number; // C29
  // 3. Vertrieb & Mietsubvention
  vertriebsprovision: number; // C32
  mietsubvention: number; // C36
  summeVertrieb: number; // C38
  // 4. Finanzierung
  fremdkapital: number; // C42
  eigenkapital: number; // C43
  zinskosten: number; // C46
  summeFinanzierung: number; // C48
  // Mieten bis zum Verkauf
  istMieteJahr: number;
  mietueberschussJahr: number;
  mieteinnahmen: number; // Überschuss über die Laufzeit, anteilig wie das Darlehen
  // Objekt
  verkaufsflaeche: number; // Wohn- + Gewerbefläche
  gesamtflaeche: number;
  kaufpreisJeQm: number; // je m² Gesamtfläche
  kaufpreisFaktor: number; // Kaufpreis / Ist-Miete p. a.
  abgabepreisDurchschnitt: number; // Ø €/m² Wohnen + Gewerbe
  // Ergebnis
  gesamtkosten: number; // C51
  gewinn: number; // C53
  margeErloes: number; // C54
  margeKosten: number; // C55
  renditeEigenkapital: number; // C56
  gewinnJeWohnung: number; // C57, mit Gewerbe: je Einheit
  gewinnJeQm: number; // C58
  gesamtkostenJeQm: number; // C59
  mindestAbgabepreis: number; // C60, Ø €/m² Wohnen + Gewerbe
  abgabepreisGruen: number; // C61, Ø €/m² Wohnen + Gewerbe
  urteil: AnkaufUrteil; // B63
}

/** Teilung wie in der Excel: Nenner 0 ergibt 0 statt #DIV/0!. */
const teile = (zaehler: number, nenner: number) => (nenner === 0 ? 0 : zaehler / nenner);

export function berechneAnkauf(e: AnkaufEingaben): AnkaufErgebnis {
  const erloesWohnen = e.abgabepreisProQm * e.wohnflaeche;
  const erloesGewerbe = e.abgabepreisGewerbeProQm * e.gewerbeflaeche;
  const erloesStellplaetze = e.abgabepreisStellplatz * e.stellplaetze;
  const verkaufserloes = erloesWohnen + erloesGewerbe + erloesStellplaetze;
  const verkaufsflaeche = e.wohnflaeche + e.gewerbeflaeche;
  const einheiten = e.wohneinheiten + e.gewerbeeinheiten;

  const grunderwerbsteuer = e.kaufpreis * e.grunderwerbsteuer;
  const notarAnkauf = e.kaufpreis * e.notarAnkauf;
  const maklerEinkauf = e.kaufpreis * e.maklerEinkauf;
  const summeAnkauf = e.kaufpreis + grunderwerbsteuer + notarAnkauf + maklerEinkauf;

  const sanierungWohnungen = e.sanierungProQm * e.wohnflaeche;
  const sanierungGewerbe = e.sanierungGewerbeProQm * e.gewerbeflaeche;
  const pufferSanierung = (sanierungWohnungen + sanierungGewerbe + e.sanierungGemeinschaft) * e.pufferSanierung;
  const summeSanierung =
    sanierungWohnungen + sanierungGewerbe + e.sanierungGemeinschaft + pufferSanierung + e.aufteilung + e.gutachtenSonstiges;

  const vertriebsprovision = verkaufserloes * e.vertriebsprovision;
  const mietsubvention =
    Math.max(0, e.garantiemieteProQm - e.marktmieteProQm) * e.wohnflaeche * e.subventionMonate;
  const summeVertrieb = vertriebsprovision + mietsubvention + e.marketing;

  // Mietsubvention nur auf Wohnfläche: die Garantiemiete gilt für Wohnungskäufer.
  // Fremd- und Eigenkapital sind nur Information, keine Kostenposten.
  const fremdkapital = (summeAnkauf + summeSanierung) * e.fremdkapitalquote;
  const eigenkapital = summeAnkauf + summeSanierung - fremdkapital;
  const zinskosten = ((fremdkapital * e.zinssatz * e.laufzeitMonate) / 12) * e.inanspruchnahme;
  const summeFinanzierung = zinskosten + e.bankgebuehren;

  const gesamtkosten = summeAnkauf + summeSanierung + summeVertrieb + summeFinanzierung;

  // Mieten bis zum Verkauf: Einheiten gehen nach und nach weg, deshalb
  // anteilig mit derselben Ø-Quote wie das Darlehen. Negativ bei Leerstand.
  const istMieteJahr = e.istMieteWohnenJahr + e.istMieteGewerbeJahr + e.istMieteStellplaetzeJahr;
  const mietueberschussJahr = istMieteJahr - e.bewirtschaftungJahr;
  const mieteinnahmen = ((mietueberschussJahr * e.laufzeitMonate) / 12) * e.inanspruchnahme;

  const gewinn = verkaufserloes + mieteinnahmen - gesamtkosten;
  const margeErloes = teile(gewinn, verkaufserloes);

  // Ø Abgabepreis/m² (Wohnen und Gewerbe gleich), bei dem die Marge genau 0
  // bzw. die Grün-Schwelle erreicht; Stellplätze bleiben fest. Die
  // Vertriebsprovision wächst mit dem Preis mit, deshalb steht sie im Nenner.
  const kostenOhneProvision = gesamtkosten - vertriebsprovision;
  const preisFuer = (quote: number) => {
    const nenner = verkaufsflaeche * quote;
    return nenner <= 0 ? 0 : (kostenOhneProvision - mieteinnahmen - erloesStellplaetze * quote) / nenner;
  };
  const gesamtflaeche = e.gesamtflaecheManuell > 0 ? e.gesamtflaecheManuell : verkaufsflaeche;

  return {
    verkaufserloes,
    erloesWohnen,
    erloesGewerbe,
    erloesStellplaetze,
    abgabepreisJeWohnung: teile(erloesWohnen + erloesGewerbe, einheiten),
    grunderwerbsteuer,
    notarAnkauf,
    maklerEinkauf,
    summeAnkauf,
    sanierungWohnungen,
    sanierungGewerbe,
    pufferSanierung,
    summeSanierung,
    vertriebsprovision,
    mietsubvention,
    summeVertrieb,
    fremdkapital,
    eigenkapital,
    zinskosten,
    summeFinanzierung,
    istMieteJahr,
    mietueberschussJahr,
    mieteinnahmen,
    verkaufsflaeche,
    gesamtflaeche,
    kaufpreisJeQm: teile(e.kaufpreis, gesamtflaeche),
    kaufpreisFaktor: teile(e.kaufpreis, istMieteJahr),
    abgabepreisDurchschnitt: teile(erloesWohnen + erloesGewerbe, verkaufsflaeche),
    gesamtkosten,
    gewinn,
    margeErloes,
    margeKosten: teile(gewinn, gesamtkosten),
    renditeEigenkapital: teile(gewinn, eigenkapital),
    gewinnJeWohnung: teile(gewinn, einheiten),
    gewinnJeQm: teile(gewinn, verkaufsflaeche),
    gesamtkostenJeQm: teile(gesamtkosten, verkaufsflaeche),
    mindestAbgabepreis: preisFuer(1 - e.vertriebsprovision),
    abgabepreisGruen: preisFuer(1 - e.vertriebsprovision - e.schwelleGruen),
    urteil:
      margeErloes >= e.schwelleGruen ? "LOHNT SICH" : margeErloes >= e.schwelleGelb ? "GRENZWERTIG" : "LOHNT SICH NICHT",
  };
}

/** Spalte „% v. Erlös“ der Excel. */
export function anteilAmErloes(betrag: number, erloes: number): number {
  return teile(betrag, erloes);
}

/** Eine gespeicherte Rechnung. Liegt je Nutzer in `user_settings`. */
export interface AnkaufVersion {
  id: string;
  name: string;
  gespeichertAm: string;
  eingaben: Partial<AnkaufEingaben>;
  objekt?: Partial<AnkaufObjekt>; // fehlt bei Versionen vor dem Exposé-Abschnitt
}

export const ANKAUF_VERSIONEN_SCHLUESSEL = "ankaufstool_versionen";

/** Eingaben einer Version; Felder, die es beim Speichern noch nicht gab, kommen aus der Vorlage. */
export function eingabenAusVersion(v: AnkaufVersion): AnkaufEingaben {
  return { ...ANKAUF_STANDARD, ...v.eingaben };
}

export function objektAusVersion(v: AnkaufVersion): AnkaufObjekt {
  return { ...OBJEKT_LEER, ...v.objekt };
}

/**
 * Version in die Liste legen, neueste zuerst. Eine Version gleichen Namens
 * wird ersetzt, so lässt sich eine Rechnung unter ihrem Namen fortschreiben.
 */
export function versionSpeichern<V extends { name: string }>(liste: V[], neu: V): V[] {
  const name = neu.name.trim().toLowerCase();
  return [neu, ...liste.filter((v) => v.name.trim().toLowerCase() !== name)];
}
