import { createContext, useContext, useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { eigenkapitalrendite, type InvestmentEingabe, type InvestmentErgebnis } from "@/lib/investmentrechner/rechenkern";
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
  if (mitAufwand || mitMoebeln) zeilen.push({ label: t.kaufpreisImmobilie, wert: euro(result.nebenkostenBasis) });
  if (mitAufwand) zeilen.push({ label: t.erhaltungGesondert, wert: euro(result.erhaltungsaufwand) });
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
  const prozent1 = (wert: number | null) => (wert === null ? "nicht bestimmbar" : formatProzentEineStelle(wert));
  const optional = (wert: number | null, format: (w: number) => string) => (wert === null ? "–" : format(wert));

  const bloecke: { titel: string; zeilen: [string, string][]; hinweis?: string; neu?: boolean }[] = [
    {
      titel: "Kapitalbedarf und Finanzierung",
      zeilen: [
        ["Kaufpreis", formatEuro(bank.kaufpreis)],
        ...(bank.kaufnebenkosten > 0 ? [["Kaufnebenkosten", formatEuro(bank.kaufnebenkosten)] as [string, string]] : []),
        ["Gesamtkosten", formatEuro(bank.gesamtkosten)],
        ["Eigenkapital", formatEuro(bank.eigenkapital)],
        ["Darlehen gesamt", formatEuro(bank.darlehen)],
        ["Darlehen in % des Kaufpreises", formatProzent(bank.beleihungKaufpreis)],
        ["Darlehen in % der Gesamtkosten", formatProzent(bank.beleihungGesamtkosten)],
        ["Zinssatz gewichtet", formatProzent(bank.mischzins)],
        ["Anfängliche Tilgung gewichtet", formatProzent(bank.tilgungGewichtet)],
        ["Kapitaldienst je Monat (Jahr 1)", formatEuroCent(bank.kapitaldienstMonat)],
        ["Bankdarlehen voll getilgt", optional(bank.volltilgungBank, String)],
        ...(bank.volltilgungZweites !== null
          ? [["2. Bankdarlehen voll getilgt", String(bank.volltilgungZweites)] as [string, string]]
          : []),
        ...(bank.volltilgungNachrang !== null
          ? [["Nachrangdarlehen voll getilgt", String(bank.volltilgungNachrang)] as [string, string]]
          : []),
      ],
    },
    {
      titel: "Zinsbindung und Anschluss",
      neu: true,
      zeilen: [
        ...(bank.restschuldZinsbindung
          ? [[`Restschuld Bankdarlehen Ende ${bank.restschuldZinsbindung.jahr}`, formatEuro(bank.restschuldZinsbindung.betrag)] as [string, string]]
          : []),
        ["Anschlusszins angenommen", bank.anschlusszins === null ? "keiner, Zins von heute" : formatProzent(bank.anschlusszins)],
        ...(result.sondertilgungenGesamt > 0
          ? [["Sondertilgungen im Prognosezeitraum", formatEuro(result.sondertilgungenGesamt)] as [string, string]]
          : []),
        ...((result.secondLoanAmount ?? 0) > 0
          ? [["Zweites Bankdarlehen", formatEuro(result.secondLoanAmount)] as [string, string]]
          : []),
      ],
      hinweis: "Mit Anschlusszins rechnen Cashflow, Steuer, Restschuld und das Zinsänderungsrisiko unten ab dem Jahr nach der Zinsbindung mit ihm.",
    },
    {
      titel: "Objekt und Kapitaldienstfähigkeit",
      zeilen: [
        ["Kaufpreis je m²", optional(bank.kaufpreisJeQm, formatEuro)],
        ["Kaltmiete je m²", optional(bank.kaltmieteJeQm, formatEuroCent)],
        ["Kaufpreisfaktor", optional(bank.kaufpreisfaktor, (w) => `${formatZahl(w, "de", 1)}-fach`)],
        ["Miete abzüglich Hausgeld und Rücklage je Monat", formatEuroCent(bank.mietueberschussMonat)],
        ["Kapitaldienstdeckung (DSCR)", optional(bank.kapitaldienstdeckung, (w) => `${formatZahl(w, "de", 2)}-fach`)],
      ],
      hinweis: "Ab 1,0-fach trägt die Miete nach Kosten die Rate allein. Banken rechnen meist mit eigenen Abschlägen.",
    },
    {
      titel: "Zinsänderungsrisiko",
      zeilen: risiken.flatMap((risiko): [string, string][] =>
        risiko
          ? [
              [`${risiko.jahr}: Zins heute auf ${formatEuro(risiko.restschuldBeginn)} Restschuld`, formatProzent(risiko.zinsHeute)],
              [`${risiko.jahr}: Cashflow nach Steuer wird 0 bei`, risiko.zinsBeiNull === null ? "auch ohne Zins nicht" : formatProzent(risiko.zinsBeiNull)],
              [`${risiko.jahr}: 1 Prozentpunkt mehr Zins kostet nach Steuer`, `${formatEuroCent(risiko.mehrkostenJeProzentpunktMonat)} im Monat`],
            ]
          : [],
      ),
      hinweis: "Tilgung, Miete und Kosten bleiben gleich, nur der Zins ändert sich. Die Steuer rechnet mit derselben Progression wie oben.",
    },
    {
      titel: `Eigenkapitalrendite über ${result.years.length} Jahre`,
      zeilen: [
        ["mit Wertsteigerung", prozent1(ekrMit)],
        ["ohne Wertsteigerung", prozent1(ekrOhne)],
      ],
      hinweis: "Ohne Wertsteigerung zählt nur, was Tilgung und Rücklage aufbauen.",
    },
    ...(haushalt
      ? [
          {
            titel: "Haushaltsrechnung je Monat",
            neu: true,
            zeilen: [
              ["Einkünfte", formatEuroCent(haushalt.einkuenfteMonat)],
              ["Ausgaben", formatEuroCent(haushalt.ausgabenMonat)],
              ["Überschuss vor dem Investment", formatEuroCent(haushalt.ueberschussVorMonat)],
              ["Überschuss nach dem Investment (ohne Steuer)", formatEuroCent(haushalt.ueberschussNachMonat)],
              ["… mit Steuerwirkung im ersten Jahr", formatEuroCent(haushalt.ueberschussNachMitSteuerMonat)],
            ] as [string, string][],
            hinweis: "Miete, Rate und Bewirtschaftung der Wohnung kommen aus der Berechnung. Je Jahr mal 12, im Bankgespräch-PDF ausgewiesen.",
          },
        ]
      : []),
    ...(vermoegen
      ? [
          {
            titel: "Vermögensaufstellung",
            neu: true,
            zeilen: [
              ["Vermögenswerte", formatEuro(vermoegen.werte)],
              ["davon verpfändet", formatEuro(vermoegen.davonVerpfaendet)],
              ["Verbindlichkeiten", formatEuro(vermoegen.verbindlichkeiten)],
              ["Differenz", formatEuro(vermoegen.differenz)],
              ["Differenz mit Wohnung und neuen Darlehen", formatEuro(vermoegen.differenzNachKauf)],
            ] as [string, string][],
          },
        ]
      : []),
    ...(grenze
      ? [
          {
            titel: "15-%-Grenze anschaffungsnahe Herstellungskosten",
            zeilen: [
              ["Anschaffungskosten Gebäude", formatEuro(grenze.gebaeude)],
              ["Grenze netto (brutto mit 19 % USt.)", `${formatEuro(grenze.grenzeNetto)} (${formatEuro(grenze.grenzeBrutto)})`],
              ["Eingetragener Erhaltungsaufwand", formatEuro(grenze.aufwand)],
              [grenze.spielraumNetto >= 0 ? "Spielraum netto" : "Grenze überschritten um", formatEuro(Math.abs(grenze.spielraumNetto))],
            ] as [string, string][],
            hinweis:
              "Instandsetzungen in den ersten drei Jahren nach dem Kauf sind nur bis zu dieser Grenze sofort absetzbar, darüber werden sie über die AfA verteilt. Vereinfachter Check, ersetzt keine Steuerberatung.",
          },
        ]
      : []),
  ];

  return (
    <div className={imDokument ? "bankgespraech" : "bankgespraech karte-innen"}>
      {!imDokument && (
      <div className="bankgespraech-pdf">
        <button type="button" className="button button-primary" disabled={pdfEntsteht} onClick={() => void pdfLaden()}>
          <FileDown size={14} /> {pdfEntsteht ? "PDF wird erstellt …" : "Bankgespräch-PDF"}
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

function ampelwert(wert: number | null, schwelle: Pick<Ampelschwelle, "einheit">): string {
  if (wert === null) return "nicht bestimmbar";
  return schwelle.einheit === "prozent" ? formatProzent(wert) : `${formatEuro(wert)} / Monat`;
}

/**
 * Die Ampel der fünf Kennzahlen, seit dem 11.10.2026. `mitSchwellen` zeigt
 * darunter, ab wann welche Farbe gilt, damit niemand raten muss.
 */
export function AmpelLeiste({ input, result, mitSchwellen = false }: { input: InvestmentEingabe; result: InvestmentErgebnis; mitSchwellen?: boolean }) {
  const einstellung = useContext(AmpelKontext);
  const [bearbeitet, setBearbeitet] = useState(false);
  const zeilen = ampel(input, result, einstellung.schwellen);
  return (
    <div data-testid="ampel">
      <div className="ampel-leiste">
        {zeilen.map((z) => (
          <div key={z.kennzahl}>
            <small>{z.schwelle.label}</small>
            <strong>
              <Ampelpunkt farbe={z.farbe} />
              {ampelwert(z.wert, z.schwelle)}
            </strong>
            {z.farbe && <span className="ampel-wort">{AMPEL_WORT[z.farbe]}</span>}
          </div>
        ))}
      </div>
      {mitSchwellen && (
        <>
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
              {Object.values(einstellung.schwellen).map((s) => (
                <tr key={s.label} title={s.erklaerung}>
                  <td>{s.label}</td>
                  <td>{ampelwert(s.gruenAb, s)}</td>
                  <td>{ampelwert(s.gelbAb, s)}</td>
                  <td>darunter</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="kachel-hinweis">
            Cashflows im ersten Jahr je Monat. Die Schwellen gelten unternehmensweit; ändern dürfen sie nur Admin und
            Inhaber. Die Ampel ist ein internes Werkzeug und steht nicht in der Berechnung für den Kunden.
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
  const hinweis = kaufpreisHinweis(result);
  return (
    <>
      <div className="tax-profile-grid">
        {kaufpreiszeilen(result).map((zeile) => (
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
  const texte = KENNZAHL_TEXTE.kacheln;
  const wege = rechenwege(input, result);
  const { schwellen } = useContext(AmpelKontext);
  const farben = Object.fromEntries(ampel(input, result, schwellen).map((z) => [z.kennzahl, z.farbe]));
  const letztesJahr = result.years[result.years.length - 1];
  const zahltZu = letztesJahr.cumulativeEigenanteil > 0;
  return (
    <div className="metrics-grid">
      <Kennzahlkarte label={texte.kaltmiete} value={formatEuro(result.effectiveAnnualRent / 12)} rechenweg={wege.kaltmiete} />
      <Kennzahlkarte label={texte.kreditrate} value={formatEuroCent(result.monthlyDebtService)} rechenweg={wege.kreditrate} />
      <Kennzahlkarte label={texte.bruttorendite} value={formatProzent(result.grossYield)} rechenweg={wege.bruttorendite} ampel={farben.bruttorendite} />
      <Kennzahlkarte label={texte.nettorendite} value={formatProzent(result.netYield)} rechenweg={wege.nettorendite} ampel={farben.nettorendite} />
      <Kennzahlkarte
        label={texte.immobilienwert(letztesJahr.year)}
        value={formatEuro(letztesJahr.propertyValue)}
        rechenweg={wege.immobilienwert}
      />
      <Kennzahlkarte
        label={texte.restschuld(letztesJahr.year)}
        value={formatEuro(letztesJahr.remainingDebt)}
        rechenweg={wege.restschuld}
      />
      {/*
        Frueher hiess diese Kachel "Eigenkapital {Jahr}". Das Wort meinte hier
        etwas anderes als das gleichnamige Eingabefeld unter Finanzierung: dort
        das eingesetzte Geld, hier der Wert der Immobilie abzueglich Restschuld.
      */}
      <Kennzahlkarte
        label={texte.immobilieMinusRestschuld(letztesJahr.year)}
        value={formatEuro(letztesJahr.propertyEquity)}
        rechenweg={wege.immobilieMinusRestschuld}
      />
      {/*
        Die UNGESALDIERTE Summe der Zuzahlungen: Wer sechs Jahre zuzahlt und
        danach etwas herausbekommt, hat trotzdem die volle Summe aufgebracht.
        Zahlt der Kunde nie zu, steht hier die Summe der Ueberschuesse.
      */}
      <Kennzahlkarte
        label={zahltZu ? texte.selbstEingezahlt(result.years.length) : texte.ueberschuss(result.years.length)}
        value={formatEuro(
          zahltZu ? letztesJahr.cumulativeEigenanteil : Math.abs(letztesJahr.cumulativeCashflowAfterTax),
        )}
        rechenweg={wege.selbstEingezahlt}
      />
    </div>
  );
}

/**
 * Rechenstandards aus dem Vertriebspaket, seit dem 16.10.2026: Belastung vor
 * und nach Steuer, Regel-AfA neben erhöhter AfA, Stresstest und
 * Wertentwicklung 0/1/2 %. Nur Anzeige, siehe rechenstandards.ts.
 */
export function Rechenstandards({ input, result }: { input: InvestmentEingabe; result: InvestmentErgebnis }) {
  const erstes = result.years[0];
  if (!erstes) return null;
  const afa = regelAfa(input);
  const faelle = stresstest(input, result);
  const wert = wertszenarien(input);
  const belastung = (betrag: number) => `${formatEuroCent(betrag)} im Monat`;
  const regelErstes = afa.mitRegelAfa?.years[0];

  const bloecke: { titel: string; zeilen: [string, string][]; hinweis?: string }[] = [
    {
      titel: `Belastung ${erstes.year}`,
      zeilen: [
        ["Zuzahlung vor Steuer", belastung(-erstes.cashflowBeforeTax / 12)],
        ["Zuzahlung nach Steuer", belastung(-erstes.cashflowAfterTax / 12)],
      ],
      hinweis: "Negativ heißt: Überschuss statt Zuzahlung.",
    },
    {
      titel: "AfA",
      zeilen: [
        [
          "Eingestellt",
          `${formatZahl(input.buildingDepreciationRate, "de", 2)} % ${input.depreciationMethod === "declining" ? "degressiv" : "linear"}`,
        ],
        ["Regel-AfA", `${formatZahl(afa.regel.satz, "de", 1)} % linear (${afa.regel.grund}, ${afa.regel.paragraf})`],
        ...(afa.mitRegelAfa && regelErstes
          ? ([
              [`Zuzahlung nach Steuer ${regelErstes.year} mit Regel-AfA`, belastung(-regelErstes.cashflowAfterTax / 12)],
              ["Steuerwirkung gesamt mit Regel-AfA", formatEuro(afa.mitRegelAfa.cumulativeTaxEffect)],
            ] as [string, string][])
          : []),
      ],
      hinweis: afa.erhoeht
        ? "Erhöhte AfA nur mit anerkanntem Gutachten (Restnutzungsdauer)."
        : afa.degressiv
          ? "Degressive AfA 5 % nur bei Baubeginn 10/2023 bis 9/2029."
          : undefined,
    },
    {
      titel: "Stresstest",
      zeilen: faelle.map((fall): [string, string] => [
        `${fall.titel} (${fall.jahr}): ${fall.beschreibung}`,
        fall.entfaellt
          ? `entfällt, ${fall.entfaellt}`
          : fall.einheit === "einmalig"
            ? `einmalig ${formatEuro(fall.stress.vorSteuer)} vor, ${formatEuro(fall.stress.nachSteuer)} nach Steuer`
            : `${formatEuroCent(fall.stress.vorSteuer)} vor, ${formatEuroCent(fall.stress.nachSteuer)} nach Steuer im Monat (bisher ${formatEuroCent(fall.basis.nachSteuer)} nach Steuer)`,
      ]),
      hinweis: "Zuzahlung je Monat, Leerstand als einmalige Mehrbelastung. Jeder Fall für sich, die Steuer mit derselben Rechnung wie oben.",
    },
    ...(wert
      ? [
          {
            titel: `Wertentwicklung bis ${wert.jahr}`,
            zeilen: wert.szenarien.flatMap((s): [string, string][] => [
              [`${s.prozent} % im Jahr: Wert / Wert minus Restschuld`, `${formatEuro(s.wert)} / ${formatEuro(s.vermoegen)}`],
              [`… ${s.prozent} % in heutiger Kaufkraft`, `${formatEuro(s.wertKaufkraft)} / ${formatEuro(s.vermoegenKaufkraft)}`],
            ]),
            hinweis: `Kaufkraft abgezinst mit ${formatZahl(wert.inflation, "de", 1)} % Inflation im Jahr. Szenarien, keine Prognose.`,
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
