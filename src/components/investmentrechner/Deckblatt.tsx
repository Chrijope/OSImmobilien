import { useId, type ReactNode } from "react";
import logoImg from "@/assets/moreimmo-logo.png";
import type { InvestmentEingabe, InvestmentErgebnis } from "@/lib/investmentrechner/rechenkern";
import type { UnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import { formatEuro, formatEuroCent, formatProzent, formatProzentEineStelle, formatZahl } from "@/lib/investmentrechner/formatierer";
import { dokumentTexteFuer, type Kernsatzteil } from "@/lib/investmentrechner/dokumentTexte";
import { kennzahlTexteFuer } from "@/lib/investmentrechner/kennzahlTexte";
import { deckblattWerte, type DeckblattVariante, type DeckblattWerte } from "@/lib/investmentrechner/deckblattWerte";
import { SPRACH_LOCALE, datumText, type FormatSprache } from "@/lib/sprachFormat";
import { kaufpreiszeilen } from "./Auswertungen";
import { mitVorzeichen } from "./Felder";

/*
 * Die beiden Deckblätter der Berechnung, seit dem 07.10.2026. Der Berater
 * wählt im Rechner unter „Berechnung“, mit welchem er die Objektvorstellung
 * beginnt; die Seiten danach sind für beide gleich.
 *
 * Vorlage sind Christians Entwürfe „IDEE 1“ und „IDEE 2“. Gebaut wie die
 * übrigen Druckseiten als HTML, damit der Download sie mit derselben Technik
 * fotografiert. Alle Zahlen kommen aus `deckblattWerte`, also aus der
 * Jahrestabelle des Rechenkerns.
 */

export interface DeckblattProps {
  input: InvestmentEingabe;
  result: InvestmentErgebnis;
  photos: string[];
  documentData: UnterlagenDaten;
  sprache: FormatSprache;
  /** Kennzeichnung im Vergleich, etwa „Objekt A“. */
  marke?: string;
  fusszeile: ReactNode;
}

function formate(sprache: FormatSprache) {
  return {
    euro: (wert: number) => formatEuro(wert, sprache),
    euroCent: (wert: number) => formatEuroCent(wert, sprache),
    prozentZahl: (wert: number) => {
      const zahl = formatZahl(wert, sprache, 2);
      return sprache === "en" ? `${zahl}%` : `${zahl} %`;
    },
  };
}

function Kopf({ input, marke, sprache }: Pick<DeckblattProps, "input" | "marke" | "sprache">) {
  const d = dokumentTexteFuer(sprache).deckblaetter;
  const zeile = d.kalkulationVom(datumText(new Date(), sprache));
  const name = input.clientName.trim();
  return (
    <div className="expose-brand-row">
      <div className="brand-lockup dark-text">
        <img className="brand-logo expose-logo" src={logoImg} alt="MORE Immo" />
      </div>
      <div className="client-block">
        {name && <strong>{d.fuer(name)}</strong>}
        <span>{marke ? `${marke} · ${zeile}` : zeile}</span>
      </div>
    </div>
  );
}

function Objektband({
  input,
  result,
  photos,
  sprache,
  unterzeile,
}: Pick<DeckblattProps, "input" | "result" | "photos" | "sprache"> & { unterzeile: string }) {
  const t = dokumentTexteFuer(sprache);
  // Dieselbe erste Zeile wie in den Kaufpreisdetails, Betrag und Beschriftung.
  const kaufpreis = kaufpreiszeilen(result, sprache)[0];
  return (
    <div
      className={`expose-hero ${photos[0] ? "has-image" : ""}`}
      style={
        photos[0]
          ? { backgroundImage: `linear-gradient(90deg, rgba(15,22,33,.94), rgba(15,22,33,.54)), url(${photos[0]})` }
          : undefined
      }
    >
      <div>
        {input.propertyType && <span>{input.propertyType}</span>}
        <h1>{input.propertyTitle || t.kopf.investmentobjekt}</h1>
        {unterzeile && <p>{unterzeile}</p>}
      </div>
      <div className="hero-price">
        <strong>{kaufpreis.wert}</strong>
        <span>{kaufpreis.label}</span>
      </div>
    </div>
  );
}

function Kernsatz({ teile }: { teile: Kernsatzteil[] }) {
  return (
    <p className="db-kernsatz">
      {teile.map((teil, index) => (
        <span key={index} className={teil.ton ? `db-ton-${teil.ton}` : undefined}>
          {teil.text}
        </span>
      ))}
    </p>
  );
}

function Kachel({ label, wert, notiz, ton }: { label: string; wert: string; notiz?: ReactNode; ton?: "blau" | "gruen" }) {
  return (
    <div>
      <span>{label}</span>
      {wert && <strong className={ton ? `db-ton-${ton}` : undefined}>{wert}</strong>}
      {notiz && <small>{notiz}</small>}
    </div>
  );
}

function Monatszeile({
  label,
  wert,
  art,
  gruen = false,
}: {
  label: string;
  wert: string;
  art?: "eingerueckt" | "leise" | "summe" | "schnitt";
  /** Betrag grün, etwa eine Ersparnis oder ein Überschuss. */
  gruen?: boolean;
}) {
  return (
    <div className={["db-zeile", art ? `db-zeile-${art}` : "", gruen ? "db-zeile-gruen" : ""].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <b>{wert}</b>
    </div>
  );
}

/** Variante 1: „Ergebnis auf einen Blick“. */
export function DeckblattAufEinenBlick({ input, result, photos, documentData, sprache, marke, fusszeile }: DeckblattProps) {
  const t = dokumentTexteFuer(sprache);
  const d = t.deckblaetter;
  const { euro } = formate(sprache);

  const eckdaten: { label: string; wert: string }[] = [];
  if (input.area > 0) eckdaten.push({ label: t.deckblatt.wohnflaeche, wert: `${formatZahl(input.area, sprache, 3)} m²` });
  if (input.rooms > 0) eckdaten.push({ label: t.deckblatt.zimmer, wert: formatZahl(input.rooms, sprache, 3) });
  if (input.constructionYear > 0) eckdaten.push({ label: t.deckblatt.baujahr, wert: String(input.constructionYear) });
  if (documentData.energyClass) eckdaten.push({ label: t.deckblatt.energieklasse, wert: documentData.energyClass });
  eckdaten.push({ label: d.kaltmiete, wert: euro(result.effectiveAnnualRent / 12) });
  eckdaten.push({ label: d.bruttorendite, wert: formatProzent(result.grossYield, sprache) });

  return (
    <section className="expose-page deckblatt-page deckblatt-blick">
      <Kopf input={input} marke={marke} sprache={sprache} />
      <Objektband input={input} result={result} photos={photos} sprache={sprache} unterzeile={input.address} />
      <div className="object-facts db-eckdaten">
        {eckdaten.map((eintrag) => (
          <span key={eintrag.label}>
            <small>{eintrag.label}</small>
            <strong>{eintrag.wert}</strong>
          </span>
        ))}
      </div>
      <ErgebnisAufEinenBlick input={input} result={result} sprache={sprache} />
      {fusszeile}
    </section>
  );
}

/** Was beide Ergebnisteile brauchen. Die Analyse reicht hier immer Deutsch herein. */
export interface ErgebnisProps {
  input: InvestmentEingabe;
  result: InvestmentErgebnis;
  sprache: FormatSprache;
}

/**
 * Der Ergebnisteil von Variante 1: Kernsatz, drei Kacheln, der Monat, das
 * Vermögen und die Steuervorteile. Steht auf dem Deckblatt und, seit dem
 * 07.10.2026, auch oben in der Analyse, damit Bildschirm und PDF dasselbe zeigen.
 */
export function ErgebnisAufEinenBlick({ input, result, sprache }: ErgebnisProps) {
  const d = dokumentTexteFuer(sprache).deckblaetter;
  const k = kennzahlTexteFuer(sprache);
  const { euro, euroCent, prozentZahl } = formate(sprache);
  const w = deckblattWerte(input, result);
  const { monat, letztes } = w;
  const anzahl = w.jahre.length;
  const ekr = w.eigenkapitalrendite;

  const kernsatz =
    w.zuzahlungMonat !== null
      ? d.kernsatzZuzahlung(euro(w.zuzahlungMonat), euro(w.vermoegensaufbauMonat))
      : d.kernsatzSelbsttragend(euro(w.vermoegensaufbauMonat));

  const balkenMax = Math.max(1, letztes.propertyValue, letztes.remainingDebt, letztes.propertyEquity, w.selbstEingezahlt);
  const balken: { label: string; wert: number; klasse: string }[] = [
    { label: d.immobilienwert, wert: letztes.propertyValue, klasse: "wert" },
    { label: d.restschuld, wert: letztes.remainingDebt, klasse: "schuld" },
    { label: d.deinAnteil, wert: letztes.propertyEquity, klasse: "anteil" },
    { label: d.selbstEingezahlt, wert: w.selbstEingezahlt, klasse: "eingezahlt" },
  ];
  // Ohne Nachrangdarlehen gehören Zins und Tilgung eindeutig zu einer Rate; mit KfW zählt der Mischzins.
  const kreditrate =
    result.kfwLoanAmount > 0
      ? d.kreditrateMischzins(formatProzent(result.mischzins, sprache))
      : input.juniorLoanAmount > 0
        ? d.kreditrateOhneSaetze
        : d.kreditrate(prozentZahl(input.seniorInterestRate), prozentZahl(input.seniorRepaymentRate));
  const sprung = result.rateSprung;

  return (
    <>
      <div className="db-kern">
        <span className="eyebrow">{d.augenbraue}</span>
        <Kernsatz teile={kernsatz} />
      </div>

      <div className="db-kacheln">
        <Kachel
          label={d.kachelCashflow}
          wert={mitVorzeichen(monat.nachSteuer, euroCent)}
          ton={monat.nachSteuer >= 0 ? "gruen" : undefined}
          notiz={
            w.nachSteuerAbJahr2 !== null ? (
              <b className="db-ab-jahr-2">{d.kachelCashflowNotiz(mitVorzeichen(w.nachSteuerAbJahr2, euroCent), anzahl)}</b>
            ) : (
              k.zusaetze.imMonat
            )
          }
        />
        <Kachel label={d.kachelAufbau} wert={euro(w.vermoegensaufbauMonat)} ton="gruen" notiz={
            w.jahre.some((j) => j.darlehen.kfw.tilgungszuschuss > 0) ? d.kachelAufbauNotizZuschuss(anzahl) : d.kachelAufbauNotiz(anzahl)
          }
        />
        <Kachel
          label={k.kacheln.eigenkapitalrendite}
          wert={ekr.rendite !== null ? formatProzentEineStelle(ekr.rendite, sprache) : ""}
          ton="gruen"
          notiz={ekr.rendite !== null ? d.kachelEkrNotiz(euro(ekr.nenner)) : k.zusaetze.eigenkapitalrenditeNichtBestimmbar}
        />
      </div>

      <div className="db-spalten">
        <div className="db-monat">
          <h3>{d.monatTitel}</h3>
          <p className="db-unterzeile">{d.monatUntertitel}</p>
          <Monatszeile label={d.kaltmiete} wert={mitVorzeichen(monat.miete, euroCent)} />
          <Monatszeile label={kreditrate} wert={mitVorzeichen(monat.rate, euroCent)} />
          <Monatszeile label={d.davonTilgung} wert={euroCent(monat.tilgung)} art="eingerueckt" />
          <Monatszeile label={d.kosten} wert={mitVorzeichen(monat.kosten, euroCent)} />
          <Monatszeile label={d.vorSteuer} wert={mitVorzeichen(monat.vorSteuer, euroCent)} art="leise" />
          <Monatszeile
            label={monat.steuer >= 0 ? d.steuerErsparnis : d.steuerMehr}
            wert={mitVorzeichen(monat.steuer, euroCent)}
            gruen={monat.steuer > 0}
          />
          <Monatszeile
            label={d.nachSteuer}
            wert={mitVorzeichen(monat.nachSteuer, euroCent)}
            art="summe"
            gruen={monat.nachSteuer > 0}
          />
          {w.nachSteuerAbJahr2 !== null && (
            <Monatszeile
              label={d.abJahr2(anzahl)}
              wert={`Ø ${mitVorzeichen(w.nachSteuerAbJahr2, euroCent)}`}
              art="schnitt"
              gruen={w.nachSteuerAbJahr2 > 0}
            />
          )}
          <p className="db-fussnote">{d.monatFussnote}</p>
          {sprung && (
            <p className="db-fussnote">{d.rateSteigt(sprung.jahr, sprung.kalenderjahr, euroCent(sprung.rateNachher))}</p>
          )}
        </div>

        <div className="db-vermoegen">
          <h3>{d.vermoegenTitel(letztes.year)}</h3>
          <p className="db-unterzeile">{d.vermoegenUntertitel(anzahl, prozentZahl(input.annualValueGrowth))}</p>
          {balken.map((eintrag) => (
            <div key={eintrag.klasse} className="db-balkenzeile">
              <span>{eintrag.label}</span>
              <i className="db-balken">
                <i
                  className={`db-balken-${eintrag.klasse}`}
                  style={{ width: `${(Math.max(0, eintrag.wert) / balkenMax) * 100}%` }}
                />
              </i>
              <b>{euro(eintrag.wert)}</b>
            </div>
          ))}
          <div className="db-bleibt">
            <span>{d.fuerDichBleibt}</span>
            <strong>{euro(w.fuerDichBleibt)}</strong>
            <small>
              {w.ueberschuesse >= 0.5
                ? d.bleibtRechnungMitUeberschuss(euro(letztes.propertyEquity), euro(w.selbstEingezahlt), euro(w.ueberschuesse))
                : d.bleibtRechnung(euro(letztes.propertyEquity), euro(w.selbstEingezahlt))}
            </small>
          </div>
        </div>
      </div>

      <div className="db-steuerkaesten">
        <div className={w.steuerErstesJahr < 0 ? "negativ" : ""}>
          <strong>{mitVorzeichen(w.steuerErstesJahr, euro)}</strong>
          <span>{w.steuerErstesJahr >= 0 ? d.steuerErstesJahr : d.steuerwirkungErstesJahr}</span>
        </div>
        <div className={w.steuerSumme < 0 ? "negativ" : ""}>
          <strong>{mitVorzeichen(w.steuerSumme, euro)}</strong>
          <span>{w.steuerSumme >= 0 ? d.steuerGesamt(anzahl) : d.steuerwirkungGesamt(anzahl)}</span>
        </div>
      </div>
    </>
  );
}

/** Schritt fürs Raster: 1, 2, 2,5 oder 5 mal eine Zehnerpotenz, rund fünf Linien. */
function rasterschritt(spanne: number): number {
  const roh = Math.max(spanne, 1) / 5;
  const potenz = 10 ** Math.floor(Math.log10(roh));
  return ([1, 2, 2.5, 5, 10].find((m) => m * potenz >= roh) ?? 10) * potenz;
}

/** Fläche „Dein Anteil“ und Säulen „selbst eingezahlt“ über die gezeigten Jahre. */
function Anteilsdiagramm({ werte, sprache }: { werte: DeckblattWerte; sprache: FormatSprache }) {
  const d = dokumentTexteFuer(sprache).deckblaetter;
  const breite = 760;
  const hoehe = 230;
  const rand = { oben: 12, rechts: 14, unten: 26, links: 58 };
  const anteile = werte.jahre.map((j) => j.propertyEquity);
  const eingezahlt = werte.jahre.map((j) => j.cumulativeEigenanteil);
  const schritt = rasterschritt(Math.max(...anteile, ...eingezahlt, 1) - Math.min(0, ...anteile));
  const unten = Math.floor(Math.min(0, ...anteile) / schritt) * schritt;
  const oben = Math.ceil(Math.max(1, ...anteile, ...eingezahlt) / schritt) * schritt;
  const band = (breite - rand.links - rand.rechts) / werte.jahre.length;
  const x = (index: number) => rand.links + band * (index + 0.5);
  const y = (wert: number) => rand.oben + ((oben - wert) / (oben - unten || 1)) * (hoehe - rand.oben - rand.unten);
  const linie = anteile.map((wert, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(wert)}`).join(" ");
  const flaeche = `${linie} L${x(anteile.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const raster: number[] = [];
  for (let wert = unten; wert <= oben + schritt / 2; wert += schritt) raster.push(wert);
  const tausend = (wert: number) => d.tausendEuro(formatZahl(wert / 1000, sprache, 0));

  return (
    <div className="db-diagramm">
      <svg viewBox={`0 0 ${breite} ${hoehe}`} role="img" aria-label={d.diagrammTitel}>
        {raster.map((wert) => (
          <g key={wert}>
            <line className="db-raster" x1={rand.links} x2={breite - rand.rechts} y1={y(wert)} y2={y(wert)} />
            <text className="db-achse" x={rand.links - 8} y={y(wert) + 4} textAnchor="end">
              {tausend(wert)}
            </text>
          </g>
        ))}
        <path className="db-flaeche" d={flaeche} />
        {eingezahlt.map((wert, index) =>
          wert > 0 ? (
            <rect
              key={index}
              className="db-saeule"
              x={x(index) - band * 0.18}
              width={band * 0.36}
              y={y(wert)}
              height={Math.max(0, y(0) - y(wert))}
              rx={3}
            />
          ) : null,
        )}
        <path className="db-linie" d={linie} />
        <circle className="db-punkt" cx={x(anteile.length - 1)} cy={y(anteile[anteile.length - 1])} r={5} />
        {werte.jahre.map((jahr, index) => (
          <text key={jahr.year} className="db-achse" x={x(index)} y={hoehe - 6} textAnchor="middle">
            {jahr.year}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** Variante 2: „Jahr für Jahr“. */
export function DeckblattJahrFuerJahr({ input, result, photos, documentData, sprache, marke, fusszeile }: DeckblattProps) {
  const d = dokumentTexteFuer(sprache).deckblaetter;
  const unterzeile = [
    input.address,
    input.area > 0 ? `${formatZahl(input.area, sprache, 3)} m²` : "",
    input.rooms > 0 ? d.zimmerAnzahl(formatZahl(input.rooms, sprache, 3)) : "",
    input.constructionYear > 0 ? d.baujahrText(input.constructionYear) : "",
    documentData.energyClass ? d.energieklasseText(documentData.energyClass) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="expose-page deckblatt-page deckblatt-jahre">
      <Kopf input={input} marke={marke} sprache={sprache} />
      <Objektband input={input} result={result} photos={photos} sprache={sprache} unterzeile={unterzeile} />
      <ErgebnisJahrFuerJahr input={input} result={result} sprache={sprache} />
      {fusszeile}
    </section>
  );
}

/**
 * Der Ergebnisteil von Variante 2: drei Kacheln, die Vermögenskurve und die
 * Tabelle Jahr für Jahr. Auf dem Deckblatt und oben in der Analyse.
 */
export function ErgebnisJahrFuerJahr({ input, result, sprache }: ErgebnisProps) {
  const d = dokumentTexteFuer(sprache).deckblaetter;
  const { euro, euroCent } = formate(sprache);
  const w = deckblattWerte(input, result);
  const { letztes } = w;
  const anzahl = w.jahre.length;
  const sp = d.spalten;

  const jeEuro = new Intl.NumberFormat(SPRACH_LOCALE[sprache], {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  // Wirkt der Erhaltungsaufwand nur im ersten Jahr, nennt die Fußnote ihn; sonst bleibt sie allgemein.
  const erhaltungNurJahr1 = (w.jahre[0]?.rehabDeduction ?? 0) > 0 && (w.jahre[1]?.rehabDeduction ?? 0) === 0;

  return (
    <>
      <div className="db-kacheln">
        <Kachel label={d.kachelVermoegen(letztes.year)} wert={euro(letztes.propertyEquity)} ton="gruen" notiz={d.kachelVermoegenNotiz} />
        <Kachel label={d.kachelEingezahlt(anzahl)} wert={euro(w.selbstEingezahlt)} ton="blau" notiz={d.kachelEingezahltNotiz(anzahl)} />
        {w.jeEingezahltemEuro !== null ? (
          <Kachel label={d.kachelJeEuro} wert={jeEuro.format(w.jeEingezahltemEuro)} ton="gruen" notiz={d.kachelJeEuroNotiz} />
        ) : (
          <Kachel
            label={d.kachelCashflowSchnitt}
            wert={mitVorzeichen(w.nachSteuerSchnitt, euroCent)}
            ton={w.nachSteuerSchnitt >= 0 ? "gruen" : undefined}
            notiz={d.kachelCashflowSchnittNotiz(anzahl)}
          />
        )}
      </div>

      <h3 className="db-abschnitt">{d.diagrammTitel}</h3>
      <p className="db-unterzeile">{d.diagrammUntertitel}</p>
      <Anteilsdiagramm werte={w} sprache={sprache} />

      <h3 className="db-abschnitt">{d.tabelleTitel}</h3>
      <p className="db-unterzeile">{d.tabelleUntertitel}</p>
      {/* Die Hülle scrollt nur am schmalen Bildschirm der Analyse, siehe Stylesheet. */}
      <div className="db-tabelle-huelle">
      <table className="db-tabelle">
        <thead>
          <tr>
            {[sp.jahr, sp.miete, sp.rate, sp.kosten, sp.vorSteuer, sp.steuer, sp.nachSteuer, sp.tilgung, sp.restschuld, sp.wert, sp.anteil].map(
              (titel) => (
                <th key={titel}>{titel}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {w.jahre.map((j, index) => (
            <tr key={j.year} className={index === 0 ? "db-jahr-eins" : undefined}>
              <td>{j.year}</td>
              <td>{euro(j.effectiveRent / 12)}</td>
              <td>{mitVorzeichen(-j.debtService / 12, euro)}</td>
              <td>{mitVorzeichen(-(j.operatingCosts + j.reserveContribution) / 12, euro)}</td>
              <td>{mitVorzeichen(j.cashflowBeforeTax / 12, euroCent)}</td>
              <td className={j.taxEffect > 0 ? "db-ton-gruen" : undefined}>{mitVorzeichen(j.taxEffect / 12, euroCent)}</td>
              <td className={`db-fett ${j.cashflowAfterTax >= 0 ? "db-ton-gruen" : ""}`}>{mitVorzeichen(j.cashflowAfterTax / 12, euroCent)}</td>
              <td>{euro(j.principal / 12)}</td>
              <td>{euro(j.remainingDebt)}</td>
              <td>{euro(j.propertyValue)}</td>
              <td className="db-fett db-ton-blau">{euro(j.propertyEquity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="db-fussnote">
        {erhaltungNurJahr1 ? d.tabelleFussnoteErhaltung(euro(w.jahre[0].rehabDeduction)) : d.tabelleFussnote}
        {result.rateSprung &&
          ` ${d.rateSteigt(result.rateSprung.jahr, result.rateSprung.kalenderjahr, euroCent(result.rateSprung.rateNachher))}`}
      </p>
    </>
  );
}

/**
 * Die Wahl des Deckblatts, unter „Berechnung“ und oben in der Analyse.
 * Beide lesen und schreiben denselben Zustand, die Wahl ist also immer gleich.
 */
export function DeckblattWahl({
  wert,
  onWahl,
  hinweis,
}: {
  wert: DeckblattVariante;
  onWahl: (variante: DeckblattVariante) => void;
  hinweis: string;
}) {
  const titelId = useId();
  return (
    <div className="deckblatt-wahl">
      <span id={titelId}>Deckblatt</span>
      <div className="view-toggle" role="radiogroup" aria-labelledby={titelId}>
        {(
          [
            ["blick", "Ergebnis auf einen Blick"],
            ["jahre", "Jahr für Jahr"],
          ] as const
        ).map(([variante, beschriftung]) => (
          <button
            key={variante}
            type="button"
            role="radio"
            aria-checked={wert === variante}
            className={wert === variante ? "active" : ""}
            onClick={() => onWahl(variante)}
          >
            {beschriftung}
          </button>
        ))}
      </div>
      <small>{hinweis}</small>
    </div>
  );
}
