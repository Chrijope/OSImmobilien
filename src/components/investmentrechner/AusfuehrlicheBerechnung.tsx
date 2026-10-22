import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FileDown } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { FormatSprache } from "@/lib/sprachFormat";
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
import { geladeneStildateien, stileInKopieEinbetten } from "@/lib/investmentrechner/berechnungAnsichtPdf";
import { ohneLiquidGlasInKopie } from "@/lib/designSchalter";
import { useRechnerSprache } from "./RechnerSprache";
import { hausgeldHinweis, hausgeldZeilen } from "./Auswertungen";
import "./ausfuehrlicheBerechnung.css";

/*
 * „Berechnung (ausführlich)“: zwölf A4-Seiten für den Kunden, in CRM und
 * Artefakt dieselbe Komponente (seit dem 22.10.2026).
 *
 * Herkunft: Sie entstand zuerst nur in der eigenständigen Artefaktfassung
 * des Rechners und lag nicht im Repository. Am 22.10.2026 aus der
 * veröffentlichten Fassung übernommen, sprachlich geprüft, ins Englische
 * übersetzt (Sprache der rechten Seite, siehe RechnerSprache.tsx) und an den
 * Umbau des Rechenkerns angeglichen: monatliche Darlehen, Anschluss und
 * Umschuldung, Tilgungsarten, § 7b mit Obergrenzen, AfA nach dem
 * Begünstigungszeitraum, Erwerbsmonat, Möbel bis zum Restbuchwert, Wohnung
 * und Stellplatz getrennt, beide Sanierungsfälle mit 15-Prozent-Grenze,
 * Hausgeld in ganzer Höhe, interner Zinsfuß, Verkaufskosten und Grenzen des
 * Modells.
 *
 * Gerechnet wird hier nichts Neues. Alle Zahlen kommen aus dem Ergebnis des
 * Rechenkerns, nur Monatswerte und Summen werden daraus gebildet.
 *
 * Anrede: Sie, wie in der Beratungspräsentation.
 */

const SEITEN = 12;
const MONATE_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MONATE_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Formatierung und Texte in einer Sprache, für alle Bausteine des Dokuments. */
function sprachwerkzeug(sprache: FormatSprache) {
  const en = sprache === "en";
  const locale = en ? "en-GB" : "de-DE";
  const zahl = (wert: number, stellen = 0) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: stellen, maximumFractionDigits: stellen }).format(Math.abs(wert) < 0.005 ? 0 : wert);
  const euro = (wert: number, stellen = 0) => (en ? `€${zahl(wert, stellen)}`.replace("€-", "−€") : `${zahl(wert, stellen)}\u00a0€`);
  return {
    en,
    t: (de: string, englisch: string) => (en ? englisch : de),
    zahl,
    euro,
    /** Betrag mit Vorzeichen, das Minus als Rechenzeichen U+2212. */
    mitZeichen: (wert: number, stellen = 0) => `${wert > 0.005 ? "+ " : wert < -0.005 ? "− " : ""}${euro(Math.abs(wert), stellen)}`,
    /** Prozentwert, der schon in Prozent vorliegt (etwa 4,8 für 4,8 %). */
    prozent: (wert: number, stellen = 2) => (en ? `${zahl(wert, stellen)}%` : `${zahl(wert, stellen)}\u00a0%`),
    monat: (nr: number) => (en ? MONATE_EN : MONATE_DE)[nr - 1],
    datum: () => new Date().toLocaleDateString(locale),
    jahre: (n: number) => (en ? `${n} ${n === 1 ? "year" : "years"}` : `${n} ${n === 1 ? "Jahr" : "Jahre"}`),
  };
}
type Werkzeug = ReturnType<typeof sprachwerkzeug>;
const WerkzeugKontext = createContext<Werkzeug>(sprachwerkzeug("de"));
const useWerkzeug = () => useContext(WerkzeugKontext);

const tonKlasse = (wert: number) => (wert < -0.005 ? "ba-neg" : "ba-pos");

/** Abschreibungen eines Jahres zusammen: Gebäude, Sonder-AfA, Möbel. */
const afaGesamt = (j: Jahreswert) => j.buildingDepreciation + j.specialDepreciation + j.furnitureDepreciation;
/** Sofort abziehbare Werbungskosten: Finanzierung im ersten Jahr, Umschuldung, Erhaltungsaufwand. */
const werbungskosten = (j: Jahreswert) => j.financingCostDeduction + (j.umschuldungskosten ?? 0) + j.rehabDeduction;
/** Laufende Kosten, wie sie im steuerlichen Ergebnis stehen: der Rest bis zum Ergebnis. */
const laufendeKosten = (j: Jahreswert) => j.effectiveRent - j.interest - afaGesamt(j) - werbungskosten(j) - j.taxableResult;

interface Darlehenszeile {
  art: "bank" | "bank2" | "kfw" | "nachrang";
  name: string;
  betrag: number;
  zins: number | null;
  /** Tilgungsart, Laufzeit und tilgungsfreie Jahre. */
  tilgung: { art: string; satz: number; laufzeit: number; anlauf: number };
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

  const saetze: ["grunderwerbsteuer" | "notar" | "grundbuch" | "makler" | "sonstiges", number][] = [
    ["grunderwerbsteuer", input.transferTaxRate],
    ["notar", input.notaryRate],
    ["grundbuch", input.landRegisterRate],
    ["makler", input.brokerRate],
    ["sonstiges", input.otherPurchaseCostRate],
  ];
  const summeSaetze = saetze.reduce((s, [, satz]) => s + (satz || 0), 0);
  const nebenkosten = saetze
    .filter(([, satz]) => satz > 0)
    .map(([art, satz]) => ({ art, satz, betrag: summeSaetze > 0 ? (result.purchaseCosts * satz) / summeSaetze : 0 }));

  // Erste Monatsrate: bei Bank und zweitem Darlehen aus dem Plan, sonst der Schnitt des ersten Jahres.
  const ersteRate = (art: "bank" | "bank2", betrag: number) =>
    bankplan({ ...bankplanParameter(input, art, betrag, anteil), jahre: 1, startMonat: input.acquisitionMonth }).ersteRate;
  const schnittErstesJahr = (art: "kfw" | "nachrang") => (erstes?.darlehen?.[art]?.payment ?? 0) / ersteMonate;
  const darlehen: Darlehenszeile[] = [];
  if (result.seniorLoanAmount > 0) {
    darlehen.push({
      art: "bank",
      name: "",
      betrag: result.seniorLoanAmount,
      zins: input.seniorInterestRate,
      tilgung: { art: input.seniorRepaymentType, satz: input.seniorRepaymentRate, laufzeit: input.seniorTermYears, anlauf: input.seniorGracePeriodYears },
      rateMonat: ersteRate("bank", result.seniorLoanAmount),
      zinsbindung: input.seniorFixedRateYears || null,
    });
  }
  if (result.secondLoanAmount > 0) {
    darlehen.push({
      art: "bank2",
      name: "",
      betrag: result.secondLoanAmount,
      zins: input.secondInterestRate,
      tilgung: { art: input.secondRepaymentType, satz: input.secondRepaymentRate, laufzeit: input.secondTermYears, anlauf: input.secondGracePeriodYears },
      rateMonat: ersteRate("bank2", result.secondLoanAmount),
      zinsbindung: input.secondFixedRateYears || null,
    });
  }
  if (result.kfwLoanAmount > 0) {
    darlehen.push({
      art: "kfw",
      name: `KfW${input.kfwProgram ? ` ${input.kfwProgram}` : ""}`,
      betrag: result.kfwLoanAmount,
      zins: input.kfwInterestRate,
      tilgung: { art: "kfw", satz: 0, laufzeit: 0, anlauf: result.kfwAnlaufJahre },
      rateMonat: schnittErstesJahr("kfw"),
      zinsbindung: input.kfwFixedRateYears || null,
    });
  }
  const nachrang = result.totalDebt - result.seniorLoanAmount - result.kfwLoanAmount - result.secondLoanAmount;
  if (nachrang > 0.005) {
    darlehen.push({
      art: "nachrang",
      name: "",
      betrag: nachrang,
      zins: input.juniorInterestRate,
      tilgung: { art: "annuitaet", satz: input.juniorRepaymentRate, laufzeit: 0, anlauf: 0 },
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
    Annahmen. Erlös bei Verkauf ist, seit der Codex-Nachprüfung vom 22.10.2026,
    Immobilienwert minus Restschuld minus Verkaufskosten, genau wie im
    internen Zinsfuß. Vorher stand dort Wertzuwachs plus Tilgung; das ließ das
    eingesetzte Eigenkapital weg (300.000 Kaufpreis, 60.000 Eigenkapital,
    keine Wertsteigerung: 44.174,94 statt 104.174,94 Euro).

    `monateSeitKauf` zählt ab dem Übergang. Ob die Zehnjahresfrist nach § 23
    EStG abgelaufen ist, hängt am Datum des Kaufvertrags; die Rechnung nennt
    sie deshalb nur unter diesem Vorbehalt.
  */
  const verkaufskostenSatz = Math.max(0, input.saleCostRate || 0) / 100;
  const lang = berechneInvestment({ ...input, forecastYears: 30 });
  const verkaufskosten = (wert: number) => wert * verkaufskostenSatz;
  const erloes = (j: Jahreswert) => j.propertyValue - j.remainingDebt - verkaufskosten(j.propertyValue);
  const heute = lang.years[0] ? lang.years[0].propertyValue - lang.years[0].wertzuwachs : ausgewiesenerKaufpreis(input, result);
  const monateBis = (index: number) => index * 12 + ersteMonate;
  const stichjahre = [
    {
      jahre: 0,
      monateSeitKauf: 0,
      immobilienwert: heute,
      restschuld: lang.totalDebt,
      verkaufskosten: verkaufskosten(heute),
      erloes: heute - lang.totalDebt - verkaufskosten(heute),
      mieteMonat: monat?.miete ?? 0,
      nachSteuerMonat: monat?.nachSteuer ?? 0,
    },
    ...[10, 20, 30]
      .filter((n) => lang.years[n - 1])
      .map((n) => {
        const j = lang.years[n - 1];
        return {
          jahre: n,
          monateSeitKauf: monateBis(n - 1),
          immobilienwert: j.propertyValue,
          restschuld: j.remainingDebt,
          verkaufskosten: verkaufskosten(j.propertyValue),
          erloes: erloes(j),
          mieteMonat: j.effectiveRent / 12,
          nachSteuerMonat: j.cashflowAfterTax / 12,
        };
      }),
  ];
  const summe = (wert: (j: Jahreswert) => number) => jahre.reduce((s, j) => s + wert(j), 0);
  const monateGesamt = jahre.length > 0 ? monateBis(jahre.length - 1) : 0;
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
    erloesJahr: erloes,
    steuerSumme: summe((j) => j.taxEffect),
    nachSteuerMittelMonat: monateGesamt > 0 ? summe((j) => j.cashflowAfterTax) / monateGesamt : 0,
    erloesEnde: letztes ? erloes(letztes) : 0,
    /** Monate vom Übergang bis zum Ende des Betrachtungszeitraums. */
    monateGesamt,
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
  const sprache = useRechnerSprache();
  const w = sprachwerkzeug(sprache);
  const druck = useRef<HTMLDivElement>(null);
  const [entsteht, setEntsteht] = useState(false);
  const werte = ausfuehrlicheWerte(input, result);
  const dokument = (
    <WerkzeugKontext.Provider value={w}>
      <Dokument input={input} result={result} photos={photos} werte={werte} erstelltVon={erstelltVon.trim()} />
    </WerkzeugKontext.Provider>
  );

  const herunterladen = async () => {
    setEntsteht(true);
    try {
      const seiten = Array.from(druck.current?.querySelectorAll<HTMLElement>(".ba-seite") ?? []);
      if (!seiten.length) throw new Error("Keine Seiten");
      await document.fonts.ready;
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      // Wie in berechnungAnsichtPdf.ts (AGENTS.md): Die Kopie bekommt die schon geladenen Stile, sonst kommt sie ungestaltet heraus.
      const stile = geladeneStildateien();
      for (const [index, seite] of seiten.entries()) {
        const bild = await html2canvas(seite, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
          windowWidth: 1280,
          onclone: (kopie) => {
            stileInKopieEinbetten(kopie, stile);
            ohneLiquidGlasInKopie(kopie);
          },
        });
        if (index > 0) pdf.addPage();
        pdf.addImage(bild.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
        // Speicher sofort freigeben, zwölf Seiten in doppelter Auflösung sind sonst viel.
        bild.width = 0;
        bild.height = 0;
      }
      const name = (input.propertyTitle || "Objekt").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
      const datei = w.en ? "Calculation_detailed" : "Berechnung_ausfuehrlich";
      pdf.save(`${datei}_${name}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (fehler) {
      console.error("[Ausführlich] PDF fehlgeschlagen", fehler);
      toast({
        title: w.t("PDF konnte nicht erstellt werden", "The PDF could not be created"),
        description: w.t("Bitte noch einmal versuchen.", "Please try again."),
        variant: "destructive",
      });
    } finally {
      setEntsteht(false);
    }
  };

  return (
    <div className="ba-wrap">
      <div className="ba-leiste">
        <p>
          {w.t(
            `Ausführliche Fassung mit ${SEITEN} Seiten: Kalkulationsgrundlagen, Cashflow, Verkaufen oder halten, Jahrestabellen und Steuer.`,
            `Detailed version with ${SEITEN} pages: calculation basis, cash flow, sell or hold, annual tables and tax.`,
          )}
        </p>
        <Button variant="brand" className="gap-2" disabled={entsteht} onClick={() => void herunterladen()} id="ba-herunterladen">
          <FileDown size={16} />{" "}
          {entsteht ? w.t("PDF wird erstellt …", "Creating PDF …") : w.t("Ausführliche Berechnung herunterladen", "Download detailed calculation")}
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
      <Fuss titel={input.propertyTitle} nr={nr} />
    </section>
  );
}

function Fuss({ titel, nr }: { titel: string; nr: number }) {
  const w = useWerkzeug();
  return (
    <div className="ba-fuss">
      <span>{w.t("Stand", "As of")} {w.datum()}</span>
      <span>
        {w.t("Investmentkalkulation", "Investment calculation")} · {titel || w.t("Objekt", "Property")} · {nr} / {SEITEN}
      </span>
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
  const w = useWerkzeug();
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
            {w.en ? `€${w.zahl(wert / 1000, 0)}k` : `${w.zahl(wert / 1000, 0)}\u00a0T€`}
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
  const w = useWerkzeug();
  const { t, euro, mitZeichen, prozent, zahl, en } = w;
  const { erstes, letztes, monat, jahre } = werte;
  const anzahl = jahre.length;
  const start = input.startYear;
  const titel = input.propertyTitle || t("Ihr Objekt", "Your property");
  const kunde = input.clientName.trim();
  const methode = input.depreciationMethod === "declining" ? t("degressiv", "declining balance") : t("linear", "straight-line");
  const tabelle = jahre.slice(0, 30);
  const stellplatz = mitStellplatz(result);
  const garagenpreis = Math.max(0, input.garagePrice || 0);
  const garagenmiete = Math.max(0, input.monthlyGarageRent || 0);
  const wohnungspreis = input.purchasePrice - garagenpreis;
  const ab = Math.min(12, Math.max(1, Math.round(input.acquisitionMonth || 1)));
  const zeitanteilig = ab > 1;
  const durchVerkaeufer = result.sanierungsfall === "durchVerkaeufer";
  const nachJahren = (n: number) => (en ? `after ${n} years` : `${n} Jahren`);
  const darlehenName = (d: Darlehenszeile) =>
    d.art === "bank" ? t("Bankdarlehen", "Bank loan") : d.art === "bank2" ? t("Zweites Bankdarlehen", "Second bank loan") : d.art === "nachrang" ? t("Nachrangdarlehen", "Subordinated loan") : d.name;
  const tilgungText = ({ art, satz, laufzeit, anlauf }: Darlehenszeile["tilgung"]) => {
    const basis =
      art === "kfw"
        ? t("Annuität", "Annuity")
        : art === "volltilgung" && laufzeit > 0
          ? t(`Volltilgung in ${laufzeit} Jahren`, `Full repayment in ${laufzeit} years`)
          : art === "endfaellig"
            ? laufzeit > 0 ? t(`endfällig nach ${laufzeit} Jahren`, `bullet after ${laufzeit} years`) : t("endfällig, nur Zinsen", "bullet, interest only")
            : prozent(satz);
    return anlauf > 0 ? `${basis}, ${t(`${anlauf} Jahre tilgungsfrei`, `${anlauf} years repayment-free`)}` : basis;
  };
  const nebenkostenName: Record<string, string> = {
    grunderwerbsteuer: t("Grunderwerbsteuer", "Real estate transfer tax"),
    notar: t("Notar", "Notary"),
    grundbuch: t("Grundbuch", "Land registry"),
    makler: t("Makler", "Broker"),
    sonstiges: t("Sonstiges", "Other"),
  };
  const preiszeilen: Zeile[] =
    garagenpreis > 0
      ? [
          [t("Kaufpreis gesamt", "Total purchase price"), euro(input.purchasePrice)],
          [t("davon Wohnung", "of which apartment"), euro(wohnungspreis)],
          [t("davon Stellplatz/Garage", "of which parking space/garage"), euro(garagenpreis)],
        ]
      : [[t("Kaufpreis", "Purchase price"), euro(input.purchasePrice)]];
  const mietzeilen: Zeile[] =
    garagenmiete > 0
      ? [
          [t("Kaltmiete Wohnung im Monat", "Net cold rent apartment per month"), euro(input.monthlyColdRent, 2)],
          [t("Miete Stellplatz/Garage im Monat", "Rent parking space/garage per month"), euro(garagenmiete, 2)],
          [t("Kaltmiete gesamt im Monat", "Total net cold rent per month"), euro(input.monthlyColdRent + garagenmiete, 2)],
        ]
      : [[t("Kaltmiete im Monat", "Net cold rent per month"), euro(input.monthlyColdRent, 2)]];
  const sanierungszeilen: Zeile[] =
    result.erhaltungsaufwand > 0
      ? [
          [t("Sanierungsanteil", "Renovation share"), euro(result.erhaltungsaufwand)],
          [
            t("Sanierungsfall", "Renovation case"),
            durchVerkaeufer ? t("durch den Verkäufer vor dem Verkauf", "by the seller before the sale") : t("nach dem Kauf für den Käufer", "after the purchase for the buyer"),
          ],
          ...(!durchVerkaeufer
            ? ([
                [
                  t("15-Prozent-Grenze (§ 6 Abs. 1 Nr. 1a EStG)", "15 percent limit (Sec. 6 (1) no. 1a EStG)"),
                  `${euro(result.fuenfzehnProzentGrenze)}, ${t("Anteil", "share")} ${prozent(result.immediateDeductionRatio * 100, 1)}`,
                ],
                [
                  t("Steuerliche Behandlung", "Tax treatment"),
                  result.sanierungAktiviert ? t("Abschreibung über das Gebäude", "Depreciation with the building") : t("Werbungskosten (Erhaltungsaufwand)", "Income-related expenses (maintenance)"),
                ],
              ] as Zeile[])
            : ([[t("Steuerliche Behandlung", "Tax treatment"), t("Anschaffungskosten, Abschreibung über das Gebäude", "Acquisition costs, depreciation with the building")]] as Zeile[])),
        ]
      : [];
  const hausgeld: Zeile[] = hausgeldZeilen(input, w.en ? "en" : "de").map((z) => [z.label, z.wert]);
  const hausgeldAbweichung = hausgeldHinweis(input, w.en ? "en" : "de");

  if (!erstes || !letztes || !monat) {
    return (
      <div className="ba-dokument">
        <section className="ba-seite">
          <div className="ba-in">
            <h2>{t("Noch keine Berechnung", "No calculation yet")}</h2>
          </div>
        </section>
      </div>
    );
  }
  const seite = { input };
  const kein = "–";

  return (
    <div className="ba-dokument" lang={en ? "en" : "de"}>
      {/* 1 Titel */}
      <section className="ba-seite ba-dunkel ba-titel">
        <div className="ba-titelbild">{photos[0] ? <img src={photos[0]} alt="" /> : <div className="ba-ohnebild" />}</div>
        <div className="ba-titelverlauf" />
        <div className="ba-titelkopf">
          <span className="ba-tag">{t("Immobilienberechnung", "Property calculation")}</span>
          {erstelltVon && <span className="ba-partner">{t("Erstellt von", "Prepared by")} {erstelltVon}</span>}
        </div>
        <div className="ba-titeltext">
          <div className="ba-kick">
            <b>{start}</b>
            {kunde ? t(`Persönlich für ${kunde}`, `Prepared for ${kunde}`) : t("Persönliche Berechnung", "Personal calculation")}
          </div>
          <h1>{titel}</h1>
          {input.address && <div className="ba-unit">{input.address}</div>}
          <div className="ba-regel" />
          <div className="ba-titeldaten">
            <div>
              <div className="ba-label">{t("Steuerersparnis", "Tax savings")}</div>
              <div className="v">{euro(werte.steuerSumme)}</div>
              <small>{t(`nach ${anzahl} Jahren`, `after ${anzahl} years`)}</small>
            </div>
            <div>
              <div className="ba-label">{t("Wertzuwachs", "Value increase")}</div>
              <div className="v">{euro(letztes.wertzuwachs)}</div>
              <small>
                {t(`nach ${anzahl} Jahren`, `after ${anzahl} years`)}
                {werte.monateGesamt >= 120
                  ? t(", bei Verkauf steuerfrei, sofern die Zehnjahresfrist ab Kaufvertrag abgelaufen ist", ", tax-free on sale if the ten-year period from the purchase contract has expired")
                  : t(", bei Verkauf vor Ablauf von zehn Jahren steuerpflichtig", ", taxable on sale within ten years")}
              </small>
            </div>
            <div>
              <div className="ba-label">{t("Eigenkapital", "Equity")}</div>
              <div className="v">{euro(werte.ekr.eigenkapital)}</div>
              <small>{t("Einsatz beim Kauf", "Invested at purchase")}</small>
            </div>
            <div>
              <div className="ba-label">{t("Cashflow vor Steuer", "Cash flow before tax")}</div>
              <div className={`v ${tonKlasse(monat.vorSteuer)}`}>{mitZeichen(monat.vorSteuer)}</div>
              <small>{t(`im Monat, ${start}`, `per month, ${start}`)}</small>
            </div>
            <div>
              <div className="ba-label">{t("Cashflow nach Steuer", "Cash flow after tax")}</div>
              <div className={`v ${tonKlasse(monat.nachSteuer)}`}>{mitZeichen(monat.nachSteuer)}</div>
              <small>{t(`im Monat, ${start}`, `per month, ${start}`)}</small>
            </div>
            <div>
              <div className="ba-label">{t("Kumulierter Cashflow", "Cumulative cash flow")}</div>
              <div className={`v ${tonKlasse(letztes.cumulativeCashflowAfterTax)}`}>{mitZeichen(letztes.cumulativeCashflowAfterTax)}</div>
              <small>{t(`nach Steuer, ${anzahl} Jahre`, `after tax, ${anzahl} years`)}</small>
            </div>
          </div>
        </div>
        <Fuss titel={input.propertyTitle} nr={1} />
      </section>

      {/* 2 Das Objekt */}
      <Seite nr={2} kick={t("Das Objekt", "The property")} titel={<>{titel}: <em>{t("die Eckdaten.", "the key facts.")}</em></>} {...seite}>
        <div className="ba-zwei">
          <Tabelle
            zeilen={[
              [t("Objekt", "Property"), titel],
              [t("Adresse", "Address"), input.address || kein],
              [t("Objekttyp", "Property type"), input.propertyType || kein],
              [t("Wohnfläche", "Living area"), input.area ? `${zahl(input.area, 2)} m²` : kein],
              [t("Zimmer", "Rooms"), input.rooms ? zahl(input.rooms, 1) : kein],
              [t("Baujahr", "Year of construction"), input.constructionYear ? String(input.constructionYear) : kein],
              ...preiszeilen,
              ...mietzeilen,
              [t("Kaufpreis je m² Wohnung", "Purchase price per m² apartment"), input.area ? euro(wohnungspreis / input.area) : kein],
              [t("Abschreibung", "Depreciation"), `${prozent(input.buildingDepreciationRate)} ${methode}`],
              [t("Gebäudeanteil", "Building share"), prozent(input.buildingShare, 0)],
            ]}
          />
          <div className="ba-fotos">
            {photos.slice(0, 4).map((foto, i) => (
              <div className="ba-foto" key={i}>
                <img src={foto} alt="" />
              </div>
            ))}
            {photos.length === 0 && (
              <div className="ba-hinweis">
                {t("Objektfotos lassen sich im Bereich „Bilder“ hinzufügen. Das erste wird zum Titelbild.", "Property photos can be added in the “Images” section. The first one becomes the cover image.")}
              </div>
            )}
          </div>
        </div>
        <div className="ba-kacheln3">
          <Kachel
            label={stellplatz ? t("Bruttomietrendite Wohnung", "Gross rental yield apartment") : t("Bruttomietrendite", "Gross rental yield")}
            wert={prozent(result.grossYieldWohnung * 100)}
            text={stellplatz ? t("Jahreskaltmiete der Wohnung durch ihren Kaufpreis", "Annual net cold rent of the apartment divided by its price") : t("Jahreskaltmiete durch Kaufpreis", "Annual net cold rent divided by purchase price")}
          />
          {stellplatz ? (
            <Kachel
              label={t("Bruttomietrendite gesamt", "Gross rental yield total")}
              wert={prozent(result.grossYield * 100)}
              text={t("Wohnung und Stellplatz: Miete gesamt durch Kaufpreis gesamt", "Apartment and parking: total rent divided by total price")}
            />
          ) : (
            <Kachel
              label={t("Kaufpreisfaktor", "Price-to-rent ratio")}
              wert={result.kaufpreisfaktor !== null ? `${zahl(result.kaufpreisfaktor, 2)}×` : kein}
              text={t("Kaufpreis durch Jahreskaltmiete", "Purchase price divided by annual net cold rent")}
            />
          )}
          <Kachel
            dunkel
            label={stellplatz ? t("Kaufpreisfaktor Wohnung / gesamt", "Price-to-rent ratio apartment / total") : t("Miete je m²", "Rent per m²")}
            wert={
              stellplatz
                ? `${result.kaufpreisfaktorWohnung !== null ? zahl(result.kaufpreisfaktorWohnung, 2) : kein} / ${result.kaufpreisfaktor !== null ? zahl(result.kaufpreisfaktor, 2) : kein}`
                : input.area ? euro(input.monthlyColdRent / input.area, 2) : kein
            }
            text={stellplatz ? t("Kaufpreis durch Jahreskaltmiete", "Purchase price divided by annual net cold rent") : t("Kaltmiete im Monat", "Net cold rent per month")}
          />
        </div>
      </Seite>

      {/* 3 Grundlagen */}
      <Seite nr={3} kick={t("Grundlagen", "Basics")} titel={en ? <>Why a let apartment <em>pays off.</em></> : <>Warum sich eine vermietete Wohnung <em>rechnet.</em></>} {...seite}>
        <p className="ba-lead">
          {t(
            "Eine vermietete Wohnung ist ein Sachwert. Mieter, Finanzamt und Bank tragen einen großen Teil der Kosten, Sie bauen Vermögen auf.",
            "A let apartment is a real asset. Tenant, tax office and bank carry a large part of the costs while you build wealth.",
          )}
        </p>
        <div className="ba-texte">
          <div>
            <h3>{t("Sachwert statt Geldwert", "Real asset instead of cash")}</h3>
            <p>{t("Guthaben verliert mit der Inflation an Kaufkraft. Eine Immobilie hat einen eigenen Marktwert, und die Miete steigt in der Regel mit den Preisen.", "Savings lose purchasing power with inflation. A property has its own market value, and rents usually rise with prices.")}</p>
          </div>
          <div>
            <h3>{t("Fremdkapital als Hebel", "Leverage through debt")}</h3>
            <p>{t("Die Bank finanziert den größten Teil. Der Wertzuwachs gehört trotzdem vollständig Ihnen, deshalb steigt die Rendite auf das eingesetzte Eigenkapital.", "The bank finances the largest part. The increase in value still belongs entirely to you, which is why the return on the equity invested rises.")}</p>
          </div>
          <div>
            <h3>{t("Abschreibung (AfA)", "Depreciation (AfA)")}</h3>
            <p>
              {t(
                "Nur das Gebäude wird abgeschrieben, nicht der Boden. Üblich sind 2 % im Jahr, 2,5 % für Gebäude vor 1925 und 3 % für Neubauten ab 2023. Für neue Mietwohnungen kann die Sonder-AfA nach § 7b dazukommen; danach wird der Restwert über die Restnutzungsdauer verteilt.",
                "Only the building is depreciated, not the land. Usual rates are 2% a year, 2.5% for buildings before 1925 and 3% for new buildings from 2023. New rental apartments may add the special depreciation under Sec. 7b EStG; afterwards the residual value is spread over the remaining useful life.",
              )}
            </p>
          </div>
          <div>
            <h3>{t("Zinsen und Kosten", "Interest and costs")}</h3>
            <p>
              {t(
                "Darlehenszinsen, nicht umlagefähige Kosten und Erhaltungsaufwand sind Werbungskosten und senken das zu versteuernde Einkommen. Instandsetzung über 15 % der Gebäudekosten in den ersten drei Jahren wird dagegen abgeschrieben.",
                "Loan interest, non-recoverable costs and maintenance expenses are income-related expenses and reduce taxable income. Repairs above 15% of the building costs within the first three years are depreciated instead.",
              )}
            </p>
          </div>
          <div>
            <h3>{t("Nebenkosten beim Kauf", "Incidental purchase costs")}</h3>
            <p>{t("Grunderwerbsteuer, Notar, Grundbuch und Makler gehören anteilig zur Bemessungsgrundlage der Abschreibung, nach Abzug des Bodenanteils.", "Transfer tax, notary, land registry and broker fees form part of the depreciation basis pro rata, after deducting the land share.")}</p>
          </div>
          <div>
            <h3>{t("Haltedauer", "Holding period")}</h3>
            <p>
              {t(
                "Liegen zwischen Kaufvertrag und Verkaufsvertrag mehr als zehn Jahre, ist der Gewinn aus dem Verkauf einer privat vermieteten Wohnung steuerfrei (§ 23 EStG). Maßgeblich sind die Daten der Verträge.",
                "If more than ten years lie between the purchase contract and the sale contract, the gain from selling a privately let apartment is tax-free (Sec. 23 EStG). The contract dates are decisive.",
              )}
            </p>
          </div>
        </div>
        <div className="ba-note">
          <b>{t("Die Abschreibung beginnt mit dem Übergang von Nutzen und Lasten.", "Depreciation starts with the transfer of benefits and burdens.")}</b>{" "}
          {t("Das Datum steht im notariellen Kaufvertrag.", "The date is stated in the notarial purchase contract.")}
          {zeitanteilig
            ? t(
                ` Die Rechnung setzt ihn auf ${w.monat(ab)} ${start}: Miete, Kosten, Zinsen und Abschreibung zählen im ersten Jahr ab diesem Monat.`,
                ` The calculation sets it to ${w.monat(ab)} ${start}: rent, costs, interest and depreciation count from this month in the first year.`,
              )
            : ""}{" "}
          {t("Die Erhaltungsrücklage wird steuerlich erst wirksam, wenn aus ihr Rechnungen bezahlt werden.", "The maintenance reserve only becomes tax-effective when invoices are paid from it.")}
          {garagenpreis > 0
            ? t(
                " Der mitgekaufte Stellplatz gehört steuerlich zum Gebäude und wird mit abgeschrieben; der Bodenanteil wird wie bei der Wohnung abgezogen.",
                " The parking space bought with it belongs to the building for tax purposes and is depreciated with it; the land share is deducted as for the apartment.",
              )
            : ""}
        </div>
      </Seite>

      {/* 4 Kalkulationsgrundlagen */}
      <Seite nr={4} kick={t("Kalkulationsgrundlagen", "Calculation basis")} titel={en ? <>Person, property and <em>financing.</em></> : <>Person, Objekt und <em>Finanzierung.</em></>} {...seite}>
        <div className="ba-zwei">
          <div>
            <div className="ba-label ba-abstand">{t("Persönliche Angaben", "Personal details")}</div>
            <Tabelle
              zeilen={[
                [t("Name", "Name"), kunde || kein],
                [t("Veranlagung", "Assessment"), input.jointAssessment ? t("Zusammenveranlagung", "Joint assessment") : t("Einzelveranlagung", "Individual assessment")],
                [t("Anteil am Objekt", "Share of the property"), prozent(result.anteil * 100, 0)],
                [t("Zu versteuerndes Einkommen", "Taxable income"), euro(erstes.taxableIncomeBefore)],
                [t("Kirchensteuer", "Church tax"), input.churchTaxRate ? prozent(input.churchTaxRate, 0) : t("keine", "none")],
                [
                  input.taxCalculationMode === "manual" ? t("Persönlicher Steuersatz (fest)", "Personal tax rate (fixed)") : t("Grenzsteuersatz", "Marginal tax rate"),
                  prozent((input.taxCalculationMode === "manual" ? input.marginalTaxRate / 100 : result.marginalTotalTaxRate) * 100, 1),
                ],
              ]}
            />
            <div className="ba-label ba-abstand">{t("Immobilie", "Property")}</div>
            <Tabelle
              zeilen={[
                ...preiszeilen,
                ...mietzeilen,
                [t("Nicht umlagefähige Kosten im Monat", "Non-recoverable costs per month"), euro(input.monthlyOperatingCosts, 2)],
                [t("Erhaltungsrücklage im Monat", "Maintenance reserve per month"), euro(input.monthlyReserveContribution, 2)],
                [t("Übergang von Nutzen und Lasten", "Transfer of benefits and burdens"), `${w.monat(ab)} ${start}`],
                ...sanierungszeilen,
              ]}
            />
            {hausgeld.length > 0 && (
              <>
                <div className="ba-label ba-abstand">{t("Hausgeld", "Service charge")}</div>
                <Tabelle zeilen={hausgeld} />
                {hausgeldAbweichung && <p className="ba-klein">{hausgeldAbweichung}</p>}
              </>
            )}
          </div>
          <div>
            <div className="ba-label ba-abstand">{t("Erwerbsnebenkosten", "Incidental purchase costs")}</div>
            {result.allInclusive ? (
              <div className="ba-hinweis">{t("Die Kaufnebenkosten sind im Kaufpreis enthalten (All-inclusive).", "The incidental purchase costs are included in the purchase price (all-inclusive).")}</div>
            ) : (
              <Tabelle
                zeilen={werte.nebenkosten.map((n) => [`${nebenkostenName[n.art]} (${prozent(n.satz)})`, euro(n.betrag)])}
                summe={[t("Summe", "Total"), euro(result.purchaseCosts)]}
              />
            )}
            <div className="ba-kachel dk ba-abstand-gross">
              <div className="ba-label">{t("Eigenkapitaleinsatz", "Equity invested")}</div>
              <div className="n">{euro(werte.ekr.eigenkapital)}</div>
              <div className="s">
                {t("Gesamtkosten", "Total costs")} {euro(result.totalInvestment)}, {t("finanziert", "financed")} {euro(werte.darlehenSumme)}
              </div>
            </div>
          </div>
        </div>
        <div className="ba-label ba-abstand-gross">{t("Finanzierungskonzept", "Financing concept")}</div>
        <table className="ba-tab">
          <thead>
            <tr>
              <th>{t("Darlehen", "Loan")}</th>
              <th>{t("Betrag", "Amount")}</th>
              <th>{t("Zins", "Interest")}</th>
              <th>{t("Tilgung", "Repayment")}</th>
              <th>{t("Rate im Monat", "Monthly instalment")}</th>
              <th>{t("Zinsbindung", "Fixed-rate period")}</th>
            </tr>
          </thead>
          <tbody>
            {werte.darlehen.map((d) => (
              <tr key={d.art}>
                <td>{darlehenName(d)}</td>
                <td>{euro(d.betrag)}</td>
                <td>{d.zins !== null ? prozent(d.zins) : kein}</td>
                <td>{tilgungText(d.tilgung)}</td>
                <td className="ba-rate">{euro(d.rateMonat, 2)}</td>
                <td>{d.zinsbindung ? w.jahre(d.zinsbindung) : kein}</td>
              </tr>
            ))}
            {werte.darlehen.length === 0 && (
              <tr>
                <td colSpan={6}>{t("Ohne Darlehen gerechnet.", "Calculated without loans.")}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>{t("Gesamt", "Total")}</td>
              <td>{euro(werte.darlehenSumme)}</td>
              <td>Ø {prozent(werte.zinsMittel)}</td>
              <td />
              <td className="ba-rate">{euro(result.monthlyDebtService, 2)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        <p className="ba-klein ba-abstand">
          {t(
            "Alle Darlehen rechnen monatlich: Monatszins ist Restschuld mal Sollzins durch 12, die Rate wird am Monatsende gezahlt.",
            "All loans are calculated monthly: monthly interest is remaining debt times the nominal rate divided by 12, the instalment is paid at the end of the month.",
          )}
          {input.seniorFollowUpRate > 0 || input.seniorFollowUpRepaymentRate > 0
            ? en
              ? ` After ${input.seniorFixedRateYears} years follow-up financing${input.seniorFollowUpRate > 0 ? ` at ${prozent(input.seniorFollowUpRate)}` : ""}${input.seniorFollowUpRepaymentRate > 0 ? ` with ${prozent(input.seniorFollowUpRepaymentRate)} repayment` : ""}.`
              : ` Nach ${input.seniorFixedRateYears} Jahren Anschlussfinanzierung${input.seniorFollowUpRate > 0 ? ` zu ${prozent(input.seniorFollowUpRate)}` : ""}${input.seniorFollowUpRepaymentRate > 0 ? ` mit ${prozent(input.seniorFollowUpRepaymentRate)} Tilgung` : ""}.`
            : ""}
          {(input.seniorFurtherFollowUps ?? [])
            .filter((a) => a.nachJahren >= 1)
            .map((a) =>
              en
                ? ` After ${a.nachJahren} years again${a.zinsProzent > 0 ? ` at ${prozent(a.zinsProzent)}` : ""}${a.tilgungProzent > 0 ? ` with ${prozent(a.tilgungProzent)} repayment` : ""}.`
                : ` Nach ${a.nachJahren} Jahren erneut${a.zinsProzent > 0 ? ` zu ${prozent(a.zinsProzent)}` : ""}${a.tilgungProzent > 0 ? ` mit ${prozent(a.tilgungProzent)} Tilgung` : ""}.`,
            )
            .join("")}
          {result.umschuldungskostenGesamt > 0
            ? t(
                ` Umschuldungskosten im Zeitraum: ${euro(result.umschuldungskostenGesamt)}, als Werbungskosten abgezogen.`,
                ` Refinancing costs in the period: ${euro(result.umschuldungskostenGesamt)}, deducted as income-related expenses.`,
              )
            : ""}
        </p>
      </Seite>

      {/* 5 Cashflow */}
      <Seite nr={5} kick={t("Cashflow und Rendite", "Cash flow and return")} titel={en ? <>How the month works out <em>in {start}.</em></> : <>So rechnet sich der Monat <em>im Jahr {start}.</em></>} {...seite}>
        <div className="ba-annahmen">
          <span>{t("Betrachtung", "Period")} <b>{w.jahre(anzahl)}</b></span>
          <span>{t("Wertentwicklung", "Value development")} <b>{prozent(input.annualValueGrowth, 1)} p. a.</b></span>
          <span>{t("Mietentwicklung", "Rent development")} <b>{prozent(input.annualRentGrowth, 1)} p. a.</b></span>
          <span>{t("Kostensteigerung", "Cost increase")} <b>{prozent(input.annualCostGrowth, 1)} p. a.</b></span>
          <span>{t("Mietausfall", "Rent loss")} <b>{prozent(input.vacancyRate, 1)}</b></span>
          <span>{t("Start", "Start")} <b>{zeitanteilig ? `${w.monat(ab)} ${start}` : start}</b></span>
        </div>
        <div className="ba-zwei ba-abstand-gross">
          <div className="ba-box">
            <div className="ba-label">{t("Einnahmen im Monat", "Income per month")}</div>
            <Tabelle
              zeilen={[
                [
                  <>
                    {t("Kaltmiete", "Net cold rent")}
                    {garagenmiete > 0 ? t(" Wohnung und Stellplatz", " apartment and parking") : ""}
                    <span className="ba-klein">{t("nach Mietausfall, zahlt der Mieter", "after rent loss, paid by the tenant")}</span>
                  </>,
                  mitZeichen(monat.miete, 2),
                  "ba-pos",
                ],
                [
                  <>
                    {t("Steuerwirkung", "Tax effect")}
                    <span className="ba-klein">{t("AfA, Zinsen und Kosten senken die Steuer", "Depreciation, interest and costs reduce the tax")}</span>
                  </>,
                  mitZeichen(monat.steuer, 2),
                  monat.steuer < 0 ? "ba-neg" : "ba-pos",
                ],
              ]}
              summe={[t("Einnahmen", "Income"), mitZeichen(monat.miete + monat.steuer, 2)]}
            />
          </div>
          <div className="ba-box">
            <div className="ba-label">{t("Ausgaben im Monat", "Expenses per month")}</div>
            <Tabelle
              zeilen={[
                [<>{t("Kreditrate", "Loan instalment")}<span className="ba-klein">{t("Zins und Tilgung an die Bank", "Interest and repayment to the bank")}</span></>, mitZeichen(-monat.rate, 2), "ba-rate"],
                [<>{t("Laufende Kosten", "Running costs")}<span className="ba-klein">{t("nicht umlagefähig, mit Rücklage", "non-recoverable, with reserve")}</span></>, mitZeichen(-monat.kosten, 2)],
              ]}
              summe={[t("Ausgaben", "Expenses"), mitZeichen(-(monat.rate + monat.kosten), 2)]}
            />
          </div>
        </div>
        <div className="ba-ergebnisse">
          <div>
            <span>{t("Ergebnis vor Steuer im Monat", "Result before tax per month")}</span>
            <b className={tonKlasse(monat.vorSteuer)}>{mitZeichen(monat.vorSteuer, 2)}</b>
          </div>
          <div className="dk">
            <span>{t("Ergebnis nach Steuer im Monat", "Result after tax per month")}</span>
            <b className={tonKlasse(monat.nachSteuer)}>{mitZeichen(monat.nachSteuer, 2)}</b>
          </div>
        </div>
        <div className="ba-zwei ba-abstand-gross">
          <div>
            <div className="ba-label ba-abstand">
              {t(`Im Jahr ${start}`, `In ${start}`)}
              {zeitanteilig ? t(` (ab ${w.monat(ab)})`, ` (from ${w.monat(ab)})`) : ""}
            </div>
            <Tabelle
              zeilen={[
                [t("Kaltmiete abzüglich laufender Kosten", "Net cold rent less running costs"), euro(erstes.effectiveRent - erstes.operatingCosts - erstes.reserveContribution)],
                [t("Zins und Tilgung", "Interest and repayment"), <span className="ba-rate">{mitZeichen(-erstes.debtService)}</span>],
                [t("Ergebnis vor Steuer", "Result before tax"), <span className={tonKlasse(erstes.cashflowBeforeTax)}>{mitZeichen(erstes.cashflowBeforeTax)}</span>],
                [t("Steuerwirkung", "Tax effect"), mitZeichen(erstes.taxEffect)],
              ]}
              summe={[t("Ergebnis nach Steuer", "Result after tax"), <span className={tonKlasse(erstes.cashflowAfterTax)}>{mitZeichen(erstes.cashflowAfterTax)}</span>]}
            />
          </div>
          <div>
            <div className="ba-label ba-abstand">{t(`Rendite über ${anzahl} Jahre`, `Return over ${anzahl} years`)}</div>
            <Tabelle
              zeilen={[
                [t("Eigenkapital", "Equity"), euro(werte.ekr.eigenkapital)],
                [t("Zuzahlung vor Steuer, 12 Monate", "Top-up before tax, 12 months"), euro(werte.ekr.zuzahlungMonat * 12)],
                [t("Vermögensaufbau gesamt", "Total wealth building"), euro(werte.ekr.vermoegensaufbau)],
                [t("Vermögensrendite p. a. (Modellkennzahl)", "Wealth return p.a. (model figure)"), werte.ekr.rendite !== null ? prozent(werte.ekr.rendite * 100, 1) : kein],
              ]}
              summe={[t("Interner Zinsfuß (IRR) p. a.", "Internal rate of return (IRR) p.a."), result.irr !== null ? prozent(result.irr * 100, 1) : kein]}
            />
            <p className="ba-klein ba-abstand">
              {t(
                "Die Vermögensrendite ist eine Modellkennzahl: Vermögensaufbau je Jahr geteilt durch Eigenkapital plus zwölf Monate Zuzahlung, wie in der Analyse. Der interne Zinsfuß ist die Verzinsung des eingesetzten Geldes nach Steuer, mit einem Verkauf am Ende",
                "The wealth return is a model figure: wealth building per year divided by equity plus twelve months of top-up payments, as in the analysis. The internal rate of return is the return on the money invested after tax, with a sale at the end",
              )}
              {input.saleCostRate > 0 ? t(` abzüglich ${prozent(input.saleCostRate, 1)} Verkaufskosten`, ` less ${prozent(input.saleCostRate, 1)} selling costs`) : ""}.
            </p>
          </div>
        </div>
      </Seite>

      {/* 6 Verkaufen oder halten */}
      <Seite nr={6} kick={t("Verkaufen oder halten", "Sell or hold")} titel={en ? <>What remains after 10, 20 and 30 <em>years.</em></> : <>Was nach 10, 20 und 30 Jahren <em>bleibt.</em></>} {...seite}>
        <p className="ba-lead">
          {t(
            `Zwei Wege: verkaufen und den Erlös mitnehmen oder behalten und von der Miete leben. Gerechnet mit ${prozent(input.annualValueGrowth, 1)} Wertentwicklung und ${prozent(input.annualRentGrowth, 1)} Mietentwicklung im Jahr.`,
            `Two paths: sell and take the proceeds, or keep the apartment and live on the rent. Calculated with ${prozent(input.annualValueGrowth, 1)} value development and ${prozent(input.annualRentGrowth, 1)} rent development a year.`,
          )}
        </p>
        <div className="ba-label ba-abstand-gross">
          {t(
            "Erlös bei Verkauf: Immobilienwert minus Restschuld minus Verkaufskosten",
            "Proceeds on sale: property value minus remaining debt minus selling costs",
          )}
        </div>
        <table className="ba-tab ba-stich">
          <thead>
            <tr>
              <th>{t("Verkauf nach", "Sale")}</th>
              {werte.stichjahre.map((s) => <th key={s.jahre}>{s.jahre === 0 ? t("Heute", "Today") : nachJahren(s.jahre)}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t("Immobilienwert", "Property value")}</td>
              {werte.stichjahre.map((s) => <td key={s.jahre}>{euro(s.immobilienwert)}</td>)}
            </tr>
            <tr>
              <td>{t("Restschuld", "Remaining debt")}</td>
              {werte.stichjahre.map((s) => <td key={s.jahre}>{mitZeichen(-s.restschuld)}</td>)}
            </tr>
            {input.saleCostRate > 0 && (
              <tr>
                <td>{t("Verkaufskosten", "Selling costs")} ({prozent(input.saleCostRate, 1)})</td>
                {werte.stichjahre.map((s) => <td key={s.jahre}>{mitZeichen(-s.verkaufskosten)}</td>)}
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>{t("Erlös gesamt", "Total proceeds")}</td>
              {werte.stichjahre.map((s) => <td key={s.jahre}>{euro(s.erloes)}</td>)}
            </tr>
          </tfoot>
        </table>
        <p className="ba-klein">
          {t(
            "Ein Gewinn aus dem Verkauf ist nach § 23 EStG nur steuerfrei, wenn zwischen Kaufvertrag und Verkaufsvertrag mehr als zehn Jahre liegen. Die Spalten zählen ab dem Übergang von Nutzen und Lasten; maßgeblich sind die Daten der Verträge. Eine Steuer bei früherem Verkauf zieht die Rechnung nicht ab.",
            "Under Sec. 23 EStG a gain on sale is only tax-free if more than ten years lie between the purchase contract and the sale contract. The columns count from the transfer of benefits and burdens; the contract dates are decisive. The calculation does not deduct tax on an earlier sale.",
          )}
        </p>
        <Saeulen
          x={werte.stichjahre.slice(1).map((s) => w.jahre(s.jahre))}
          hoehe={170}
          reihen={[{ name: "erloes", werte: werte.stichjahre.slice(1).map((s) => s.erloes), farbe: "#198A5F" }]}
        />
        <Legende eintraege={[[t("Erlös bei Verkauf", "Proceeds on sale"), "#198A5F"], [t("negativ", "negative"), "#A23B32"]]} />
        <div className="ba-oder">{t("oder", "or")}</div>
        <div className="ba-label">{t("Behalten: Einnahmen im Monat", "Hold: income per month")}</div>
        <table className="ba-tab ba-stich">
          <thead>
            <tr>
              <th>{t("Nach", "After")}</th>
              {werte.stichjahre.map((s) => <th key={s.jahre}>{s.jahre === 0 ? t("Heute", "Today") : en ? w.jahre(s.jahre) : nachJahren(s.jahre)}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t("Kaltmiete", "Net cold rent")}</td>
              {werte.stichjahre.map((s) => <td key={s.jahre}>{euro(s.mieteMonat)}</td>)}
            </tr>
            <tr>
              <td>{t("Ergebnis nach Steuer", "Result after tax")}</td>
              {werte.stichjahre.map((s) => <td key={s.jahre} className={tonKlasse(s.nachSteuerMonat)}>{mitZeichen(s.nachSteuerMonat)}</td>)}
            </tr>
          </tbody>
        </table>
        <p className="ba-klein ba-abstand">
          {t(
            "Nach dem Ende jeder Zinsbindung rechnet der Rechner mit dem eingetragenen Anschlusszins und der neuen Tilgung. Ist ein Darlehen getilgt, fällt seine Rate weg.",
            "After each fixed-rate period ends, the calculator uses the follow-up rate and the new repayment entered. Once a loan is repaid, its instalment ends.",
          )}
        </p>
      </Seite>

      {/* 7 Entwicklung */}
      <Seite nr={7} kick={t("Entwicklung", "Development")} titel={en ? <>Proceeds, remaining debt and cash flow <em>year by year.</em></> : <>Erlös, Restschuld und Cashflow <em>Jahr für Jahr.</em></>} {...seite}>
        <div className="ba-label ba-abstand-gross">{t("Erlös bei Verkauf im Verhältnis zur Restschuld", "Proceeds on sale relative to remaining debt")}</div>
        <Saeulen
          x={tabelle.map((j) => String(j.year))}
          hoehe={300}
          reihen={[
            { name: "rest", werte: tabelle.map((j) => j.remainingDebt), farbe: "#A7D7C5" },
            { name: "erloes", werte: tabelle.map((j) => werte.erloesJahr(j)), farbe: "#198A5F" },
          ]}
        />
        <Legende
          eintraege={[
            [t("Restschuld der Darlehen", "Remaining loan debt"), "#A7D7C5"],
            [t("Erlös bei Verkauf (Immobilienwert minus Restschuld minus Verkaufskosten)", "Proceeds on sale (property value minus remaining debt minus selling costs)"), "#198A5F"],
          ]}
        />
        <div className="ba-label ba-abstand-gross">{t("Kumulierter Cashflow nach Steuer", "Cumulative cash flow after tax")}</div>
        <Saeulen x={tabelle.map((j) => String(j.year))} hoehe={300} reihen={[{ name: "kum", werte: tabelle.map((j) => j.cumulativeCashflowAfterTax), farbe: "#12362A" }]} />
        <Legende
          eintraege={[
            [t("Summe der Ergebnisse nach Steuer bis zum Jahr", "Sum of results after tax up to the year"), "#12362A"],
            [t("negativ", "negative"), "#A23B32"],
          ]}
        />
      </Seite>

      {/* 8 Cashflow-Kalkulation */}
      <Seite nr={8} kick={t("Cashflow-Kalkulation", "Cash flow calculation")} titel={en ? <>{anzahl} years at a <em>glance.</em></> : <>{anzahl} Jahre im <em>Überblick.</em></>} {...seite}>
        <div className="ba-annahmen">
          <span>{t("Eigenkapital", "Equity")} <b>{euro(werte.ekr.eigenkapital)}</b></span>
          <span>{t("Vermögensrendite (Modellkennzahl)", "Wealth return (model figure)")} <b>{werte.ekr.rendite !== null ? prozent(werte.ekr.rendite * 100, 1) : kein} p. a.</b></span>
          <span>{t("Interner Zinsfuß", "Internal rate of return")} <b>{result.irr !== null ? prozent(result.irr * 100, 1) : kein} p. a.</b></span>
        </div>
        <table className={`ba-tab ba-jahre ba-abstand-gross${tabelle.length <= 15 ? " ba-wenig" : ""}`}>
          <thead>
            <tr>
              <th>{t("Jahr", "Year")}</th>
              <th>{t("Miete mtl.", "Rent p.m.")}</th>
              <th>{t("Kosten mtl.", "Costs p.m.")}</th>
              <th>{t("Zinsen mtl.", "Interest p.m.")}</th>
              <th>{t("Tilgung mtl.", "Repayment p.m.")}</th>
              <th>{t("Vor Steuer mtl.", "Before tax p.m.")}</th>
              <th>{t("Steuer p. a.", "Tax p.a.")}</th>
              <th>{t("Nach Steuer mtl.", "After tax p.m.")}</th>
              <th>{t("Restschuld", "Remaining debt")}</th>
              <th>{t("Immobilienwert", "Property value")}</th>
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
              <td colSpan={6}>{t("Summe Steuerwirkung · Ø nach Steuer im Monat", "Total tax effect · Ø after tax per month")}</td>
              <td>{euro(werte.steuerSumme)}</td>
              <td className={tonKlasse(werte.nachSteuerMittelMonat)}>{euro(werte.nachSteuerMittelMonat)}</td>
              <td colSpan={2}>{t("Erlös bei Verkauf", "Proceeds on sale")} {euro(werte.erloesEnde)}</td>
            </tr>
          </tfoot>
        </table>
        {anzahl <= 20 && (
          <div className="ba-note">
            <b>{t("Warum sinkt die Steuerwirkung mit den Jahren?", "Why does the tax effect decrease over the years?")}</b>{" "}
            {t(
              "Mit jeder Tilgung sinkt die Restschuld und damit der Zinsanteil der Rate. Weniger Zinsen heißt weniger Werbungskosten, gleichzeitig steigt die Miete.",
              "With every repayment, the remaining debt falls and with it the interest share of the instalment. Less interest means fewer income-related expenses, while the rent rises.",
            )}
          </div>
        )}
      </Seite>

      {/* 9 Vermietung und Verpachtung */}
      <Seite nr={9} kick={t("Vermietung und Verpachtung", "Rental income")} titel={en ? <>Income from letting, <em>year by year.</em></> : <>Einkünfte aus Vermietung, <em>Jahr für Jahr.</em></>} {...seite}>
        <p className="ba-lead">
          {t(
            "Ein negatives Ergebnis verrechnet das Finanzamt mit Ihrem übrigen Einkommen. Daraus entsteht die Steuerersparnis auf der nächsten Seite.",
            "The tax office offsets a negative result against your other income. This creates the tax savings shown on the next page.",
          )}
        </p>
        <table className={`ba-tab ba-jahre ba-abstand-gross${tabelle.length <= 15 ? " ba-wenig" : ""}`}>
          <thead>
            <tr>
              <th>{t("Jahr", "Year")}</th>
              <th>{t("Mieteinnahmen", "Rental income")}</th>
              <th>{t("Werbungskosten", "Income-related expenses")}</th>
              <th>{t("AfA gesamt", "Total depreciation")}</th>
              <th>{t("Laufende Kosten", "Running costs")}</th>
              <th>{t("Zinsen", "Interest")}</th>
              <th>{t("Einkünfte V+V", "Rental result")}</th>
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
          {t(
            "Werbungskosten: Finanzierungsnebenkosten im ersten Jahr, Umschuldungskosten und Erhaltungsaufwand. AfA gesamt: Gebäude, Sonder-AfA und Möbel; die Möbel werden nur bis zu ihrem Restbuchwert abgeschrieben.",
            "Income-related expenses: financing costs in the first year, refinancing costs and maintenance expenses. Total depreciation: building, special depreciation and furniture; furniture is depreciated only up to its residual book value.",
          )}
          {result.sonderAfa.beantragt
            ? ` ${result.sonderAfa.zulaessig ? t("Sonder-AfA nach § 7b", "Special depreciation under Sec. 7b") : t("Keine Sonder-AfA nach § 7b", "No special depreciation under Sec. 7b")}${en ? "." : `: ${result.sonderAfa.hinweis}`}`
            : ""}
        </p>
      </Seite>

      {/* 10 Steuerkalkulation */}
      <Seite nr={10} kick={t("Steuerkalkulation", "Tax calculation")} titel={en ? <>Your tax before and after <em>the purchase.</em></> : <>Ihre Steuer vor und nach <em>dem Kauf.</em></>} {...seite}>
        <table className={`ba-tab ba-jahre ba-abstand-gross${tabelle.length <= 15 ? " ba-wenig" : ""}`}>
          <thead>
            <tr>
              <th>{t("Jahr", "Year")}</th>
              <th>{t("Einkommen vor Kauf", "Income before purchase")}</th>
              <th>{t("Ergebnis V+V", "Rental result")}</th>
              <th>{t("Einkommen nach Kauf", "Income after purchase")}</th>
              <th>{t("Steuer vor Kauf", "Tax before purchase")}</th>
              <th>{t("Steuer nach Kauf", "Tax after purchase")}</th>
              <th>{t("Steuerersparnis", "Tax savings")}</th>
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
              <td colSpan={6}>{t("Steuerersparnis gesamt", "Total tax savings")}</td>
              <td>{euro(werte.steuerSumme)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="ba-klein ba-abstand">
          {input.taxCalculationMode === "manual"
            ? t(
                `Gerechnet mit einem festen persönlichen Steuersatz von ${prozent(input.marginalTaxRate, 1)} auf das Ergebnis, Zuschläge eingerechnet; eine Erstattung gibt es höchstens bis zur Steuer vor dem Kauf.`,
                `Calculated with a fixed personal tax rate of ${prozent(input.marginalTaxRate, 1)} on the result, surcharges included; a refund is limited to the tax before the purchase.`,
              )
            : t(
                `Steuer nach dem Tarif 2026 (§ 32a EStG), jeweils mit Solidaritätszuschlag${input.churchTaxRate ? " und Kirchensteuer" : ""}.`,
                `Tax under the 2026 tariff (Sec. 32a EStG), including solidarity surcharge${input.churchTaxRate ? " and church tax" : ""}.`,
              )}{" "}
          {t(`Das Einkommen wächst mit ${prozent(input.annualTaxableIncomeGrowth, 1)} im Jahr.`, `Income grows by ${prozent(input.annualTaxableIncomeGrowth, 1)} a year.`)}
        </p>
      </Seite>

      {/* 11 Steuererklärung */}
      <Seite nr={11} kick={t("Steuererklärung", "Tax return")} titel={en ? <>Form V in the first year, <em>simplified.</em></> : <>Anlage V im ersten Jahr, <em>vereinfacht.</em></>} {...seite}>
        <p className="ba-lead">
          {t(
            `So stehen die Zahlen des Jahres ${start} sinngemäß in der Anlage V Ihrer Einkommensteuererklärung.`,
            `This is roughly how the figures for ${start} appear in Form V (Anlage V) of your German income tax return.`,
          )}
        </p>
        <div className="ba-zwei ba-abstand-gross">
          <Tabelle
            zeilen={[
              [t("Mieteinnahmen", "Rental income"), euro(erstes.effectiveRent)],
              [t("Werbungskosten (Finanzierung, Erhaltung)", "Income-related expenses (financing, maintenance)"), mitZeichen(-werbungskosten(erstes))],
              [t("Absetzung für Abnutzung", "Depreciation"), mitZeichen(-afaGesamt(erstes))],
              [t("Laufende Kosten", "Running costs"), mitZeichen(-laufendeKosten(erstes))],
              [t("Schuldzinsen", "Loan interest"), mitZeichen(-erstes.interest)],
            ]}
            summe={[t("Einkünfte aus Vermietung", "Income from letting"), <span className={tonKlasse(erstes.taxableResult)}>{mitZeichen(erstes.taxableResult)}</span>]}
          />
          <div className="ba-kacheln1">
            <Kachel dunkel label={t(`Steuerersparnis ${start}`, `Tax savings ${start}`)} wert={euro(erstes.taxEffect)} text={t(`rund ${euro(erstes.taxEffect / werte.ersteMonate)} im Monat`, `about ${euro(erstes.taxEffect / werte.ersteMonate)} per month`)} />
            <Kachel label={t("Steuer vor dem Kauf", "Tax before the purchase")} wert={euro(erstes.taxBefore.totalTax)} text={t(`bei ${euro(erstes.taxableIncomeBefore)} Einkommen`, `on ${euro(erstes.taxableIncomeBefore)} income`)} />
            <Kachel label={t("Steuer nach dem Kauf", "Tax after the purchase")} wert={euro(erstes.taxAfter.totalTax)} text={t(`bei ${euro(erstes.taxableIncomeAfter)} Einkommen`, `on ${euro(erstes.taxableIncomeAfter)} income`)} />
          </div>
        </div>
        <div className="ba-note">
          <b>{t("Tipp: Freibetrag beantragen.", "Tip: apply for a tax allowance.")}</b>{" "}
          {t(
            "Mit einem Antrag auf Lohnsteuer-Ermäßigung wirkt die Ersparnis schon mit jedem Gehalt und nicht erst mit dem Steuerbescheid.",
            "With an application for a wage tax reduction, the savings take effect with every salary payment and not only with the tax assessment.",
          )}
        </div>
      </Seite>

      {/* 12 Hinweise */}
      <Seite nr={12} kick={t("Hinweise", "Notes")} titel={en ? <>What this calculation is <em>and what it is not.</em></> : <>Was diese Rechnung ist <em>und was nicht.</em></>} {...seite}>
        <div className="ba-texte ba-einspaltig">
          <div>
            <h3>{t("Eine Prognose", "A forecast")}</h3>
            <p>
              {t(
                "Die Rechnung beruht auf Annahmen zu Miete, Kosten, Wertentwicklung, Zins und Steuer. Die Wirklichkeit kann davon nach oben und unten abweichen. Werte der Immobilie sind Beispiele und keine Wertermittlung.",
                "The calculation is based on assumptions about rent, costs, value development, interest and tax. Reality may deviate up or down. Property values are examples, not a valuation.",
              )}
            </p>
          </div>
          <div>
            <h3>{t("Keine Steuerberatung", "No tax advice")}</h3>
            <p>
              {t(
                "Die Steuer ist vereinfacht nach dem Tarif 2026 gerechnet, für alle Jahre gleich. Nicht abgebildet sind Verlustvorträge und Verlustrückträge, der Progressionsvorbehalt, Änderungen des Tarifs und individuelle Abzüge. Sanierungsanteil, Sonder-AfA nach § 7b und die 15-Prozent-Grenze hängen an Voraussetzungen, die nur die Steuerberatung verbindlich prüfen kann. Die Anerkennung liegt beim Finanzamt.",
                "Tax is calculated in simplified form under the 2026 tariff, the same for all years. Not covered are loss carry-forwards and carry-backs, the progression proviso, changes to the tariff and individual deductions. The renovation share, special depreciation under Sec. 7b and the 15 percent limit depend on conditions that only a tax adviser can check reliably. Recognition lies with the tax office.",
              )}
            </p>
          </div>
          <div>
            <h3>{t("Keine Finanzierungszusage", "No financing commitment")}</h3>
            <p>
              {t(
                "Zins, Tilgung, Zinsbindung und Anschlussfinanzierung sind Beispiele. Die Konditionen legt die Bank erst bei der Kreditentscheidung fest.",
                "Interest, repayment, fixed-rate period and follow-up financing are examples. The bank only sets the terms when it decides on the loan.",
              )}
            </p>
          </div>
          <div>
            <h3>{t("Kein Ersatz für Unterlagen", "No substitute for documents")}</h3>
            <p>
              {t(
                "Maßgeblich sind Kaufvertrag, Teilungserklärung, Wirtschaftsplan und Protokolle der Eigentümerversammlung. Umlagefähige Nebenkosten zahlt der Mieter, sie stehen deshalb nicht in der Rechnung.",
                "The purchase contract, declaration of division, budget plan and minutes of the owners' meetings are decisive. Recoverable service charges are paid by the tenant and are therefore not part of the calculation.",
              )}
            </p>
          </div>
          <div>
            <h3>{t("Verkauf vor zehn Jahren", "Sale within ten years")}</h3>
            <p>
              {t(
                "Wer früher verkauft, versteuert den Gewinn, und Kauf- und Verkaufskosten schmälern das Ergebnis. Die Rechnung zieht diese Steuer nicht ab und setzt einen langen Anlagehorizont voraus.",
                "Anyone who sells earlier pays tax on the gain, and purchase and selling costs reduce the result. The calculation does not deduct this tax and assumes a long investment horizon.",
              )}
            </p>
          </div>
        </div>
      </Seite>
    </div>
  );
}
