import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ChevronRight, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatEuro, formatEuroCent, formatProzentEineStelle, formatZahl } from "@/lib/investmentrechner/formatierer";
import {
  eigenkapitalrendite,
  eigenkapitalrenditeNebenkosten,
  type InvestmentEingabe,
  type Jahreswert,
  type InvestmentErgebnis,
} from "@/lib/investmentrechner/rechenkern";
import { useRechnerTexte } from "./RechnerSprache";
import { rechenwege, type Rechenweg } from "@/lib/investmentrechner/kennzahlErklaerungen";
import { hinweisOhneSteuerwirkung } from "@/lib/investmentrechner/dokumentTexte";
import type { Feldmarkierung } from "@/lib/investmentrechner/herkunft";

/*
 * Eingabebausteine des Investmentrechners, eins zu eins aus der Web-App
 * (Original q, J, me, Y, he, X, Z). Die Klassennamen sind die des Originals
 * und werden in src/styles/investmentrechner.css unter .investmentrechner
 * gestaltet.
 */

/**
 * Kleines Info-Symbol neben einem Feld-Label, das eine kurze Erklärung zeigt.
 *
 * Die Felder stecken in einem <label>. Ein normaler Klick würde deshalb das
 * Eingabefeld fokussieren oder den Schalter umlegen. Darum wird das Standard-
 * verhalten schon beim Zeigergedrückt abgefangen und der Tooltip selbst über
 * den Klick geöffnet, so wie bei SidebarInfoTooltip in AppSidebar.tsx. Damit
 * funktioniert das Antippen auch auf dem Handy.
 *
 * Der TooltipProvider hängt bereits in App.tsx und umschließt die Route, hier
 * wird deshalb bewusst kein zweiter angelegt.
 */
export function FeldInfo({ text }: { text: string }) {
  const [offen, setOffen] = useState(false);
  useEffect(() => {
    if (!offen) return;
    const schliessen = () => setOffen(false);
    window.addEventListener("scroll", schliessen, true);
    const zeitgeber = window.setTimeout(schliessen, 8000);
    return () => {
      window.removeEventListener("scroll", schliessen, true);
      window.clearTimeout(zeitgeber);
    };
  }, [offen]);
  return (
    <Tooltip open={offen} onOpenChange={setOffen}>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label="Erklärung"
          className="field-info"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOffen((v) => !v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              setOffen((v) => !v);
            }
          }}
        >
          <Info size={13} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-xs text-xs font-normal leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Herkunftsetiketten an den Feldern, nur in der Investmentkalkulation Plus
 * (09.10.2026). Der Rechner schaltet sie mit diesem Kontext ein, damit nicht
 * jedes Feld einen Schalter durchgereicht bekommen muss.
 */
export const FeldetikettKontext = createContext(false);

const FELDETIKETT_TEXT: Record<Feldmarkierung, string> = {
  objekt: "Objekt",
  selbstauskunft: "Kunden-SA",
  manuell: "Manuell",
};

/** Das Etikett hinter der Beschriftung. Ohne Angabe gilt das Feld als manuell. */
export function Feldetikett({ art = "manuell" }: { art?: Feldmarkierung }) {
  if (!useContext(FeldetikettKontext)) return null;
  return (
    <span className={`feldetikett feldetikett-${art}`} data-testid="feldetikett">
      {FELDETIKETT_TEXT[art]}
    </span>
  );
}

interface ZahlenfeldProps {
  label: string;
  value: number;
  onChange: (wert: number) => void;
  suffix?: string;
  step?: string;
  min?: number;
  hint?: string;
  tooltip?: string;
  /**
   * Gesperrt heisst: sichtbar, aber nicht aenderbar. Ein verschwundenes Feld
   * sieht aus wie ein Fehler, ein graues erklaert sich mit seinem Hinweis.
   */
  gesperrt?: boolean;
  /** Herkunftsetikett, siehe `Feldetikett`. */
  markierung?: Feldmarkierung;
}

export function Zahlenfeld({ label, value, onChange, suffix, step = "any", min = 0, hint, tooltip, gesperrt, markierung }: ZahlenfeldProps) {
  return (
    <label className="field" data-gesperrt={gesperrt ? "ja" : undefined}>
      <span className="field-label">
        {label}
        {tooltip && <FeldInfo text={tooltip} />}
        <Feldetikett art={markierung} />
      </span>
      <span className="input-shell">
        <input
          inputMode="decimal"
          min={min}
          step={step}
          type="number"
          value={value || ""}
          disabled={gesperrt}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && <span className="input-suffix">{suffix}</span>}
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

interface TextfeldProps {
  label: string;
  value: string;
  onChange: (wert: string) => void;
  placeholder?: string;
  hint?: string;
  tooltip?: string;
  /** Herkunftsetikett, siehe `Feldetikett`. */
  markierung?: Feldmarkierung;
}

export function Textfeld({ label, value, onChange, placeholder, hint, tooltip, markierung }: TextfeldProps) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {tooltip && <FeldInfo text={tooltip} />}
        <Feldetikett art={markierung} />
      </span>
      <span className="input-shell">
        <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

interface AuswahlOderTextProps {
  label: string;
  value: string;
  onChange: (wert: string) => void;
  /** Die angebotenen Vorschläge, in der Reihenfolge der Auswahl. */
  vorschlaege: readonly string[];
  /** Beschriftung der leeren Zeile ganz oben. */
  leerText?: string;
  placeholder?: string;
  hint?: string;
  tooltip?: string;
  /** Herkunftsetikett, siehe `Feldetikett`. */
  markierung?: Feldmarkierung;
}

/** Kennung der Zeile „Eigene Angabe", sie steht für keinen echten Wert. */
const EIGENE_ANGABE = "__eigene__";

/**
 * Auswahl mit Freitext.
 *
 * Eine reine Auswahlliste wäre zu eng, ein reines Textfeld hilft niemandem.
 * Deshalb gibt es beides: die häufigen Fälle als Liste, darunter bei Bedarf ein
 * Textfeld für alles andere.
 *
 * Wichtig für Bestandsdaten: Steht im Wert etwas, das zu keinem Vorschlag
 * passt, schaltet das Feld von selbst auf „Eigene Angabe" und zeigt den alten
 * Wert im Textfeld. Es geht also nichts verloren, auch nicht bei Werten, die
 * aus der Objektanlage übernommen wurden.
 *
 * Statt eines umschließenden <label> steht hier ein <div>: Zwei Bedienelemente
 * unter einer Beschriftung wären mit einem gemeinsamen Label mehrdeutig, beide
 * tragen deshalb ihre eigene Beschriftung.
 */
export function AuswahlOderText({
  label,
  value,
  onChange,
  vorschlaege,
  leerText = "Bitte wählen",
  placeholder,
  hint,
  tooltip,
  markierung,
}: AuswahlOderTextProps) {
  const [freiGewaehlt, setFreiGewaehlt] = useState(false);
  // Ein vorhandener Wert außerhalb der Liste öffnet das Textfeld von selbst.
  const eigenerWert = value !== "" && !vorschlaege.includes(value);
  const frei = freiGewaehlt || eigenerWert;
  return (
    <div className="field">
      <span className="field-label">
        {label}
        {tooltip && <FeldInfo text={tooltip} />}
        <Feldetikett art={markierung} />
      </span>
      <span className="select-shell">
        <select
          aria-label={label}
          value={frei ? EIGENE_ANGABE : value}
          onChange={(e) => {
            const gewaehlt = e.target.value;
            if (gewaehlt === EIGENE_ANGABE) {
              // Der bisherige Wert bleibt stehen und lässt sich weiterschreiben.
              setFreiGewaehlt(true);
              return;
            }
            setFreiGewaehlt(false);
            onChange(gewaehlt);
          }}
        >
          <option value="">{leerText}</option>
          {vorschlaege.map((vorschlag) => (
            <option key={vorschlag} value={vorschlag}>
              {vorschlag}
            </option>
          ))}
          <option value={EIGENE_ANGABE}>Eigene Angabe</option>
        </select>
      </span>
      {frei && (
        <span className="input-shell" style={{ marginTop: 6 }}>
          <input
            type="text"
            aria-label={`${label}, eigene Angabe`}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        </span>
      )}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

interface TextbereichProps {
  label: string;
  value: string;
  onChange: (wert: string) => void;
  placeholder?: string;
  hint?: string;
  /** Sichtbare Zeilen, Standard fünf wie in der Vorlage. */
  rows?: number;
  tooltip?: string;
}

export function Textbereich({ label, value, onChange, placeholder, hint, rows = 5, tooltip }: TextbereichProps) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {tooltip && <FeldInfo text={tooltip} />}
      </span>
      <span className="textarea-shell">
        <textarea rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

interface AuswahlfeldProps {
  label: string;
  value: string | number;
  onChange: (wert: string) => void;
  children: ReactNode;
  hint?: string;
  tooltip?: string;
  /** Herkunftsetikett, siehe `Feldetikett`. */
  markierung?: Feldmarkierung;
}

export function Auswahlfeld({ label, value, onChange, children, hint, tooltip, markierung }: AuswahlfeldProps) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {tooltip && <FeldInfo text={tooltip} />}
        <Feldetikett art={markierung} />
      </span>
      <span className="select-shell">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {children}
        </select>
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

interface SchalterfeldProps {
  label: string;
  checked: boolean;
  onChange: (wert: boolean) => void;
  hint?: string;
  tooltip?: string;
}

export function Schalterfeld({ label, checked, onChange, hint, tooltip }: SchalterfeldProps) {
  return (
    <label className="toggle-field">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track">
        <i />
      </span>
      <span>
        <strong>
          {label}
          {tooltip && <FeldInfo text={tooltip} />}
        </strong>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

interface BereichsknopfProps {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  /**
   * Vermerk, für wen der Bereich gilt, etwa „alle Objekte" oder „Objekt A".
   * Bleibt leer, solange nur ein Objekt gerechnet wird.
   */
  vermerk?: string;
  /** true, wenn der Vermerk für alle Objekte gilt (andere Farbe). */
  vermerkFuerAlle?: boolean;
}

export function Bereichsknopf({ active, icon, label, onClick, vermerk, vermerkFuerAlle }: BereichsknopfProps) {
  return (
    <button className={`section-button ${vermerk ? "with-scope" : ""} ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {vermerk && <span className={`section-scope ${vermerkFuerAlle ? "scope-all" : ""}`}>{vermerk}</span>}
      <ChevronRight size={16} />
    </button>
  );
}

interface ObjektkarteProps {
  /** Kennzeichnung des Objekts, etwa „Objekt A". */
  marke: string;
  titel: string;
  adresse: string;
  preis: string;
  /** Seite im Vergleich, steuert nur die Farbe der Kopfzeile. */
  seite: "a" | "b";
  /** Drei kurze Kennzahlen unter der Kopfzeile. */
  werte: { label: string; wert: string }[];
}

/**
 * Kopfkarte eines Objekts im Vergleich. Dieselbe Karte trägt die
 * Vergleichsansicht und die Vergleichsseite des Exposés, nur die drei
 * Kennzahlen unterscheiden sich je nach Zusammenhang.
 */
export function Objektkarte({ marke, titel, adresse, preis, seite, werte }: ObjektkarteProps) {
  return (
    <div className={`compare-card side-${seite}`}>
      <div className="compare-card-head">
        <div>
          <small>{marke}</small>
          <strong>{titel}</strong>
          <span>{adresse}</span>
        </div>
        <b>{preis}</b>
      </div>
      <div className="compare-card-values">
        {werte.map((eintrag) => (
          <div key={eintrag.label}>
            <small>{eintrag.label}</small>
            <b>{eintrag.wert}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

interface KennzahlkarteProps {
  label: string;
  value: string;
  accent?: "gold" | "green" | "red";
  note?: string;
  /**
   * Nimmt zwei der sechs Spalten ein. Gedacht für die Zahlen, die eine Zeile
   * abschließen: die Kreditrate neben der Kaltmiete und das Gesamtvermögen am
   * Ende der Vermögenszeile.
   */
  wide?: boolean;
  /** Der Rechenweg unter der Zahl, siehe kennzahlErklaerungen.ts. */
  rechenweg?: Rechenweg | null;
}

export function Kennzahlkarte({ label, value, accent, note, wide, rechenweg }: KennzahlkarteProps) {
  const klassen = ["metric-card", accent ? `metric-${accent}` : "", wide ? "metric-wide" : ""];
  return (
    <div className={klassen.filter(Boolean).join(" ")}>
      <span>{label}</span>
      <strong>{value}</strong>
      <RechenwegZeile weg={rechenweg} />
      {note && <small>{note}</small>}
    </div>
  );
}

/**
 * Die kleine graue Zeile unter einer Zahl, die zeigt, wie sie entsteht.
 *
 * Ein eigenes <p> und kein <span> oder <small>: Die Kacheln gestalten ihre
 * Spans als Überschrift in Großbuchstaben und ihre Smalls als Einordnung, die
 * Zeile soll von beidem nichts erben. Sie ist bewusst leise gesetzt, siehe
 * `.rechenweg` im Stylesheet.
 */
export function RechenwegZeile({ weg }: { weg: Rechenweg | null | undefined }) {
  if (!weg) return null;
  return <p className="rechenweg">{weg.text}</p>;
}

/** Ein Betrag mit Vorzeichen, das Minus als Rechenzeichen U+2212. */
export function mitVorzeichen(wert: number, format: (betrag: number) => string): string {
  const betrag = format(Math.abs(wert));
  // Was gerundet null ist, bekommt kein Zeichen, wie im Rechenweg darunter.
  if (betrag === format(0)) return betrag;
  return wert > 0 ? `+${betrag}` : `−${betrag}`;
}

/**
 * Die dunklen Kacheln der ersten Seite, in Analyse und Berechnung gleich.
 *
 * Seit dem 25.09.2026 in zwei Reihen:
 *
 * 1. Der Cashflow und der Vermögensaufbau. Die Cashflow-Kachel ist geteilt,
 *    oben vor Steuer, darunter nach Steuer, beide pro Monat im ersten Jahr.
 *    Ihre Überschrift folgt dem Vorzeichen nach Steuer: „Das bekommst du
 *    raus“ oder „Das zahlst du monatlich drauf“.
 * 2. Gesamtvermögen, Steuereffekt im ersten Jahr und der Steuereffekt über
 *    den ganzen Betrachtungszeitraum.
 *
 * Seit dem 30.09.2026 steht in der Kachel „Vermögensaufbau“ zusätzlich die
 * Eigenkapitalrendite nach Christians Formel, siehe `eigenkapitalrendite` im
 * Rechenkern.
 *
 * Bis zum 25.09.2026 stand in der ersten Reihe die Kachel „Rendite auf dein
 * eingesetztes Geld“, ein interner Zinsfuß. Christian hat sie gestrichen. Der
 * Rechenkern rechnet den Zinsfuß weiter, der Objektvergleich zeigt ihn.
 *
 * Die Werte folgen dem Vorzeichen. Eine Minuszahl bleibt rot, sonst behauptet
 * die Farbe das Gegenteil der Zahl. Deshalb wird am Wert geprüft statt am
 * Text: Das Minuszeichen von Intl.NumberFormat lässt sich nicht zuverlässig
 * am Zeichen erkennen.
 */
export function Cashflowleiste({
  input, jahr, result,
}: { input: InvestmentEingabe; jahr: Jahreswert; result: InvestmentErgebnis }) {
  const { sprache, texte: dokument, kennzahl: texte } = useRechnerTexte();
  const euro = (wert: number) => formatEuro(wert, sprache);
  const euroCent = (wert: number) => formatEuroCent(wert, sprache);
  const wege = rechenwege(input, result, texte, sprache);
  const steuerhinweis =
    input.taxCalculationMode === "tariff"
      ? dokument.cashflowleiste.tarif(input.jointAssessment)
      : dokument.cashflowleiste.manuell(formatZahl(input.marginalTaxRate, sprache, 3));

  const jahre = result.years.length;
  const letztesJahr = result.years[jahre - 1];
  const vorSteuerMonat = jahr.cashflowBeforeTax / 12;
  const nachSteuerMonat = jahr.cashflowAfterTax / 12;
  // Null zählt als „bekommst du raus“: Es wird nichts zugezahlt.
  const zahltDrauf = nachSteuerMonat < 0;
  // Ohne Einkommen oder Satz sind beide Cashflows gleich; ein Satz sagt warum (30.09.2026).
  const ohneSteuerwirkung = hinweisOhneSteuerwirkung(input, result, sprache);
  const ekr = eigenkapitalrendite(input, result);
  const nebenkosten = eigenkapitalrenditeNebenkosten(input, result);
  const prozentEins = (wert: number) => formatProzentEineStelle(wert, sprache);

  return (
    <>
      <div className="cashflow-band cashflow-band--oben">
        <div className={`cashflow-geteilt ${zahltDrauf ? "zahlt-drauf" : ""}`}>
          <span>{zahltDrauf ? texte.kacheln.zahlstDuDrauf : texte.kacheln.bekommstDuRaus}</span>
          <div className={`cashflow-teil ${vorSteuerMonat < 0 ? "negativ" : ""}`}>
            <small className="cashflow-teil-label">{texte.kacheln.cashflowVorSteuer}</small>
            <strong>{mitVorzeichen(vorSteuerMonat, euroCent)}</strong>
            <RechenwegZeile weg={wege.cashflowVorSteuer} />
          </div>
          <div className={`cashflow-teil ${zahltDrauf ? "negativ" : ""}`}>
            <small className="cashflow-teil-label">{texte.kacheln.cashflowNachSteuer}</small>
            <strong>{mitVorzeichen(nachSteuerMonat, euroCent)}</strong>
            <RechenwegZeile weg={wege.cashflowNachSteuer} />
            {ohneSteuerwirkung && (
              <p className="rechenweg" data-testid="hinweis-ohne-steuerwirkung">{ohneSteuerwirkung}</p>
            )}
          </div>
        </div>
        <div>
          <span>{texte.kacheln.vermoegensaufbau}</span>
          <strong>{euroCent(result.vermoegensaufbauMonat)}</strong>
          <RechenwegZeile weg={wege.vermoegensaufbau} />
          <small>
            {texte.zusaetze.imMonat} · {texte.zusaetze.davonTilgung(euroCent(result.tilgungMonat))}
            {result.faktorJeEuro > 0
              ? ` · ${texte.zusaetze.jeEingezahltemEuro(
                  formatZahl(result.faktorJeEuro, sprache, 2),
                )}`
              : ""}
          </small>
          {/*
            Eigenkapitalrendite, seit dem 30.09.2026 in dieser Kachel (Christian):
            Hier ist Platz, die untere Reihe bleibt bei drei Kacheln. Ein eigenes
            Teilstück wie in der Cashflow-Kachel, damit die Kachel weiter genau
            eine eigene Zahl und einen Rechenweg trägt.
          */}
          <div
            className={`cashflow-teil ekr-teil ${ekr.rendite !== null && ekr.rendite < 0 ? "negativ" : ""}`}
            data-testid="kachel-eigenkapitalrendite"
          >
            {/* Zahl zuerst, linksbündig unter der Zahl des Vermögensaufbaus, die Beschriftung dahinter (Christian, 30.09.2026). */}
            {ekr.rendite !== null ? (
              <>
                <div className="ekr-zeile">
                  <strong>{prozentEins(ekr.rendite)}</strong>
                  <small className="cashflow-teil-label">{texte.kacheln.eigenkapitalrendite}</small>
                </div>
                <RechenwegZeile weg={wege.eigenkapitalrendite} />
              </>
            ) : (
              <>
                <small className="cashflow-teil-label">{texte.kacheln.eigenkapitalrendite}</small>
                <p className="rechenweg" data-testid="eigenkapitalrendite-nicht-bestimmbar">
                  {texte.zusaetze.eigenkapitalrenditeNichtBestimmbar}
                </p>
              </>
            )}
            <small data-testid="eigenkapitalrendite-hinweis">
              {texte.zusaetze.eigenkapitalrenditeHinweis}
              {nebenkosten &&
                ` ${texte.zusaetze.eigenkapitalrenditeNebenkosten({
                  selbstGezahlt: nebenkosten.selbstGezahlt,
                  kaufnebenkosten: euro(nebenkosten.kaufnebenkosten),
                  rendite: nebenkosten.vergleich.rendite !== null ? prozentEins(nebenkosten.vergleich.rendite) : null,
                  rate: euroCent(Math.abs(nebenkosten.rateDifferenzMonat)),
                })}`}
            </small>
          </div>
        </div>
      </div>

      {/*
        "Gesamtvermoegen" ist `totalWealth`, also Immobilie minus Restschuld
        plus die Summe der Cashflows nach Steuer, nicht der reine
        Immobilienwert: Eine belastete Immobilie ist nicht das Vermoegen ihres
        Eigentuemers.

        Der Steuereffekt gesamt ist `cumulativeTaxEffect`, die Summe der
        Jahreswerte aus der Jahrestabelle ueber genau den eingestellten
        Betrachtungszeitraum.
      */}
      <div className="cashflow-band cashflow-band--drei">
        <div className={`steuer ${(letztesJahr?.totalWealth ?? 0) >= 0 ? "" : "negativ"}`}>
          <span>{texte.kacheln.gesamtvermoegen(jahre)}</span>
          <strong>{euro(letztesJahr?.totalWealth ?? 0)}</strong>
          <RechenwegZeile weg={wege.gesamtvermoegen} />
        </div>
        <div className={`steuer ${jahr.taxEffect >= 0 ? "" : "negativ"}`}>
          <span>{texte.kacheln.steuereffektErstesJahr}</span>
          <strong>{mitVorzeichen(jahr.taxEffect, euro)}</strong>
          <RechenwegZeile weg={wege.steuereffektErstesJahr} />
          <small>
            {texte.zusaetze.steuereffektMonat(mitVorzeichen(jahr.taxEffect / 12, euroCent))} · {steuerhinweis}
          </small>
        </div>
        <div className={`steuer ${result.cumulativeTaxEffect >= 0 ? "" : "negativ"}`}>
          <span>{texte.kacheln.steuereffektGesamt(jahre)}</span>
          <strong>{mitVorzeichen(result.cumulativeTaxEffect, euro)}</strong>
          <RechenwegZeile weg={wege.steuereffektGesamt} />
          <small>
            {texte.zusaetze.steuereffektZeitraum(
              result.years[0]?.year ?? input.startYear,
              letztesJahr?.year ?? input.startYear,
            )}
          </small>
        </div>
      </div>
    </>
  );
}
