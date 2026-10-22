import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FileDown } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  ausgewiesenerKaufpreis,
  bankplan,
  bankplanParameter,
  berechneInvestment,
  eigenkapitalrendite,
  mitStellplatz,
  monateErstesJahr,
  type InvestmentEingabe,
  type InvestmentErgebnis,
  type Jahreswert,
} from "@/lib/investmentrechner/rechenkern";
import { ExposeVorschau } from "./ExposeVorschau";
import "./ausfuehrlicheBerechnung.css";

/*
 * „Berechnung (ausführlich)“: zwölf A4-Seiten für den Kunden, in CRM und
 * Artefakt dieselbe Komponente (seit dem 22.10.2026).
 *
 * Herkunft: Sie entstand zuerst nur in der eigenständigen Artefaktfassung
 * des Rechners und lag nicht im Repository. Am 22.10.2026 aus der
 * veröffentlichten Fassung übernommen, sprachlich geprüft und an den
 * Umbau des Rechenkerns angeglichen: monatliche Darlehen, Anschluss und
 * Umschuldung, Tilgungsarten, § 7b mit Obergrenzen, AfA nach dem
 * Begünstigungszeitraum, Erwerbsmonat, Möbel bis zum Restbuchwert, Wohnung
 * und Stellplatz getrennt, beide Sanierungsfälle mit 15-Prozent-Grenze,
 * interner Zinsfuß, Verkaufskosten und Grenzen des Modells.
 *
 * Gerechnet wird hier nichts Neues. Alle Zahlen kommen aus dem Ergebnis des
 * Rechenkerns, nur Monatswerte und Summen werden daraus gebildet.
 *
 * Anrede: Sie, wie in der Beratungspräsentation.
 */

const SEITEN = 12;
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

const zahlText = (wert: number, stellen = 0) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen }).format(Math.abs(wert) < 0.005 ? 0 : wert);
const euro = (wert: number, stellen = 0) => `${zahlText(wert, stellen)} €`;
/** Betrag mit Vorzeichen, das Minus als Rechenzeichen U+2212. */
const mitZeichen = (wert: number, stellen = 0) => `${wert > 0.005 ? "+ " : wert < -0.005 ? "− " : ""}${euro(Math.abs(wert), stellen)}`;
/** Prozentwert, der schon in Prozent vorliegt (etwa 4,8 für 4,8 %). */
const prozent = (wert: number, stellen = 2) => `${zahlText(wert, stellen)} %`;
const tonKlasse = (wert: number) => (wert < -0.005 ? "ba-neg" : "ba-pos");

/** Abschreibungen eines Jahres zusammen: Gebäude, Sonder-AfA, Möbel. */
const afaGesamt = (j: Jahreswert) => j.buildingDepreciation + j.specialDepreciation + j.furnitureDepreciation;
/** Sofort abziehbare Werbungskosten: Finanzierung im ersten Jahr, Umschuldung, Erhaltungsaufwand. */
const werbungskosten = (j: Jahreswert) => j.financingCostDeduction + (j.umschuldungskosten ?? 0) + j.rehabDeduction;
/** Laufende Kosten, wie sie im steuerlichen Ergebnis stehen: der Rest bis zum Ergebnis. */
const laufendeKosten = (j: Jahreswert) => j.effectiveRent - j.interest - afaGesamt(j) - werbungskosten(j) - j.taxableResult;

interface Darlehenszeile {
  name: string;
  betrag: number;
  zins: number | null;
  tilgung: string;
  rateMonat: number;
  zinsbindung: number | null;
}

/** Alle Zahlen der zwölf Seiten an einer Stelle, aus Eingabe und Ergebnis. */
export function ausfuehrlicheWerte(input: InvestmentEingabe, result: InvestmentErgebnis) {
  const jahre = result.years;
  const erstes = jahre[0];
  const letztes = jahre[jahre.length - 1];
  const ersteMonate = monateErstesJahr(result);
  const ekr = eigenkapitalrendite(input, result);
  const anteil = result.anteil > 0 ? result.anteil : 1;

  const saetze: [string, number][] = [
    ["Grunderwerbsteuer", input.transferTaxRate],
    ["Notar", input.notaryRate],
    ["Grundbuch", input.landRegisterRate],
    ["Makler", input.brokerRate],
    ["Sonstiges", input.otherPurchaseCostRate],
  ];
  const summeSaetze = saetze.reduce((s, [, satz]) => s + (satz || 0), 0);
  const nebenkosten = saetze
    .filter(([, satz]) => satz > 0)
    .map(([name, satz]) => ({ name, satz, betrag: summeSaetze > 0 ? (result.purchaseCosts * satz) / summeSaetze : 0 }));

  // Erste Monatsrate: bei Bank und zweitem Darlehen aus dem Plan, sonst der Schnitt des ersten Jahres.
  const ersteRate = (art: "bank" | "bank2", betrag: number) =>
    bankplan({ ...bankplanParameter(input, art, betrag, anteil), jahre: 1, startMonat: input.acquisitionMonth }).ersteRate;
  const schnittErstesJahr = (art: "kfw" | "nachrang") => (erstes?.darlehen?.[art]?.payment ?? 0) / ersteMonate;
  const tilgungText = (art: string | undefined, satz: number, laufzeit: number, anlauf: number) => {
    const basis =
      art === "volltilgung" && laufzeit > 0
        ? `Volltilgung in ${laufzeit} Jahren`
        : art === "endfaellig"
          ? laufzeit > 0 ? `endfällig nach ${laufzeit} Jahren` : "endfällig, nur Zinsen"
          : prozent(satz);
    return anlauf > 0 ? `${basis}, ${anlauf} Jahre tilgungsfrei` : basis;
  };
  const darlehen: Darlehenszeile[] = [];
  if (result.seniorLoanAmount > 0) {
    darlehen.push({
      name: "Bankdarlehen",
      betrag: result.seniorLoanAmount,
      zins: input.seniorInterestRate,
      tilgung: tilgungText(input.seniorRepaymentType, input.seniorRepaymentRate, input.seniorTermYears, input.seniorGracePeriodYears),
      rateMonat: ersteRate("bank", result.seniorLoanAmount),
      zinsbindung: input.seniorFixedRateYears || null,
    });
  }
  if (result.secondLoanAmount > 0) {
    darlehen.push({
      name: "Zweites Bankdarlehen",
      betrag: result.secondLoanAmount,
      zins: input.secondInterestRate,
      tilgung: tilgungText(input.secondRepaymentType, input.secondRepaymentRate, input.secondTermYears, input.secondGracePeriodYears),
      rateMonat: ersteRate("bank2", result.secondLoanAmount),
      zinsbindung: input.secondFixedRateYears || null,
    });
  }
  if (result.kfwLoanAmount > 0) {
    darlehen.push({
      name: `KfW${input.kfwProgram ? ` ${input.kfwProgram}` : ""}`,
      betrag: result.kfwLoanAmount,
      zins: input.kfwInterestRate,
      tilgung: result.kfwAnlaufJahre > 0 ? `Annuität, ${result.kfwAnlaufJahre} Jahre tilgungsfrei` : "Annuität",
      rateMonat: schnittErstesJahr("kfw"),
      zinsbindung: input.kfwFixedRateYears || null,
    });
  }
  const nachrang = result.totalDebt - result.seniorLoanAmount - result.kfwLoanAmount - result.secondLoanAmount;
  if (nachrang > 0.005) {
    darlehen.push({
      name: "Nachrangdarlehen",
      betrag: nachrang,
      zins: input.juniorInterestRate,
      tilgung: prozent(input.juniorRepaymentRate),
      rateMonat: schnittErstesJahr("nachrang"),
      zinsbindung: null,
    });
  }
  const darlehenSumme = darlehen.reduce((s, d) => s + d.betrag, 0);
  const zinsMittel = darlehenSumme > 0 ? darlehen.reduce((s, d) => s + d.betrag * (d.zins ?? 0), 0) / darlehenSumme : 0;

  // Monatswerte des ersten Jahres, seit dem 22.10.2026 auf seine Monate ab dem Übergang bezogen.
  const jeMonat = (wert: number) => wert / ersteMonate;
  const monat = erstes
    ? {
        miete: jeMonat(erstes.effectiveRent),
        steuer: jeMonat(erstes.taxEffect),
        rate: jeMonat(erstes.debtService),
        kosten: jeMonat(erstes.operatingCosts + erstes.reserveContribution + (erstes.umschuldungskosten ?? 0)),
        vorSteuer: jeMonat(erstes.cashflowBeforeTax),
        nachSteuer: jeMonat(erstes.cashflowAfterTax),
      }
    : null;

  /*
    Stichjahre 10, 20 und 30: eine eigene Rechnung über 30 Jahre mit denselben
    Annahmen. Erlös bei Verkauf ist Wertzuwachs plus getilgter Betrag, seit
    dem 22.10.2026 abzüglich der Verkaufskosten.
  */
  const verkaufskostenSatz = Math.max(0, input.saleCostRate || 0) / 100;
  const lang = berechneInvestment({ ...input, forecastYears: 30 });
  const erloes = (j: Jahreswert, gesamtDarlehen: number) =>
    j.wertzuwachs + Math.max(0, gesamtDarlehen - j.remainingDebt) - j.propertyValue * verkaufskostenSatz;
  const heute = lang.years[0] ? lang.years[0].propertyValue - lang.years[0].wertzuwachs : ausgewiesenerKaufpreis(input, result);
  const stichjahre = [
    { jahre: 0, immobilienwert: heute, gewinn: 0, getilgt: 0, verkaufskosten: 0, erloes: 0, mieteMonat: monat?.miete ?? 0, nachSteuerMonat: monat?.nachSteuer ?? 0 },
    ...[10, 20, 30]
      .filter((n) => lang.years[n - 1])
      .map((n) => {
        const j = lang.years[n - 1];
        const getilgt = Math.max(0, lang.totalDebt - j.remainingDebt);
        return {
          jahre: n,
          immobilienwert: j.propertyValue,
          gewinn: j.wertzuwachs,
          getilgt,
          verkaufskosten: j.propertyValue * verkaufskostenSatz,
          erloes: erloes(j, lang.totalDebt),
          mieteMonat: j.effectiveRent / 12,
          nachSteuerMonat: j.cashflowAfterTax / 12,
        };
      }),
  ];
  const summe = (wert: (j: Jahreswert) => number) => jahre.reduce((s, j) => s + wert(j), 0);
  const monateGesamt = jahre.length > 0 ? (jahre.length - 1) * 12 + ersteMonate : 0;
  return {
    jahre,
    erstes,
    letztes,
    ekr,
    nebenkosten,
    darlehen,
    darlehenSumme,
    zinsMittel,
    monat,
    ersteMonate,
    stichjahre,
    erloesJahr: (j: Jahreswert) => erloes(j, result.totalDebt),
    steuerSumme: summe((j) => j.taxEffect),
    nachSteuerMittelMonat: monateGesamt > 0 ? summe((j) => j.cashflowAfterTax) / monateGesamt : 0,
    erloesEnde: letztes ? erloes(letztes, result.totalDebt) : 0,
  };
}

type Werte = ReturnType<typeof ausfuehrlicheWerte>;

export interface AusfuehrlicheBerechnungProps {
  input: InvestmentEingabe;
  result: InvestmentErgebnis;
  photos: string[];
  /** Name auf dem Titelblatt („Erstellt von …“), leer heißt keiner. */
  erstelltVon?: string;
}

/** Die Ansicht im Rechner: Vorschau der zwölf Seiten und der Knopf für das PDF. */
export function AusfuehrlicheBerechnung({ input, result, photos, erstelltVon = "" }: AusfuehrlicheBerechnungProps) {
  const druck = useRef<HTMLDivElement>(null);
  const [entsteht, setEntsteht] = useState(false);
  const werte = ausfuehrlicheWerte(input, result);
  const dokument = <Dokument input={input} result={result} photos={photos} werte={werte} erstelltVon={erstelltVon.trim()} />;

  const herunterladen = async () => {
    setEntsteht(true);
    try {
      const seiten = Array.from(druck.current?.querySelectorAll<HTMLElement>(".ba-seite") ?? []);
      if (!seiten.length) throw new Error("Keine Seiten");
      await document.fonts.ready;
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      for (const [index, seite] of seiten.entries()) {
        const bild = await html2canvas(seite, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: 1280 });
        if (index > 0) pdf.addPage();
        pdf.addImage(bild.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
        // Speicher sofort freigeben, zwölf Seiten in doppelter Auflösung sind sonst viel.
        bild.width = 0;
        bild.height = 0;
      }
      const name = (input.propertyTitle || "Objekt").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
      pdf.save(`Berechnung_ausfuehrlich_${name}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (fehler) {
      console.error("[Ausführlich] PDF fehlgeschlagen", fehler);
      toast({ title: "PDF konnte nicht erstellt werden", description: "Bitte noch einmal versuchen.", variant: "destructive" });
    } finally {
      setEntsteht(false);
    }
  };

  return (
    <div className="ba-wrap">
      <div className="ba-leiste">
        <p>Ausführliche Fassung mit {SEITEN} Seiten: Kalkulationsgrundlagen, Cashflow, Verkaufen oder halten, Jahrestabellen und Steuer.</p>
        <Button variant="brand" className="gap-2" disabled={entsteht} onClick={() => void herunterladen()} id="ba-herunterladen">
          <FileDown size={16} /> {entsteht ? "PDF wird erstellt …" : "Ausführliche Berechnung herunterladen"}
        </Button>
      </div>
      <ExposeVorschau>{dokument}</ExposeVorschau>
      {createPortal(
        <div ref={druck} className="ba-druck" aria-hidden="true">
          {dokument}
        </div>,
        document.body,
      )}
    </div>
  );
}

function Seite({ nr, kick, titel, children, dunkel, input }: { nr: number; kick?: string; titel?: ReactNode; children: ReactNode; dunkel?: boolean; input: InvestmentEingabe }) {
  return (
    <section className={`ba-seite${dunkel ? " ba-dunkel" : ""}`}>
      <div className="ba-in">
        {kick && (
          <div className="ba-kick">
            <b>{String(nr - 1).padStart(2, "0")}</b>
            {kick}
          </div>
        )}
        {titel && <h2>{titel}</h2>}
        {children}
      </div>
      <Fuss titel={input.propertyTitle || "Objekt"} nr={nr} />
    </section>
  );
}

function Fuss({ titel, nr }: { titel: string; nr: number }) {
  return (
    <div className="ba-fuss">
      <span>Stand {new Date().toLocaleDateString("de-DE")}</span>
      <span>Investmentkalkulation · {titel} · {nr} / {SEITEN}</span>
    </div>
  );
}

type Zeile = [ReactNode, ReactNode, string?];

function Tabelle({ zeilen, summe }: { zeilen: Zeile[]; summe?: [ReactNode, ReactNode] }) {
  return (
    <table className="ba-kv">
      <tbody>
        {zeilen.map(([links, rechts, klasse], index) => (
          <tr key={index} className={klasse}>
            <td>{links}</td>
            <td>{rechts}</td>
          </tr>
        ))}
        {summe && (
          <tr className="ba-sum">
            <td>{summe[0]}</td>
            <td>{summe[1]}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Kachel({ label, wert, text, dunkel, wertKlasse }: { label: string; wert: ReactNode; text?: ReactNode; dunkel?: boolean; wertKlasse?: string }) {
  return (
    <div className={`ba-kachel${dunkel ? " dk" : ""}`}>
      <div className="ba-label">{label}</div>
      <div className={`n ${wertKlasse ?? ""}`}>{wert}</div>
      {text && <div className="s">{text}</div>}
    </div>
  );
}

/** Gestapelte Säulen, negative Werte rot unter der Nulllinie. */
function Saeulen({ x, reihen, hoehe = 150, breite = 640 }: { x: string[]; reihen: { name: string; werte: number[]; farbe: string }[]; hoehe?: number; breite?: number }) {
  const summen = x.map((_, i) => reihen.reduce((s, r) => s + Math.max(0, r.werte[i] ?? 0), 0));
  const unten = Math.min(0, ...reihen.flatMap((r) => r.werte));
  const spanne = Math.max(1, ...summen) - unten;
  const innenHoehe = hoehe - 10 - 22;
  const innenBreite = breite - 52 - 6;
  const y = (wert: number) => 10 + innenHoehe - ((wert - unten) / spanne) * innenHoehe;
  const schritt = innenBreite / x.length;
  const saeule = Math.min(38, schritt * 0.6);
  const linien = [0, 1, 2, 3, 4].map((i) => unten + (spanne * i) / 4);
  return (
    <svg className="ba-chart" viewBox={`0 0 ${breite} ${hoehe}`} width="100%" role="img">
      {linien.map((wert, i) => (
        <g key={i}>
          <line x1={52} x2={breite - 6} y1={y(wert)} y2={y(wert)} stroke="#E3EBE7" strokeWidth={0.6} />
          <text x={48} y={y(wert) + 3} textAnchor="end">
            {zahlText(wert / 1000, 0)}{" "}T€
          </text>
        </g>
      ))}
      <line x1={52} x2={breite - 6} y1={y(0)} y2={y(0)} stroke="#B9CBC2" strokeWidth={0.8} />
      {x.map((beschriftung, i) => {
        let gestapelt = 0;
        const mitte = 52 + i * schritt + schritt / 2;
        return (
          <g key={i}>
            {reihen.map((reihe, r) => {
              const wert = reihe.werte[i] ?? 0;
              if (wert < 0) return <rect key={r} x={mitte - saeule / 2} y={y(0)} width={saeule} height={y(wert) - y(0)} fill="#A23B32" rx={1.5} />;
              const oben = y(gestapelt + wert);
              const boden = y(gestapelt);
              gestapelt += wert;
              return <rect key={r} x={mitte - saeule / 2} y={oben} width={saeule} height={Math.max(0, boden - oben)} fill={reihe.farbe} rx={1.5} />;
            })}
            {(x.length <= 15 || i % 5 === 0 || i === x.length - 1) && (
              <text x={mitte} y={hoehe - 8} textAnchor="middle">
                {beschriftung}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Legende({ eintraege }: { eintraege: [string, string][] }) {
  return (
    <div className="ba-legende">
      {eintraege.map(([name, farbe]) => (
        <span key={name}>
          <i style={{ background: farbe }} />
          {name}
        </span>
      ))}
    </div>
  );
}

function Dokument({ input, result, photos, werte, erstelltVon }: { input: InvestmentEingabe; result: InvestmentErgebnis; photos: string[]; werte: Werte; erstelltVon: string }) {
  const { erstes, letztes, monat, jahre } = werte;
  const anzahl = jahre.length;
  const start = input.startYear;
  const titel = input.propertyTitle || "Ihr Objekt";
  const kunde = input.clientName.trim();
  const methode = input.depreciationMethod === "declining" ? "degressiv" : "linear";
  const tabelle = jahre.slice(0, 30);
  const stellplatz = mitStellplatz(result);
  const garagenpreis = Math.max(0, input.garagePrice || 0);
  const garagenmiete = Math.max(0, input.monthlyGarageRent || 0);
  const wohnungspreis = input.purchasePrice - garagenpreis;
  const ab = Math.min(12, Math.max(1, Math.round(input.acquisitionMonth || 1)));
  const zeitanteilig = ab > 1;
  const durchVerkaeufer = result.sanierungsfall === "durchVerkaeufer";
  const preiszeilen: Zeile[] =
    garagenpreis > 0
      ? [["Kaufpreis gesamt", euro(input.purchasePrice)], ["davon Wohnung", euro(wohnungspreis)], ["davon Stellplatz/Garage", euro(garagenpreis)]]
      : [["Kaufpreis", euro(input.purchasePrice)]];
  const mietzeilen: Zeile[] =
    garagenmiete > 0
      ? [
          ["Kaltmiete Wohnung im Monat", euro(input.monthlyColdRent, 2)],
          ["Miete Stellplatz/Garage im Monat", euro(garagenmiete, 2)],
          ["Kaltmiete gesamt im Monat", euro(input.monthlyColdRent + garagenmiete, 2)],
        ]
      : [["Kaltmiete im Monat", euro(input.monthlyColdRent, 2)]];
  const sanierungszeilen: Zeile[] =
    result.erhaltungsaufwand > 0
      ? [
          ["Sanierungsanteil", euro(result.erhaltungsaufwand)],
          ["Sanierungsfall", durchVerkaeufer ? "durch den Verkäufer vor dem Verkauf" : "nach dem Kauf für den Käufer"],
          ...(!durchVerkaeufer
            ? ([
                ["15-Prozent-Grenze (§ 6 Abs. 1 Nr. 1a EStG)", `${euro(result.fuenfzehnProzentGrenze)}, Anteil ${prozent(result.immediateDeductionRatio * 100, 1)}`],
                ["Steuerliche Behandlung", result.sanierungAktiviert ? "Abschreibung über das Gebäude" : "Werbungskosten (Erhaltungsaufwand)"],
              ] as Zeile[])
            : ([["Steuerliche Behandlung", "Anschaffungskosten, Abschreibung über das Gebäude"]] as Zeile[])),
        ]
      : [];

  if (!erstes || !letztes || !monat) {
    return (
      <div className="ba-dokument">
        <section className="ba-seite">
          <div className="ba-in">
            <h2>Noch keine Berechnung</h2>
          </div>
        </section>
      </div>
    );
  }
  const seite = { input };

  return (
    <div className="ba-dokument">
      {/* 1 Titel */}
      <section className="ba-seite ba-dunkel ba-titel">
        <div className="ba-titelbild">{photos[0] ? <img src={photos[0]} alt="" /> : <div className="ba-ohnebild" />}</div>
        <div className="ba-titelverlauf" />
        <div className="ba-titelkopf">
          <span className="ba-tag">Immobilienberechnung</span>
          {erstelltVon && <span className="ba-partner">Erstellt von {erstelltVon}</span>}
        </div>
        <div className="ba-titeltext">
          <div className="ba-kick">
            <b>{start}</b>
            {kunde ? `Persönlich für ${kunde}` : "Persönliche Berechnung"}
          </div>
          <h1>{titel}</h1>
          {input.address && <div className="ba-unit">{input.address}</div>}
          <div className="ba-regel" />
          <div className="ba-titeldaten">
            <div>
              <div className="ba-label">Steuerersparnis</div>
              <div className="v">{euro(werte.steuerSumme)}</div>
              <small>nach {anzahl} Jahren</small>
            </div>
            <div>
              <div className="ba-label">Wertzuwachs</div>
              <div className="v">{euro(letztes.wertzuwachs)}</div>
              <small>nach {anzahl} Jahren{anzahl >= 10 ? ", bei Verkauf steuerfrei" : ""}</small>
            </div>
            <div>
              <div className="ba-label">Eigenkapital</div>
              <div className="v">{euro(werte.ekr.eigenkapital)}</div>
              <small>Einsatz beim Kauf</small>
            </div>
            <div>
              <div className="ba-label">Cashflow vor Steuer</div>
              <div className={`v ${tonKlasse(monat.vorSteuer)}`}>{mitZeichen(monat.vorSteuer)}</div>
              <small>im Monat, {start}</small>
            </div>
            <div>
              <div className="ba-label">Cashflow nach Steuer</div>
              <div className={`v ${tonKlasse(monat.nachSteuer)}`}>{mitZeichen(monat.nachSteuer)}</div>
              <small>im Monat, {start}</small>
            </div>
            <div>
              <div className="ba-label">Kumulierter Cashflow</div>
              <div className={`v ${tonKlasse(letztes.cumulativeCashflowAfterTax)}`}>{mitZeichen(letztes.cumulativeCashflowAfterTax)}</div>
              <small>nach Steuer, {anzahl} Jahre</small>
            </div>
          </div>
        </div>
        <Fuss titel={titel} nr={1} />
      </section>

      {/* 2 Das Objekt */}
      <Seite nr={2} kick="Das Objekt" titel={<>{titel}: <em>die Eckdaten.</em></>} {...seite}>
        <div className="ba-zwei">
          <Tabelle
            zeilen={[
              ["Objekt", titel],
              ["Adresse", input.address || "–"],
              ["Objekttyp", input.propertyType || "–"],
              ["Wohnfläche", input.area ? `${zahlText(input.area, 2)} m²` : "–"],
              ["Zimmer", input.rooms ? zahlText(input.rooms, 1) : "–"],
              ["Baujahr", input.constructionYear ? String(input.constructionYear) : "–"],
              ...preiszeilen,
              ...mietzeilen,
              ["Kaufpreis je m² Wohnung", input.area ? euro(wohnungspreis / input.area) : "–"],
              ["Abschreibung", `${prozent(input.buildingDepreciationRate)} ${methode}`],
              ["Gebäudeanteil", prozent(input.buildingShare, 0)],
            ]}
          />
          <div className="ba-fotos">
            {photos.slice(0, 4).map((foto, i) => (
              <div className="ba-foto" key={i}>
                <img src={foto} alt="" />
              </div>
            ))}
            {photos.length === 0 && (
              <div className="ba-hinweis">Objektfotos lassen sich im Bereich „Bilder“ hinzufügen. Das erste wird zum Titelbild.</div>
            )}
          </div>
        </div>
        <div className="ba-kacheln3">
          <Kachel
            label={stellplatz ? "Bruttomietrendite Wohnung" : "Bruttomietrendite"}
            wert={prozent(result.grossYieldWohnung * 100)}
            text={stellplatz ? "Jahreskaltmiete der Wohnung durch ihren Kaufpreis" : "Jahreskaltmiete durch Kaufpreis"}
          />
          {stellplatz ? (
            <Kachel label="Bruttomietrendite gesamt" wert={prozent(result.grossYield * 100)} text="Wohnung und Stellplatz: Miete gesamt durch Kaufpreis gesamt" />
          ) : (
            <Kachel label="Kaufpreisfaktor" wert={result.kaufpreisfaktor !== null ? `${zahlText(result.kaufpreisfaktor, 2)}-fach` : "–"} text="Kaufpreis durch Jahreskaltmiete" />
          )}
          <Kachel
            dunkel
            label={stellplatz ? "Kaufpreisfaktor Wohnung / gesamt" : "Miete je m²"}
            wert={
              stellplatz
                ? `${result.kaufpreisfaktorWohnung !== null ? zahlText(result.kaufpreisfaktorWohnung, 2) : "–"} / ${result.kaufpreisfaktor !== null ? zahlText(result.kaufpreisfaktor, 2) : "–"}`
                : input.area ? euro(input.monthlyColdRent / input.area, 2) : "–"
            }
            text={stellplatz ? "Kaufpreis durch Jahreskaltmiete" : "Kaltmiete im Monat"}
          />
        </div>
      </Seite>

      {/* 3 Grundlagen */}
      <Seite nr={3} kick="Grundlagen" titel={<>Warum sich eine vermietete Wohnung <em>rechnet.</em></>} {...seite}>
        <p className="ba-lead">
          Eine vermietete Wohnung ist ein Sachwert. Mieter, Finanzamt und Bank tragen einen großen Teil der Kosten, Sie bauen Vermögen auf.
        </p>
        <div className="ba-texte">
          <div>
            <h3>Sachwert statt Geldwert</h3>
            <p>Guthaben verliert mit der Inflation an Kaufkraft. Eine Immobilie hat einen eigenen Marktwert, und die Miete steigt in der Regel mit den Preisen.</p>
          </div>
          <div>
            <h3>Fremdkapital als Hebel</h3>
            <p>Die Bank finanziert den größten Teil. Der Wertzuwachs gehört trotzdem vollständig Ihnen, deshalb steigt die Rendite auf das eingesetzte Eigenkapital.</p>
          </div>
          <div>
            <h3>Abschreibung (AfA)</h3>
            <p>
              Nur das Gebäude wird abgeschrieben, nicht der Boden. Üblich sind 2 % im Jahr, 2,5 % für Gebäude vor 1925 und 3 % für Neubauten ab 2023.
              Für neue Mietwohnungen kann die Sonder-AfA nach § 7b dazukommen; danach wird der Restwert über die Restnutzungsdauer verteilt.
            </p>
          </div>
          <div>
            <h3>Zinsen und Kosten</h3>
            <p>
              Darlehenszinsen, nicht umlagefähige Kosten und Erhaltungsaufwand sind Werbungskosten und senken das zu versteuernde Einkommen.
              Instandsetzung über 15 % der Gebäudekosten in den ersten drei Jahren wird dagegen abgeschrieben.
            </p>
          </div>
          <div>
            <h3>Nebenkosten beim Kauf</h3>
            <p>Grunderwerbsteuer, Notar, Grundbuch und Makler gehören anteilig zur Bemessungsgrundlage der Abschreibung, nach Abzug des Bodenanteils.</p>
          </div>
          <div>
            <h3>Haltedauer</h3>
            <p>Nach zehn Jahren ist der Gewinn aus dem Verkauf einer privat vermieteten Wohnung steuerfrei. Die Rechnung zeigt deshalb mindestens diesen Zeitraum.</p>
          </div>
        </div>
        <div className="ba-note">
          <b>Die Abschreibung beginnt mit dem Übergang von Nutzen und Lasten.</b> Das Datum steht im notariellen Kaufvertrag.
          {zeitanteilig
            ? ` Die Rechnung setzt ihn auf ${MONATE[ab - 1]} ${start}: Miete, Kosten, Zinsen und Abschreibung zählen im ersten Jahr ab diesem Monat.`
            : ""}{" "}
          Die Erhaltungsrücklage wird steuerlich erst wirksam, wenn aus ihr Rechnungen bezahlt werden.
          {garagenpreis > 0 ? " Der mitgekaufte Stellplatz gehört steuerlich zum Gebäude und wird mit abgeschrieben; der Bodenanteil wird wie bei der Wohnung abgezogen." : ""}
        </div>
      </Seite>

      {/* 4 Kalkulationsgrundlagen */}
      <Seite nr={4} kick="Kalkulationsgrundlagen" titel={<>Person, Objekt und <em>Finanzierung.</em></>} {...seite}>
        <div className="ba-zwei">
          <div>
            <div className="ba-label ba-abstand">Persönliche Angaben</div>
            <Tabelle
              zeilen={[
                ["Name", kunde || "–"],
                ["Veranlagung", input.jointAssessment ? "Zusammenveranlagung" : "Einzelveranlagung"],
                ["Anteil am Objekt", prozent(result.anteil * 100, 0)],
                ["Zu versteuerndes Einkommen", euro(erstes.taxableIncomeBefore)],
                ["Kirchensteuer", input.churchTaxRate ? prozent(input.churchTaxRate, 0) : "keine"],
                [input.taxCalculationMode === "manual" ? "Steuersatz (fest)" : "Grenzsteuersatz", prozent((input.taxCalculationMode === "manual" ? input.marginalTaxRate / 100 : result.marginalTotalTaxRate) * 100, 1)],
              ]}
            />
            <div className="ba-label ba-abstand">Immobilie</div>
            <Tabelle
              zeilen={[
                ...preiszeilen,
                ...mietzeilen,
                ["Nicht umlagefähige Kosten im Monat", euro(input.monthlyOperatingCosts, 2)],
                ["Erhaltungsrücklage im Monat", euro(input.monthlyReserveContribution, 2)],
                ["Übergang von Nutzen und Lasten", `${MONATE[ab - 1]} ${start}`],
                ...sanierungszeilen,
              ]}
            />
          </div>
          <div>
            <div className="ba-label ba-abstand">Erwerbsnebenkosten</div>
            {result.allInclusive ? (
              <div className="ba-hinweis">Die Kaufnebenkosten sind im Kaufpreis enthalten (All-inclusive).</div>
            ) : (
              <Tabelle zeilen={werte.nebenkosten.map((n) => [`${n.name} (${prozent(n.satz)})`, euro(n.betrag)])} summe={["Summe", euro(result.purchaseCosts)]} />
            )}
            <div className="ba-kachel dk ba-abstand-gross">
              <div className="ba-label">Eigenkapitaleinsatz</div>
              <div className="n">{euro(werte.ekr.eigenkapital)}</div>
              <div className="s">
                Gesamtkosten {euro(result.totalInvestment)}, finanziert {euro(werte.darlehenSumme)}
              </div>
            </div>
          </div>
        </div>
        <div className="ba-label ba-abstand-gross">Finanzierungskonzept</div>
        <table className="ba-tab">
          <thead>
            <tr>
              <th>Darlehen</th>
              <th>Betrag</th>
              <th>Zins</th>
              <th>Tilgung</th>
              <th>Rate im Monat</th>
              <th>Zinsbindung</th>
            </tr>
          </thead>
          <tbody>
            {werte.darlehen.map((d) => (
              <tr key={d.name}>
                <td>{d.name}</td>
                <td>{euro(d.betrag)}</td>
                <td>{d.zins !== null ? prozent(d.zins) : "–"}</td>
                <td>{d.tilgung}</td>
                <td className="ba-rate">{euro(d.rateMonat, 2)}</td>
                <td>{d.zinsbindung ? `${d.zinsbindung} Jahre` : "–"}</td>
              </tr>
            ))}
            {werte.darlehen.length === 0 && (
              <tr>
                <td colSpan={6}>Ohne Darlehen gerechnet.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>Gesamt</td>
              <td>{euro(werte.darlehenSumme)}</td>
              <td>Ø {prozent(werte.zinsMittel)}</td>
              <td />
              <td className="ba-rate">{euro(result.monthlyDebtService, 2)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        <p className="ba-klein ba-abstand">
          Alle Darlehen rechnen monatlich: Monatszins ist Restschuld mal Sollzins durch 12, die Rate wird am Monatsende gezahlt.
          {input.seniorFollowUpRate > 0 || input.seniorFollowUpRepaymentRate > 0
            ? ` Nach ${input.seniorFixedRateYears} Jahren Anschlussfinanzierung${input.seniorFollowUpRate > 0 ? ` zu ${prozent(input.seniorFollowUpRate)}` : ""}${input.seniorFollowUpRepaymentRate > 0 ? ` mit ${prozent(input.seniorFollowUpRepaymentRate)} Tilgung` : ""}.`
            : ""}
          {(input.seniorFurtherFollowUps ?? []).filter((a) => a.nachJahren >= 1).map((a) => ` Nach ${a.nachJahren} Jahren erneut${a.zinsProzent > 0 ? ` zu ${prozent(a.zinsProzent)}` : ""}${a.tilgungProzent > 0 ? ` mit ${prozent(a.tilgungProzent)} Tilgung` : ""}.`).join("")}
          {result.umschuldungskostenGesamt > 0 ? ` Umschuldungskosten im Zeitraum: ${euro(result.umschuldungskostenGesamt)}, als Werbungskosten abgezogen.` : ""}
        </p>
      </Seite>

      {/* 5 Cashflow */}
      <Seite nr={5} kick="Cashflow und Rendite" titel={<>So rechnet sich der Monat <em>im Jahr {start}.</em></>} {...seite}>
        <div className="ba-annahmen">
          <span>Betrachtung <b>{anzahl} Jahre</b></span>
          <span>Wertentwicklung <b>{prozent(input.annualValueGrowth, 1)} p. a.</b></span>
          <span>Mietentwicklung <b>{prozent(input.annualRentGrowth, 1)} p. a.</b></span>
          <span>Kostensteigerung <b>{prozent(input.annualCostGrowth, 1)} p. a.</b></span>
          <span>Mietausfall <b>{prozent(input.vacancyRate, 1)}</b></span>
          <span>Start <b>{zeitanteilig ? `${MONATE[ab - 1]} ${start}` : start}</b></span>
        </div>
        <div className="ba-zwei ba-abstand-gross">
          <div className="ba-box">
            <div className="ba-label">Einnahmen im Monat</div>
            <Tabelle
              zeilen={[
                [<>Kaltmiete{garagenmiete > 0 ? " Wohnung und Stellplatz" : ""}<span className="ba-klein">nach Mietausfall, zahlt der Mieter</span></>, mitZeichen(monat.miete, 2), "ba-pos"],
                [<>Steuerwirkung<span className="ba-klein">AfA, Zinsen und Kosten senken die Steuer</span></>, mitZeichen(monat.steuer, 2), monat.steuer < 0 ? "ba-neg" : "ba-pos"],
              ]}
              summe={["Einnahmen", mitZeichen(monat.miete + monat.steuer, 2)]}
            />
          </div>
          <div className="ba-box">
            <div className="ba-label">Ausgaben im Monat</div>
            <Tabelle
              zeilen={[
                [<>Kreditrate<span className="ba-klein">Zins und Tilgung an die Bank</span></>, mitZeichen(-monat.rate, 2), "ba-rate"],
                [<>Laufende Kosten<span className="ba-klein">nicht umlagefähig, mit Rücklage</span></>, mitZeichen(-monat.kosten, 2)],
              ]}
              summe={["Ausgaben", mitZeichen(-(monat.rate + monat.kosten), 2)]}
            />
          </div>
        </div>
        <div className="ba-ergebnisse">
          <div>
            <span>Ergebnis vor Steuer im Monat</span>
            <b className={tonKlasse(monat.vorSteuer)}>{mitZeichen(monat.vorSteuer, 2)}</b>
          </div>
          <div className="dk">
            <span>Ergebnis nach Steuer im Monat</span>
            <b className={tonKlasse(monat.nachSteuer)}>{mitZeichen(monat.nachSteuer, 2)}</b>
          </div>
        </div>
        <div className="ba-zwei ba-abstand-gross">
          <div>
            <div className="ba-label ba-abstand">Im Jahr {start}{zeitanteilig ? ` (ab ${MONATE[ab - 1]})` : ""}</div>
            <Tabelle
              zeilen={[
                ["Kaltmiete abzüglich laufender Kosten", euro(erstes.effectiveRent - erstes.operatingCosts - erstes.reserveContribution)],
                ["Zins und Tilgung", <span className="ba-rate">{mitZeichen(-erstes.debtService)}</span>],
                ["Ergebnis vor Steuer", <span className={tonKlasse(erstes.cashflowBeforeTax)}>{mitZeichen(erstes.cashflowBeforeTax)}</span>],
                ["Steuerwirkung", mitZeichen(erstes.taxEffect)],
              ]}
              summe={["Ergebnis nach Steuer", <span className={tonKlasse(erstes.cashflowAfterTax)}>{mitZeichen(erstes.cashflowAfterTax)}</span>]}
            />
          </div>
          <div>
            <div className="ba-label ba-abstand">Rendite über {anzahl} Jahre</div>
            <Tabelle
              zeilen={[
                ["Eigenkapital", euro(werte.ekr.eigenkapital)],
                ["Zuzahlung vor Steuer, 12 Monate", euro(werte.ekr.zuzahlungMonat * 12)],
                ["Vermögensaufbau gesamt", euro(werte.ekr.vermoegensaufbau)],
                ["Vermögensrendite p. a. (Modellkennzahl)", werte.ekr.rendite !== null ? prozent(werte.ekr.rendite * 100, 1) : "–"],
              ]}
              summe={["Interner Zinsfuß (IRR) p. a.", result.irr !== null ? prozent(result.irr * 100, 1) : "–"]}
            />
            <p className="ba-klein ba-abstand">
              Die Vermögensrendite ist eine Modellkennzahl: Vermögensaufbau je Jahr geteilt durch Eigenkapital plus zwölf Monate Zuzahlung, wie in der Analyse.
              Der interne Zinsfuß ist die Verzinsung des eingesetzten Geldes nach Steuer, mit einem Verkauf am Ende{input.saleCostRate > 0 ? ` abzüglich ${prozent(input.saleCostRate, 1)} Verkaufskosten` : ""}.
            </p>
          </div>
        </div>
      </Seite>

      {/* 6 Verkaufen oder halten */}
      <Seite nr={6} kick="Verkaufen oder halten" titel={<>Was nach 10, 20 und 30 Jahren <em>bleibt.</em></>} {...seite}>
        <p className="ba-lead">
          Zwei Wege: verkaufen und den Erlös mitnehmen oder behalten und von der Miete leben. Gerechnet mit {prozent(input.annualValueGrowth, 1)} Wertentwicklung
          und {prozent(input.annualRentGrowth, 1)} Mietentwicklung im Jahr.
        </p>
        <div className="ba-label ba-abstand-gross">Erlös bei Verkauf (nach 10 Jahren steuerfrei)</div>
        <table className="ba-tab ba-stich">
          <thead>
            <tr>
              <th>Verkauf nach</th>
              {werte.stichjahre.map((s) => <th key={s.jahre}>{s.jahre === 0 ? "Heute" : `${s.jahre} Jahren`}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Immobilienwert</td>
              {werte.stichjahre.map((s) => <td key={s.jahre}>{euro(s.immobilienwert)}</td>)}
            </tr>
            <tr>
              <td>Wertzuwachs</td>
              {werte.stichjahre.map((s) => <td key={s.jahre}>{euro(s.gewinn)}</td>)}
            </tr>
            <tr>
              <td>Getilgter Betrag</td>
              {werte.stichjahre.map((s) => <td key={s.jahre}>{euro(s.getilgt)}</td>)}
            </tr>
            {input.saleCostRate > 0 && (
              <tr>
                <td>Verkaufskosten ({prozent(input.saleCostRate, 1)})</td>
                {werte.stichjahre.map((s) => <td key={s.jahre}>{mitZeichen(-s.verkaufskosten)}</td>)}
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>Erlös gesamt</td>
              {werte.stichjahre.map((s) => <td key={s.jahre}>{euro(s.erloes)}</td>)}
            </tr>
          </tfoot>
        </table>
        <Saeulen
          x={werte.stichjahre.slice(1).map((s) => `${s.jahre} Jahre`)}
          hoehe={170}
          reihen={[
            { name: "Getilgt", werte: werte.stichjahre.slice(1).map((s) => s.getilgt), farbe: "#12362A" },
            { name: "Wertzuwachs", werte: werte.stichjahre.slice(1).map((s) => s.gewinn - s.verkaufskosten), farbe: "#198A5F" },
          ]}
        />
        <Legende eintraege={[["Getilgter Betrag", "#12362A"], [input.saleCostRate > 0 ? "Wertzuwachs abzüglich Verkaufskosten" : "Wertzuwachs", "#198A5F"]]} />
        <div className="ba-oder">oder</div>
        <div className="ba-label">Behalten: Einnahmen im Monat</div>
        <table className="ba-tab ba-stich">
          <thead>
            <tr>
              <th>Nach</th>
              {werte.stichjahre.map((s) => <th key={s.jahre}>{s.jahre === 0 ? "Heute" : `${s.jahre} Jahren`}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Kaltmiete</td>
              {werte.stichjahre.map((s) => <td key={s.jahre}>{euro(s.mieteMonat)}</td>)}
            </tr>
            <tr>
              <td>Ergebnis nach Steuer</td>
              {werte.stichjahre.map((s) => <td key={s.jahre} className={tonKlasse(s.nachSteuerMonat)}>{mitZeichen(s.nachSteuerMonat)}</td>)}
            </tr>
          </tbody>
        </table>
        <p className="ba-klein ba-abstand">
          Nach dem Ende jeder Zinsbindung rechnet der Rechner mit dem eingetragenen Anschlusszins und der neuen Tilgung. Ist ein Darlehen getilgt, fällt seine Rate weg.
        </p>
      </Seite>

      {/* 7 Entwicklung */}
      <Seite nr={7} kick="Entwicklung" titel={<>Erlös, Restschuld und Cashflow <em>Jahr für Jahr.</em></>} {...seite}>
        <div className="ba-label ba-abstand-gross">Erlös bei Verkauf im Verhältnis zur Restschuld</div>
        <Saeulen
          x={tabelle.map((j) => String(j.year))}
          hoehe={300}
          reihen={[
            { name: "Restschuld", werte: tabelle.map((j) => j.remainingDebt), farbe: "#A7D7C5" },
            { name: "Erlös", werte: tabelle.map((j) => werte.erloesJahr(j)), farbe: "#198A5F" },
          ]}
        />
        <Legende eintraege={[["Restschuld der Darlehen", "#A7D7C5"], ["Erlös bei Verkauf (Wertzuwachs plus Tilgung, abzüglich Verkaufskosten)", "#198A5F"]]} />
        <div className="ba-label ba-abstand-gross">Kumulierter Cashflow nach Steuer</div>
        <Saeulen x={tabelle.map((j) => String(j.year))} hoehe={300} reihen={[{ name: "Kumuliert", werte: tabelle.map((j) => j.cumulativeCashflowAfterTax), farbe: "#12362A" }]} />
        <Legende eintraege={[["Summe der Ergebnisse nach Steuer bis zum Jahr", "#12362A"], ["negativ", "#A23B32"]]} />
      </Seite>

      {/* 8 Cashflow-Kalkulation */}
      <Seite nr={8} kick="Cashflow-Kalkulation" titel={<>{anzahl} Jahre im <em>Überblick.</em></>} {...seite}>
        <div className="ba-annahmen">
          <span>Eigenkapital <b>{euro(werte.ekr.eigenkapital)}</b></span>
          <span>Vermögensrendite (Modellkennzahl) <b>{werte.ekr.rendite !== null ? prozent(werte.ekr.rendite * 100, 1) : "–"} p. a.</b></span>
          <span>Interner Zinsfuß <b>{result.irr !== null ? prozent(result.irr * 100, 1) : "–"} p. a.</b></span>
        </div>
        <table className={`ba-tab ba-jahre ba-abstand-gross${tabelle.length <= 15 ? " ba-wenig" : ""}`}>
          <thead>
            <tr>
              <th>Jahr</th>
              <th>Miete mtl.</th>
              <th>Kosten mtl.</th>
              <th>Zinsen mtl.</th>
              <th>Tilgung mtl.</th>
              <th>Vor Steuer mtl.</th>
              <th>Steuer p. a.</th>
              <th>Nach Steuer mtl.</th>
              <th>Restschuld</th>
              <th>Immobilienwert</th>
            </tr>
          </thead>
          <tbody>
            {tabelle.map((j) => {
              const m = j.index === 0 ? werte.ersteMonate : 12;
              return (
                <tr key={j.year}>
                  <td>{j.year}</td>
                  <td>{euro(j.effectiveRent / m)}</td>
                  <td>{euro((j.operatingCosts + j.reserveContribution) / m)}</td>
                  <td className="ba-rate">{euro(j.interest / m)}</td>
                  <td className="ba-rate">{euro(j.principal / m)}</td>
                  <td className={tonKlasse(j.cashflowBeforeTax)}>{euro(j.cashflowBeforeTax / m)}</td>
                  <td>{euro(j.taxEffect)}</td>
                  <td className={tonKlasse(j.cashflowAfterTax)}>{euro(j.cashflowAfterTax / m)}</td>
                  <td>{euro(j.remainingDebt)}</td>
                  <td>{euro(j.propertyValue)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>Summe Steuerwirkung · Ø nach Steuer im Monat</td>
              <td>{euro(werte.steuerSumme)}</td>
              <td className={tonKlasse(werte.nachSteuerMittelMonat)}>{euro(werte.nachSteuerMittelMonat)}</td>
              <td colSpan={2}>Erlös bei Verkauf {euro(werte.erloesEnde)}</td>
            </tr>
          </tfoot>
        </table>
        {anzahl <= 20 && (
          <div className="ba-note">
            <b>Warum sinkt die Steuerwirkung mit den Jahren?</b> Mit jeder Tilgung sinkt die Restschuld und damit der Zinsanteil der Rate. Weniger Zinsen heißt
            weniger Werbungskosten, gleichzeitig steigt die Miete.
          </div>
        )}
      </Seite>

      {/* 9 Vermietung und Verpachtung */}
      <Seite nr={9} kick="Vermietung und Verpachtung" titel={<>Einkünfte aus Vermietung, <em>Jahr für Jahr.</em></>} {...seite}>
        <p className="ba-lead">
          Ein negatives Ergebnis verrechnet das Finanzamt mit Ihrem übrigen Einkommen. Daraus entsteht die Steuerersparnis auf der nächsten Seite.
        </p>
        <table className={`ba-tab ba-jahre ba-abstand-gross${tabelle.length <= 15 ? " ba-wenig" : ""}`}>
          <thead>
            <tr>
              <th>Jahr</th>
              <th>Mieteinnahmen</th>
              <th>Werbungskosten</th>
              <th>AfA gesamt</th>
              <th>Laufende Kosten</th>
              <th>Zinsen</th>
              <th>Einkünfte V+V</th>
            </tr>
          </thead>
          <tbody>
            {tabelle.map((j) => (
              <tr key={j.year}>
                <td>{j.year}</td>
                <td>{euro(j.effectiveRent)}</td>
                <td>{euro(werbungskosten(j))}</td>
                <td>{euro(afaGesamt(j))}</td>
                <td>{euro(laufendeKosten(j))}</td>
                <td>{euro(j.interest)}</td>
                <td className={tonKlasse(j.taxableResult)}>{euro(j.taxableResult)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ba-klein ba-abstand">
          Werbungskosten: Finanzierungsnebenkosten im ersten Jahr, Umschuldungskosten und Erhaltungsaufwand. AfA gesamt: Gebäude, Sonder-AfA und Möbel;
          die Möbel werden nur bis zu ihrem Restbuchwert abgeschrieben.
          {result.sonderAfa.beantragt ? ` ${result.sonderAfa.zulaessig ? "Sonder-AfA nach § 7b" : "Keine Sonder-AfA nach § 7b"}: ${result.sonderAfa.hinweis}` : ""}
        </p>
      </Seite>

      {/* 10 Steuerkalkulation */}
      <Seite nr={10} kick="Steuerkalkulation" titel={<>Ihre Steuer vor und nach <em>dem Kauf.</em></>} {...seite}>
        <table className={`ba-tab ba-jahre ba-abstand-gross${tabelle.length <= 15 ? " ba-wenig" : ""}`}>
          <thead>
            <tr>
              <th>Jahr</th>
              <th>Einkommen vor Kauf</th>
              <th>Ergebnis V+V</th>
              <th>Einkommen nach Kauf</th>
              <th>Steuer vor Kauf</th>
              <th>Steuer nach Kauf</th>
              <th>Steuerersparnis</th>
            </tr>
          </thead>
          <tbody>
            {tabelle.map((j) => (
              <tr key={j.year}>
                <td>{j.year}</td>
                <td>{euro(j.taxableIncomeBefore)}</td>
                <td className={tonKlasse(j.allocatedTaxableResult)}>{euro(j.allocatedTaxableResult)}</td>
                <td>{euro(j.taxableIncomeAfter)}</td>
                <td>{euro(j.taxBefore.totalTax)}</td>
                <td>{euro(j.taxAfter.totalTax)}</td>
                <td className={tonKlasse(j.taxEffect)}>{euro(j.taxEffect)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>Steuerersparnis gesamt</td>
              <td>{euro(werte.steuerSumme)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="ba-klein ba-abstand">
          {input.taxCalculationMode === "manual"
            ? `Gerechnet mit einem festen Steuersatz von ${prozent(input.marginalTaxRate, 1)} auf das Ergebnis; eine Erstattung gibt es höchstens bis zur Steuer vor dem Kauf.`
            : `Steuer nach dem Tarif 2026, jeweils mit Solidaritätszuschlag${input.churchTaxRate ? " und Kirchensteuer" : ""}.`}{" "}
          Das Einkommen wächst mit {prozent(input.annualTaxableIncomeGrowth, 1)} im Jahr.
        </p>
      </Seite>

      {/* 11 Steuererklärung */}
      <Seite nr={11} kick="Steuererklärung" titel={<>Anlage V im ersten Jahr, <em>vereinfacht.</em></>} {...seite}>
        <p className="ba-lead">So stehen die Zahlen des Jahres {start} sinngemäß in der Anlage V Ihrer Einkommensteuererklärung.</p>
        <div className="ba-zwei ba-abstand-gross">
          <Tabelle
            zeilen={[
              ["Mieteinnahmen", euro(erstes.effectiveRent)],
              ["Werbungskosten (Finanzierung, Erhaltung)", mitZeichen(-werbungskosten(erstes))],
              ["Absetzung für Abnutzung", mitZeichen(-afaGesamt(erstes))],
              ["Laufende Kosten", mitZeichen(-laufendeKosten(erstes))],
              ["Schuldzinsen", mitZeichen(-erstes.interest)],
            ]}
            summe={["Einkünfte aus Vermietung", <span className={tonKlasse(erstes.taxableResult)}>{mitZeichen(erstes.taxableResult)}</span>]}
          />
          <div className="ba-kacheln1">
            <Kachel dunkel label={`Steuerersparnis ${start}`} wert={euro(erstes.taxEffect)} text={`rund ${euro(erstes.taxEffect / werte.ersteMonate)} im Monat`} />
            <Kachel label="Steuer vor dem Kauf" wert={euro(erstes.taxBefore.totalTax)} text={`bei ${euro(erstes.taxableIncomeBefore)} Einkommen`} />
            <Kachel label="Steuer nach dem Kauf" wert={euro(erstes.taxAfter.totalTax)} text={`bei ${euro(erstes.taxableIncomeAfter)} Einkommen`} />
          </div>
        </div>
        <div className="ba-note">
          <b>Tipp: Freibetrag beantragen.</b> Mit einem Antrag auf Lohnsteuer-Ermäßigung wirkt die Ersparnis schon mit jedem Gehalt und nicht erst mit dem Steuerbescheid.
        </div>
      </Seite>

      {/* 12 Hinweise */}
      <Seite nr={12} kick="Hinweise" titel={<>Was diese Rechnung ist <em>und was nicht.</em></>} {...seite}>
        <div className="ba-texte ba-einspaltig">
          <div>
            <h3>Eine Prognose</h3>
            <p>
              Die Rechnung beruht auf Annahmen zu Miete, Kosten, Wertentwicklung, Zins und Steuer. Die Wirklichkeit kann davon nach oben und unten abweichen.
              Werte der Immobilie sind Beispiele und keine Wertermittlung.
            </p>
          </div>
          <div>
            <h3>Keine Steuerberatung</h3>
            <p>
              Die Steuer ist vereinfacht nach dem Tarif 2026 gerechnet, für alle Jahre gleich. Nicht abgebildet sind Verlustvorträge und Verlustrückträge, der
              Progressionsvorbehalt, Änderungen des Tarifs und individuelle Abzüge. Sanierungsanteil, Sonder-AfA nach § 7b und die 15-Prozent-Grenze hängen an
              Voraussetzungen, die nur die Steuerberatung verbindlich prüfen kann. Die Anerkennung liegt beim Finanzamt.
            </p>
          </div>
          <div>
            <h3>Keine Finanzierungszusage</h3>
            <p>Zins, Tilgung, Zinsbindung und Anschlussfinanzierung sind Beispiele. Die Konditionen legt die Bank erst bei der Kreditentscheidung fest.</p>
          </div>
          <div>
            <h3>Kein Ersatz für Unterlagen</h3>
            <p>
              Maßgeblich sind Kaufvertrag, Teilungserklärung, Wirtschaftsplan und Protokolle der Eigentümerversammlung. Umlagefähige Nebenkosten zahlt der Mieter,
              sie stehen deshalb nicht in der Rechnung.
            </p>
          </div>
          <div>
            <h3>Verkauf vor zehn Jahren</h3>
            <p>
              Wer früher verkauft, versteuert den Gewinn, und Kauf- und Verkaufskosten schmälern das Ergebnis. Die Rechnung zieht diese Steuer nicht ab und setzt
              einen langen Anlagehorizont voraus.
            </p>
          </div>
        </div>
      </Seite>
    </div>
  );
}
