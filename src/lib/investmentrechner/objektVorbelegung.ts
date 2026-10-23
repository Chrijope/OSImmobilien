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
import { rohdaten } from "@/lib/investagonFelder";
import { objektartInfo, objektseiteFelder } from "@/lib/objektseiteDaten";
import { objektAnlageklasse } from "@/lib/objektKlassen";
import { bundeslandFromPlz, GRUNDBUCH_PROZENT, NOTAR_PROZENT } from "@/lib/kaufnebenkosten";
import {
  getHausgeldMonatForWohnung,
  getHausgeldNichtUmlegbarP,
  hausgeldNichtUmlegbarQuelle,
} from "@/lib/objekteStore";
import { hausgeldTeile } from "../../../supabase/functions/_shared/einheit-hausgeld";
import { linearerAfaSatz } from "@/lib/afaSaetze";
import { dez, eur0, prozent } from "@/lib/objektKennzahlen";
import { standardEingabe, type InvestmentEingabe } from "./rechenkern";
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
 * `allInclusive` rechnet die Vorbelegung im All-inclusive-Modell (seit dem
 * 09.10.2026). Objekt und Einheit tragen dafür noch kein Kennzeichen, es
 * kommt deshalb vom Aufrufer.
 */
export function vorbelegungAusEinheit(
  objekt: ObjektData,
  wohnung: ObjektWohnung,
  heute: Date = new Date(),
  optionen: { allInclusive?: boolean } = {},
): ObjektVorbelegung {
  const daten = exposeObjektdatenAus(objekt, wohnung, heute);
  const felder = objektseiteFelder(objekt);
  const uebernommen: VorbelegungUebernahme[] = [];
  const luecken: VorbelegungLuecke[] = [];
  const eingabe: InvestmentEingabe = {
    ...standardEingabe,
    startYear: heute.getFullYear(),
    allInclusive: optionen.allInclusive === true,
  };
  let knk: Kaufnebenkostenauswahl = standardKaufnebenkostenauswahl;

  const herkunft: Herkunft = {};
  const zuordnung: Record<string, (keyof InvestmentEingabe)[]> = {
    "Objektbezeichnung": ["propertyTitle"], "Adresse": ["address"], "Objekttyp": ["propertyType"],
    "Kaufpreis": ["purchasePrice"], "davon Möbel/Inventar": ["furniturePrice"], "davon Stellplatz/Garage": ["garagePrice"],
    "Stellplatz-/Garagenmiete p. M.": ["monthlyGarageRent"],
    "Hausgeld gesamt p. M.": ["housingFeeTotal", "housingFeeRecoverable"],
    "Wohnfläche": ["area"], "Zimmer": ["rooms"], "Baujahr": ["constructionYear"],
    "Kaufnebenkosten": ["transferTaxRate", "notaryRate", "landRegisterRate"], "Kaltmiete p. M.": ["monthlyColdRent"],
    "Nicht umlagefähige Kosten p. M.": ["housingFeeNonRecoverable", "monthlyOperatingCosts"], "Gebäudeanteil": ["buildingShare"],
    "davon Instandhaltungsrücklage p. M.": ["monthlyReserveContribution"],
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
  /*
   * Seit dem 22.10.2026 steht der Stellplatz zusätzlich als „davon“ im
   * Kaufpreis, damit Rendite und Kaufpreisfaktor der Wohnung allein neben
   * denen des Pakets stehen können. Gerechnet wird damit wie vorher.
   */
  const stellplatzpreis = positiv(daten.stellplatzpreis);
  if (stellplatzpreis > 0 && stellplatzpreis <= eingabe.purchasePrice) {
    eingabe.garagePrice = stellplatzpreis;
    nimm("davon Stellplatz/Garage", eur0(stellplatzpreis), "Einheit, Stellplatzpreis, im Kaufpreis enthalten");
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
   * Notar (1,5 Prozent) plus Grundbuch (0,5 Prozent) definiert und wird genau
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
   *
   * Beim All-inclusive-Modell ergibt dieselbe Regel 0: Die Kaufnebenkosten
   * stecken im Kaufpreis und werden mit ihm finanziert, der Rechenkern weist
   * keine gesonderten aus.
   */
  /*
   * Seit dem 23.10.2026 ist das Eigenkapital kein Eingabefeld mehr, sondern
   * der Rest der Finanzierung. Der Standard des Rechners (Bank 100 Prozent des
   * Kaufpreises) ergibt dieselbe Regel wie vorher: Eigenkapital in Höhe der
   * Kaufnebenkosten, beim All-inclusive-Modell 0. Sie steht unten bei den
   * Annahmen. Finanzierungsnebenkosten gibt es nicht mehr.
   */

  // ── Miete & Entwicklung ───────────────────────────────────────────────────

  /*
   * Kaltmiete der Wohnung und Stellplatzmiete getrennt, seit dem 22.10.2026.
   * `kaltmieteMonat` aus exposeObjektdatenAus enthält die Stellplatzmiete,
   * weil der Exposé-Rechner nur eine Miete kennt; hier wird sie wieder
   * herausgenommen und steht im eigenen Feld. Vorher stand alles in der
   * Kaltmiete, gerechnet wird gleich, nur der Ausweis der Rendite ändert sich.
   * Eine noch ausstehende Mieterhöhung ist bewusst nicht eingerechnet: Der
   * Rechner kennt nur eine Startmiete, und eine vorweggenommene Erhöhung wäre
   * eine stille Annahme.
   */
  const stellplatzMiete = Math.min(positiv(daten.stellplatzMieteMonat), positiv(daten.kaltmieteMonat));
  const miete = positiv(daten.kaltmieteMonat) - stellplatzMiete;
  if (stellplatzMiete > 0) {
    eingabe.monthlyGarageRent = stellplatzMiete;
    nimm("Stellplatz-/Garagenmiete p. M.", eur0(stellplatzMiete), "Einheit, Stellplatzmiete");
  }
  if (miete > 0) {
    eingabe.monthlyColdRent = miete;
    nimm("Kaltmiete p. M.", eur0(miete), stellplatzMiete > 0 ? "Einheit, ohne Stellplatzmiete" : "Einheit");
  } else {
    fehlt("Kaltmiete p. M.", "Rendite, Cashflow und Steuerwirkung", 'Einheit über „Wohnung bearbeiten"', "einheit");
  }

  /*
   * Nicht umlagefähige Kosten: der nicht umlegbare Anteil des Hausgelds und
   * die Kosten der Sondereigentumsverwaltung. Beides trägt der Eigentümer und
   * beides ist abziehbar, genau so behandelt es der Exposé-Rechner. Der
   * umlagefähige Teil des Hausgelds gehört nicht hierher, den zahlt der Mieter.
   */
  /*
   * Seit dem 22.10.2026 mit Herkunft: Der nicht umlagefähige Anteil ist an der
   * Einheit gepflegt (auch aus den Investagon-Rohdaten), als Eurobetrag am
   * Objekt, oder nur geschätzt als Prozentsatz vom Hausgeld gesamt. Eine
   * Schätzung wird genannt und als Lücke gemeldet, statt still mitzurechnen.
   * Ist die Rücklage bekannt, läuft die Schätzung auf das Hausgeld ohne sie:
   * Die Rücklage steht im eigenen Feld und zählte sonst zweimal.
   */
  const zufuehrung = positiv(wohnung.ruecklageZufuehrungMonat ?? hausgeldTeile(wohnung).ruecklage ?? hausgeldTeile((wohnung as { meta?: unknown }).meta).ruecklage);
  const nuQuelle = hausgeldNichtUmlegbarQuelle(objekt, wohnung);
  const hausgeldGesamt = getHausgeldMonatForWohnung(objekt, wohnung);
  const nuSatz = getHausgeldNichtUmlegbarP(objekt, wohnung);
  const hausgeldNu =
    nuQuelle === "geschaetzt" && zufuehrung > 0
      ? Math.round((Math.max(0, hausgeldGesamt - zufuehrung) * nuSatz) / 100)
      : positiv(daten.hausgeldNichtUmlegbarMonat);
  const mietverwaltung = positiv(daten.mietverwaltungMonat);
  /*
   * Seit dem 22.10.2026 getrennt: das nicht umlagefähige Hausgeld in seinem
   * Feld, die Mietverwaltung (Sondereigentumsverwaltung) als weitere Kosten.
   * Der Rechenkern zählt beide zusammen; so wirkt jede Änderung in der Maske.
   */
  eingabe.housingFeeNonRecoverable = hausgeldNu;
  eingabe.monthlyOperatingCosts = mietverwaltung;
  const nichtUmlagefaehigGesamt = hausgeldNu + mietverwaltung;
  /*
   * Das Hausgeld in ganzer Höhe, seit dem 22.10.2026 (Christian): gesamt,
   * umlagefähig und nicht umlagefähig wie im Exposé und Wirtschaftsplan. Der
   * umlagefähige Teil steht nur zur Anzeige da, er zahlt der Mieter.
   */
  const umlagefaehig = positiv(hausgeldTeile(wohnung).umlagefaehig ?? hausgeldTeile((wohnung as { meta?: unknown }).meta).umlagefaehig);
  if (hausgeldGesamt > 0 || umlagefaehig > 0 || hausgeldNu > 0) {
    eingabe.housingFeeTotal = hausgeldGesamt;
    eingabe.housingFeeRecoverable = umlagefaehig;
    nimm(
      "Hausgeld gesamt p. M.",
      eur0(hausgeldGesamt),
      `Einheit, davon umlagefähig ${eur0(umlagefaehig)}, nicht umlagefähig ${eur0(hausgeldNu)}${nuQuelle === "geschaetzt" ? " (geschätzt)" : ""}`,
    );
  }
  /*
   * Zuführung zur Instandhaltungsrücklage, seit dem 25.09.2026 als eigenes
   * Feld. Investagon liefert sie getrennt vom nicht umlagefähigen Hausgeld
   * (Sigmundstraße 2: 45 plus 90 Rücklage gleich 135). Der Rechner zählt sie
   * im Cashflow, zieht sie steuerlich aber nicht ab (BFH IX R 19/24, siehe
   * `RUECKLAGENZUFUEHRUNG_ABZIEHBAR`). Nur aus dem Import: Ein von Hand
   * gepflegter nicht umlegbarer Anteil kann die Rücklage schon enthalten.
   */
  if (zufuehrung > 0) {
    eingabe.monthlyReserveContribution = zufuehrung;
    nimm("davon Instandhaltungsrücklage p. M.", eur0(zufuehrung), "Einheit, aus Investagon");
  }
  if (nichtUmlagefaehigGesamt > 0) {
    const nuText =
      nuQuelle === "geschaetzt"
        ? `geschätzt: ${prozent(nuSatz, 0)} des Hausgelds gesamt ${eur0(hausgeldGesamt)}${zufuehrung > 0 ? " ohne Rücklage" : ""}`
        : "nicht umlegbarer Anteil des Hausgelds";
    nimm(
      "Nicht umlagefähige Kosten p. M.",
      eur0(nichtUmlagefaehigGesamt),
      mietverwaltung > 0 ? `Hausgeld nicht umlegbar ${eur0(hausgeldNu)} (${nuText}) plus Mietverwaltung ${eur0(mietverwaltung)}` : nuText,
    );
    if (nuQuelle === "geschaetzt") {
      fehlt(
        "Nicht umlagefähiges Hausgeld (nur geschätzt)",
        `bekannt ist nur das Hausgeld gesamt; der Rechner nimmt ${prozent(nuSatz, 0)} davon als nicht umlagefähig an. Der umlagefähige Teil zahlt der Mieter und belastet den Cashflow nicht`,
        'Einheit über „Wohnung bearbeiten", Hausgeld umlagefähig, nicht umlagefähig und Zuführung Rücklage',
        "einheit",
      );
    }
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

  // ── Objektunterlagen ──────────────────────────────────────────────────────

  /*
   * Rücklagenanteil und Sanierungshistorie. Die Feldnamen decken sich eins zu
   * eins, es wird nichts umgerechnet. Den Energieausweis übernimmt der Rechner
   * seit dem 23.10.2026 nicht mehr, er steht im Exposé.
   */
  const sanierungshistorie = felder.sanierungen
    .map((s) => [s.jahr, s.massnahme].filter(Boolean).join(" · "))
    .filter(Boolean);
  const unterlagen: UnterlagenDaten = {
    ...leereUnterlagenDaten,
    reserveUnitShare: positiv(wohnung.ruecklageWohnung),
    renovations: sanierungshistorie,
  };
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
    "Zu versteuerndes Einkommen",
    "ohne zu versteuerndes Einkommen gibt es keine Steuerwirkung und keinen Cashflow nach Steuern",
    "Kunde & Einkommen im Rechner, Zahl aus der Selbstauskunft",
    "kunde",
  );

  eingabe.kfwProgram = investagonKfwProgramm(objekt, wohnung);
  if (eingabe.kfwProgram) {
    nimm("KfW-Programm", eingabe.kfwProgram, "Investagon, nur der Programmname; Betrag und Zins trägst du unter Finanzierung ein");
  }

  // ── Vorgaben, die nicht am Objekt hängen ──────────────────────────────────

  const annahmen: VorbelegungAnnahme[] = [
    {
      feld: "Bankdarlehen",
      wert: `${prozent(eingabe.seniorLoanValue, 0)} des Kaufpreises, Eigenkapital ${eingabe.allInclusive ? "0 € (All-inclusive)" : "in Höhe der Kaufnebenkosten"}`,
    },
    { feld: "Sollzins p. a.", wert: prozent(eingabe.seniorInterestRate, 2) },
    { feld: "Anfängliche Tilgung", wert: prozent(eingabe.seniorRepaymentRate, 2) },
    { feld: "Leerstand / Mietausfall", wert: prozent(eingabe.vacancyRate, 2) },
    { feld: "Mietsteigerung p. a.", wert: prozent(eingabe.annualRentGrowth, 2) },
    { feld: "Kostensteigerung p. a.", wert: prozent(eingabe.annualCostGrowth, 2) },
    { feld: "Wertsteigerung p. a.", wert: prozent(eingabe.annualValueGrowth, 2) },
    { feld: "Betrachtungszeitraum", wert: `${eingabe.forecastYears} Jahre` },
  ];

  return { eingabe, knk, unterlagen, bilder, uebernommen, luecken, annahmen, quellen: objektUnterlagenQuelle(objekt, wohnung), herkunft };
}

/** Der Herkunftssatz, mit dem die Vorbelegung bis zum 22.10.2026 die Kaltmiete samt Stellplatzmiete markierte. */
const KALTMIETE_MIT_STELLPLATZ = "inklusive Stellplatzmiete";

/**
 * Eine gespeicherte Berechnung von vor dem 22.10.2026 auf getrennte
 * Wohnungs- und Stellplatzmiete umstellen.
 *
 * Bis dahin schrieb die Vorbelegung Wohnung und Stellplatz zusammen in die
 * Kaltmiete. Getrennt wird nur, was sich belegen lässt:
 *   - die Kaltmiete trägt noch den alten Herkunftssatz „inklusive
 *     Stellplatzmiete“, stammt also nachweislich aus der Vorbelegung und
 *     wurde nicht von Hand geändert;
 *   - die Garagenmiete ist leer, sonst stünde die Garage danach doppelt da;
 *   - die Einheit nennt heute eine Stellplatzmiete, und sie ist nicht höher
 *     als die gespeicherte Kaltmiete.
 * Die Summe bleibt gleich, also auch jede Zahl der Berechnung; nur Rendite
 * und Kaufpreisfaktor der Wohnung allein werden damit richtig. Den
 * Stellplatzpreis gibt es dazu, wenn er noch fehlt und in den Kaufpreis passt.
 * In jedem anderen Fall bleibt die Berechnung, wie sie ist.
 */
export function stellplatzmieteTrennen(
  eingabe: InvestmentEingabe,
  herkunft: Herkunft,
  vorbelegung: { eingabe: InvestmentEingabe } | null | undefined,
): { eingabe: InvestmentEingabe; herkunft: Herkunft; getrennt: boolean } {
  const unveraendert = { eingabe, herkunft, getrennt: false };
  const stellplatzMiete = positiv(vorbelegung?.eingabe.monthlyGarageRent);
  if (!vorbelegung || !(stellplatzMiete > 0)) return unveraendert;
  if (positiv(eingabe.monthlyGarageRent) > 0) return unveraendert;
  const mieteHerkunft = herkunft.monthlyColdRent;
  if (mieteHerkunft?.quelle !== "objekt" || !mieteHerkunft.text.includes(KALTMIETE_MIT_STELLPLATZ)) return unveraendert;
  if (!(eingabe.monthlyColdRent >= stellplatzMiete)) return unveraendert;
  const stellplatzpreis = positiv(vorbelegung.eingabe.garagePrice);
  const mitPreis = !(positiv(eingabe.garagePrice) > 0) && stellplatzpreis > 0 && stellplatzpreis <= eingabe.purchasePrice;
  const hinweis = "aus der gespeicherten Kaltmiete getrennt";
  return {
    eingabe: {
      ...eingabe,
      monthlyColdRent: eingabe.monthlyColdRent - stellplatzMiete,
      monthlyGarageRent: stellplatzMiete,
      ...(mitPreis ? { garagePrice: stellplatzpreis } : {}),
    },
    herkunft: {
      ...herkunft,
      monthlyColdRent: { quelle: "objekt", text: `Aus der Objektanlage, Einheit, ohne Stellplatzmiete (${hinweis})` },
      monthlyGarageRent: { quelle: "objekt", text: `Aus der Objektanlage, Einheit, Stellplatzmiete (${hinweis})` },
      ...(mitPreis ? { garagePrice: { quelle: "objekt" as const, text: "Aus der Objektanlage, Einheit, Stellplatzpreis, im Kaufpreis enthalten" } } : {}),
    },
    getrennt: true,
  };
}
