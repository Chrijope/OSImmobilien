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
}

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
};

export type AnkaufUrteil = "LOHNT SICH" | "GRENZWERTIG" | "LOHNT SICH NICHT";

export interface AnkaufErgebnis {
  verkaufserloes: number; // C13
  abgabepreisJeWohnung: number; // C14
  // 1. Ankauf
  grunderwerbsteuer: number; // C18
  notarAnkauf: number; // C19
  maklerEinkauf: number; // C20
  summeAnkauf: number; // C21
  // 2. Sanierung & Aufteilung
  sanierungWohnungen: number; // C24
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
  // Ergebnis
  gesamtkosten: number; // C51
  gewinn: number; // C53
  margeErloes: number; // C54
  margeKosten: number; // C55
  renditeEigenkapital: number; // C56
  gewinnJeWohnung: number; // C57
  gewinnJeQm: number; // C58
  gesamtkostenJeQm: number; // C59
  mindestAbgabepreis: number; // C60
  abgabepreisGruen: number; // C61
  urteil: AnkaufUrteil; // B63
}

/** Teilung wie in der Excel: Nenner 0 ergibt 0 statt #DIV/0!. */
const teile = (zaehler: number, nenner: number) => (nenner === 0 ? 0 : zaehler / nenner);

export function berechneAnkauf(e: AnkaufEingaben): AnkaufErgebnis {
  const verkaufserloes = e.abgabepreisProQm * e.wohnflaeche;

  const grunderwerbsteuer = e.kaufpreis * e.grunderwerbsteuer;
  const notarAnkauf = e.kaufpreis * e.notarAnkauf;
  const maklerEinkauf = e.kaufpreis * e.maklerEinkauf;
  const summeAnkauf = e.kaufpreis + grunderwerbsteuer + notarAnkauf + maklerEinkauf;

  const sanierungWohnungen = e.sanierungProQm * e.wohnflaeche;
  const pufferSanierung = (sanierungWohnungen + e.sanierungGemeinschaft) * e.pufferSanierung;
  const summeSanierung =
    sanierungWohnungen + e.sanierungGemeinschaft + pufferSanierung + e.aufteilung + e.gutachtenSonstiges;

  const vertriebsprovision = verkaufserloes * e.vertriebsprovision;
  const mietsubvention =
    Math.max(0, e.garantiemieteProQm - e.marktmieteProQm) * e.wohnflaeche * e.subventionMonate;
  const summeVertrieb = vertriebsprovision + mietsubvention + e.marketing;

  // Fremd- und Eigenkapital sind nur Information, keine Kostenposten.
  const fremdkapital = (summeAnkauf + summeSanierung) * e.fremdkapitalquote;
  const eigenkapital = summeAnkauf + summeSanierung - fremdkapital;
  const zinskosten = ((fremdkapital * e.zinssatz * e.laufzeitMonate) / 12) * e.inanspruchnahme;
  const summeFinanzierung = zinskosten + e.bankgebuehren;

  const gesamtkosten = summeAnkauf + summeSanierung + summeVertrieb + summeFinanzierung;
  const gewinn = verkaufserloes - gesamtkosten;
  const margeErloes = teile(gewinn, verkaufserloes);

  // Abgabepreis/m², bei dem die Marge genau 0 bzw. die Grün-Schwelle erreicht.
  // Die Vertriebsprovision wächst mit dem Preis mit, deshalb steht sie im Nenner.
  const kostenOhneProvision = gesamtkosten - vertriebsprovision;
  const nennerNull = e.wohnflaeche * (1 - e.vertriebsprovision);
  const nennerGruen = e.wohnflaeche * (1 - e.vertriebsprovision - e.schwelleGruen);

  return {
    verkaufserloes,
    abgabepreisJeWohnung: teile(verkaufserloes, e.wohneinheiten),
    grunderwerbsteuer,
    notarAnkauf,
    maklerEinkauf,
    summeAnkauf,
    sanierungWohnungen,
    pufferSanierung,
    summeSanierung,
    vertriebsprovision,
    mietsubvention,
    summeVertrieb,
    fremdkapital,
    eigenkapital,
    zinskosten,
    summeFinanzierung,
    gesamtkosten,
    gewinn,
    margeErloes,
    margeKosten: teile(gewinn, gesamtkosten),
    renditeEigenkapital: teile(gewinn, eigenkapital),
    gewinnJeWohnung: teile(gewinn, e.wohneinheiten),
    gewinnJeQm: teile(gewinn, e.wohnflaeche),
    gesamtkostenJeQm: teile(gesamtkosten, e.wohnflaeche),
    mindestAbgabepreis: nennerNull <= 0 ? 0 : kostenOhneProvision / nennerNull,
    abgabepreisGruen: nennerGruen <= 0 ? 0 : kostenOhneProvision / nennerGruen,
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
}

export const ANKAUF_VERSIONEN_SCHLUESSEL = "ankaufstool_versionen";

/** Eingaben einer Version; Felder, die es beim Speichern noch nicht gab, kommen aus der Vorlage. */
export function eingabenAusVersion(v: AnkaufVersion): AnkaufEingaben {
  return { ...ANKAUF_STANDARD, ...v.eingaben };
}

/**
 * Version in die Liste legen, neueste zuerst. Eine Version gleichen Namens
 * wird ersetzt, so lässt sich eine Rechnung unter ihrem Namen fortschreiben.
 */
export function versionSpeichern<V extends { name: string }>(liste: V[], neu: V): V[] {
  const name = neu.name.trim().toLowerCase();
  return [neu, ...liste.filter((v) => v.name.trim().toLowerCase() !== name)];
}
