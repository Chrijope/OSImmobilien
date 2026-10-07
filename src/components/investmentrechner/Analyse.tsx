import { useRef, type MouseEvent } from "react";
import { BookOpen, FileSearch } from "lucide-react";
import { KENNZAHL_TEXTE } from "@/lib/investmentrechner/kennzahlTexte";
import type { InvestmentEingabe, InvestmentErgebnis } from "@/lib/investmentrechner/rechenkern";
import type { UnterlagenDaten, UnterlagenDokument } from "@/lib/investmentrechner/unterlagenAuslesen";
import { DECKBLATT_STANDARD, type DeckblattVariante } from "@/lib/investmentrechner/deckblattWerte";
import { hinweisOhneSteuerwirkung } from "@/lib/investmentrechner/dokumentTexte";
import { Kaufpreisdetails, Kennzahlen, Steuerprofil, UnterlagenEinblicke } from "./Auswertungen";
import { DeckblattWahl, ErgebnisAufEinenBlick, ErgebnisJahrFuerJahr } from "./Deckblatt";
import { Minidiagramm, Vermoegensdiagramm, Zusammensetzung } from "./Diagramme";
import { Cashflowtabelle, Darlehenstabelle, Steuertabelle } from "./Tabellen";
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
}

export function Analyse({
  input,
  result,
  documents,
  documentData,
  onOpenDocuments,
  deckblatt = DECKBLATT_STANDARD,
  onDeckblatt,
}: AnalyseProps) {
  const ohneSteuerwirkung = hinweisOhneSteuerwirkung(input, result, "de");
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
        <DeckblattWahl wert={deckblatt} onWahl={onDeckblatt} hinweis="Dieselbe Wahl wie unter „Berechnung“, sie bestimmt auch das Deckblatt im PDF." />
      )}
      {/* Die Analyse ist ein Werkzeug für Berater und bleibt Deutsch. */}
      <section className={`analyse-deckblatt analyse-deckblatt-${deckblatt}`}>
        {deckblatt === "jahre" ? (
          <ErgebnisJahrFuerJahr input={input} result={result} sprache="de" />
        ) : (
          <ErgebnisAufEinenBlick input={input} result={result} sprache="de" />
        )}
        {/* Stand bis zum 07.10.2026 in der Cashflow-Leiste: ohne Einkommen oder Satz keine Steuerwirkung. */}
        {ohneSteuerwirkung && (
          <p className="kachel-hinweis" data-testid="hinweis-ohne-steuerwirkung">
            {ohneSteuerwirkung}
          </p>
        )}
      </section>
      <Kennzahlen result={result} input={input} />
      {/* Die Berechnung trägt den vollen Hinweis, die Analyse bis zum 30.09.2026 gar keinen. */}
      <p className="kachel-hinweis">{KENNZAHL_TEXTE.zusaetze.beispielrechnung}</p>
      {/* Der Weg zum Glossar ganz unten, direkt unter den Zahlen, nach denen man fragt. */}
      <a className="glossar-link" href="#rechner-glossar" onClick={glossarOeffnen}>
        <BookOpen size={14} /> {KENNZAHL_TEXTE.glossar.ueberschriftAnalyse}
      </a>
      {/*
        Kaufpreis und Möbel fehlten hier bis zum 25.09.2026 ganz, nur die
        Berechnung zeigte sie. Die Zahlen oben rechnen trotzdem mit beiden,
        ohne diese Karte liess sich aber nicht erkennen, worauf.
      */}
      <article className="content-card purchase-basis-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Kalkulationsbasis</span>
            <h3>Kaufpreisdetails</h3>
          </div>
        </div>
        <Kaufpreisdetails input={input} result={result} />
      </article>
      <article className="content-card tax-profile-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Kunde vor Erwerb</span>
            <h3>Einkommens- und Steuerprofil</h3>
          </div>
          <span className="period-pill">
            StKl {input.taxClass} · {input.jointAssessment ? "Splitting" : "Grundtarif"}
          </span>
        </div>
        <Steuerprofil input={input} result={result} />
      </article>
      <article className="content-card document-analysis-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Objektprüfung</span>
            <h3>Energie, Rücklagen & Sanierungen</h3>
          </div>
          <button className="text-button" onClick={onOpenDocuments}>
            <FileSearch size={15} />{" "}
            {documents.length > 0
              ? `${documents.length} Unterlage${documents.length === 1 ? "" : "n"}`
              : "Unterlagen hochladen"}
          </button>
        </div>
        <UnterlagenEinblicke data={documentData} />
      </article>
      <article className="content-card chart-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Prognose</span>
            <h3>Vermögensentwicklung</h3>
          </div>
          <span className="period-pill">{input.forecastYears} Jahre</span>
        </div>
        <Vermoegensdiagramm years={result.years} />
      </article>
      <article className="content-card reverse-visuals-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Aufteilung & Vergleich</span>
            <h3>Grafische Investmentanalyse</h3>
          </div>
        </div>
        <Zusammensetzung input={input} result={result} />
        <div className="visual-grid">
          <div>
            <h4>Immobilienwert und Restschuld</h4>
            <Minidiagramm
              years={result.years}
              seriesA={(jahr) => jahr.propertyValue}
              seriesB={(jahr) => jahr.remainingDebt}
              labelA="Immobilienwert"
              labelB="Restschuld"
            />
          </div>
          <div>
            <h4>Steuerbelastung vor und nach Erwerb</h4>
            <Minidiagramm
              years={result.years}
              seriesA={(jahr) => jahr.taxBefore.totalTax}
              seriesB={(jahr) => jahr.taxAfter.totalTax}
              labelA="Vor Erwerb"
              labelB="Nach Erwerb"
            />
          </div>
        </div>
      </article>
      <article className="content-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Jahreswerte</span>
            <h3>Cashflow, Steuer und Tilgung</h3>
          </div>
        </div>
        <Cashflowtabelle years={result.years} />
      </article>
      {/* Seit dem 07.10.2026: Mit KfW-Darlehen jedes Darlehen einzeln, ohne bleibt es bei der Tabelle darüber. */}
      {result.kfwLoanAmount > 0 && (
        <article className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Finanzierung</span>
              <h3>Darlehen je Jahr: Rate, Zinsen, Tilgung und Restschuld</h3>
            </div>
            <span className="period-pill">Mischzins {formatProzent(result.mischzins)}</span>
          </div>
          {result.rateSprung && (
            <p className="kachel-hinweis">
              Ab Jahr {result.rateSprung.jahr} ({result.rateSprung.kalenderjahr}) steigt die Rate von{" "}
              {formatEuroCent(result.rateSprung.rateVorher)} auf {formatEuroCent(result.rateSprung.rateNachher)} im Monat,
              weil die tilgungsfreie Zeit des KfW-Darlehens endet.
            </p>
          )}
          <Darlehenstabelle years={result.years} />
        </article>
      )}
      <article className="content-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Steuerwirkung</span>
            <h3>Zu versteuerndes Einkommen vor und nach Immobilienerwerb</h3>
          </div>
          <span className="period-pill">Anteil {input.investmentShare.toLocaleString("de-DE")} %</span>
        </div>
        <Steuertabelle years={result.years} />
      </article>
      {/*
        Bis zum 25.09.2026 stand hier „Berechnungslogik anzeigen“ mit vier
        Absätzen. Seitdem das Glossar, derselbe Inhalt wie auf der letzten
        Seite der Berechnung und aus derselben Quelle wie die Rechenwege.
      */}
      <details className="method-card glossar-karte" id="rechner-glossar" ref={glossarRef}>
        <summary>{KENNZAHL_TEXTE.glossar.ueberschriftAnalyse}</summary>
        <Glossar />
      </details>
    </div>
  );
}
