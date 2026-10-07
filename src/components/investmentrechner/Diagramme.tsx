import type { InvestmentEingabe, InvestmentErgebnis, Jahreswert } from "@/lib/investmentrechner/rechenkern";
import { formatEuro } from "@/lib/investmentrechner/formatierer";
import { useRechnerTexte } from "./RechnerSprache";

/*
 * SVG-Diagramme und Zusammensetzungsbalken des Investmentrechners
 * (Original ge, ye, be). Die Diagramme rechnen ihre Koordinaten selbst aus,
 * damit sie ohne Diagrammbibliothek auskommen und im Druck identisch bleiben.
 */

/** Vermögensentwicklung: Gesamtvermögen und Immobilien-Eigenkapital über die Laufzeit. */
export function Vermoegensdiagramm({ years }: { years: Jahreswert[] }) {
  const { texte } = useRechnerTexte();
  const rand = { top: 20, right: 16, bottom: 35, left: 62 };
  const werte = years.flatMap((jahr) => [jahr.propertyEquity, jahr.totalWealth]);
  const minimum = Math.min(0, ...werte);
  const maximum = Math.max(1, ...werte);
  const spanne = maximum - minimum || 1;
  const x = (index: number) =>
    rand.left + (index / Math.max(1, years.length - 1)) * (760 - rand.left - rand.right);
  const y = (wert: number) => rand.top + ((maximum - wert) / spanne) * (250 - rand.top - rand.bottom);
  const pfad = (feld: "propertyEquity" | "totalWealth") =>
    years.map((jahr, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(jahr[feld])}`).join(" ");
  const rasterlinien = [0, 0.25, 0.5, 0.75, 1].map((anteil) => minimum + spanne * anteil);

  return (
    <div className="chart-wrap" aria-label={texte.diagramm.vermoegensentwicklung}>
      <svg viewBox="0 0 760 250" role="img">
        {rasterlinien.map((wert) => (
          <g key={wert}>
            <line className="grid-line" x1={rand.left} x2={760 - rand.right} y1={y(wert)} y2={y(wert)} />
            <text className="axis-label" x={rand.left - 10} y={y(wert) + 4} textAnchor="end">
              {Math.round(wert / 1e3)}k
            </text>
          </g>
        ))}
        <path className="chart-line chart-line-muted" d={pfad("propertyEquity")} />
        <path className="chart-line chart-line-gold" d={pfad("totalWealth")} />
        {years.map((jahr, index) => (
          <text key={jahr.year} className="axis-label" x={x(index)} y={240} textAnchor="middle">
            {years.length > 12 && index % 2 ? "" : jahr.year}
          </text>
        ))}
      </svg>
      <div className="chart-legend">
        <span>
          <i className="legend-gold" />
          {texte.diagramm.gesamtvermoegen}
        </span>
        <span>
          <i className="legend-green" />
          {texte.diagramm.immobilienEigenkapital}
        </span>
      </div>
    </div>
  );
}

interface ZweireihendiagrammProps {
  /** Jahreszahlen der x-Achse. */
  jahre: number[];
  reiheA: number[];
  reiheB: number[];
  labelA: string;
  labelB: string;
  /**
   * schmal für das halbbreite Kennzahlraster (Original ye), breit für die volle
   * Panelbreite, flach für die Vergleichsseite des Exposés, auf der die Höhe
   * knapp bemessen ist.
   */
  groesse?: Diagrammgroesse;
}

type Diagrammgroesse = "schmal" | "breit" | "flach";

const DIAGRAMMASSE: Record<Diagrammgroesse, { breite: number; hoehe: number; rand: { top: number; right: number; bottom: number; left: number }; jahrY: number }> = {
  schmal: { breite: 420, hoehe: 190, rand: { top: 16, right: 12, bottom: 28, left: 52 }, jahrY: 182 },
  breit: { breite: 760, hoehe: 250, rand: { top: 20, right: 16, bottom: 35, left: 62 }, jahrY: 240 },
  flach: { breite: 760, hoehe: 165, rand: { top: 14, right: 16, bottom: 30, left: 62 }, jahrY: 155 },
};

/**
 * Diagramm mit zwei Reihen (Original ye).
 *
 * Es arbeitet auf blanken Zahlenreihen, damit es sowohl zwei Kennzahlen
 * desselben Objekts als auch dieselbe Kennzahl zweier Objekte zeigen kann.
 */
export function Zweireihendiagramm({ jahre, reiheA, reiheB, labelA, labelB, groesse = "schmal" }: ZweireihendiagrammProps) {
  const { breite, hoehe, rand, jahrY } = DIAGRAMMASSE[groesse];
  const { texte } = useRechnerTexte();
  const werte = [...reiheA, ...reiheB];
  const minimum = Math.min(0, ...werte);
  const maximum = Math.max(1, ...werte);
  const spanne = maximum - minimum || 1;
  const x = (index: number) => rand.left + (index / Math.max(1, jahre.length - 1)) * (breite - rand.left - rand.right);
  const y = (wert: number) => rand.top + ((maximum - wert) / spanne) * (hoehe - rand.top - rand.bottom);
  const pfad = (reihe: number[]) =>
    reihe.map((wert, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(wert)}`).join(" ");
  const rasterlinien = [0, 0.5, 1].map((anteil) => minimum + spanne * anteil);

  return (
    <div className={groesse === "schmal" ? "mini-chart" : "chart-wrap"}>
      <svg viewBox={`0 0 ${breite} ${hoehe}`} role="img" aria-label={`${labelA} ${texte.diagramm.und} ${labelB}`}>
        {rasterlinien.map((wert) => (
          <g key={wert}>
            <line className="grid-line" x1={rand.left} x2={breite - rand.right} y1={y(wert)} y2={y(wert)} />
            <text className="axis-label" x={rand.left - 8} y={y(wert) + 4} textAnchor="end">
              {Math.round(wert / 1e3)}k
            </text>
          </g>
        ))}
        <path className="chart-line chart-line-gold" d={pfad(reiheA)} />
        <path className="chart-line chart-line-muted" d={pfad(reiheB)} />
        {jahre.map((jahr, index) => (
          <text key={jahr} className="axis-label" x={x(index)} y={jahrY} textAnchor="middle">
            {jahre.length > 12 && index % 2 ? "" : jahr}
          </text>
        ))}
      </svg>
      <div className="chart-legend">
        <span>
          <i className="legend-gold" />
          {labelA}
        </span>
        <span>
          <i className="legend-green" />
          {labelB}
        </span>
      </div>
    </div>
  );
}

interface MinidiagrammProps {
  years: Jahreswert[];
  seriesA: (jahr: Jahreswert) => number;
  seriesB: (jahr: Jahreswert) => number;
  labelA: string;
  labelB: string;
}

/** Zwei Kennzahlen desselben Objekts über die Laufzeit. */
export function Minidiagramm({ years, seriesA, seriesB, labelA, labelB }: MinidiagrammProps) {
  return (
    <Zweireihendiagramm
      jahre={years.map((jahr) => jahr.year)}
      reiheA={years.map(seriesA)}
      reiheB={years.map(seriesB)}
      labelA={labelA}
      labelB={labelB}
    />
  );
}

interface ZusammensetzungProps {
  input: InvestmentEingabe;
  result: InvestmentErgebnis;
}

/** Aufteilung des modellierten Vermögenszuwachses als Balken mit Legende (Original be). */
export function Zusammensetzung({ input, result }: ZusammensetzungProps) {
  const { sprache, texte } = useRechnerTexte();
  const letztesJahr = result.years[result.years.length - 1];
  const anteile = [
    { label: texte.diagramm.eigenkapital, value: Math.max(0, input.equity), className: "composition-equity" },
    { label: texte.diagramm.tilgung, value: Math.max(0, result.getilgtGesamt), className: "composition-principal" },
    // Der KfW-Zuschuss senkt die Restschuld ohne Zahlung des Kunden, deshalb ein eigener Teil, nur wenn es ihn gibt.
    ...(result.tilgungszuschussPrognose > 0
      ? [{ label: texte.diagramm.tilgungszuschuss, value: result.tilgungszuschussPrognose, className: "composition-grant" }]
      : []),
    {
      label: texte.diagramm.wertzuwachs,
      // Die reine Steigerung des Immobilienanteils aus dem Rechenkern, anteilig wie alles hier.
      value: Math.max(0, letztesJahr.wertzuwachs),
      className: "composition-value",
    },
    { label: texte.diagramm.steuereffekt, value: Math.max(0, result.cumulativeTaxEffect), className: "composition-tax" },
  ];
  const summe = Math.max(
    1,
    anteile.reduce((zwischensumme, anteil) => zwischensumme + anteil.value, 0),
  );

  return (
    <div className="composition-wrap">
      <div className="composition-bar" aria-label={texte.diagramm.zusammensetzung}>
        {anteile.map((anteil) => (
          <span
            key={anteil.label}
            className={anteil.className}
            style={{ width: `${(anteil.value / summe) * 100}%` }}
            title={`${anteil.label}: ${formatEuro(anteil.value, sprache)}`}
          />
        ))}
      </div>
      <div className="composition-legend">
        {anteile.map((anteil) => (
          <span key={anteil.label}>
            <i className={anteil.className} />
            <small>{anteil.label}</small>
            <strong>{formatEuro(anteil.value, sprache)}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
