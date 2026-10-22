import { useRef, type MouseEvent } from "react";
import { BookOpen, FileSearch } from "lucide-react";
import { useRechnerTexte } from "./RechnerSprache";
import type { InvestmentEingabe, InvestmentErgebnis } from "@/lib/investmentrechner/rechenkern";
import type { UnterlagenDaten, UnterlagenDokument } from "@/lib/investmentrechner/unterlagenAuslesen";
import { DECKBLATT_STANDARD, type DeckblattVariante } from "@/lib/investmentrechner/deckblattWerte";
import { hinweisOhneSteuerwirkung } from "@/lib/investmentrechner/dokumentTexte";
import { AmpelLeiste, Bankgespraech, Hausgeldaufstellung, Kaufpreisdetails, Kennzahlen, Rechenstandards, Steuerprofil, UnterlagenEinblicke } from "./Auswertungen";
import { hausgeldAufstellung } from "@/lib/investmentrechner/rechenkern";
import { Neu } from "./Felder";
import { DeckblattWahl, ErgebnisAltersvorsorge, ErgebnisAufEinenBlick, ErgebnisJahrFuerJahr } from "./Deckblatt";
import { Minidiagramm, Vermoegensdiagramm, Zusammensetzung } from "./Diagramme";
import { Cashflowtabelle, Darlehenstabelle, Steuertabelle, zeigeDarlehenstabelle } from "./Tabellen";
import { formatEuroCent, formatProzent } from "@/lib/investmentrechner/formatierer";
import { Glossar } from "./Glossar";

/*
 * Analyse-Ansicht des rechten Panels, eins zu eins aus der Web-App.
 *
 * Seit dem 07.10.2026 zeigt der obere Teil das Ergebnis des gewählten
 * Deckblatts, mit denselben Bausteinen wie das PDF. Er ersetzt die dunkle
 * Cashflow-Leiste mit dem großen Wert vor Steuer. Alles darunter bleibt.
 */

interface AnalyseProps {
  input: InvestmentEingabe;
  result: InvestmentErgebnis;
  documents: UnterlagenDokument[];
  documentData: UnterlagenDaten;
  onOpenDocuments: () => void;
  /** Dieselbe Wahl wie unter „Berechnung“. */
  deckblatt?: DeckblattVariante;
  /** Ohne diesen Rückruf steht kein Schalter da, etwa in Tests der übrigen Karten. */
  onDeckblatt?: (variante: DeckblattVariante) => void;
  /** Karte „Bankgespräch“, nur in der Investmentkalkulation Plus. */
  mitBankgespraech?: boolean;
}

export function Analyse({
  input,
  result,
  documents,
  documentData,
  onOpenDocuments,
  deckblatt = DECKBLATT_STANDARD,
  onDeckblatt,
  mitBankgespraech = false,
}: AnalyseProps) {
  // Seit dem 22.10.2026 in der Sprache der rechten Seite (Kundensprache oder Wahl), vorher immer Deutsch.
  const { sprache, kennzahl } = useRechnerTexte();
  const en = sprache === "en";
  const t = (de: string, englisch: string) => (en ? englisch : de);
  const ohneSteuerwirkung = hinweisOhneSteuerwirkung(input, result, sprache);
  const glossarRef = useRef<HTMLDetailsElement>(null);
  const glossarOeffnen = (ereignis: MouseEvent<HTMLAnchorElement>) => {
    ereignis.preventDefault();
    const feld = glossarRef.current;
    if (!feld) return;
    feld.open = true;
    feld.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="analysis-content">
      {onDeckblatt && (
        <DeckblattWahl
          wert={deckblatt}
          onWahl={onDeckblatt}
          hinweis={t("Dieselbe Wahl wie unter „Berechnung“, sie bestimmt auch das Deckblatt im PDF.", "The same choice as under “Calculation”; it also sets the cover page of the PDF.")}
        />
      )}
      <section className={`analyse-deckblatt analyse-deckblatt-${deckblatt}`}>
        {deckblatt === "jahre" ? (
          <ErgebnisJahrFuerJahr input={input} result={result} sprache={sprache} />
        ) : deckblatt === "rente" ? (
          <ErgebnisAltersvorsorge input={input} result={result} sprache={sprache} />
        ) : (
          <ErgebnisAufEinenBlick input={input} result={result} sprache={sprache} mitAmpel />
        )}
        {/* Stand bis zum 07.10.2026 in der Cashflow-Leiste: ohne Einkommen oder Satz keine Steuerwirkung. */}
        {ohneSteuerwirkung && (
          <p className="kachel-hinweis" data-testid="hinweis-ohne-steuerwirkung">
            {ohneSteuerwirkung}
          </p>
        )}
      </section>
      <Kennzahlen result={result} input={input} />
      <article className="content-card ampel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">{t("Einordnung", "Assessment")}</span>
            <h3>
              {t("Ampel", "Traffic light")} <Neu />
            </h3>
          </div>
        </div>
        <div className="karte-innen">
          <AmpelLeiste input={input} result={result} mitSchwellen />
        </div>
      </article>
      {/* Die Berechnung trägt den vollen Hinweis, die Analyse bis zum 30.09.2026 gar keinen. */}
      <p className="kachel-hinweis">{kennzahl.zusaetze.beispielrechnung}</p>
      {/* Der Weg zum Glossar ganz unten, direkt unter den Zahlen, nach denen man fragt. */}
      <a className="glossar-link" href="#rechner-glossar" onClick={glossarOeffnen}>
        <BookOpen size={14} /> {kennzahl.glossar.ueberschriftAnalyse}
      </a>
      {/*
        Kaufpreis und Möbel fehlten hier bis zum 25.09.2026 ganz, nur die
        Berechnung zeigte sie. Die Zahlen oben rechnen trotzdem mit beiden,
        ohne diese Karte liess sich aber nicht erkennen, worauf.
      */}
      <article className="content-card purchase-basis-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">{t("Kalkulationsbasis", "Calculation basis")}</span>
            <h3>{t("Kaufpreisdetails", "Purchase price details")}</h3>
          </div>
        </div>
        <Kaufpreisdetails input={input} result={result} />
      </article>
      {hausgeldAufstellung(input).vorhanden && (
        <article className="content-card purchase-basis-card" data-testid="karte-hausgeld">
          <div className="card-heading">
            <div>
              <span className="eyebrow">{t("Bewirtschaftung", "Running costs")}</span>
              <h3>{t("Hausgeld", "Service charge")}</h3>
            </div>
          </div>
          <Hausgeldaufstellung input={input} />
        </article>
      )}
      <article className="content-card tax-profile-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">{t("Kunde vor Erwerb", "Client before purchase")}</span>
            <h3>{t("Einkommens- und Steuerprofil", "Income and tax profile")}</h3>
          </div>
          <span className="period-pill">
            {t("StKl", "Tax class")} {input.taxClass} · {input.jointAssessment ? t("Splitting", "Joint assessment") : t("Grundtarif", "Basic tariff")}
          </span>
        </div>
        <Steuerprofil input={input} result={result} />
      </article>
      {mitBankgespraech && (
      <article className="content-card bank-card" data-testid="karte-bankgespraech">
        <div className="card-heading">
          <div>
            <span className="eyebrow">{t("Finanzierung & Risiko", "Financing & risk")}</span>
            <h3>{t("Bankgespräch", "Bank meeting")}</h3>
          </div>
        </div>
        <Bankgespraech input={input} result={result} />
      </article>
      )}
      <article className="content-card bank-card" data-testid="karte-stresstest">
        <div className="card-heading">
          <div>
            <span className="eyebrow">{t("Rechenstandards", "Calculation standards")}</span>
            <h3>
              {t("Belastung, AfA und Stresstest", "Burden, depreciation and stress test")} <Neu />
            </h3>
          </div>
        </div>
        <Rechenstandards input={input} result={result} />
      </article>
      <article className="content-card document-analysis-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">{t("Objektprüfung", "Property review")}</span>
            <h3>{t("Energie, Rücklagen & Sanierungen", "Energy, reserves & renovations")}</h3>
          </div>
          <button className="text-button" onClick={onOpenDocuments}>
            <FileSearch size={15} />{" "}
            {documents.length > 0
              ? en
                ? `${documents.length} document${documents.length === 1 ? "" : "s"}`
                : `${documents.length} Unterlage${documents.length === 1 ? "" : "n"}`
              : t("Unterlagen hochladen", "Upload documents")}
          </button>
        </div>
        <UnterlagenEinblicke data={documentData} />
      </article>
      <article className="content-card chart-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">{t("Prognose", "Forecast")}</span>
            <h3>{t("Vermögensentwicklung", "Wealth development")}</h3>
          </div>
          <span className="period-pill">{input.forecastYears} {t("Jahre", "years")}</span>
        </div>
        <Vermoegensdiagramm years={result.years} />
      </article>
      <article className="content-card reverse-visuals-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">{t("Aufteilung & Vergleich", "Breakdown & comparison")}</span>
            <h3>{t("Grafische Investmentanalyse", "Graphical investment analysis")}</h3>
          </div>
        </div>
        <Zusammensetzung input={input} result={result} />
        <div className="visual-grid">
          <div>
            <h4>{t("Immobilienwert und Restschuld", "Property value and remaining debt")}</h4>
            <Minidiagramm
              years={result.years}
              seriesA={(jahr) => jahr.propertyValue}
              seriesB={(jahr) => jahr.remainingDebt}
              labelA={t("Immobilienwert", "Property value")}
              labelB={t("Restschuld", "Remaining debt")}
            />
          </div>
          <div>
            <h4>{t("Steuerbelastung vor und nach Erwerb", "Tax burden before and after purchase")}</h4>
            <Minidiagramm
              years={result.years}
              seriesA={(jahr) => jahr.taxBefore.totalTax}
              seriesB={(jahr) => jahr.taxAfter.totalTax}
              labelA={t("Vor Erwerb", "Before purchase")}
              labelB={t("Nach Erwerb", "After purchase")}
            />
          </div>
        </div>
      </article>
      <article className="content-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">{t("Jahreswerte", "Annual values")}</span>
            <h3>{t("Cashflow, Steuer und Tilgung", "Cash flow, tax and repayment")}</h3>
          </div>
        </div>
        <Cashflowtabelle years={result.years} />
      </article>
      {/* Seit dem 07.10.2026: Mit KfW-Darlehen jedes Darlehen einzeln, ohne bleibt es bei der Tabelle darüber. */}
      {zeigeDarlehenstabelle(result) && (
        <article className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">{t("Finanzierung", "Financing")}</span>
              <h3>{t("Darlehen je Jahr: Rate, Zinsen, Tilgung und Restschuld", "Loans per year: instalment, interest, repayment and remaining debt")}</h3>
            </div>
            <span className="period-pill">{t("Mischzins", "Blended rate")} {formatProzent(result.mischzins, sprache)}</span>
          </div>
          {result.rateSprung && (
            <p className="kachel-hinweis">
              {en
                ? `From year ${result.rateSprung.jahr} (${result.rateSprung.kalenderjahr}) the instalment rises from ${formatEuroCent(result.rateSprung.rateVorher, sprache)} to ${formatEuroCent(result.rateSprung.rateNachher, sprache)} per month because the repayment-free period of the KfW loan ends.`
                : `Ab Jahr ${result.rateSprung.jahr} (${result.rateSprung.kalenderjahr}) steigt die Rate von ${formatEuroCent(result.rateSprung.rateVorher)} auf ${formatEuroCent(result.rateSprung.rateNachher)} im Monat, weil die tilgungsfreie Zeit des KfW-Darlehens endet.`}
            </p>
          )}
          <Darlehenstabelle years={result.years} />
        </article>
      )}
      <article className="content-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">{t("Steuerwirkung", "Tax effect")}</span>
            <h3>{t("Zu versteuerndes Einkommen vor und nach Immobilienerwerb", "Taxable income before and after the property purchase")}</h3>
          </div>
          <span className="period-pill">{t("Anteil", "Share")} {formatProzent(result.anteil, sprache)}</span>
        </div>
        <Steuertabelle years={result.years} />
      </article>
      {/*
        Bis zum 25.09.2026 stand hier „Berechnungslogik anzeigen“ mit vier
        Absätzen. Seitdem das Glossar, derselbe Inhalt wie auf der letzten
        Seite der Berechnung und aus derselben Quelle wie die Rechenwege.
      */}
      <details className="method-card glossar-karte" id="rechner-glossar" ref={glossarRef}>
        <summary>{kennzahl.glossar.ueberschriftAnalyse}</summary>
        <Glossar allInclusive={result.allInclusive} />
      </details>
    </div>
  );
}
