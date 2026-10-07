import type { Herkunft } from "./herkunft";
import { objektUnterlagenQuelle, type ObjektUnterlagenQuelle } from "./objektUnterlagen";
/**
 * Vorbelegung des Investmentrechners aus einem Objekt und einer Einheit.
 *
 * Der Reiter „Investmentrechner" auf der Einheitenseite startet nicht leer,
 * sondern mit den Zahlen, die in der Objektanlage schon gepflegt sind. Diese
 * Datei ist die einzige Stelle, an der entschieden wird, welches Feld des
 * Rechners aus welcher Angabe kommt.
 *
 * Grundsätze:
 *
 *   1. Es entsteht keine zweite Zuordnung. Die Zahlen kommen aus
 *      `exposeObjektdatenAus` (exposeInhalt.ts), das schon heute Objekt und
 *      Wohnung für den Exposé-Rechner zusammenfasst. Wer dort etwas ändert,
 *      ändert es auch hier. Nur was der Exposé-Rechner nicht kennt (Titel,
 *      Adresse, Zimmer, AfA-Modell, Bilder, dazu Baujahr und Energieausweis
 *      aus den Investagon-Rohdaten als Rückfall), wird direkt gelesen.
 *   2. Im Zweifel bleibt ein Feld leer. Ein falsch belegtes Feld erzeugt eine
 *      Berechnung, die richtig aussieht und falsch ist. Das ist schlimmer als
 *      eine erkennbare Lücke, deshalb wird nichts geraten und nichts
 *      umgerechnet, dessen Einheit nicht sicher feststeht.
 *   3. Alles, was übernommen wurde, und alles, was fehlt, wird benannt und
 *      zurückgegeben, damit die Oberfläche es aufzählen kann.
 *
 * Bewusst nicht belegt: alle Felder des Bereichs „Kunde & Einkommen". Sie
 * stehen nicht am Objekt, sondern beim Kunden, und werden deshalb als Lücke
 * gemeldet.
 *
 * Das Eigenkapital steht seit dem 23.09.2026 in Höhe der Kaufnebenkosten
 * vorbelegt (Christian: „in der Regel immer die Höhe der Kaufnebenkosten“).
 * Aus der Selbstauskunft wird es ausdrücklich NICHT übernommen.
 *
 * Gerechnet wird hier nichts. Die Berechnung macht ausschließlich
 * `berechneInvestment` in rechenkern.ts.
 */

import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { exposeObjektdatenAus } from "@/lib/exposeInhalt";
import { ausweisartText, energieeffizienzklasse, rohdaten } from "@/lib/investagonFelder";
import { objektartInfo, objektseiteFelder } from "@/lib/objektseiteDaten";
import { objektAnlageklasse } from "@/lib/objektKlassen";
import { bundeslandFromPlz, GRUNDBUCH_PROZENT, NOTAR_PROZENT } from "@/lib/kaufnebenkosten";
import { linearerAfaSatz } from "@/lib/afaSaetze";
import { dez, eur0, prozent } from "@/lib/objektKennzahlen";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "./rechenkern";
import { ENERGIEKLASSEN } from "./formatierer";
import { leereUnterlagenDaten, type UnterlagenDaten } from "./unterlagenAuslesen";
import { MAX_RECHNER_BILDER, rechnerBildAdressen } from "./rechnerBilder";
import {
  bundeslandName,
  saetzeFuerBundesland,
  standardKaufnebenkostenauswahl,
  type Kaufnebenkostenauswahl,
} from "./kaufnebenkostenAuswahl";

/** Woher eine Angabe kommt, für die Gruppierung der Lückenliste. */
export type Vorbelegungsquelle = "objekt" | "einheit" | "kunde";

/** Ein Feld, das aus der Objektanlage übernommen wurde. */
export interface VorbelegungUebernahme {
  /** Beschriftung des Feldes im Rechner, wortgleich. */
  feld: string;
  /** Der übernommene Wert, schon lesbar formatiert. */
  wert: string;
  /** Woher er stammt. */
  woher: string;
}

/** Ein Feld, das der Rechner braucht und das die Objektanlage nicht hergibt. */
export interface VorbelegungLuecke {
  /** Beschriftung des Feldes im Rechner, wortgleich. */
  feld: string;
  /** Was ohne die Angabe fehlt oder falsch gerechnet wird. */
  wofuer: string;
  /** Wo die Angabe nachgetragen wird. */
  wo: string;
  quelle: Vorbelegungsquelle;
}

/** Eine Vorgabe des Rechners, die nicht am Objekt hängt und nachgeschärft werden darf. */
export interface VorbelegungAnnahme {
  feld: string;
  wert: string;
}

export interface ObjektVorbelegung {
  quellen: ObjektUnterlagenQuelle;
  herkunft: Herkunft;
  eingabe: InvestmentEingabe;
  knk: Kaufnebenkostenauswahl;
  /**
   * Bereich „Objektunterlagen": Energieausweis, Rücklage und Sanierungen. Der
   * Rechner liest sie sonst aus hochgeladenen PDFs, im CRM sind sie am Objekt
   * gepflegt. In die Berechnung geht davon nichts ein, sie stehen im Exposé.
   */
  unterlagen: UnterlagenDaten;
  /**
   * Adressen der Fotos für den Bereich „Bilder", erst Einheit, dann Objekt
   * mit dem Titelbild vorn. Der Rechner lädt davon bis zu sechs, siehe
   * `rechnerBilder.ts`.
   */
  bilder: string[];
  uebernommen: VorbelegungUebernahme[];
  luecken: VorbelegungLuecke[];
  annahmen: VorbelegungAnnahme[];
}

/** Positive, endliche Zahl oder 0. */
function positiv(wert: number | null | undefined): number {
  const zahl = Number(wert);
  return Number.isFinite(zahl) && zahl > 0 ? zahl : 0;
}

/** Die Rohdaten der Einheit in der Form, die `investagonFelder.ts` erwartet. */
function einheitRohdaten(wohnung: ObjektWohnung) {
  return { meta: { investagonRaw: wohnung.investagonRaw } };
}

/** Das Baujahr aus den Investagon-Rohdaten, erst am Objekt, dann an der Einheit. Nur ein plausibles Jahr, sonst 0. */
function investagonBaujahr(objekt: ObjektData, wohnung: ObjektWohnung): number {
  for (const roh of [rohdaten(objekt), rohdaten(einheitRohdaten(wohnung))]) {
    const jahr = Number(roh?.object_building_year);
    if (Number.isInteger(jahr) && jahr >= 1800 && jahr <= 2100) return jahr;
  }
  return 0;
}

/**
 * Das Förderprogramm aus den Investagon-Rohdaten, seit dem 07.10.2026.
 *
 * Investagon liefert dazu nur einen Text (`m3_program` oder `funding`, siehe
 * mapping.ts im Import), keinen Betrag und keine Konditionen. Übernommen
 * wird er nur, wenn er eine KfW nennt, und nur als Beschriftung: Der
 * Schalter „KfW-Darlehen“ bleibt aus, bis jemand Betrag und Zins einträgt.
 */
function investagonKfwProgramm(objekt: ObjektData, wohnung: ObjektWohnung): string {
  for (const roh of [rohdaten(einheitRohdaten(wohnung)), rohdaten(objekt)]) {
    for (const schluessel of ["m3_program", "funding", "foerderung", "subsidy"]) {
      const wert = roh?.[schluessel];
      if (typeof wert === "string" && /kfw/i.test(wert)) return wert.trim();
    }
  }
  return "";
}

/**
 * Alle Eingaben des Rechners aus Objekt und Einheit belegen, soweit sie dort
 * gepflegt sind.
 *
 * `heute` ist nur für Tests und für den Stichtag der Mieterhöhung da.
 */
export function vorbelegungAusEinheit(
  objekt: ObjektData,
  wohnung: ObjektWohnung,
  heute: Date = new Date(),
): ObjektVorbelegung {
  const daten = exposeObjektdatenAus(objekt, wohnung, heute);
  const felder = objektseiteFelder(objekt);
  const uebernommen: VorbelegungUebernahme[] = [];
  const luecken: VorbelegungLuecke[] = [];
  const eingabe: InvestmentEingabe = { ...standardEingabe, startYear: heute.getFullYear() };
  let knk: Kaufnebenkostenauswahl = standardKaufnebenkostenauswahl;

  const herkunft: Herkunft = {};
  const zuordnung: Record<string, (keyof InvestmentEingabe)[]> = {
    "Objektbezeichnung": ["propertyTitle"], "Adresse": ["address"], "Objekttyp": ["propertyType"],
    "Kaufpreis": ["purchasePrice"], "davon Möbel/Inventar": ["furniturePrice"],
    "Wohnfläche": ["area"], "Zimmer": ["rooms"], "Baujahr": ["constructionYear"],
    "Kaufnebenkosten": ["transferTaxRate", "notaryRate", "landRegisterRate"], "Kaltmiete p. M.": ["monthlyColdRent"],
    "Eigenkapital": ["equity"], "Finanzierungsnebenkosten": ["financingCostRate"],
    "Nicht umlagefähige Kosten p. M.": ["monthlyOperatingCosts"], "Gebäudeanteil": ["buildingShare"],
    "Zuführung Instandhaltungsrücklage p. M.": ["monthlyReserveContribution"],
    "Nutzungsdauer Möbel": ["furnitureDepreciationYears"],
    "Degressive AfA p. a.": ["buildingDepreciationRate", "depreciationMethod"], "Lineare AfA p. a.": ["buildingDepreciationRate", "depreciationMethod"],
    "davon Erhaltungsaufwand": ["rehabExpense", "rehabMode"], "Verteilung des Aufwands": ["rehabDistributionYears"],
    "KfW-Programm": ["kfwProgram"],
  };
  const nimm = (feld: string, wert: string, woher: string) => {
    uebernommen.push({ feld, wert, woher });
    for (const key of zuordnung[feld] ?? []) herkunft[key] = { quelle: "objekt", text: `Aus der Objektanlage, ${woher}` };
  };
  const fehlt = (feld: string, wofuer: string, wo: string, quelle: Vorbelegungsquelle) =>
    luecken.push({ feld, wofuer, wo, quelle });

  // ── Objekt & Kaufpreis ────────────────────────────────────────────────────

  eingabe.propertyTitle = [objekt.titel, wohnung.weNr].filter(Boolean).join(", ");
  if (eingabe.propertyTitle) nimm("Objektbezeichnung", eingabe.propertyTitle, "Objekt und Einheit");

  eingabe.address = [objekt.adresse, [objekt.plz, objekt.ort].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  if (eingabe.address) nimm("Adresse", eingabe.address, "Objekt");

  // Nur ein Textfeld ohne Wirkung auf die Rechnung. Die abgeleitete Objektart
  // bleibt draußen, hier steht nur, was tatsächlich gepflegt ist.
  eingabe.propertyType = objektAnlageklasse(objekt) || objektartInfo(felder.objektart)?.label || "";
  if (eingabe.propertyType) nimm("Objekttyp", eingabe.propertyType, "Objekt");

  /*
   * Kaufpreis: der Gesamtkaufpreis der Einheit plus Stellplatz. Der Rechner
   * kennt seit dem 25.09.2026 nur einen Kaufpreis, Möbel sind ein Anteil
   * darin. Genau so speichert der Investagon-Import `vk_gesamt`: Wohnung plus
   * Möbel. Der Möbelanteil selbst steht in `meta.moebelPreis` und wird
   * darunter als „davon Möbel/Inventar“ übernommen, nicht dazugezählt.
   * Dieselbe Summe zeigt die Kachel „Gesamtinvestition" auf der
   * Einheitenseite.
   */
  eingabe.purchasePrice = positiv(daten.kaufpreis) + positiv(daten.stellplatzpreis);
  if (eingabe.purchasePrice > 0) {
    nimm(
      "Kaufpreis",
      eur0(eingabe.purchasePrice),
      positiv(daten.stellplatzpreis) > 0
        ? `Einheit, Kaufpreis ${eur0(positiv(daten.kaufpreis))} plus Stellplatz ${eur0(positiv(daten.stellplatzpreis))}`
        : "Einheit",
    );
  } else {
    fehlt("Kaufpreis", "ohne ihn rechnet nichts", 'Einheit über „Wohnung bearbeiten"', "einheit");
  }

  // Mehr Möbel als Kaufpreis wäre ein Datenfehler, dann lieber keine Angabe.
  const moebel = positiv(wohnung.moebelPreis);
  if (moebel > 0 && moebel <= eingabe.purchasePrice) {
    eingabe.furniturePrice = moebel;
    nimm("davon Möbel/Inventar", eur0(moebel), "Einheit, Möbelpreis aus Investagon, im Kaufpreis enthalten");
  }

  /*
   * Nutzungsdauer der Möbel, seit dem 25.09.2026 aus Investagon
   * (`depreciation_rate_furniture`, trotz des Namens in Jahren). Ohne Angabe
   * bleibt der Standard des Rechners.
   */
  const moebelJahre = positiv(wohnung.moebelNutzungsdauerJahre);
  if (moebelJahre >= 1 && moebelJahre <= 50) {
    eingabe.furnitureDepreciationYears = Math.round(moebelJahre);
    nimm("Nutzungsdauer Möbel", `${eingabe.furnitureDepreciationYears} Jahre`, "Einheit, aus Investagon");
  }

  const flaeche = positiv(daten.wohnflaeche);
  if (flaeche > 0) {
    eingabe.area = flaeche;
    nimm("Wohnfläche", `${dez(flaeche, 1)} m²`, "Einheit");
  } else {
    fehlt("Wohnfläche", "Preis je Quadratmeter im Exposé", 'Einheit über „Wohnung bearbeiten"', "einheit");
  }

  const zimmer = positiv(wohnung.zimmer);
  if (zimmer > 0) {
    eingabe.rooms = zimmer;
    nimm("Zimmer", dez(zimmer, 0), "Einheit");
  } else {
    fehlt("Zimmer", "Angabe im Exposé", 'Einheit über „Wohnung bearbeiten"', "einheit");
  }

  /*
   * Baujahr: gepflegt am Objekt, sonst aus den Investagon-Rohdaten von Objekt
   * oder Einheit. Dieselbe Regel wie im Exposé (`baueExposeInhalt`). Ohne den
   * Rückfall blieb das Feld bei Investagon-Objekten leer, obwohl Investagon
   * das Baujahr liefert und das Exposé es zeigt.
   */
  const gepflegtesBaujahr = positiv(daten.baujahr);
  const baujahr = gepflegtesBaujahr || investagonBaujahr(objekt, wohnung);
  if (baujahr > 0) {
    eingabe.constructionYear = baujahr;
    nimm("Baujahr", String(baujahr), gepflegtesBaujahr > 0 ? "Objekt" : "Investagon-Daten");
  } else {
    fehlt("Baujahr", "gesetzlicher AfA-Satz", 'Objekt über „Objekt bearbeiten"', "objekt");
  }

  /*
   * Kaufnebenkosten. Ein am Objekt gepflegter Gesamtsatz geht vor, so hält es
   * das ganze CRM (kaufnebenkostenPct). Er ist dort als Grunderwerbsteuer plus
   * Notar (1,0 Prozent) plus Grundbuch (0,5 Prozent) definiert und wird genau
   * so wieder zerlegt, damit die Summe stimmt. Ohne gepflegten Satz entscheidet
   * das Bundesland aus der Postleitzahl, das ist der reguläre Weg des Rechners.
   */
  const nkSchluessel = bundeslandFromPlz(objekt.plz || "");
  const nkGepflegt = positiv(daten.kaufnebenkostenProzent);
  if (nkGepflegt > 0) {
    const zerlegbar = nkGepflegt >= NOTAR_PROZENT + GRUNDBUCH_PROZENT;
    eingabe.transferTaxRate = zerlegbar ? nkGepflegt - NOTAR_PROZENT - GRUNDBUCH_PROZENT : nkGepflegt;
    eingabe.notaryRate = zerlegbar ? NOTAR_PROZENT : 0;
    eingabe.landRegisterRate = zerlegbar ? GRUNDBUCH_PROZENT : 0;
    knk = { weg: "manuell", bundesland: nkSchluessel ?? "" };
    nimm("Kaufnebenkosten", prozent(nkGepflegt, 2), "Objekt, gepflegter Gesamtsatz");
  } else if (nkSchluessel && saetzeFuerBundesland(nkSchluessel)) {
    const saetze = saetzeFuerBundesland(nkSchluessel)!;
    eingabe.transferTaxRate = saetze.transferTaxRate;
    eingabe.notaryRate = saetze.notaryRate;
    eingabe.landRegisterRate = saetze.landRegisterRate;
    knk = { weg: "bundesland", bundesland: nkSchluessel };
    const summe = saetze.transferTaxRate + saetze.notaryRate + saetze.landRegisterRate;
    nimm(
      "Kaufnebenkosten",
      `${bundeslandName(nkSchluessel)}, ${prozent(summe, 2)}`,
      "Postleitzahl des Objekts",
    );
  } else {
    fehlt(
      "Bundesland des Objekts",
      "Grunderwerbsteuer, Notar und Grundbuch",
      "Postleitzahl am Objekt pflegen oder das Land im Rechner wählen",
      "objekt",
    );
  }

  /*
   * Eigenkapital in Höhe der Kaufnebenkosten, so wie Christian es als Regel
   * vorgegeben hat: Der Kunde bringt Grunderwerbsteuer, Notar und Grundbuch
   * selbst mit, der Kaufpreis wird finanziert.
   *
   * Seit dem 30.09.2026 ist der Betrag das Ergebnis des Rechenkerns, statt
   * hier mit eigener Formel auf den Gesamtkaufpreis gerechnet zu werden. Die
   * Nebenkosten laufen dort ohne den Erhaltungsaufwand, und eine zweite
   * Formel hätte ihn übersehen. Gerechnet wird deshalb erst unten, wenn
   * Erhaltungsaufwand und Gebäudeanteil feststehen; der Eintrag steht aber
   * schon hier, damit die Liste der Übernahmen ihre Reihenfolge behält.
   * Fehlt Kaufpreis oder Satz, bleibt es eine benannte Lücke.
   */
  const nkSatz = eingabe.transferTaxRate + eingabe.notaryRate + eingabe.landRegisterRate
    + eingabe.brokerRate + eingabe.otherPurchaseCostRate;
  const eigenkapitalAusNebenkosten = eingabe.purchasePrice > 0 && nkSatz > 0;
  const eigenkapitalEintrag = eigenkapitalAusNebenkosten ? uebernommen.length : -1;
  if (eigenkapitalAusNebenkosten) nimm("Eigenkapital", "", `in Höhe der Kaufnebenkosten (${prozent(nkSatz, 2)})`);

  /*
   * Finanzierungsnebenkosten, seit dem 25.09.2026. Liefert Investagon einen
   * Satz für die Einheit, gilt er; sonst bleibt der Standard des Rechners
   * (0,2 Prozent) als benannte Annahme unten.
   */
  const finanzierungSatz = positiv(wohnung.finanzierungsnebenkostenSatz);
  const finanzierungAusEinheit = finanzierungSatz > 0 && finanzierungSatz <= 2;
  if (finanzierungAusEinheit) {
    eingabe.financingCostRate = finanzierungSatz;
    nimm("Finanzierungsnebenkosten", prozent(finanzierungSatz, 2), "Einheit, aus Investagon");
  }

  // ── Miete & Entwicklung ───────────────────────────────────────────────────

  /*
   * Kaltmiete inklusive Stellplatzmiete, passend dazu, dass der Stellplatz im
   * Kaufpreis steckt. Eine noch ausstehende Mieterhöhung ist hier bewusst
   * nicht eingerechnet: Der Rechner kennt nur eine Startmiete, und eine
   * vorweggenommene Erhöhung wäre eine stille Annahme.
   */
  const miete = positiv(daten.kaltmieteMonat);
  if (miete > 0) {
    eingabe.monthlyColdRent = miete;
    nimm(
      "Kaltmiete p. M.",
      eur0(miete),
      positiv(wohnung.stellplatzMiete) > 0 ? "Einheit, inklusive Stellplatzmiete" : "Einheit",
    );
  } else {
    fehlt("Kaltmiete p. M.", "Rendite, Cashflow und Steuerwirkung", 'Einheit über „Wohnung bearbeiten"', "einheit");
  }

  /*
   * Nicht umlagefähige Kosten: der nicht umlegbare Anteil des Hausgelds und
   * die Kosten der Sondereigentumsverwaltung. Beides trägt der Eigentümer und
   * beides ist abziehbar, genau so behandelt es der Exposé-Rechner. Der
   * umlagefähige Teil des Hausgelds gehört nicht hierher, den zahlt der Mieter.
   */
  const hausgeldNu = positiv(daten.hausgeldNichtUmlegbarMonat);
  const mietverwaltung = positiv(daten.mietverwaltungMonat);
  eingabe.monthlyOperatingCosts = hausgeldNu + mietverwaltung;
  /*
   * Zuführung zur Instandhaltungsrücklage, seit dem 25.09.2026 als eigenes
   * Feld. Investagon liefert sie getrennt vom nicht umlagefähigen Hausgeld
   * (Sigmundstraße 2: 45 plus 90 Rücklage gleich 135). Der Rechner zählt sie
   * im Cashflow, zieht sie steuerlich aber nicht ab (BFH IX R 19/24, siehe
   * `RUECKLAGENZUFUEHRUNG_ABZIEHBAR`). Nur aus dem Import: Ein von Hand
   * gepflegter nicht umlegbarer Anteil kann die Rücklage schon enthalten.
   */
  const zufuehrung = positiv(wohnung.ruecklageZufuehrungMonat);
  if (zufuehrung > 0) {
    eingabe.monthlyReserveContribution = zufuehrung;
    nimm("Zuführung Instandhaltungsrücklage p. M.", eur0(zufuehrung), "Einheit, aus Investagon");
  }
  if (eingabe.monthlyOperatingCosts > 0) {
    nimm(
      "Nicht umlagefähige Kosten p. M.",
      eur0(eingabe.monthlyOperatingCosts),
      mietverwaltung > 0
        ? `Hausgeld nicht umlegbar ${eur0(hausgeldNu)} plus Mietverwaltung ${eur0(mietverwaltung)}`
        : "nicht umlegbarer Anteil des Hausgelds",
    );
  } else {
    fehlt(
      "Nicht umlagefähige Kosten p. M.",
      "Cashflow und steuerliches Ergebnis, ohne sie fällt das Ergebnis zu gut aus",
      'Hausgeld an der Einheit oder am Objekt über „Wohnung bearbeiten"',
      "einheit",
    );
  }

  // ── Steuer & AfA ──────────────────────────────────────────────────────────

  const gebaeudeanteil = positiv(daten.gebaeudeanteilProzent);
  if (gebaeudeanteil > 0) {
    eingabe.buildingShare = gebaeudeanteil;
    nimm("Gebäudeanteil", prozent(gebaeudeanteil, 1), "Objekt, Kaufpreisaufteilung");
  } else {
    fehlt(
      "Gebäudeanteil",
      `Grundlage der Abschreibung, ohne Kaufpreisaufteilung rechnet der Rechner mit ${prozent(standardEingabe.buildingShare, 0)}`,
      'Objekt über „Objekt bearbeiten", Grundstücksanteil',
      "objekt",
    );
  }

  const afa = objekt.afaDaten;
  const afaSatz = positiv(afa?.afaSatz);
  if (afaSatz > 0) {
    eingabe.buildingDepreciationRate = afaSatz;
    eingabe.depreciationMethod = afa?.afaModell === "degressiv" ? "declining" : "linear";
    nimm(
      eingabe.depreciationMethod === "declining" ? "Degressive AfA p. a." : "Lineare AfA p. a.",
      prozent(afaSatz, 1),
      `Objekt, AfA-Modell ${afa?.afaModell}`,
    );
  } else {
    const gesetzlich = linearerAfaSatz(baujahr > 0 ? baujahr : null);
    eingabe.buildingDepreciationRate = gesetzlich.satz;
    fehlt(
      "Lineare AfA p. a.",
      `am Objekt ist kein Satz gepflegt, der Rechner nimmt ${prozent(gesetzlich.satz, 1)} nach ${gesetzlich.paragraf}`,
      'Objekt über „Objekt bearbeiten", Abschnitt AfA',
      "objekt",
    );
  }

  /*
   * Erhaltungsaufwand: der Anteil dieser Einheit an den beschlossenen
   * Maßnahmen am Gemeinschaftseigentum. Ein direkt gepflegter Betrag geht vor,
   * sonst Gesamtkosten mal Miteigentumsanteil. Ohne beides bleibt das Feld
   * leer, ein geschätzter Sanierungsanteil wäre reine Erfindung.
   */
  const sanierungAnteil =
    positiv(daten.sanierungsanteilEuro) > 0
      ? positiv(daten.sanierungsanteilEuro)
      : (positiv(daten.sanierungskostenGesamt) * positiv(daten.miteigentumsanteilProzent)) / 100;
  if (sanierungAnteil > 0) {
    eingabe.rehabExpense = sanierungAnteil;
    eingabe.rehabMode = "expense";
    eingabe.rehabDistributionYears = Math.min(5, Math.max(1, positiv(objekt.erhaltungsaufwandJahre) || 1));
    nimm(
      "davon Erhaltungsaufwand",
      eur0(sanierungAnteil),
      positiv(daten.sanierungsanteilEuro) > 0
        ? "Einheit, gepflegter Sanierungsanteil"
        : `Objekt, ${eur0(positiv(daten.sanierungskostenGesamt))} mal Miteigentumsanteil ${prozent(positiv(daten.miteigentumsanteilProzent), 1)}`,
    );
    nimm(
      "Verteilung des Aufwands",
      `${eingabe.rehabDistributionYears} Jahr${eingabe.rehabDistributionYears === 1 ? "" : "e"}`,
      "Objekt, Verteilung nach § 82b EStDV",
    );
  }

  // Das Eigenkapital von oben, jetzt mit Erhaltungsaufwand und Gebäudeanteil.
  if (eigenkapitalEintrag >= 0) {
    const ergebnis = berechneInvestment(eingabe);
    eingabe.equity = Math.round(ergebnis.purchaseCosts);
    uebernommen[eigenkapitalEintrag].wert = eur0(eingabe.equity);
    if (ergebnis.erhaltungsaufwand > 0 || ergebnis.moebelAnteil > 0) {
      const ohne = [ergebnis.erhaltungsaufwand > 0 && "Erhaltungsaufwand", ergebnis.moebelAnteil > 0 && "Möbel"]
        .filter(Boolean)
        .join(" und ");
      const woher = `in Höhe der Kaufnebenkosten (${prozent(nkSatz, 2)} auf ${eur0(ergebnis.nebenkostenBasis)}, ohne ${ohne})`;
      uebernommen[eigenkapitalEintrag].woher = woher;
      herkunft.equity = { quelle: "objekt", text: `Aus der Objektanlage, ${woher}` };
    }
  }

  // ── Objektunterlagen ──────────────────────────────────────────────────────

  /*
   * Energieausweis, Rücklagenanteil und Sanierungshistorie. Die Feldnamen
   * decken sich eins zu eins, es wird nichts umgerechnet. Die Klasse wird nur
   * übernommen, wenn sie auf der Skala des Rechners steht, sonst stünde im
   * Auswahlfeld ein Wert, den es dort nicht gibt.
   */
  const ea = felder.energieausweis;
  /*
   * Investagon führt die Effizienzklasse und die Ausweisart mal am Projekt,
   * mal nur an der Einheit. `objektseiteFelder` fragt nur das Objekt, hier
   * kommt die Einheit als Rückfall dazu. Gelesen wird nur, was
   * `energieeffizienzklasse` als echte Klasse anerkennt.
   */
  const klasseDerEinheit = ea.klasse ? undefined : energieeffizienzklasse(einheitRohdaten(wohnung));
  const klasse = (ea.klasse || klasseDerEinheit || "").trim().toUpperCase();
  const sanierungshistorie = felder.sanierungen
    .map((s) => [s.jahr, s.massnahme].filter(Boolean).join(" · "))
    .filter(Boolean);
  const unterlagen: UnterlagenDaten = {
    ...leereUnterlagenDaten,
    energyClass: (ENERGIEKLASSEN as readonly string[]).includes(klasse) ? klasse : "",
    energyValue: positiv(ea.kennwert),
    certificateType: ea.art || ausweisartText(einheitRohdaten(wohnung)) || "",
    energyCarrier: ea.energietraeger || "",
    certificateValidUntil: ea.gueltigBis || "",
    reserveUnitShare: positiv(wohnung.ruecklageWohnung),
    renovations: sanierungshistorie,
  };
  if (unterlagen.energyClass || unterlagen.energyValue > 0) {
    nimm(
      "Energieausweis",
      [unterlagen.energyClass, unterlagen.energyValue > 0 ? `${dez(unterlagen.energyValue, 0)} kWh/(m²·a)` : ""]
        .filter(Boolean)
        .join(", "),
      !(klasseDerEinheit && unterlagen.energyClass)
        ? "Objekt, Energieausweis"
        : unterlagen.energyValue > 0
          ? "Objekt, Energieausweis, Klasse aus den Investagon-Daten der Einheit"
          : "Investagon-Daten der Einheit",
    );
  } else {
    fehlt(
      "Energieeffizienzklasse",
      "Angabe im Exposé, sie ist bei Vermietung und Verkauf pflichtig, in die Rechnung geht sie nicht ein",
      // Den Knopf „Objektangaben pflegen" gibt es seit dem 23.09.2026 nicht mehr.
      "Objekt, Energieausweis, der Admin trägt ihn über den Bearbeiten-Stift ein",
      "objekt",
    );
  }
  if (unterlagen.reserveUnitShare > 0) {
    nimm("Anteil der Einheit an der Rücklage", eur0(unterlagen.reserveUnitShare), "Einheit");
  }
  if (sanierungshistorie.length > 0) {
    nimm(
      "Letzte Sanierungen",
      `${sanierungshistorie.length} Eintrag${sanierungshistorie.length === 1 ? "" : "e"}`,
      "Objekt, Maßnahmen am Gemeinschaftseigentum",
    );
  }

  // ── Bilder ────────────────────────────────────────────────────────────────

  /*
   * Die Fotos für den Bereich „Bilder" und damit für die Berechnungs-PDF.
   * Hier steht nur die Auswahl; geladen werden sie im Rechner, und dort nur,
   * solange noch niemand eigene Bilder hineingelegt hat.
   */
  const bilder = rechnerBildAdressen(objekt, wohnung);
  if (bilder.length > 0) {
    const vonEinheit = rechnerBildAdressen({ bildUrl: "", bilder: [] }, wohnung).length;
    const anzahl = Math.min(MAX_RECHNER_BILDER, bilder.length);
    nimm(
      "Bilder",
      `${anzahl} Foto${anzahl === 1 ? "" : "s"}`,
      vonEinheit === 0 ? "Objekt, Titelbild vorn" : vonEinheit >= anzahl ? "Einheit" : "erst Einheit, dann Objekt",
    );
  }

  // ── Was der Rechner vom Kunden braucht ────────────────────────────────────

  fehlt("Kundenname", "Beschriftung der Auswertung und des Exposés", "Kunde & Einkommen im Rechner", "kunde");
  fehlt(
    "zvE Kunde",
    "ohne zu versteuerndes Einkommen gibt es keine Steuerwirkung und keinen Cashflow nach Steuern",
    "Kunde & Einkommen im Rechner, Zahl aus der Selbstauskunft",
    "kunde",
  );
  if (!(eingabe.equity > 0)) {
    fehlt(
      "Eigenkapital",
      "Darlehenshöhe, Rate und Rendite auf das eingesetzte Kapital",
      "Finanzierung im Rechner; Regel: in Höhe der Kaufnebenkosten",
      "kunde",
    );
  }

  eingabe.kfwProgram = investagonKfwProgramm(objekt, wohnung);
  if (eingabe.kfwProgram) {
    nimm("KfW-Programm", eingabe.kfwProgram, "Investagon, nur der Programmname; Betrag und Zins trägst du unter Finanzierung ein");
  }

  // ── Vorgaben, die nicht am Objekt hängen ──────────────────────────────────

  const annahmen: VorbelegungAnnahme[] = [
    { feld: "Sollzins p. a.", wert: prozent(eingabe.seniorInterestRate, 2) },
    { feld: "Anfängliche Tilgung", wert: prozent(eingabe.seniorRepaymentRate, 2) },
    { feld: "Leerstand / Mietausfall", wert: prozent(eingabe.vacancyRate, 2) },
    { feld: "Mietsteigerung p. a.", wert: prozent(eingabe.annualRentGrowth, 2) },
    { feld: "Kostensteigerung p. a.", wert: prozent(eingabe.annualCostGrowth, 2) },
    { feld: "Wertsteigerung p. a.", wert: prozent(eingabe.annualValueGrowth, 2) },
    { feld: "Betrachtungszeitraum", wert: `${eingabe.forecastYears} Jahre` },
    ...(finanzierungAusEinheit
      ? []
      : [{ feld: "Finanzierungsnebenkosten", wert: `${prozent(eingabe.financingCostRate, 2)} der Darlehenssumme` }]),
  ];

  return { eingabe, knk, unterlagen, bilder, uebernommen, luecken, annahmen, quellen: objektUnterlagenQuelle(objekt, wohnung), herkunft };
}
