import { createContext, useContext, useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { eigenkapitalrendite, hausgeldAufstellung, mitStellplatz, monateErstesJahr, type InvestmentEingabe, type InvestmentErgebnis } from "@/lib/investmentrechner/rechenkern";
import {
  haushaltMitVorlage,
  haushaltsrechnung,
  vermoegenMitVorlage,
  vermoegensaufstellung,
} from "@/lib/investmentrechner/bankunterlagen";
import {
  bankuebersicht,
  eigenkapitalrenditeOhneWertsteigerung,
  fuenfzehnProzentGrenze,
  zinsrisiko,
} from "@/lib/investmentrechner/bankgespraech";
import { regelAfa, stresstest, wertszenarien } from "@/lib/investmentrechner/rechenstandards";
import { sanierungenBereinigt, type UnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import {
  ENERGIEKLASSEN,
  formatEuro,
  formatEuroCent,
  formatProzent,
  formatProzentEineStelle,
  formatZahl,
} from "@/lib/investmentrechner/formatierer";
import { KENNZAHL_TEXTE } from "@/lib/investmentrechner/kennzahlTexte";
import { rechenwege } from "@/lib/investmentrechner/kennzahlErklaerungen";
import { AMPEL_WORT, Ampelpunkt, Kennzahlkarte, Neu } from "./Felder";
import {
  AMPEL_SCHWELLEN,
  ampel,
  pruefeSchwellen,
  type Ampelkennzahl,
  type Ampelschwelle,
} from "@/lib/investmentrechner/ampel";

/**
 * Die gültigen Ampel-Schwellen und wer sie ändern darf, seit dem 11.10.2026.
 * Der Rechner liest sie aus `app_config` und reicht sie hier herein; ohne
 * Rechner (Tests, Einzelkarten) gelten die Standardwerte, nur lesend.
 */
export interface AmpelEinstellung {
  schwellen: Record<Ampelkennzahl, Ampelschwelle>;
  darfBearbeiten: boolean;
  speichern: (schwellen: Record<Ampelkennzahl, Ampelschwelle>) => Promise<boolean>;
  /** Satz unter dem Editor, etwa dass in der Vorschau nur lokal gespeichert wird. */
  hinweis?: string;
}

export const AmpelKontext = createContext<AmpelEinstellung>({
  schwellen: AMPEL_SCHWELLEN,
  darfBearbeiten: false,
  speichern: async () => false,
});
import { useRechnerTexte } from "./RechnerSprache";
import { dokumentTexteFuer } from "@/lib/investmentrechner/dokumentTexte";
import type { FormatSprache } from "@/lib/sprachFormat";

/*
 * Auswertungsbausteine des Investmentrechners: Steuerprofil, Energieskala,
 * Unterlagen-Einblicke und Kennzahlenraster (Original xe, Ce, we, Te).
 */

interface SteuerprofilProps {
  input: InvestmentEingabe;
  result: InvestmentErgebnis;
  compact?: boolean;
}

/** Einkommens- und Steuerprofil des Kunden vor Erwerb. */
export function Steuerprofil({ input, result, compact = false }: SteuerprofilProps) {
  const { sprache, texte } = useRechnerTexte();
  const t = texte.steuerprofil;
  const euro = (wert: number) => formatEuro(wert, sprache);
  const prozent = (wert: number) => formatProzent(wert, sprache);
  const zeilen: [string, string][] = [
    [t.brutto, euro(input.annualGrossIncome)],
    [t.zve, euro(result.combinedTaxableIncome)],
    [t.est, euro(result.taxProfile.incomeTax)],
    [t.soli, euro(result.taxProfile.solidarity)],
    [t.kist, euro(result.taxProfile.churchTax)],
    [t.gesamt, euro(result.taxProfile.totalTax)],
    [t.effektiv, prozent(result.taxProfile.effectiveRate)],
    [t.grenz, prozent(result.marginalTotalTaxRate)],
  ];
  return (
    <div className={`tax-profile-grid ${compact ? "compact" : ""}`}>
      {zeilen.map(([label, wert], index) => (
        <div key={label} className={index === 5 ? "tax-profile-total" : ""}>
          <span>{label}</span>
          <strong>{wert}</strong>
        </div>
      ))}
    </div>
  );
}

export interface Kaufpreiszeile {
  label: string;
  wert: string;
  /** Die Summenzeile, in der Berechnung fett, in der Analyse dunkel hinterlegt. */
  summe?: boolean;
}

/**
 * Die Zeilen der Kaufpreisdetails, einmal für Analyse und Berechnung.
 *
 * Bis zum 25.09.2026 standen Kaufpreis und Möbel nur in der Berechnung, die
 * Analyse zeigte sie nirgends, obwohl beide in jede ihrer Kennzahlen
 * einfließen. Beide Ansichten lesen jetzt diese eine Liste, damit Beschriftung
 * und Werte nicht auseinanderlaufen. Gerechnet wird hier nichts, alles kommt
 * aus der Eingabe und dem Ergebnis des Rechenkerns.
 *
 * Seit dem 25.09.2026 gibt es einen Kaufpreis. Möbel, Erhaltungsaufwand und
 * Rücklage sind darin enthalten und stehen als „davon“ darunter, nur wenn sie
 * vorkommen. Sie werden nicht addiert: Gesamtkosten sind Kaufpreis plus
 * Kaufnebenkosten. Grundstücks- und Gebäudeanteil zeigen, wie der Kaufpreis
 * ohne Möbel und Rücklage aufgeteilt ist.
 *
 * Alle Beträge kommen aus dem Ergebnis, nicht aus der Eingabe. Dort sind sie
 * schon mit dem Anteil am Investment gerechnet. Vorher standen Kaufpreis und
 * Möbel voll aus der Eingabe da, die Nebenkosten darunter aber anteilig, und
 * bei 50 Prozent passte die Summe nicht zu den Zeilen.
 */
export function kaufpreiszeilen(result: InvestmentErgebnis, sprache: FormatSprache = "de"): Kaufpreiszeile[] {
  const t = dokumentTexteFuer(sprache).kaufpreis;
  const euro = (wert: number) => formatEuro(wert, sprache);
  const prozent = (wert: number) => formatProzent(wert, sprache);
  /*
    Mit Erhaltungsaufwand oder Möbeln seit dem 30.09.2026 ausführlicher: Beide
    sind im Notarvertrag gesondert ausgewiesen und tragen keine
    Kaufnebenkosten. Damit das nachvollziehbar ist, stehen Kaufpreis der
    Immobilie, Aufwand und Möbel als eigene Zeilen da, und jeder Posten nennt
    Satz und tatsächliche Basis. Ohne beide bleibt die Liste, wie sie war.
  */
  const mitAufwand = result.erhaltungsaufwand > 0;
  const mitMoebeln = result.moebelAnteil > 0;
  // Beim All-inclusive-Modell steckt der Aufschlag im Kaufpreis, die Nebenkosten stehen als „enthalten“ da, nie als 0 €.
  const allInclusive = result.allInclusive;
  const gesamtLabel = allInclusive
    ? t.gesamtAllInclusive
    : mitAufwand && mitMoebeln
    ? t.gesamtInklBeides
    : mitAufwand
      ? t.gesamtInklErhaltung
      : mitMoebeln
        ? t.gesamtInklMoebel
        : t.gesamt;
  const zeilen: Kaufpreiszeile[] = [{ label: gesamtLabel, wert: euro(result.kaufpreisGesamt) }];
  // Wohnung und Stellplatz getrennt, seit dem 22.10.2026.
  if ((result.garagenpreis ?? 0) > 0) {
    zeilen.push({ label: t.davonWohnung, wert: euro(result.kaufpreisWohnung) });
    zeilen.push({ label: t.davonStellplatz, wert: euro(result.kaufpreisGesamt - result.kaufpreisWohnung) });
  }
  // Saniert der Verkäufer, ist der Anteil Kaufpreis der Immobilie und trägt Nebenkosten; er steht dann nur zur Erklärung da.
  const durchVerkaeufer = result.sanierungsfall === "durchVerkaeufer";
  if (mitMoebeln || (mitAufwand && !durchVerkaeufer)) zeilen.push({ label: t.kaufpreisImmobilie, wert: euro(result.nebenkostenBasis) });
  if (mitAufwand) zeilen.push({ label: durchVerkaeufer ? t.sanierungVerkaeufer : t.erhaltungGesondert, wert: euro(result.erhaltungsaufwand) });
  if (mitMoebeln) zeilen.push({ label: t.moebel, wert: euro(result.moebelAnteil) });
  if (result.ruecklage > 0) zeilen.push({ label: t.ruecklage, wert: euro(result.ruecklage) });
  zeilen.push({ label: t.grundstueck, wert: euro(result.grundstuecksanteil) });
  zeilen.push(
    mitAufwand
      ? { label: t.gebaeudeOhneErhaltung, wert: euro(result.gebaeudeanteilKaufpreis - result.erhaltungsaufwand) }
      : { label: t.gebaeude, wert: euro(result.gebaeudeanteilKaufpreis) },
  );
  if (allInclusive) {
    /*
      Erst der Aufschlag als Betrag: Grundstück, Gebäude, Möbel, Rücklage und
      er ergeben zusammen den Kaufpreis all-inclusive. Dann die Zeile, die
      sagt, dass zu den Gesamtkosten nichts mehr dazukommt.
    */
    zeilen.push({ label: t.nebenkostenImKaufpreis(prozent(result.purchaseCostRate)), wert: euro(result.allInclusiveAufschlag) });
    zeilen.push({
      label: mitAufwand || mitMoebeln
        ? t.nebenkostenAuf(prozent(result.purchaseCostRate), euro(result.nebenkostenBasis))
        : t.nebenkosten(prozent(result.purchaseCostRate)),
      wert: t.nebenkostenEnthalten,
    });
  } else if (!mitAufwand && !mitMoebeln) {
    zeilen.push({ label: t.nebenkosten(prozent(result.purchaseCostRate)), wert: euro(result.purchaseCosts) });
  } else {
    const basis = euro(result.nebenkostenBasis);
    const satz = (betrag: number) => prozent(result.nebenkostenBasis > 0 ? betrag / result.nebenkostenBasis : 0);
    zeilen.push(
      { label: t.grunderwerbsteuer(satz(result.grunderwerbsteuer), basis), wert: euro(result.grunderwerbsteuer) },
      { label: t.notar(satz(result.notarkosten), basis), wert: euro(result.notarkosten) },
      { label: t.grundbuch(satz(result.grundbuchkosten), basis), wert: euro(result.grundbuchkosten) },
    );
    // Makler und Sonstige, sonst ginge die Summe darunter nicht auf.
    const weitere = result.purchaseCosts - result.grunderwerbsteuer - result.notarkosten - result.grundbuchkosten;
    if (weitere > 0.005) zeilen.push({ label: t.weitereNebenkosten, wert: euro(weitere) });
    zeilen.push({ label: t.nebenkostenAuf(prozent(result.purchaseCostRate), basis), wert: euro(result.purchaseCosts) });
  }
  // Seit dem 25.09.2026: Sie stecken in den Gesamtkosten, nicht im Darlehen.
  if (result.finanzierungsnebenkosten > 0) {
    zeilen.push({ label: t.finanzierungsnebenkosten, wert: euro(result.finanzierungsnebenkosten) });
  }
  zeilen.push({ label: t.gesamtkosten, wert: euro(result.totalInvestment), summe: true });
  return zeilen;
}

/** Der feste Hinweis unter den Kaufpreisdetails, nur mit Erhaltungsaufwand, Möbeln oder All-inclusive. */
export function kaufpreisHinweis(result: InvestmentErgebnis, sprache: FormatSprache = "de"): string | null {
  const t = dokumentTexteFuer(sprache).kaufpreis;
  const mitAufwand = result.erhaltungsaufwand > 0;
  const mitMoebeln = result.moebelAnteil > 0;
  const basis = mitAufwand && mitMoebeln
    ? t.hinweisBeides
    : mitAufwand
      ? t.hinweisErhaltung
      : mitMoebeln
        ? t.hinweisMoebel
        : null;
  if (!result.allInclusive) return basis;
  return basis ? `${t.hinweisAllInclusive} ${basis}` : t.hinweisAllInclusive;
}

/**
 * Bankgespräch und Risiko, seit dem 09.10.2026: Beleihung, Kapitaldienst,
 * Zinsänderungsrisiko, Eigenkapitalrendite ohne Wertsteigerung und der
 * Spielraum bis zur 15-Prozent-Grenze. Gerechnet wird in bankgespraech.ts,
 * hier nur gezeigt. Die Analyse bleibt Deutsch.
 */
export function Bankgespraech({
  input,
  result,
  imDokument = false,
  teil,
}: {
  input: InvestmentEingabe;
  result: InvestmentErgebnis;
  /** Nur in der Berechnung: Teil 1 Kapitalbedarf und Zinsbindung, Teil 2 der Rest, damit jede Seite aufs A4-Blatt passt. */
  teil?: 1 | 2;
  /**
   * In der Berechnung (ExposeDokument), seit dem 11.10.2026: ohne PDF-Knopf
   * und ohne Haushalt und Vermögen, die dort eine eigene Seite haben.
   */
  imDokument?: boolean;
}) {
  const bank = bankuebersicht(input, result);
  // Seit dem 22.10.2026 in der Sprache der rechten Seite.
  const { sprache } = useRechnerTexte();
  const t = (de: string, en: string) => (sprache === "en" ? en : de);
  const fEuro = (wert: number) => formatEuro(wert, sprache);
  const fEuroCent = (wert: number) => formatEuroCent(wert, sprache);
  const fProzent = (wert: number) => formatProzent(wert, sprache);
  const fProzent1 = (wert: number) => formatProzentEineStelle(wert, sprache);
  const [pdfEntsteht, setPdfEntsteht] = useState(false);
  const haushaltAusgefuellt = (input.haushalt?.einkuenfte.length ?? 0) + (input.haushalt?.ausgaben.length ?? 0) > 0;
  const vermoegenAusgefuellt = (input.vermoegen?.werte.length ?? 0) + (input.vermoegen?.verbindlichkeiten.length ?? 0) > 0;
  const haushalt = haushaltAusgefuellt && !imDokument ? haushaltsrechnung(input.haushalt, result) : null;
  const vermoegen = vermoegenAusgefuellt && !imDokument ? vermoegensaufstellung(input.vermoegen, result) : null;
  const pdfLaden = async () => {
    setPdfEntsteht(true);
    try {
      const { ladeBankgespraechPdfHerunter } = await import("@/lib/investmentrechner/berechnungPdf");
      await ladeBankgespraechPdfHerunter(input, result);
    } catch (fehler) {
      console.error("[Bankgespräch] PDF fehlgeschlagen", fehler);
      toast({ title: "PDF konnte nicht erstellt werden", description: "Bitte versuch es noch einmal.", variant: "destructive" });
    } finally {
      setPdfEntsteht(false);
    }
  };
  const letzter = result.years.length - 1;
  const risiken = [zinsrisiko(input, result, 0), letzter > 0 ? zinsrisiko(input, result, letzter) : null];
  const ekrMit = eigenkapitalrendite(input, result).rendite;
  const ekrOhne = eigenkapitalrenditeOhneWertsteigerung(input, result).rendite;
  const grenze = fuenfzehnProzentGrenze(result);
  const prozent1 = (wert: number | null) => (wert === null ? t("nicht bestimmbar", "cannot be determined") : fProzent1(wert));
  const optional = (wert: number | null, format: (w: number) => string) => (wert === null ? "–" : format(wert));

  const bloecke: { titel: string; zeilen: [string, string][]; hinweis?: string; neu?: boolean }[] = [
    {
      titel: t("Kapitalbedarf und Finanzierung", "Capital requirement and financing"),
      zeilen: [
        [t("Kaufpreis", "Purchase price"), fEuro(bank.kaufpreis)],
        ...(bank.kaufnebenkosten > 0 ? [[t("Kaufnebenkosten", "Incidental purchase costs"), fEuro(bank.kaufnebenkosten)] as [string, string]] : []),
        [t("Gesamtkosten", "Total costs"), fEuro(bank.gesamtkosten)],
        [t("Eigenkapital", "Equity"), fEuro(bank.eigenkapital)],
        [t("Darlehen gesamt", "Total loans"), fEuro(bank.darlehen)],
        [t("Darlehen in % des Kaufpreises", "Loans as % of purchase price"), fProzent(bank.beleihungKaufpreis)],
        [t("Darlehen in % der Gesamtkosten", "Loans as % of total costs"), fProzent(bank.beleihungGesamtkosten)],
        [t("Zinssatz gewichtet", "Weighted interest rate"), fProzent(bank.mischzins)],
        [t("Anfängliche Tilgung gewichtet", "Weighted initial repayment"), fProzent(bank.tilgungGewichtet)],
        [t("Kapitaldienst je Monat (Jahr 1)", "Debt service per month (year 1)"), fEuroCent(bank.kapitaldienstMonat)],
        [t("Bankdarlehen voll getilgt", "Bank loan fully repaid"), optional(bank.volltilgungBank, String)],
        ...(bank.volltilgungZweites !== null
          ? [[t("2. Bankdarlehen voll getilgt", "2nd bank loan fully repaid"), String(bank.volltilgungZweites)] as [string, string]]
          : []),
        ...(bank.volltilgungNachrang !== null
          ? [[t("Nachrangdarlehen voll getilgt", "Subordinated loan fully repaid"), String(bank.volltilgungNachrang)] as [string, string]]
          : []),
      ],
    },
    {
      titel: t("Zinsbindung und Anschluss", "Fixed-rate period and follow-up"),
      neu: true,
      zeilen: [
        ...(bank.restschuldZinsbindung
          ? [[t(`Restschuld Bankdarlehen Ende ${bank.restschuldZinsbindung.jahr}`, `Remaining debt bank loan end of ${bank.restschuldZinsbindung.jahr}`), fEuro(bank.restschuldZinsbindung.betrag)] as [string, string]]
          : []),
        [t("Anschlusszins angenommen", "Assumed follow-up rate"), bank.anschlusszins === null ? t("keiner, Zins von heute", "none, today's rate") : fProzent(bank.anschlusszins)],
        ...((input.seniorFurtherFollowUps ?? []).filter((a) => a.nachJahren >= 1).map((a) => [
          t(`Weitere Anschlussfinanzierung nach ${a.nachJahren} Jahren`, `Further follow-up financing after ${a.nachJahren} years`),
          `${a.zinsProzent > 0 ? fProzent(a.zinsProzent / 100) : t("Zins wie bisher", "rate as before")}${a.tilgungProzent > 0 ? `, Tilgung ${fProzent(a.tilgungProzent / 100)}` : ""}`,
        ]) as [string, string][]),
        ...(result.umschuldungskostenGesamt > 0
          ? [[t("Umschuldungskosten im Prognosezeitraum", "Refinancing costs in the forecast period"), fEuro(result.umschuldungskostenGesamt)] as [string, string]]
          : []),
        ...(input.seniorRepaymentType === "volltilgung" && input.seniorTermYears > 0
          ? [[t("Tilgungsart Bankdarlehen", "Repayment type bank loan"), t(`Volltilgung in ${input.seniorTermYears} Jahren`, `Full repayment in ${input.seniorTermYears} years`)] as [string, string]]
          : input.seniorRepaymentType === "endfaellig"
            ? [[t("Tilgungsart Bankdarlehen", "Repayment type bank loan"), input.seniorTermYears > 0 ? t(`endfällig nach ${input.seniorTermYears} Jahren`, `bullet after ${input.seniorTermYears} years`) : t("endfällig, nur Zinsen", "bullet, interest only")] as [string, string]]
            : []),
        ...(input.seniorGracePeriodYears > 0
          ? [[t("Tilgungsfreie Anlaufjahre Bankdarlehen", "Repayment-free years bank loan"), String(input.seniorGracePeriodYears)] as [string, string]]
          : []),
        ...(result.sondertilgungenGesamt > 0
          ? [[t("Sondertilgungen im Prognosezeitraum", "Special repayments in the forecast period"), fEuro(result.sondertilgungenGesamt)] as [string, string]]
          : []),
        ...((result.secondLoanAmount ?? 0) > 0
          ? [[t("Zweites Bankdarlehen", "Second bank loan"), fEuro(result.secondLoanAmount)] as [string, string]]
          : []),
      ],
      hinweis: t("Mit Anschlusszins rechnen Cashflow, Steuer, Restschuld und das Zinsänderungsrisiko unten ab dem Jahr nach der Zinsbindung mit ihm.", "With a follow-up rate, cash flow, tax, remaining debt and the interest rate risk below use it from the year after the fixed-rate period."),
    },
    {
      titel: t("Objekt und Kapitaldienstfähigkeit", "Property and debt service capacity"),
      zeilen: [
        [t("Kaufpreis je m²", "Purchase price per m²"), optional(bank.kaufpreisJeQm, fEuro)],
        [t("Kaltmiete je m²", "Net cold rent per m²"), optional(bank.kaltmieteJeQm, fEuroCent)],
        ...(mitStellplatz(result)
          ? ([
              [t("Kaufpreisfaktor Wohnung", "Price-to-rent ratio apartment"), optional(bank.kaufpreisfaktorWohnung, (w) => `${formatZahl(w, sprache, 1)}${t("-fach", "×")}`)],
              [t("Kaufpreisfaktor gesamt (Wohnung und Stellplatz)", "Price-to-rent ratio total (apartment and parking)"), optional(bank.kaufpreisfaktor, (w) => `${formatZahl(w, sprache, 1)}${t("-fach", "×")}`)],
            ] as [string, string][])
          : ([[t("Kaufpreisfaktor", "Price-to-rent ratio"), optional(bank.kaufpreisfaktor, (w) => `${formatZahl(w, sprache, 1)}${t("-fach", "×")}`)]] as [string, string][])),
        [t("Miete abzüglich Hausgeld und Rücklage je Monat", "Rent less service charge and reserve per month"), fEuroCent(bank.mietueberschussMonat)],
        [t("Kapitaldienstdeckung (DSCR)", "Debt service coverage (DSCR)"), optional(bank.kapitaldienstdeckung, (w) => `${formatZahl(w, sprache, 2)}${t("-fach", "×")}`)],
      ],
      hinweis: t("Ab 1,0-fach trägt die Miete nach Kosten die Rate allein. Banken rechnen meist mit eigenen Abschlägen.", "From 1.0× the rent after costs covers the instalment on its own. Banks usually apply their own haircuts."),
    },
    {
      titel: t("Zinsänderungsrisiko", "Interest rate risk"),
      zeilen: risiken.flatMap((risiko): [string, string][] =>
        risiko
          ? [
              [t(`${risiko.jahr}: Zins heute auf ${fEuro(risiko.restschuldBeginn)} Restschuld`, `${risiko.jahr}: today's rate on ${fEuro(risiko.restschuldBeginn)} remaining debt`), fProzent(risiko.zinsHeute)],
              [t(`${risiko.jahr}: Cashflow nach Steuer wird 0 bei`, `${risiko.jahr}: cash flow after tax becomes 0 at`), risiko.zinsBeiNull === null ? t("auch ohne Zins nicht", "not even without interest") : fProzent(risiko.zinsBeiNull)],
              [t(`${risiko.jahr}: 1 Prozentpunkt mehr Zins kostet nach Steuer`, `${risiko.jahr}: 1 percentage point more interest costs after tax`), t(`${fEuroCent(risiko.mehrkostenJeProzentpunktMonat)} im Monat`, `${fEuroCent(risiko.mehrkostenJeProzentpunktMonat)} per month`)],
            ]
          : [],
      ),
      hinweis: t("Tilgung, Miete und Kosten bleiben gleich, nur der Zins ändert sich. Die Steuer rechnet mit derselben Progression wie oben.", "Repayment, rent and costs stay the same, only the interest changes. Tax uses the same progression as above."),
    },
    {
      titel: t(`Vermögensrendite (Modellkennzahl) und interner Zinsfuß über ${result.years.length} Jahre`, `Wealth return (model figure) and internal rate of return over ${result.years.length} years`),
      zeilen: [
        [t("Vermögensrendite mit Wertsteigerung", "Wealth return with value increase"), prozent1(ekrMit)],
        [t("Vermögensrendite ohne Wertsteigerung", "Wealth return without value increase"), prozent1(ekrOhne)],
        [t("Interner Zinsfuß (IRR) mit Wertsteigerung", "Internal rate of return (IRR) with value increase"), prozent1(result.irr)],
        [t("Interner Zinsfuß (IRR) ohne Wertsteigerung", "Internal rate of return (IRR) without value increase"), prozent1(result.irrWithoutAppreciation)],
      ],
      hinweis:
        t("Die Vermögensrendite ist eine Modellkennzahl, kein Zins. Der interne Zinsfuß ist die Verzinsung des eingesetzten Geldes nach Steuer, mit Modellverkauf am Ende abzüglich der Verkaufskosten. Ohne Wertsteigerung zählt nur, was Tilgung und Rücklage aufbauen.", "The wealth return is a model figure, not an interest rate. The internal rate of return is the return on the money invested after tax, with a model sale at the end less selling costs. Without value increase, only what repayment and reserve build up counts."),
    },
    ...(haushalt
      ? [
          {
            titel: t("Haushaltsrechnung je Monat", "Household budget per month"),
            neu: true,
            zeilen: [
              [t("Einkünfte", "Income"), fEuroCent(haushalt.einkuenfteMonat)],
              [t("Ausgaben", "Expenses"), fEuroCent(haushalt.ausgabenMonat)],
              [t("Überschuss vor dem Investment", "Surplus before the investment"), fEuroCent(haushalt.ueberschussVorMonat)],
              [t("Überschuss nach dem Investment (ohne Steuer)", "Surplus after the investment (without tax)"), fEuroCent(haushalt.ueberschussNachMonat)],
              [t("… mit Steuerwirkung im ersten Jahr", "… with tax effect in the first year"), fEuroCent(haushalt.ueberschussNachMitSteuerMonat)],
            ] as [string, string][],
            hinweis: t("Miete, Rate und Bewirtschaftung der Wohnung kommen aus der Berechnung. Je Jahr mal 12, im Bankgespräch-PDF ausgewiesen.", "Rent, instalment and running costs of the apartment come from the calculation. Per year times 12, shown in the bank meeting PDF."),
          },
        ]
      : []),
    ...(vermoegen
      ? [
          {
            titel: t("Vermögensaufstellung", "Statement of assets"),
            neu: true,
            zeilen: [
              [t("Vermögenswerte", "Assets"), fEuro(vermoegen.werte)],
              [t("davon verpfändet", "of which pledged"), fEuro(vermoegen.davonVerpfaendet)],
              [t("Verbindlichkeiten", "Liabilities"), fEuro(vermoegen.verbindlichkeiten)],
              [t("Differenz", "Difference"), fEuro(vermoegen.differenz)],
              [t("Differenz mit Wohnung und neuen Darlehen", "Difference with apartment and new loans"), fEuro(vermoegen.differenzNachKauf)],
            ] as [string, string][],
          },
        ]
      : []),
    ...(grenze
      ? [
          {
            titel: t("15-%-Grenze anschaffungsnahe Herstellungskosten", "15% limit for acquisition-related production costs"),
            zeilen: [
              [t("Anschaffungskosten Gebäude", "Acquisition costs of the building"), fEuro(grenze.gebaeude)],
              [t("Grenze netto (brutto mit 19 % USt.)", "Limit net (gross with 19% VAT)"), `${fEuro(grenze.grenzeNetto)} (${fEuro(grenze.grenzeBrutto)})`],
              [t("Erhaltungsaufwand netto", "Maintenance expenses net"), fEuro(grenze.aufwand)],
              [grenze.spielraumNetto >= 0 ? t("Spielraum netto", "Headroom net") : t("Grenze überschritten um", "Limit exceeded by"), fEuro(Math.abs(grenze.spielraumNetto))],
            ] as [string, string][],
            hinweis:
              t("Instandsetzungen in den ersten drei Jahren nach dem Kauf sind nur bis zu dieser Grenze sofort absetzbar, darüber werden sie über die AfA verteilt. Vereinfachter Check, ersetzt keine Steuerberatung.", "Repairs in the first three years after the purchase are immediately deductible only up to this limit; above it they are spread through depreciation. Simplified check, no substitute for tax advice."),
          },
        ]
      : []),
  ];

  return (
    <div className={imDokument ? "bankgespraech" : "bankgespraech karte-innen"}>
      {!imDokument && (
      <div className="bankgespraech-pdf">
        <button type="button" className="button button-primary" disabled={pdfEntsteht} onClick={() => void pdfLaden()}>
          <FileDown size={14} /> {pdfEntsteht ? "PDF wird erstellt …" : t("Bankgespräch-PDF", "Bank meeting PDF")}
        </button>
        <Neu titel="Investitionsübersicht, Haushaltsrechnung und Vermögensaufstellung als eine Unterlage" />
        {!haushalt && !vermoegen && (
          <span className="kachel-hinweis">Haushaltsrechnung und Vermögensaufstellung im Bereich „Bankunterlagen“ links ausfüllen, dann stehen sie mit im PDF.</span>
        )}
      </div>
      )}
      {(teil === 1 ? bloecke.slice(0, 2) : teil === 2 ? bloecke.slice(2) : bloecke).map((block) => (
        <section key={block.titel}>
          <h4>
            {block.titel}
            {block.neu && <Neu />}
          </h4>
          <div className="tax-profile-grid">
            {block.zeilen.map(([label, wert]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{wert}</strong>
              </div>
            ))}
          </div>
          {block.hinweis && <p className="kachel-hinweis">{block.hinweis}</p>}
        </section>
      ))}
    </div>
  );
}

function ampelwert(wert: number | null, schwelle: Pick<Ampelschwelle, "einheit">, sprache: FormatSprache = "de"): string {
  const en = sprache === "en";
  if (wert === null) return en ? "cannot be determined" : "nicht bestimmbar";
  return schwelle.einheit === "prozent" ? formatProzent(wert, sprache) : `${formatEuro(wert, sprache)} / ${en ? "month" : "Monat"}`;
}

/** Englische Beschriftungen der Ampel, seit dem 22.10.2026; die Schwellen selbst liegen auf Deutsch in app_config. */
const AMPEL_LABEL_EN: Record<string, string> = {
  bruttorendite: "Gross rental yield",
  nettorendite: "Net rental yield",
  eigenkapitalrendite: "Wealth return (model figure)",
  cashflowOperativ: "Cash flow before tax",
  cashflowNachSteuern: "Cash flow after tax",
};
const AMPEL_WORT_EN: Record<string, string> = { gruen: "green", gelb: "amber", rot: "red" };

/**
 * Die Ampel der fünf Kennzahlen, seit dem 11.10.2026. `mitSchwellen` zeigt
 * darunter, ab wann welche Farbe gilt, damit niemand raten muss.
 */
export function AmpelLeiste({ input, result, mitSchwellen = false }: { input: InvestmentEingabe; result: InvestmentErgebnis; mitSchwellen?: boolean }) {
  const einstellung = useContext(AmpelKontext);
  const [bearbeitet, setBearbeitet] = useState(false);
  const { sprache } = useRechnerTexte();
  const en = sprache === "en";
  const zeilen = ampel(input, result, einstellung.schwellen);
  return (
    <div data-testid="ampel">
      <div className="ampel-leiste">
        {zeilen.map((z) => (
          <div key={z.kennzahl}>
            <small>{en ? AMPEL_LABEL_EN[z.kennzahl] ?? z.schwelle.label : z.schwelle.label}</small>
            <strong>
              <Ampelpunkt farbe={z.farbe} />
              {ampelwert(z.wert, z.schwelle, sprache)}
            </strong>
            {z.farbe && <span className="ampel-wort">{en ? AMPEL_WORT_EN[z.farbe] : AMPEL_WORT[z.farbe]}</span>}
          </div>
        ))}
      </div>
      {mitSchwellen && (
        <>
          <table className="ampel-schwellen">
            <thead>
              <tr>
                <th>{en ? "Key figure" : "Kennzahl"}</th>
                <th>{en ? "Green from" : "Grün ab"}</th>
                <th>{en ? "Amber from" : "Gelb ab"}</th>
                <th>{en ? "Red" : "Rot"}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(einstellung.schwellen).map(([schluessel, s]) => (
                <tr key={s.label} title={s.erklaerung}>
                  <td>{en ? AMPEL_LABEL_EN[schluessel] ?? s.label : s.label}</td>
                  <td>{ampelwert(s.gruenAb, s, sprache)}</td>
                  <td>{ampelwert(s.gelbAb, s, sprache)}</td>
                  <td>{en ? "below" : "darunter"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="kachel-hinweis">
            {en
              ? "Cash flows per month in the first year. The thresholds apply company-wide; only admin and owner may change them. The traffic light is an internal tool and is not part of the calculation for the client."
              : "Cashflows im ersten Jahr je Monat. Die Schwellen gelten unternehmensweit; ändern dürfen sie nur Admin und Inhaber. Die Ampel ist ein internes Werkzeug und steht nicht in der Berechnung für den Kunden."}
          </p>
          {einstellung.darfBearbeiten && !bearbeitet && (
            <button type="button" className="text-button" data-testid="schwellen-bearbeiten" onClick={() => setBearbeitet(true)}>
              Schwellen bearbeiten <Neu />
            </button>
          )}
          {einstellung.darfBearbeiten && bearbeitet && <SchwellenEditor einstellung={einstellung} onFertig={() => setBearbeitet(false)} />}
        </>
      )}
    </div>
  );
}

/**
 * Haushaltsrechnung und Vermögensaufstellung als Tabellen, für die eigene
 * Seite in der Berechnung (seit dem 11.10.2026). Dieselben Zahlen wie im
 * Bereich „Bankunterlagen“ und im Bankgespräch-PDF.
 */
export function BankunterlagenTabellen({
  input,
  result,
  nur,
}: {
  input: InvestmentEingabe;
  result: InvestmentErgebnis;
  /** Nur eine der beiden Tabellen, je eine Seite in der Berechnung. */
  nur?: "haushalt" | "vermoegen";
}) {
  const haushalt = haushaltMitVorlage(input.haushalt);
  const vermoegen = vermoegenMitVorlage(input.vermoegen);
  const h = haushaltsrechnung(haushalt, result);
  const v = vermoegensaufstellung(vermoegen, result);
  const zeile = (label: string, monat: number, summe = false) => (
    <tr key={label} className={summe ? "bank-summe" : undefined}>
      <td>{label}</td>
      <td>{formatEuroCent(monat)}</td>
      <td>{formatEuro(monat * 12)}</td>
    </tr>
  );
  return (
    <div className="bankunterlagen-tabellen">
      {nur !== "vermoegen" && (<>
      {!nur && <h3>Haushaltsrechnung</h3>}
      <div className="table-scroll compact-table">
        <table>
          <thead>
            <tr>
              <th>Posten</th>
              <th>je Monat</th>
              <th>je Jahr</th>
            </tr>
          </thead>
          <tbody>
            {haushalt.einkuenfte.map((p, i) => zeile(p.bezeichnung || `Einkunft ${i + 1}`, p.betrag))}
            {zeile("Summe Einkünfte", h.einkuenfteMonat, true)}
            {haushalt.ausgaben.map((p, i) => zeile(p.bezeichnung || `Ausgabe ${i + 1}`, -p.betrag))}
            {zeile("Summe Ausgaben", -h.ausgabenMonat, true)}
            {zeile("Überschuss vor dem Investment", h.ueberschussVorMonat, true)}
            {zeile("+ Kaltmiete der Wohnung", h.mieteMonat)}
            {zeile("− Kreditrate", -h.rateMonat)}
            {zeile("− Bewirtschaftung und Rücklage", -h.bewirtschaftungMonat)}
            {zeile("Überschuss nach dem Investment (ohne Steuer)", h.ueberschussNachMonat, true)}
            {zeile("Steuerwirkung im ersten Jahr", h.steuerwirkungMonat)}
            {zeile("Überschuss mit Steuerwirkung", h.ueberschussNachMitSteuerMonat, true)}
          </tbody>
        </table>
      </div>
      </>)}
      {nur !== "haushalt" && (<>
      {!nur && <h3>Vermögensaufstellung</h3>}
      <div className="table-scroll compact-table">
        <table>
          <thead>
            <tr>
              <th>Posten</th>
              <th>verpfändet</th>
              <th>Betrag</th>
            </tr>
          </thead>
          <tbody>
            {vermoegen.werte.map((p, i) => (
              <tr key={`w${i}`}>
                <td>{p.bezeichnung || `Vermögenswert ${i + 1}`}</td>
                <td>{p.verpfaendet ? "ja" : "nein"}</td>
                <td>{formatEuro(p.betrag)}</td>
              </tr>
            ))}
            <tr className="bank-summe">
              <td>Summe Vermögenswerte (davon verpfändet)</td>
              <td>{formatEuro(v.davonVerpfaendet)}</td>
              <td>{formatEuro(v.werte)}</td>
            </tr>
            {vermoegen.verbindlichkeiten.map((p, i) => (
              <tr key={`v${i}`}>
                <td>{p.bezeichnung || `Verbindlichkeit ${i + 1}`}</td>
                <td />
                <td>{formatEuro(-p.betrag)}</td>
              </tr>
            ))}
            <tr className="bank-summe">
              <td>Differenz</td>
              <td />
              <td>{formatEuro(v.differenz)}</td>
            </tr>
            <tr className="bank-summe">
              <td>Differenz mit Wohnung und neuen Darlehen</td>
              <td />
              <td>{formatEuro(v.differenzNachKauf)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      </>)}
    </div>
  );
}

/**
 * Die Schwellen bearbeiten: je Kennzahl „Grün ab“ und „Gelb ab“, darunter
 * Rot. Renditen in Prozent, Cashflows in Euro je Monat.
 */
function SchwellenEditor({ einstellung, onFertig }: { einstellung: AmpelEinstellung; onFertig: () => void }) {
  const alsText = (s: Record<Ampelkennzahl, Ampelschwelle>) =>
    Object.fromEntries(
      (Object.keys(s) as Ampelkennzahl[]).map((k) => {
        const faktor = s[k].einheit === "prozent" ? 100 : 1;
        return [k, { gruenAb: String(+(s[k].gruenAb * faktor).toFixed(4)), gelbAb: String(+(s[k].gelbAb * faktor).toFixed(4)) }];
      }),
    ) as Record<Ampelkennzahl, { gruenAb: string; gelbAb: string }>;
  const [werte, setWerte] = useState(() => alsText(einstellung.schwellen));
  const [speichert, setSpeichert] = useState(false);
  const zahl = (text: string) => (text.trim() === "" ? NaN : Number(text.replace(",", ".")));
  const neu = Object.fromEntries(
    (Object.keys(werte) as Ampelkennzahl[]).map((k) => {
      const faktor = AMPEL_SCHWELLEN[k].einheit === "prozent" ? 100 : 1;
      return [k, { ...einstellung.schwellen[k], gruenAb: zahl(werte[k].gruenAb) / faktor, gelbAb: zahl(werte[k].gelbAb) / faktor }];
    }),
  ) as Record<Ampelkennzahl, Ampelschwelle>;
  const fehler = pruefeSchwellen(neu);
  const speichern = async () => {
    if (fehler.length) return;
    setSpeichert(true);
    const ok = await einstellung.speichern(neu);
    setSpeichert(false);
    if (ok) onFertig();
  };
  return (
    <div className="schwellen-editor" data-testid="schwellen-editor">
      <table className="ampel-schwellen">
        <thead>
          <tr>
            <th>Kennzahl</th>
            <th>Grün ab</th>
            <th>Gelb ab</th>
            <th>Rot</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(werte) as Ampelkennzahl[]).map((k) => {
            const einheit = AMPEL_SCHWELLEN[k].einheit === "prozent" ? "%" : "€ / Monat";
            const feld = (art: "gruenAb" | "gelbAb") => (
              <input
                type="number"
                step="any"
                aria-label={`${AMPEL_SCHWELLEN[k].label} ${art === "gruenAb" ? "Grün ab" : "Gelb ab"} in ${einheit}`}
                value={werte[k][art]}
                onChange={(e) => setWerte({ ...werte, [k]: { ...werte[k], [art]: e.target.value } })}
              />
            );
            return (
              <tr key={k}>
                <td>{AMPEL_SCHWELLEN[k].label}</td>
                <td>{feld("gruenAb")} {einheit}</td>
                <td>{feld("gelbAb")} {einheit}</td>
                <td>darunter</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {fehler.length > 0 && (
        <ul className="knk-hinweis knk-hinweis-warnung" role="alert">
          {fehler.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}
      <div className="schwellen-knoepfe">
        <button type="button" className="button button-primary" disabled={fehler.length > 0 || speichert} onClick={() => void speichern()}>
          {speichert ? "Wird gespeichert …" : "Schwellen speichern"}
        </button>
        <button type="button" className="text-button" onClick={() => setWerte(alsText(AMPEL_SCHWELLEN))}>
          Auf Standard zurücksetzen
        </button>
        <button type="button" className="text-button" onClick={onFertig}>
          Abbrechen
        </button>
      </div>
      {einstellung.hinweis && <p className="kachel-hinweis">{einstellung.hinweis}</p>}
    </div>
  );
}

/** Kaufpreisdetails der Analyse, im Raster des Steuerprofils. */
export function Kaufpreisdetails({ result }: { input: InvestmentEingabe; result: InvestmentErgebnis }) {
  // Seit dem 22.10.2026 in der Sprache der rechten Seite.
  const { sprache } = useRechnerTexte();
  const hinweis = kaufpreisHinweis(result, sprache);
  return (
    <>
      <div className="tax-profile-grid">
        {kaufpreiszeilen(result, sprache).map((zeile) => (
          <div key={zeile.label} className={zeile.summe ? "tax-profile-total" : ""}>
            <span>{zeile.label}</span>
            <strong>{zeile.wert}</strong>
          </div>
        ))}
      </div>
      {hinweis && <p className="knk-hinweis kaufpreis-hinweis">{hinweis}</p>}
    </>
  );
}

/** Zeilen der Hausgeldaufstellung in der gewünschten Sprache, für Analyse, Berechnung und PDF. */
export function hausgeldZeilen(input: InvestmentEingabe, sprache: FormatSprache = "de"): { label: string; wert: string; summe?: boolean }[] {
  const h = hausgeldAufstellung(input);
  if (!h.vorhanden) return [];
  const en = sprache === "en";
  const euro = (wert: number) => formatEuroCent(wert, sprache);
  return [
    { label: en ? "Service charge total per month" : "Hausgeld gesamt je Monat", wert: h.gesamt > 0 ? euro(h.gesamt) : en ? "not stated" : "nicht angegeben", summe: true },
    { label: en ? "of which recoverable (paid by the tenant, no cash-flow burden)" : "davon umlagefähig (zahlt der Mieter, belastet den Cashflow nicht)", wert: euro(h.umlagefaehig) },
    { label: en ? "of which non-recoverable (cash-flow burden, tax-deductible)" : "davon nicht umlagefähig (belastet den Cashflow, steuerlich abziehbar)", wert: euro(h.nichtUmlagefaehig) },
    { label: en ? "of which maintenance reserve (cash-flow burden, deductible only when spent)" : "davon Erhaltungsrücklage (belastet den Cashflow, steuerlich erst bei Verwendung)", wert: euro(h.ruecklage) },
  ];
}

/** Hinweis, wenn die Teile nicht zum Gesamtbetrag passen oder die Rechnung weniger ansetzt. */
export function hausgeldHinweis(input: InvestmentEingabe, sprache: FormatSprache = "de"): string | null {
  const h = hausgeldAufstellung(input);
  if (!h.vorhanden) return null;
  const en = sprache === "en";
  const teile: string[] = [];
  if (h.abweichung !== null && Math.abs(h.abweichung) >= 0.5) {
    teile.push(
      en
        ? `The parts add up to ${formatEuroCent(h.summeTeile, sprache)}, the total is ${formatEuroCent(h.gesamt, sprache)} (difference ${formatEuroCent(h.abweichung, sprache)}).`
        : `Die Teile ergeben ${formatEuroCent(h.summeTeile, sprache)}, das Hausgeld gesamt ist ${formatEuroCent(h.gesamt, sprache)} (Abweichung ${formatEuroCent(h.abweichung, sprache)}).`,
    );
  }
  return teile.length ? teile.join(" ") : null;
}

/** Das Hausgeld in ganzer Höhe, aufgeschlüsselt, seit dem 22.10.2026. */
export function Hausgeldaufstellung({ input }: { input: InvestmentEingabe }) {
  const { sprache } = useRechnerTexte();
  const zeilen = hausgeldZeilen(input, sprache);
  if (!zeilen.length) return null;
  const hinweis = hausgeldHinweis(input, sprache);
  return (
    <>
      <div className="tax-profile-grid" data-testid="hausgeld-aufstellung">
        {zeilen.map((zeile) => (
          <div key={zeile.label} className={zeile.summe ? "tax-profile-total" : ""}>
            <span>{zeile.label}</span>
            <strong>{zeile.wert}</strong>
          </div>
        ))}
      </div>
      {hinweis && <p className="knk-hinweis kaufpreis-hinweis" data-testid="hausgeld-abweichung">{hinweis}</p>}
    </>
  );
}

interface EnergieskalaProps {
  energyClass: string;
  energyValue: number;
  compact?: boolean;
}

/** Energieeffizienzskala A+ bis H mit hervorgehobener Klasse. */
export function Energieskala({ energyClass, energyValue, compact = false }: EnergieskalaProps) {
  const { sprache, texte } = useRechnerTexte();
  const t = texte.energie;
  return (
    <div className={`energy-scale-wrap ${compact ? "compact" : ""}`}>
      <div className="energy-scale" aria-label={t.effizienzklasse(energyClass || t.nichtAngegeben)}>
        {ENERGIEKLASSEN.map((klasse) => (
          <span
            key={klasse}
            className={`energy-${klasse.replace("+", "plus")} ${energyClass === klasse ? "active" : ""}`}
          >
            <b>{klasse}</b>
          </span>
        ))}
      </div>
      <div className="energy-scale-value">
        <span>{t.effizienz}</span>
        {/* Ohne Klasse steht hier „k. A." statt des Gedankenstrichs des Originals. */}
        <strong>{energyClass || t.keineKlasse}</strong>
        <small>
          {energyValue > 0
            ? `${formatZahl(energyValue, sprache, 1)} kWh/(m²·a)`
            : t.kennwertFehlt}
        </small>
      </div>
    </div>
  );
}

interface UnterlagenEinblickeProps {
  data: UnterlagenDaten;
  compact?: boolean;
}

/** Energieausweis, Erhaltungsrücklage und Sanierungen aus den Unterlagen. */
export function UnterlagenEinblicke({ data, compact = false }: UnterlagenEinblickeProps) {
  // Das Eingabefeld speichert die Zeilen roh, damit man dort frei tippen kann.
  // Leere Zeilen und Leerzeichen fallen erst hier weg.
  const sanierungen = sanierungenBereinigt(data.renovations);
  const { sprache, texte } = useRechnerTexte();
  const t = texte.unterlagen;
  return (
    <div className={`document-insights ${compact ? "compact" : ""}`}>
      <section className="energy-insight">
        <span className="insight-label">{t.energieausweis}</span>
        <Energieskala energyClass={data.energyClass} energyValue={data.energyValue} compact={compact} />
        <div className="insight-meta">
          <span>
            <small>{t.art}</small>
            <strong>{data.certificateType || t.keineAngabe}</strong>
          </span>
          <span>
            <small>{t.energietraeger}</small>
            <strong>{data.energyCarrier || t.keineAngabe}</strong>
          </span>
          <span>
            <small>{t.gueltigBis}</small>
            <strong>{data.certificateValidUntil || t.keineAngabe}</strong>
          </span>
        </div>
      </section>
      <section className="reserve-insight">
        <span className="insight-label">{t.ruecklage}</span>
        <div className="reserve-number">
          <strong>{formatEuro(data.reserveAmount, sprache)}</strong>
          <span>
            {t.gesamtbestand}
            {data.reserveAsOf ? t.stand(data.reserveAsOf) : ""}
          </span>
        </div>
        <div className="reserve-unit">
          <span>{t.anteilEinheit}</span>
          <strong>{data.reserveUnitShare > 0 ? formatEuro(data.reserveUnitShare, sprache) : t.nichtAusgewiesen}</strong>
        </div>
      </section>
      <section className="renovation-insight">
        <span className="insight-label">{t.sanierungen}</span>
        {sanierungen.length > 0 ? (
          <ul>
            {sanierungen.slice(0, compact ? 6 : 8).map((eintrag, index) => (
              <li key={`${eintrag}-${index}`}>{eintrag}</li>
            ))}
          </ul>
        ) : (
          <div className="no-insight">{t.keineSanierungen}</div>
        )}
      </section>
    </div>
  );
}

/**
 * Kennzahlenraster der Analyse-Ansicht, seit dem 25.09.2026 acht Kacheln in
 * zwei Reihen zu je vier, jede Reihe ein Thema:
 *
 * 1. Ertrag und Finanzierung: Kaltmiete, Kreditrate, Brutto- und Nettorendite.
 * 2. Vermögen am Ende des Modellzeitraums: Immobilienwert, Restschuld, die
 *    Differenz aus beiden und was der Kunde bis dahin selbst einzahlt.
 *
 * Cashflow vor und nach Steuer standen vom 21. bis 25.09.2026 zusätzlich hier.
 * Seit sie wieder groß in der geteilten dunklen Kachel darunter stehen, wären
 * sie doppelt, deshalb sind sie hier entfallen.
 */
export function Kennzahlen({ result, input }: { result: InvestmentErgebnis; input: InvestmentEingabe }) {
  // Seit dem 22.10.2026 in der Sprache der rechten Seite.
  const { sprache, kennzahl } = useRechnerTexte();
  const texte = kennzahl.kacheln;
  const wege = rechenwege(input, result, kennzahl, sprache);
  const fEuro = (wert: number) => formatEuro(wert, sprache);
  const fEuroCent = (wert: number) => formatEuroCent(wert, sprache);
  const fProzent = (wert: number) => formatProzent(wert, sprache);
  const fProzent1 = (wert: number) => formatProzentEineStelle(wert, sprache);
  const fFaktor = (wert: number) => (sprache === "en" ? `${formatZahl(wert, sprache, 2)}×` : `${formatZahl(wert, sprache, 2)}-fach`);
  const { schwellen } = useContext(AmpelKontext);
  const farben = Object.fromEntries(ampel(input, result, schwellen).map((z) => [z.kennzahl, z.farbe]));
  const letztesJahr = result.years[result.years.length - 1];
  const zahltZu = letztesJahr.cumulativeEigenanteil > 0;
  return (
    <>
    <div className="metrics-grid">
      <Kennzahlkarte label={texte.kaltmiete} value={fEuro(result.effectiveAnnualRent / 12)} rechenweg={wege.kaltmiete} />
      <Kennzahlkarte label={texte.kreditrate} value={fEuroCent(result.monthlyDebtService)} rechenweg={wege.kreditrate} />
      {/* Mit Stellplatz seit dem 22.10.2026 zweimal: die Wohnung allein und das Paket. */}
      {mitStellplatz(result) && (
        <Kennzahlkarte label={texte.bruttorenditeWohnung} value={fProzent(result.grossYieldWohnung)} rechenweg={wege.bruttorenditeWohnung} />
      )}
      <Kennzahlkarte
        label={mitStellplatz(result) ? texte.bruttorenditeGesamt : texte.bruttorendite}
        value={fProzent(result.grossYield)}
        rechenweg={wege.bruttorendite}
        ampel={farben.bruttorendite}
      />
      {mitStellplatz(result) && (
        <Kennzahlkarte label={texte.nettorenditeWohnung} value={fProzent(result.netYieldWohnung)} />
      )}
      <Kennzahlkarte
        label={mitStellplatz(result) ? texte.nettorenditeGesamt : texte.nettorendite}
        value={fProzent(result.netYield)}
        rechenweg={wege.nettorendite}
        ampel={farben.nettorendite}
      />
      <Kennzahlkarte
        label={texte.immobilienwert(letztesJahr.year)}
        value={fEuro(letztesJahr.propertyValue)}
        rechenweg={wege.immobilienwert}
      />
      <Kennzahlkarte
        label={texte.restschuld(letztesJahr.year)}
        value={fEuro(letztesJahr.remainingDebt)}
        rechenweg={wege.restschuld}
      />
      {/*
        Frueher hiess diese Kachel "Eigenkapital {Jahr}". Das Wort meinte hier
        etwas anderes als das gleichnamige Eingabefeld unter Finanzierung: dort
        das eingesetzte Geld, hier der Wert der Immobilie abzueglich Restschuld.
      */}
      <Kennzahlkarte
        label={texte.immobilieMinusRestschuld(letztesJahr.year)}
        value={fEuro(letztesJahr.propertyEquity)}
        rechenweg={wege.immobilieMinusRestschuld}
      />
      {/*
        Die UNGESALDIERTE Summe der Zuzahlungen: Wer sechs Jahre zuzahlt und
        danach etwas herausbekommt, hat trotzdem die volle Summe aufgebracht.
        Zahlt der Kunde nie zu, steht hier die Summe der Ueberschuesse.
      */}
      <Kennzahlkarte
        label={zahltZu ? texte.selbstEingezahlt(result.years.length) : texte.ueberschuss(result.years.length)}
        value={fEuro(
          zahltZu ? letztesJahr.cumulativeEigenanteil : Math.abs(letztesJahr.cumulativeCashflowAfterTax),
        )}
        rechenweg={wege.selbstEingezahlt}
      />
    </div>
    {/*
      Interner Zinsfuß und Kaufpreisfaktor, seit dem 22.10.2026 als eigene
      Leiste unter den Kacheln. Der IRR steht damit getrennt von der
      Modellkennzahl „Vermögensrendite“ und wird nicht mit ihr verwechselt.
    */}
    <div className="summary-strip" data-testid="kennzahlen-zusatz">
      <span>
        <small>{texte.irr}</small>
        <strong>{result.irr !== null ? fProzent1(result.irr) : "–"}</strong>
      </span>
      {mitStellplatz(result) && result.kaufpreisfaktorWohnung !== null && (
        <span>
          <small>{texte.kaufpreisfaktorWohnung}</small>
          <strong>{fFaktor(result.kaufpreisfaktorWohnung)}</strong>
        </span>
      )}
      {result.kaufpreisfaktor !== null && (
        <span>
          <small>{mitStellplatz(result) ? texte.kaufpreisfaktorGesamt : texte.kaufpreisfaktor}</small>
          <strong>{fFaktor(result.kaufpreisfaktor)}</strong>
        </span>
      )}
    </div>
    </>
  );
}

/**
 * Rechenstandards aus dem Vertriebspaket, seit dem 16.10.2026: Belastung vor
 * und nach Steuer, Regel-AfA neben erhöhter AfA, Stresstest und
 * Wertentwicklung 0/1/2 %. Nur Anzeige, siehe rechenstandards.ts.
 */
/** Warum ein Stressfall entfällt (rechenstandards.ts), auf Englisch. */
const ENTFAELLT_EN: Record<string, string> = {
  "Es ist keine erhöhte AfA eingestellt.": "no increased depreciation is set.",
  "Ohne Darlehen gibt es keinen Anschlusszins.": "without a loan there is no follow-up rate.",
  "Es ist keine Miete eingetragen.": "no rent is entered.",
};

/** Die Begründungen der Regel-AfA aus afaSaetze.ts auf Englisch. */
const GRUND_EN: Record<string, string> = {
  "Betriebsgebäude im Betriebsvermögen": "commercial building in business assets",
  "Baujahr unbekannt, Regelsatz": "year of construction unknown, standard rate",
  "Fertigstellung vor 1925": "completed before 1925",
  "Fertigstellung ab 2023": "completed from 2023",
  "Fertigstellung 1925 bis 2022": "completed 1925 to 2022",
};

export function Rechenstandards({ input, result }: { input: InvestmentEingabe; result: InvestmentErgebnis }) {
  // Seit dem 22.10.2026 in der Sprache der rechten Seite.
  const { sprache } = useRechnerTexte();
  const en = sprache === "en";
  const t = (de: string, englisch: string) => (en ? englisch : de);
  const fEuro = (wert: number) => formatEuro(wert, sprache);
  const fEuroCent = (wert: number) => formatEuroCent(wert, sprache);
  const fProzentZahl = (wert: number, stellen: number) => (en ? `${formatZahl(wert, sprache, stellen)}%` : `${formatZahl(wert, sprache, stellen)} %`);
  const erstes = result.years[0];
  if (!erstes) return null;
  const afa = regelAfa(input);
  const faelle = stresstest(input, result);
  const wert = wertszenarien(input);
  const belastung = (betrag: number) => `${fEuroCent(betrag)} ${t("im Monat", "per month")}`;
  const regelErstes = afa.mitRegelAfa?.years[0];
  // Die Fälle kommen auf Deutsch aus rechenstandards.ts; die englischen Titel stehen hier.
  const fallTitel = (titel: string) =>
    !en
      ? titel
      : titel === "Gutachten abgelehnt"
        ? "Valuation report rejected"
        : titel.startsWith("Zins +1 Punkt")
          ? titel.replace("Zins +1 Punkt ab Jahr", "Interest +1 point from year")
          : titel.replace("Monate Leerstand", "months vacancy");
  const fallText = (text: string) =>
    !en
      ? text
      : text.startsWith("Regel-AfA")
        ? text.replace("Regel-AfA", "Standard depreciation").replace("statt", "instead of")
        : text === "Anschlusszins einen Prozentpunkt höher, Tilgung wie eingestellt"
          ? "Follow-up rate one percentage point higher, repayment as set"
          : text === "Einmalig im ersten Jahr, ohne Miete, Kosten laufen weiter"
            ? "Once in the first year, without rent, costs continue"
            : text;

  const bloecke: { titel: string; zeilen: [string, string][]; hinweis?: string }[] = [
    {
      titel: t(`Belastung ${erstes.year}`, `Burden ${erstes.year}`),
      zeilen: [
        [t("Zuzahlung vor Steuer", "Top-up before tax"), belastung(-erstes.cashflowBeforeTax / monateErstesJahr(result))],
        [t("Zuzahlung nach Steuer", "Top-up after tax"), belastung(-erstes.cashflowAfterTax / monateErstesJahr(result))],
      ],
      hinweis: t("Negativ heißt: Überschuss statt Zuzahlung.", "Negative means: surplus instead of top-up."),
    },
    {
      titel: t("AfA", "Depreciation"),
      zeilen: [
        [
          t("Eingestellt", "Set"),
          `${fProzentZahl(input.buildingDepreciationRate, 2)} ${input.depreciationMethod === "declining" ? t("degressiv", "declining balance") : t("linear", "straight-line")}`,
        ],
        [t("Regel-AfA", "Standard depreciation"), `${fProzentZahl(afa.regel.satz, 1)} ${t("linear", "straight-line")} (${en ? (GRUND_EN[afa.regel.grund] ?? afa.regel.grund) : afa.regel.grund}, ${afa.regel.paragraf})`],
        ...(afa.mitRegelAfa && regelErstes
          ? ([
              [t(`Zuzahlung nach Steuer ${regelErstes.year} mit Regel-AfA`, `Top-up after tax ${regelErstes.year} with standard depreciation`), belastung(-regelErstes.cashflowAfterTax / 12)],
              [t("Steuerwirkung gesamt mit Regel-AfA", "Total tax effect with standard depreciation"), fEuro(afa.mitRegelAfa.cumulativeTaxEffect)],
            ] as [string, string][])
          : []),
      ],
      hinweis: afa.erhoeht
        ? t("Erhöhte AfA nur mit anerkanntem Gutachten (Restnutzungsdauer).", "Higher depreciation only with a recognised report (remaining useful life).")
        : afa.degressiv
          ? t("Degressive AfA 5 % nur bei Baubeginn 10/2023 bis 9/2029.", "Declining-balance depreciation of 5% only for construction start 10/2023 to 9/2029.")
          : undefined,
    },
    {
      titel: t("Stresstest", "Stress test"),
      zeilen: faelle.map((fall): [string, string] => [
        `${fallTitel(fall.titel)} (${fall.jahr}): ${fallText(fall.beschreibung)}`,
        fall.entfaellt
          ? `${t("entfällt", "not applicable")}, ${en ? ENTFAELLT_EN[fall.entfaellt] ?? fall.entfaellt : fall.entfaellt}`
          : fall.einheit === "einmalig"
            ? t(
                `einmalig ${fEuro(fall.stress.vorSteuer)} vor, ${fEuro(fall.stress.nachSteuer)} nach Steuer`,
                `once ${fEuro(fall.stress.vorSteuer)} before, ${fEuro(fall.stress.nachSteuer)} after tax`,
              )
            : t(
                `${fEuroCent(fall.stress.vorSteuer)} vor, ${fEuroCent(fall.stress.nachSteuer)} nach Steuer im Monat (bisher ${fEuroCent(fall.basis.nachSteuer)} nach Steuer)`,
                `${fEuroCent(fall.stress.vorSteuer)} before, ${fEuroCent(fall.stress.nachSteuer)} after tax per month (previously ${fEuroCent(fall.basis.nachSteuer)} after tax)`,
              ),
      ]),
      hinweis: t(
        "Zuzahlung je Monat, Leerstand als einmalige Mehrbelastung. Jeder Fall für sich, die Steuer mit derselben Rechnung wie oben.",
        "Top-up per month, vacancy as a one-off extra burden. Each case on its own, tax with the same calculation as above.",
      ),
    },
    ...(wert
      ? [
          {
            titel: t(`Wertentwicklung bis ${wert.jahr}`, `Value development until ${wert.jahr}`),
            zeilen: wert.szenarien.flatMap((s): [string, string][] => [
              [t(`${s.prozent} % im Jahr: Wert / Wert minus Restschuld`, `${s.prozent}% a year: value / value minus remaining debt`), `${fEuro(s.wert)} / ${fEuro(s.vermoegen)}`],
              [t(`… ${s.prozent} % in heutiger Kaufkraft`, `… ${s.prozent}% in today's purchasing power`), `${fEuro(s.wertKaufkraft)} / ${fEuro(s.vermoegenKaufkraft)}`],
            ]),
            hinweis: t(
              `Kaufkraft abgezinst mit ${fProzentZahl(wert.inflation, 1)} Inflation im Jahr. Szenarien, keine Prognose.`,
              `Purchasing power discounted with ${fProzentZahl(wert.inflation, 1)} inflation a year. Scenarios, not a forecast.`,
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="bankgespraech karte-innen" data-testid="rechenstandards">
      {bloecke.map((block) => (
        <section key={block.titel}>
          <h4>{block.titel}</h4>
          <div className="tax-profile-grid">
            {block.zeilen.map(([label, wert]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{wert}</strong>
              </div>
            ))}
          </div>
          {block.hinweis && <p className="kachel-hinweis">{block.hinweis}</p>}
        </section>
      ))}
    </div>
  );
}
