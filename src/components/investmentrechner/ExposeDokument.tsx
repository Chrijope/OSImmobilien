import { ImagePlus } from "lucide-react";
import { eigenkapitalrendite, type InvestmentEingabe, type InvestmentErgebnis } from "@/lib/investmentrechner/rechenkern";
import {
  sanierungenBereinigt,
  type UnterlagenDaten,
  type UnterlagenDokument,
} from "@/lib/investmentrechner/unterlagenAuslesen";
import {
  formatEuro,
  formatEuroCent,
  formatProzent,
  formatProzentEineStelle,
  formatZahl,
} from "@/lib/investmentrechner/formatierer";
import { DECKBLATT_STANDARD, type DeckblattVariante } from "@/lib/investmentrechner/deckblattWerte";
import {
  einordnung,
  formatUnterschied,
  formatVergleichswert,
  jahreDativ,
  jahreEnglisch,
  objektMarke,
  vergleichBezeichnung,
  vergleicheObjekte,
  type Vergleichsobjekt,
  type Vergleichszeile,
} from "@/lib/investmentrechner/objektvergleich";
import { kennzahlTexteFuer } from "@/lib/investmentrechner/kennzahlTexte";
import { dokumentTexteFuer } from "@/lib/investmentrechner/dokumentTexte";
import { rechenwege } from "@/lib/investmentrechner/kennzahlErklaerungen";
import type { FormatSprache } from "@/lib/sprachFormat";
import { Kennzahlkarte, Objektkarte } from "./Felder";
import { DeckblattAufEinenBlick, DeckblattJahrFuerJahr } from "./Deckblatt";
import { kaufpreisHinweis, kaufpreiszeilen, Steuerprofil, UnterlagenEinblicke } from "./Auswertungen";
import { Vermoegensdiagramm, Zusammensetzung, Zweireihendiagramm } from "./Diagramme";
import { Cashflowtabelle, Darlehenstabelle, Steuertabelle } from "./Tabellen";
import { Glossar } from "./Glossar";
import { RechnerSpracheContext } from "./RechnerSprache";

/*
 * Das Exposé, eins zu eins aus der Web-App (Original De, Q, $), seit dem
 * 25.09.2026 mit dem Glossar als letzter Seite. Seit dem 07.10.2026 steht
 * vorn eines von zwei Deckblättern (Deckblatt.tsx), dahinter die Seite
 * „Kennzahlen, Kaufpreis, Finanzierung und Annahmen“, zusammen acht Seiten.
 * Dieselbe Komponente dient als Vorschau im rechten Panel und, mit
 * printing=true, als Druckdokument.
 *
 * Seit dem 25.09.2026 in der Sprache des Kunden (Plan Kundensprache,
 * Etappe 5): Der Aufrufer reicht `sprache` aus dem Kundenprofil herein.
 * Alle festen Texte kommen aus `dokumentTexte.ts` und `kennzahlTexte.ts`,
 * Beträge und Zahlen über den Formatierer in derselben Sprache. Ohne Angabe
 * bleibt es Deutsch. Eingaben wie Objektart, Titel und Adresse stehen, wie
 * der Berater sie eingetragen hat.
 */

export interface ExposeDokumentProps {
  input: InvestmentEingabe;
  result: InvestmentErgebnis;
  photos: string[];
  documents: UnterlagenDokument[];
  documentData: UnterlagenDaten;
  printing?: boolean;
  /**
   * Seitenzahl der Seite vor diesem Block. Im Vergleich läuft die Zählung über
   * alle Objekte durch, deshalb beginnt Objekt B nicht wieder bei 1.
   */
  seitenOffset?: number;
  /** Kennzeichnung im Seitenkopf, etwa „Objekt A". Leer bei nur einem Objekt. */
  marke?: string;
  /**
   * Ohne eigenen Rahmen rendern. Der Vergleich legt alle Seiten in ein
   * gemeinsames .expose-document, damit Umbruch und Skalierung stimmen.
   */
  ohneRahmen?: boolean;
  /** Sprache des Kunden, `kundenSprache` aus dem Kundenprofil. Ohne Angabe Deutsch. */
  sprache?: FormatSprache;
  /** Das Deckblatt, das der Berater gewählt hat. Ohne Angabe „Ergebnis auf einen Blick“. */
  deckblatt?: DeckblattVariante;
}

/** Seiten je Objekt: Deckblatt, Kennzahlen, Unterlagen, Steuer, Prognose, Tabellen, Bilder, Glossar. */
const SEITEN_JE_OBJEKT = 8;

/** Mit KfW-Darlehen kommt die Seite „Darlehen je Jahr“ dazu. */
function seitenJeObjekt(result: InvestmentErgebnis): number {
  return SEITEN_JE_OBJEKT + (result.kfwLoanAmount > 0 ? 1 : 0);
}

function Zeile({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`line-item ${strong ? "strong" : ""}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Fusszeile({ seite, sprache }: { seite: number; sprache: FormatSprache }) {
  const t = dokumentTexteFuer(sprache).kopf;
  return (
    <footer className="expose-footer">
      <span>{t.fusszeile}</span>
      <span>{t.seite(seite)}</span>
    </footer>
  );
}

function Seitenkopf({ clientName, marke, sprache }: { clientName: string; marke?: string; sprache: FormatSprache }) {
  return (
    <div className="expose-page-heading">
      <span>OS Immobilien · {dokumentTexteFuer(sprache).kopf.investmentkalkulation}{marke ? ` · ${marke}` : ""}</span>
      <strong>{clientName}</strong>
    </div>
  );
}

export function ExposeDokument({
  input,
  result,
  photos,
  documents,
  documentData,
  printing = false,
  seitenOffset = 0,
  marke,
  ohneRahmen = false,
  sprache = "de",
  deckblatt = DECKBLATT_STANDARD,
}: ExposeDokumentProps) {
  const kennzahl = kennzahlTexteFuer(sprache);
  const t = dokumentTexteFuer(sprache);
  const kacheltexte = kennzahl.kacheln;
  const wege = rechenwege(input, result, kennzahl, sprache);
  const euro = (wert: number) => formatEuro(wert, sprache);
  const prozent = (wert: number) => formatProzent(wert, sprache);
  const zahl = (wert: number, stellen = 3) => formatZahl(wert, sprache, stellen);
  const erstesJahr = result.years[0];
  const letztesJahr = result.years[result.years.length - 1];
  const tabellenjahre = result.years.slice(0, 10);
  const letztesTabellenjahr = tabellenjahre[tabellenjahre.length - 1]?.year ?? input.startYear;
  const grenzsteuersatz =
    input.taxCalculationMode === "tariff" ? result.marginalTotalTaxRate : input.marginalTaxRate / 100;
  // Nur echte Maßnahmen zählen, keine leeren Zeilen aus dem Eingabefeld.
  const sanierungenAnzahl = sanierungenBereinigt(documentData.renovations).length;

  const deckblattProps = {
    input,
    result,
    photos,
    documentData,
    sprache,
    marke,
    fusszeile: <Fusszeile seite={seitenOffset + 1} sprache={sprache} />,
  };
  const ekr = eigenkapitalrendite(input, result);
  const ks = t.kennzahlenSeite;
  const kfw = result.kfwLoanAmount > 0;
  const zuschussJahr = Math.round(input.kfwGrantYear);
  const zusatzseiten = seitenJeObjekt(result) - SEITEN_JE_OBJEKT;
  const prozentZahl = (wert: number) => (sprache === "en" ? `${zahl(wert)}%` : `${zahl(wert)} %`);
  /*
    Bei aktiviertem Erhaltungsaufwand teilt er das Schicksal der
    Gebaeude-AfA, die Dauer ergibt sich also aus deren Satz. Ohne den
    Schutz stand bei einem Satz von null woertlich "Infinity Jahr(e)"
    im Expose, weil durch null geteilt wurde.
  */
  const erhaltungsjahre = String(
    input.rehabMode === "expense"
      ? input.rehabDistributionYears
      : input.buildingDepreciationRate > 0
        ? Math.round(100 / input.buildingDepreciationRate)
        : "?",
  );

  const seiten = (
    <>
      {/*
        Seit dem 07.10.2026 wählt der Berater das Deckblatt selbst. Die alte
        erste Seite ist aufgeteilt: Objekt und Ergebnis stehen jetzt auf dem
        Deckblatt, Kennzahlen, Kaufpreis, Finanzierung und Annahmen auf der
        Seite dahinter. Ab der Seite „Objektunterlagen“ bleibt alles wie zuvor.
      */}
      {deckblatt === "jahre" ? <DeckblattJahrFuerJahr {...deckblattProps} /> : <DeckblattAufEinenBlick {...deckblattProps} />}

      <section className="expose-page kennzahlen-page">
        <Seitenkopf clientName={input.clientName} marke={marke} sprache={sprache} />
        <span className="eyebrow">{ks.augenbraue}</span>
        <h2>{ks.titel}</h2>
        {/*
          Reihenfolge und Aufteilung sind dieselben wie in der Analyse-Ansicht,
          siehe Kennzahlen in Auswertungen.tsx. Wer im Rechner zwischen Analyse
          und Exposé umschaltet, soll dieselbe Anordnung wiederfinden.
        */}
        <div className="expose-metrics">
          <Kennzahlkarte
            label={kacheltexte.kaltmiete}
            value={euro(result.effectiveAnnualRent / 12)}
            rechenweg={wege.kaltmiete}
          />
          <Kennzahlkarte
            label={kacheltexte.kreditrate}
            value={formatEuroCent(result.monthlyDebtService, sprache)}
            rechenweg={wege.kreditrate}
          />
          <Kennzahlkarte label={kacheltexte.bruttorendite} value={prozent(result.grossYield)} rechenweg={wege.bruttorendite} />
          <Kennzahlkarte label={kacheltexte.nettorendite} value={prozent(result.netYield)} rechenweg={wege.nettorendite} />
        </div>
        <div className="expose-tax-callout">
          <div>
            <span>{t.deckblatt.erhaltungsaufwandModell}</span>
            <strong>
              {t.deckblatt.ueberJahre(euro(input.rehabExpense), erhaltungsjahre)}
            </strong>
          </div>
        </div>
        <div className="expose-columns">
          <div>
            <h3>{t.deckblatt.kaufpreisdetails}</h3>
            {/* Dieselbe Liste zeigt die Analyse, siehe kaufpreiszeilen in Auswertungen.tsx. */}
            {kaufpreiszeilen(result, sprache).map((zeile) => (
              <Zeile key={zeile.label} label={zeile.label} value={zeile.wert} strong={zeile.summe} />
            ))}
          </div>
          <div>
            <h3>{t.deckblatt.finanzierungSteuer}</h3>
            <Zeile label={t.deckblatt.bankdarlehen} value={euro(result.seniorLoanAmount)} />
            {kfw && <Zeile label={t.deckblatt.kfwDarlehen(input.kfwProgram.trim())} value={euro(result.kfwLoanAmount)} />}
            {input.juniorLoanAmount > 0 && <Zeile label={t.deckblatt.nachrangdarlehen} value={euro(input.juniorLoanAmount)} />}
            <Zeile
              label={t.deckblatt.zinsTilgung}
              value={
                sprache === "en"
                  ? `${zahl(input.seniorInterestRate)}% / ${zahl(input.seniorRepaymentRate)}%`
                  : `${zahl(input.seniorInterestRate)} % / ${zahl(input.seniorRepaymentRate)} %`
              }
            />
            {/* KfW-Zeilen nur mit KfW-Darlehen, ohne bleibt die Seite wie vor dem 07.10.2026. */}
            {kfw && (
              <>
                <Zeile
                  label={t.deckblatt.kfwKonditionen}
                  value={t.deckblatt.kfwKonditionenWert(
                    prozentZahl(input.kfwInterestRate),
                    result.kfwAnlaufJahre,
                    Math.max(1, Math.round(input.kfwTermYears)),
                  )}
                />
                <Zeile label={t.deckblatt.mischzins} value={prozent(result.mischzins)} />
                {result.rateSprung && (
                  <Zeile
                    label={t.deckblatt.rateAbJahr(result.rateSprung.jahr, result.rateSprung.kalenderjahr)}
                    value={formatEuroCent(result.rateSprung.rateNachher, sprache)}
                  />
                )}
              </>
            )}
            <Zeile label={t.deckblatt.eingesetztesEigenkapital} value={euro(input.equity)} strong />
            <Zeile label={t.deckblatt.zveVorErwerb} value={euro(result.combinedTaxableIncome)} />
            <Zeile
              label={
                input.taxCalculationMode === "tariff"
                  ? t.deckblatt.grenzsteuersatzTarif
                  : t.deckblatt.grenzsteuersatzManuell
              }
              value={prozent(grenzsteuersatz)}
            />
            {/*
              Was früher in den dunklen Kacheln der ersten Seite stand und auf
              den Folgeseiten fehlt, über den ganzen Prognosezeitraum. Die
              Deckblätter zeigen höchstens zehn Jahre.
            */}
            <h3 className="kennzahlen-ergebnis">{ks.ergebnisTitel(result.years.length)}</h3>
            <Zeile label={ks.vermoegensaufbauMonat} value={formatEuroCent(result.vermoegensaufbauMonat, sprache)} />
            <Zeile label={ks.davonTilgung} value={formatEuroCent(result.tilgungMonat, sprache)} />
            {result.tilgungszuschussPrognose > 0 && (
              <Zeile
                label={ks.davonZuschuss}
                value={formatEuroCent(result.tilgungszuschussPrognose / (result.years.length * 12), sprache)}
              />
            )}
            {ekr.rendite !== null && (
              <Zeile label={kacheltexte.eigenkapitalrendite} value={formatProzentEineStelle(ekr.rendite, sprache)} />
            )}
            <Zeile label={kacheltexte.immobilienwert(letztesJahr.year)} value={euro(letztesJahr.propertyValue)} />
            <Zeile label={kacheltexte.restschuld(letztesJahr.year)} value={euro(letztesJahr.remainingDebt)} />
            <Zeile label={kacheltexte.immobilieMinusRestschuld(letztesJahr.year)} value={euro(letztesJahr.propertyEquity)} />
            <Zeile
              label={
                letztesJahr.cumulativeEigenanteil > 0
                  ? kacheltexte.selbstEingezahlt(result.years.length)
                  : kacheltexte.ueberschuss(result.years.length)
              }
              value={euro(
                letztesJahr.cumulativeEigenanteil > 0
                  ? letztesJahr.cumulativeEigenanteil
                  : Math.abs(letztesJahr.cumulativeCashflowAfterTax),
              )}
            />
            <Zeile label={kacheltexte.steuereffektErstesJahr} value={euro(erstesJahr.taxEffect)} />
            <Zeile label={kacheltexte.steuereffektGesamt(result.years.length)} value={euro(result.cumulativeTaxEffect)} />
            <Zeile label={kacheltexte.gesamtvermoegen(result.years.length)} value={euro(letztesJahr.totalWealth)} strong />
          </div>
        </div>
        {/* Über die ganze Seitenbreite statt nur unter der linken Spalte, das spart Höhe (Christian, 30.09.2026). */}
        {kaufpreisHinweis(result, sprache) && <p className="expose-fineprint">{kaufpreisHinweis(result, sprache)}</p>}
        <div className="narrative-box kennzahlen-annahmen">
          <h3>{ks.annahmenTitel}</h3>
          <ul>
            <li>
              {ks.annahmeWachstum(
                prozentZahl(input.annualValueGrowth),
                prozentZahl(input.annualRentGrowth),
                prozentZahl(input.annualCostGrowth),
              )}
            </li>
            <li>
              {input.rehabExpense > 0 ? ks.annahmeErhaltung(euro(input.rehabExpense), erhaltungsjahre) : ks.annahmeOhneErhaltung}
            </li>
            <li>{ks.annahmeZins(result.years.length)}</li>
            {kfw && input.kfwFixedRateYears > 0 && result.kfwRestschuldZinsbindung > 0 && (
              <li>
                {ks.annahmeKfw(
                  Math.round(input.kfwFixedRateYears),
                  input.startYear + Math.round(input.kfwFixedRateYears) - 1,
                  euro(result.kfwRestschuldZinsbindung),
                )}
              </li>
            )}
            {/* Betrag und Jahr des Zuschusses stehen nur hier, angerechnet und bei Kürzung auch zugesagt. */}
            {kfw && result.kfwTilgungszuschussNominal > 0 && !result.kfwZuschussOhneJahr && (
              <li>
                {result.kfwTilgungszuschuss < result.kfwTilgungszuschussNominal - 0.5
                  ? ks.annahmeZuschussGekuerzt(
                      euro(result.kfwTilgungszuschussNominal),
                      euro(result.kfwTilgungszuschuss),
                      zuschussJahr,
                    )
                  : ks.annahmeZuschuss(euro(result.kfwTilgungszuschuss), zuschussJahr)}
              </li>
            )}
            <li>{ks.annahmeVermoegen(result.years.length)}</li>
          </ul>
        </div>
        <p className="expose-fineprint">
          {kennzahl.zusaetze.beispielrechnung} {kennzahl.glossar.keineSteuerberatung}
        </p>
        <Fusszeile seite={seitenOffset + 2} sprache={sprache} />
      </section>

      <section className="expose-page documents-page">
        <Seitenkopf clientName={input.clientName} marke={marke} sprache={sprache} />
        <span className="eyebrow">{t.unterlagenSeite.augenbraue}</span>
        <h2>{t.unterlagenSeite.titel}</h2>
        <p className="page-intro">{t.unterlagenSeite.einleitung}</p>
        <UnterlagenEinblicke data={documentData} compact />
        <div className="document-expose-summary">
          <div>
            <span>{t.unterlagenSeite.energieklasse}</span>
            <strong>{documentData.energyClass || t.unterlagenSeite.keineAngabe}</strong>
            <small>
              {documentData.energyValue > 0
                ? `${zahl(documentData.energyValue, 1)} kWh/(m²·a)`
                : t.unterlagenSeite.kennwertFehlt}
            </small>
          </div>
          <div>
            <span>{t.unterlagenSeite.ruecklagenbestand}</span>
            <strong>{documentData.reserveAmount > 0 ? euro(documentData.reserveAmount) : t.unterlagenSeite.keineAngabe}</strong>
            <small>
              {documentData.reserveAsOf ? t.unterlagenSeite.stand(documentData.reserveAsOf) : t.unterlagenSeite.stichtagFehlt}
            </small>
          </div>
          <div>
            <span>{t.unterlagenSeite.sanierungshistorie}</span>
            <strong>{sanierungenAnzahl}</strong>
            <small>{t.unterlagenSeite.massnahmen(sanierungenAnzahl)}</small>
          </div>
        </div>
        <div className="document-sources">
          <h3>{t.unterlagenSeite.beruecksichtigteUnterlagen}</h3>
          {documents.length > 0 ? (
            <ul>
              {documents.slice(0, 8).map((dokument) => (
                <li key={dokument.id}>
                  <span>{dokument.name}</span>
                  <small>
                    {dokument.category}
                    {dokument.pages > 0 ? ` · ${t.unterlagenSeite.seitenKurz(dokument.pages)}` : ""}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t.unterlagenSeite.keineUnterlagen}</p>
          )}
        </div>
        <div className="narrative-box">
          <h3>{t.unterlagenSeite.pruefhinweisTitel}</h3>
          <p>{t.unterlagenSeite.pruefhinweis}</p>
        </div>
        <Fusszeile seite={seitenOffset + 3} sprache={sprache} />
      </section>

      <section className="expose-page tax-profile-page">
        <Seitenkopf clientName={input.clientName} marke={marke} sprache={sprache} />
        <span className="eyebrow">{t.steuerSeite.augenbraue}</span>
        <h2>{t.steuerSeite.titel}</h2>
        <p className="page-intro">{t.steuerSeite.einleitung}</p>
        <div className="tax-basis-strip">
          <span>
            <small>{t.steuerSeite.steuerklasse}</small>
            <strong>{input.taxClass}</strong>
          </span>
          <span>
            <small>{t.steuerSeite.veranlagung}</small>
            <strong>{input.jointAssessment ? t.steuerSeite.splitting : t.steuerSeite.grundtabelle}</strong>
          </span>
          <span>
            <small>{t.steuerSeite.investitionsanteil}</small>
            <strong>{sprache === "en" ? `${zahl(input.investmentShare)}%` : `${zahl(input.investmentShare)} %`}</strong>
          </span>
          <span>
            <small>{t.steuerSeite.berechnung}</small>
            <strong>{input.taxCalculationMode === "tariff" ? t.steuerSeite.tarif : t.steuerSeite.manuell}</strong>
          </span>
        </div>
        <Steuerprofil input={input} result={result} compact />
        <div className="tax-before-after">
          <div>
            <span>{t.steuerSeite.ohneImmobilie(erstesJahr.year)}</span>
            <strong>{euro(erstesJahr.taxBefore.totalTax)}</strong>
            <small>
              {t.steuerSeite.zve} {euro(erstesJahr.taxableIncomeBefore)} · {t.steuerSeite.est}{" "}
              {euro(erstesJahr.taxBefore.incomeTax)} · {t.steuerSeite.soli} {euro(erstesJahr.taxBefore.solidarity)} ·{" "}
              {t.steuerSeite.kist} {euro(erstesJahr.taxBefore.churchTax)}
            </small>
          </div>
          <div className={erstesJahr.taxEffect >= 0 ? "tax-after-positive" : "tax-after-negative"}>
            <span>{t.steuerSeite.mitImmobilie(erstesJahr.year)}</span>
            <strong>{euro(erstesJahr.taxAfter.totalTax)}</strong>
            <small>
              {t.steuerSeite.zve} {euro(erstesJahr.taxableIncomeAfter)} · {t.steuerSeite.steuereffekt}{" "}
              {erstesJahr.taxEffect >= 0 ? "+" : ""}
              {euro(erstesJahr.taxEffect)}
            </small>
          </div>
        </div>
        <h2 className="tax-heading">{t.steuerSeite.steuerwirkung(input.startYear, letztesTabellenjahr)}</h2>
        <Steuertabelle years={tabellenjahre} compact />
        <p className="expose-fineprint">{t.steuerSeite.kleingedruckt}</p>
        <Fusszeile seite={seitenOffset + 4} sprache={sprache} />
      </section>

      <section className="expose-page forecast-page">
        <Seitenkopf clientName={input.clientName} marke={marke} sprache={sprache} />
        <span className="eyebrow">{t.prognoseSeite.augenbraue(input.startYear, letztesJahr.year)}</span>
        <h2>{t.prognoseSeite.titel}</h2>
        <Vermoegensdiagramm years={result.years} />
        <Zusammensetzung input={input} result={result} />
        <div className="forecast-highlights">
          <div>
            <span>{t.prognoseSeite.wertzuwachs}</span>
            <strong>{euro(letztesJahr.wertzuwachs)}</strong>
          </div>
          <div>
            <span>{t.prognoseSeite.getilgt}</span>
            <strong>{euro(result.getilgtGesamt)}</strong>
          </div>
          <div>
            <span>{t.prognoseSeite.steuereffektKumuliert}</span>
            <strong>{euro(result.years.reduce((summe, jahr) => summe + jahr.taxEffect, 0))}</strong>
          </div>
        </div>
        <div className="narrative-box">
          <h3>{t.prognoseSeite.erklaerungTitel}</h3>
          {/* Die Einordnung der Einzahlungen steht seit dem 21.09.2026 an der Kachel selbst, nicht mehr hier. */}
          <p>{t.prognoseSeite.erklaerung}</p>
        </div>
        <Fusszeile seite={seitenOffset + 5} sprache={sprache} />
      </section>

      <section className="expose-page table-page">
        <Seitenkopf clientName={input.clientName} marke={marke} sprache={sprache} />
        <span className="eyebrow">{t.tabellenSeite.augenbraue}</span>
        <h2>{t.tabellenSeite.titel}</h2>
        <Cashflowtabelle years={tabellenjahre} compact />
        <h2 className="tax-heading">{t.tabellenSeite.afaTitel}</h2>
        <div className="table-scroll compact-table tax-table">
          <table>
            <thead>
              <tr>
                <th>{t.tabellenSeite.jahr}</th>
                <th>{t.tabellenSeite.afaRegulaer}</th>
                <th>{t.tabellenSeite.sonderAfa}</th>
                <th>{t.tabellenSeite.afaMoebel}</th>
                <th>{t.tabellenSeite.erhaltungsaufwand}</th>
                <th>{t.tabellenSeite.ergebnisVuV}</th>
                <th>{t.tabellenSeite.steuereffekt}</th>
              </tr>
            </thead>
            <tbody>
              {tabellenjahre.map((jahr) => (
                <tr key={jahr.year}>
                  <td>{jahr.year}</td>
                  <td>{euro(jahr.buildingDepreciation)}</td>
                  <td>{euro(jahr.specialDepreciation)}</td>
                  <td>{euro(jahr.furnitureDepreciation)}</td>
                  <td>{euro(jahr.rehabDeduction)}</td>
                  {/*
                    Das ANTEILIGE Ergebnis, so wie es die Rechneransicht schon
                    zeigt. Vorher stand hier das volle Objekt neben dem
                    anteiligen Steuereffekt in derselben Zeile: Bei 50 Prozent
                    ein Verlust von 6.000 neben einer Ersparnis, die zu 3.000
                    gehoert. Wer nachrechnet, kam auf einen Steuersatz, der halb
                    so hoch war wie der Grenzsteuersatz zwei Seiten vorher.
                  */}
                  <td className={jahr.allocatedTaxableResult < 0 ? "negative" : "positive"}>{euro(jahr.allocatedTaxableResult)}</td>
                  <td>{euro(jahr.taxEffect)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result.years.length > tabellenjahre.length && (
          <p className="expose-fineprint">{t.tabellenSeite.ersteJahre(tabellenjahre.length)}</p>
        )}
        <Fusszeile seite={seitenOffset + 6} sprache={sprache} />
      </section>

      {/* Seit dem 07.10.2026, nur mit KfW-Darlehen: jedes Darlehen einzeln, auf eigener Seite, weil die Tabellenseite voll ist. */}
      {kfw && (
        <section className="expose-page table-page loans-page">
          <Seitenkopf clientName={input.clientName} marke={marke} sprache={sprache} />
          <span className="eyebrow">{t.darlehenTabelle.augenbraue}</span>
          <h2>{t.darlehenTabelle.titel}</h2>
          <p className="page-intro">{t.darlehenTabelle.einleitung}</p>
          <Darlehenstabelle years={tabellenjahre} compact />
          {result.years.length > tabellenjahre.length && (
            <p className="expose-fineprint">{t.tabellenSeite.ersteJahre(tabellenjahre.length)}</p>
          )}
          <Fusszeile seite={seitenOffset + 7} sprache={sprache} />
        </section>
      )}

      <section className="expose-page photos-page">
        <Seitenkopf clientName={input.clientName} marke={marke} sprache={sprache} />
        <span className="eyebrow">{t.fotoSeite.augenbraue}</span>
        <h2>{input.propertyTitle}</h2>
        {photos.length > 0 ? (
          <div className={`expose-photo-grid count-${Math.min(photos.length, 6)}`}>
            {photos.map((foto, index) => (
              <div key={`${foto.slice(-20)}-${index}`}>
                <img src={foto} alt={t.fotoSeite.bildAlt(index + 1)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-photo-state">
            <ImagePlus size={32} />
            <span>{t.fotoSeite.keineBilder}</span>
          </div>
        )}
        <div className="legal-note">
          <strong>{t.fotoSeite.hinweisTitel}</strong>
          <p>{t.fotoSeite.hinweis}</p>
        </div>
        <Fusszeile seite={seitenOffset + 7 + zusatzseiten} sprache={sprache} />
      </section>

      {/*
        Seit dem 25.09.2026 die siebte Seite, nach den Bildern: das Glossar.
        Derselbe Inhalt steht einklappbar in der Analyse, beide aus
        kennzahlErklaerungen.ts.
      */}
      <section className="expose-page glossary-page">
        <Seitenkopf clientName={input.clientName} marke={marke} sprache={sprache} />
        <span className="eyebrow">{t.glossarSeite.augenbraue}</span>
        <h2>{kennzahl.glossar.ueberschriftDokument}</h2>
        <Glossar kompakt />
        <Fusszeile seite={seitenOffset + 8 + zusatzseiten} sprache={sprache} />
      </section>
    </>
  );

  // Der Kontext trägt die Sprache in Tabellen, Diagramme, Steuerprofil und Glossar.
  const mitSprache = <RechnerSpracheContext.Provider value={sprache}>{seiten}</RechnerSpracheContext.Provider>;
  if (ohneRahmen) return mitSprache;
  return <div className={`expose-document ${printing ? "printing" : ""}`} lang={sprache}>{mitSprache}</div>;
}

/** Ein Objekt mit allem, was sein Exposé braucht. */
export interface ExposeObjekt {
  input: InvestmentEingabe;
  result: InvestmentErgebnis;
  photos: string[];
  documents: UnterlagenDokument[];
  documentData: UnterlagenDaten;
}

/**
 * Kennzahlen, die auf der kompakten Vergleichsseite stehen, in dieser
 * Reihenfolge. Das PDF zum Herunterladen (berechnungPdf.ts) liest dieselbe Liste.
 */
export const VERGLEICHSSEITE_KENNZAHLEN = [
  "Gesamtkosten",
  "Monatliche Rate",
  "Bruttorendite",
  "Cashflow nach Steuern p. M.",
  "Steuereffekt Jahr 1",
  "Immobilienwert",
  "Restschuld",
  "Gesamtvermögen",
];

/** Die drei Objektangaben, die auf der Vergleichsseite über den Zahlen stehen. */
function objektangaben(input: InvestmentEingabe, sprache: FormatSprache): { label: string; wert: string }[] {
  const t = dokumentTexteFuer(sprache);
  return [
    {
      label: t.deckblatt.wohnflaeche,
      wert: input.area > 0 ? `${formatZahl(input.area, sprache, 3)} m²` : t.unterlagenSeite.keineAngabe,
    },
    { label: t.deckblatt.baujahr, wert: input.constructionYear > 0 ? String(input.constructionYear) : t.unterlagenSeite.keineAngabe },
    { label: kennzahlTexteFuer(sprache).kacheln.kaltmiete, wert: formatEuro(input.monthlyColdRent, sprache) },
  ];
}

/**
 * Kompakte Vergleichsseite, die bei zwei Objekten ganz vorn steht.
 *
 * Sie zeigt beide Objekte nebeneinander, die wichtigsten Kennzahlen
 * gegenübergestellt und die Einordnung in einem Satz. Danach folgt der gewohnte
 * ausführliche Teil je Objekt.
 */
export function ExposeVergleichsseite({
  a,
  b,
  seite,
  sprache = "de",
}: {
  a: ExposeObjekt;
  b: ExposeObjekt;
  seite: number;
  sprache?: FormatSprache;
}) {
  const t = dokumentTexteFuer(sprache).vergleich;
  const objektA: Vergleichsobjekt = { eingabe: a.input, ergebnis: a.result };
  const objektB: Vergleichsobjekt = { eingabe: b.input, ergebnis: b.result };
  const alleZeilen = vergleicheObjekte(objektA, objektB);
  const zeilen = VERGLEICHSSEITE_KENNZAHLEN.map((bezeichnung) =>
    alleZeilen.find((zeile) => zeile.bezeichnung === bezeichnung),
  ).filter((zeile): zeile is Vergleichszeile => zeile !== undefined);
  const laufzeit = Math.min(a.result.years.length, b.result.years.length);
  const letztesJahr = a.result.years[laufzeit - 1]?.year ?? a.input.startYear;
  const titelA = a.input.propertyTitle || t.objektA;
  const titelB = b.input.propertyTitle || t.objektB;

  return (
    <section className="expose-page compare-page">
      <Seitenkopf clientName={a.input.clientName} marke={t.marke} sprache={sprache} />
      <span className="eyebrow">{t.marke}</span>
      <h2>{t.titel}</h2>
      <p className="page-intro">{t.einleitung(sprache === "en" ? jahreEnglisch(laufzeit) : jahreDativ(laufzeit))}</p>
      <div className="compare-cards">
        <Objektkarte
          marke={objektMarke(0, sprache)}
          titel={titelA}
          adresse={a.input.address || t.adresseFehlt}
          preis={formatEuro(a.input.purchasePrice, sprache)}
          seite="a"
          werte={objektangaben(a.input, sprache)}
        />
        <Objektkarte
          marke={objektMarke(1, sprache)}
          titel={titelB}
          adresse={b.input.address || t.adresseFehlt}
          preis={formatEuro(b.input.purchasePrice, sprache)}
          seite="b"
          werte={objektangaben(b.input, sprache)}
        />
      </div>
      <div className="table-scroll compact-table compare-table">
        <table>
          <thead>
            <tr>
              <th>{t.kennzahl}</th>
              <th className="side-a">A · {titelA}</th>
              <th className="side-b">B · {titelB}</th>
              <th>{t.unterschied}</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((zeile) => (
              <tr key={zeile.bezeichnung}>
                <td className="compare-label">
                  {vergleichBezeichnung(zeile.bezeichnung, sprache)}
                  {(zeile.bezeichnung === "Immobilienwert" ||
                    zeile.bezeichnung === "Restschuld" ||
                    zeile.bezeichnung === "Gesamtvermögen") && <small>{t.imJahr(letztesJahr)}</small>}
                </td>
                <td>{formatVergleichswert(zeile.wertA, zeile.einheit, sprache)}</td>
                <td>{formatVergleichswert(zeile.wertB, zeile.einheit, sprache)}</td>
                <td className={zeile.besser === "b" ? "positive" : zeile.besser === "a" ? "negative" : undefined}>
                  {formatUnterschied(zeile.unterschied, zeile.einheit, sprache)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="tax-heading">{t.vermoegenBeider}</h2>
      <Zweireihendiagramm
        jahre={a.result.years.slice(0, laufzeit).map((jahr) => jahr.year)}
        reiheA={a.result.years.slice(0, laufzeit).map((jahr) => jahr.totalWealth)}
        reiheB={b.result.years.slice(0, laufzeit).map((jahr) => jahr.totalWealth)}
        labelA={`A · ${titelA}`}
        labelB={`B · ${titelB}`}
        groesse="flach"
      />
      <div className="expose-verdict">
        <span>{t.einordnung}</span>
        <strong>{einordnung(objektA, objektB, sprache)}</strong>
      </div>
      <p className="expose-fineprint">{t.kleingedruckt}</p>
      <Fusszeile seite={seite} sprache={sprache} />
    </section>
  );
}

/**
 * Exposé für zwei Objekte: die kompakte Vergleichsseite, danach die acht
 * gewohnten Seiten je Objekt, jede mit dem gewählten Deckblatt. Die
 * Seitenzahlen laufen von 1 bis 17 durch.
 */
export function ExposeVergleichsdokument({
  a,
  b,
  printing = false,
  sprache = "de",
  deckblatt = DECKBLATT_STANDARD,
}: {
  a: ExposeObjekt;
  b: ExposeObjekt;
  printing?: boolean;
  sprache?: FormatSprache;
  deckblatt?: DeckblattVariante;
}) {
  const gemeinsam = { printing, ohneRahmen: true, sprache, deckblatt };
  return (
    <div className={`expose-document ${printing ? "printing" : ""}`} lang={sprache}>
      <RechnerSpracheContext.Provider value={sprache}>
        <ExposeVergleichsseite a={a} b={b} seite={1} sprache={sprache} />
      </RechnerSpracheContext.Provider>
      <ExposeDokument {...a} {...gemeinsam} seitenOffset={1} marke={objektMarke(0, sprache)} />
      <ExposeDokument {...b} {...gemeinsam} seitenOffset={1 + seitenJeObjekt(a.result)} marke={objektMarke(1, sprache)} />
    </div>
  );
}
