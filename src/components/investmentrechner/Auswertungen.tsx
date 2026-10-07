import type { InvestmentEingabe, InvestmentErgebnis } from "@/lib/investmentrechner/rechenkern";
import { sanierungenBereinigt, type UnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import { ENERGIEKLASSEN, formatEuro, formatEuroCent, formatProzent, formatZahl } from "@/lib/investmentrechner/formatierer";
import { KENNZAHL_TEXTE } from "@/lib/investmentrechner/kennzahlTexte";
import { rechenwege } from "@/lib/investmentrechner/kennzahlErklaerungen";
import { Kennzahlkarte } from "./Felder";
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
  const gesamtLabel = mitAufwand && mitMoebeln
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
  if (!mitAufwand && !mitMoebeln) {
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

/** Der feste Hinweis unter den Kaufpreisdetails, nur mit Erhaltungsaufwand oder Möbeln. */
export function kaufpreisHinweis(result: InvestmentErgebnis, sprache: FormatSprache = "de"): string | null {
  const t = dokumentTexteFuer(sprache).kaufpreis;
  const mitAufwand = result.erhaltungsaufwand > 0;
  const mitMoebeln = result.moebelAnteil > 0;
  if (mitAufwand && mitMoebeln) return t.hinweisBeides;
  if (mitAufwand) return t.hinweisErhaltung;
  if (mitMoebeln) return t.hinweisMoebel;
  return null;
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
  const letztesJahr = result.years[result.years.length - 1];
  const zahltZu = letztesJahr.cumulativeEigenanteil > 0;
  return (
    <div className="metrics-grid">
      <Kennzahlkarte label={texte.kaltmiete} value={formatEuro(result.effectiveAnnualRent / 12)} rechenweg={wege.kaltmiete} />
      <Kennzahlkarte label={texte.kreditrate} value={formatEuroCent(result.monthlyDebtService)} rechenweg={wege.kreditrate} />
      <Kennzahlkarte label={texte.bruttorendite} value={formatProzent(result.grossYield)} rechenweg={wege.bruttorendite} />
      <Kennzahlkarte label={texte.nettorendite} value={formatProzent(result.netYield)} rechenweg={wege.nettorendite} />
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
