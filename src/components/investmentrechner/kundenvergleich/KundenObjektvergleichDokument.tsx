/**
 * Persönlicher Objektvergleich als Dokument (Christian, 28.10.2026).
 *
 * Zwölf A4-Seiten im Aufbau des Vergleichs vom 28.10.2026 (Vorlage
 * `build.py`): Deckblatt, Ausgangslage, Wohnungen, Vergleich, Rechnung A und
 * B, Vermögensentwicklung, Empfehlung, Investmentsheet A und B, Freibetrag
 * nach § 39a, Steuerersparnis im Detail. Jede Seite ist eine `.expose-page`,
 * damit der vorhandene Bild-PDF-Export (`erzeugeBerechnungsansichtPdf`) sie
 * fotografieren kann. Zahlen aus `kundenObjektvergleich.ts`.
 *
 * Seit dem 29.10.2026 auch Deutsch oder Englisch (`sprache`), für die
 * ausführliche Berechnung des Investmentrechners: Kunden mit Sprache
 * Englisch bekommen alles auf Englisch. Jeder Text steht dafür als
 * `t(deutsch, englisch)`; Zahlen, Prozent und Euro formatiert `k.f` in der
 * Sprache. Das Fotodeckblatt des persönlichen Objektvergleichs bleibt deutsch.
 */
import { createContext, useContext, type ReactNode } from "react";
import "./kundenObjektvergleich.css";
import {
  STANDARD_SCHRITTE, empfohlen, haeuseruebergreifend, kriterien, nachrangFall, objektVon, rundeHalbAuf,
  type EinheitErgebnis, type KundenObjektvergleich, type VergleichAnnahmen, type VergleichObjekt,
} from "@/lib/investmentrechner/kundenObjektvergleich";

// Importiert statt als Adresse, damit die Bilder auch im Artefakt (eine HTML-Datei) mitkommen.
import LOGO from "../../../../public/images/objektvergleich/logo-hell.png";
// Dunkle Fassung auf dunklem Grund, wie auf dem Deckblatt der System-PDFs (pdfBranding, ICON_URL).
import LOGO_DUNKEL from "../../../../public/images/os-real-estate-logo-quer-dunkel.png";
import P39A_1 from "../../../../public/images/objektvergleich/p39a-1.png";
import P39A_2 from "../../../../public/images/objektvergleich/p39a-2.png";
import P39A_3 from "../../../../public/images/objektvergleich/p39a-3.png";
import P39A_4 from "../../../../public/images/objektvergleich/p39a-4.png";
const P39A = [P39A_1, P39A_2, P39A_3, P39A_4];
/** Seitenzahl gesamt; je nach Zahl der Wohnungen und Kundendaten 8 bis 13. */
const SeitenKontext = createContext(13);

// ---------------------------------------------------------------------------
// Formate wie in der Vorlage: kaufmännisch gerundet, Minus als „−“, „ €“ geschützt
// ---------------------------------------------------------------------------

interface Format {
  en: boolean;
  de: (x: number, d?: number) => string;
  eur: (x: number, d?: number) => string;
  tsd: (x: number) => string;
  pz: (x: number, d?: number) => string;
  pzGanz: (x: number) => string;
  /** Der Text in der Sprache des Dokuments. */
  t: <T>(deutsch: T, englisch: T) => T;
  /** JJJJ-MM-TT als 29.10.2026 bzw. 29/10/2026. */
  tag: (iso: string) => string;
}

function formatFuer(en: boolean): Format {
  const zahl = (x: number, d = 2) => {
    const q = rundeHalbAuf(Math.abs(x), d);
    const s = q.toLocaleString(en ? "en-GB" : "de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
    return (x < 0 && q !== 0 ? "−" : "") + s;
  };
  const eurF = (x: number, d = 2) => (en ? zahl(x, d).replace(/^(−?)/, "$1€") : `${zahl(x, d)}\u00a0€`);
  const prozent = (s: string) => (en ? `${s}%` : `${s}\u00a0%`);
  return {
    en,
    de: zahl,
    eur: eurF,
    tsd: (x) => eurF(Math.round(x / 1000) * 1000, 0),
    pz: (x, d = 1) => prozent(zahl(x * 100, d)),
    pzGanz: (x) => prozent(zahl(x * 100, x * 100 === Math.round(x * 100) ? 0 : 1)),
    t: (deutsch, englisch) => (en ? englisch : deutsch),
    tag: (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join(en ? "/" : ".") : iso),
  };
}

const DEUTSCH = formatFuer(false);
export const de = DEUTSCH.de;
export const eur = DEUTSCH.eur;
export const tsd = DEUTSCH.tsd;
const pzGanz = DEUTSCH.pzGanz;
const tagDe = DEUTSCH.tag;

interface Kontext {
  v: KundenObjektvergleich;
  A: EinheitErgebnis;
  /** Fehlt bei einer einzelnen Wohnung (ausführliche Berechnung des Investmentrechners). */
  B: EinheitErgebnis | null;
  /** A, oder A und B. */
  liste: EinheitErgebnis[];
  seiteFreibetrag: number;
  seiteSteuer: number;
  stand: string;
  anrede: string;
  fuss: string;
  /** Häuserübergreifend: Wohnung A und B liegen in verschiedenen Objekten. */
  haeuser: boolean;
  /** Das Haus einer Wohnung. */
  haus: (e: EinheitErgebnis) => VergleichObjekt;
  /** Sprache und Zahlenformat des Dokuments. */
  f: Format;
}

/** „des Wirtschaftsplans 2027“ bzw. „laut …“, für den Satz auf dem Deckblatt. */
const wpGenitiv = (wp: string) => (/^Wirtschaftsplan \d{4}$/.test(wp) ? `des Wirtschaftsplans ${wp.slice(-4)}` : `laut ${wp}`);
/** „Wirtschaftsplan 2027“ auf Englisch. */
const wpText = (f: Format, wp: string) => (f.en ? wp.replace(/^Wirtschaftsplan\b/, "Service charge budget") : wp);
/** Wirtschaftsplan beider Häuser, gleich oder verschieden. */
const wpBeide = (k: Kontext) => {
  const a = wpText(k.f, k.haus(k.A).wirtschaftsplan), b = k.B ? wpText(k.f, k.haus(k.B).wirtschaftsplan) : a;
  return a === b ? a : `${a} ${k.f.t("bzw.", "and")} ${b}`;
};

/** „pauschal 42 % wie im Exposé“ oder, aus dem Einkommen gerechnet, „von 38,2 % aus Ihrem Einkommen“. */
const steuerWie = (an: VergleichAnnahmen, f: Format = DEUTSCH) =>
  an.steuerArt === "einkommen"
    ? f.t(`${f.pzGanz(an.steuer)}, gerechnet aus Ihrem Einkommen`, `${f.pzGanz(an.steuer)}, based on your income`)
    : f.t(`pauschal ${f.pzGanz(an.steuer)} wie im Exposé`, `a flat ${f.pzGanz(an.steuer)} as in the exposé`);

/** Punkte zum Haus, die das System selbst bildet (Baujahr, Energieklasse, Verwaltung), auf Englisch. */
const punktText = (f: Format, p: string) =>
  f.en
    ? p.replace(/^Baujahr (\d+)$/, "Built in $1").replace(/^Energieeffizienzklasse (.+)$/, "Energy efficiency class $1").replace(/^Verwaltung (.+)$/, "Managed by $1")
    : p;

/** AfA-Dauer: 32 oder 31,25 Jahre. */
const jahreAfa = (f: Format, j: number) => (Number.isInteger(j) ? String(j) : f.de(j, 2));

/** „Frau Muster“, ohne Anrede „Anna Muster“; englisch „Ms Muster“. */
function anredeName(v: KundenObjektvergleich, f: Format = DEUTSCH): string {
  const k = v.kunde;
  if (/^(frau|herr)$/i.test(k.anrede) && k.nachname) {
    if (f.en) return `${/^frau$/i.test(k.anrede) ? "Ms" : "Mr"} ${k.nachname}`;
    return `${k.anrede[0].toUpperCase()}${k.anrede.slice(1).toLowerCase()} ${k.nachname}`;
  }
  return [k.vorname, k.nachname].filter(Boolean).join(" ");
}

function garagenText(e: EinheitErgebnis, mit = true, f: Format = DEUTSCH): string {
  const g = e.einheit.garagen;
  if (!g) return "";
  if (f.en) return mit ? (g === 1 ? "with garage" : `with ${g} garages`) : (g === 1 ? "garage" : `${g} garages`);
  return mit ? (g === 1 ? "mit Garage" : `mit ${g} Garagen`) : (g === 1 ? "Garage" : `${g} Garagen`);
}

const SpracheKontext = createContext<Format>(DEUTSCH);

function Fuss({ text, nr, hell }: { text: string; nr: number; hell?: boolean }) {
  const f = useContext(SpracheKontext);
  return (
    <div className="foot" style={hell ? { borderTopColor: "rgba(167,215,197,.25)", color: "#8FA39A" } : undefined}>
      <span>{text}</span>
      <span><b style={hell ? { color: "var(--champ)" } : undefined}>{f.t("Vertraulich", "Confidential")} · {nr} / {useContext(SeitenKontext)}</b></span>
    </div>
  );
}

function LogoBox({ breite, lage }: { breite: number; lage: React.CSSProperties }) {
  // Innenabstand = Schutzraum laut Brand Guideline (Höhe des O, 330/935 der Logobreite).
  const pad = breite * (330 / 935);
  return (
    <div style={{ position: "absolute", ...lage, background: "#F3F6F4", borderRadius: "1.5mm", padding: `${pad.toFixed(1)}mm` }}>
      <img src={LOGO} alt="OS Real Estate" style={{ width: `${breite}mm`, display: "block" }} />
    </div>
  );
}

function Seite({ nr, kick, fuss, children, klasse = "" }: { nr: number; kick: string; fuss: string; children: ReactNode; klasse?: string }) {
  return (
    <section className={`expose-page p ${klasse}`}>
      <div className="in">
        <div className="kick"><b>{String(nr).padStart(2, "0")}</b>{kick}</div>
        {children}
      </div>
      <Fuss text={fuss} nr={nr} />
    </section>
  );
}

const Zeilen = ({ rows }: { rows: Array<[ReactNode, ReactNode]> }) => (
  <table className="t"><tbody>{rows.map(([a, b], i) => <tr key={i}><td>{a}</td><td className="r">{b}</td></tr>)}</tbody></table>
);

// ---------------------------------------------------------------------------
// 1 Deckblatt
// ---------------------------------------------------------------------------

function Deckblatt({ k, B }: { k: Kontext; B: EinheitErgebnis }) {
  const { v, A } = k;
  const o = v.objekt;
  return (
    <section className="expose-page p" style={{ background: "var(--navy)", color: "#E4ECE7" }}>
      {o.fotoTitel && <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "150mm", background: `url("${o.fotoTitel}") center 40%/cover` }} />}
      <div style={{ position: "absolute", left: 0, right: 0, top: "95mm", height: "56mm", background: "linear-gradient(rgba(18,54,42,0),var(--navy))" }} />
      <div style={{ position: "absolute", left: "16mm", top: "12mm", fontSize: "6.6pt", letterSpacing: ".2em", textTransform: "uppercase", background: "rgba(18,54,42,.75)", color: "#fff", padding: "1.2mm 3mm", borderRadius: 999 }}>
        {k.haeuser ? `${o.strasse} · ${k.haus(B).strasse}` : `${o.strasse}${o.ortZeile ? ` · ${o.ortZeile.replace(/^\d{5}\s*/, "")}` : ""}`}
      </div>
      <LogoBox breite={24} lage={{ right: "14mm", top: "9mm" }} />
      <div style={{ position: "absolute", left: "16mm", right: "16mm", top: "150mm" }}>
        <div className="kick" style={{ color: "var(--champ)" }}><b style={{ color: "var(--champ)" }}>01</b>Persönlicher Objektvergleich</div>
        <div style={{ fontFamily: "var(--serif)", fontSize: "32pt", lineHeight: 1.08, color: "#fff", marginTop: "5mm" }}>
          Ihr Objektvergleich,<br />{k.anrede}
        </div>
        <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "14pt", color: "var(--champ)", marginTop: "4mm" }}>
          {k.haeuser ? "Zwei Häuser, zwei Wohnungen" : "Ein Haus, zwei Wohnungen"}: welche passt besser zu Ihnen?
        </div>
        <div style={{ height: ".2mm", background: "rgba(167,215,197,.35)", margin: "9mm 0 6mm" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.15fr", gap: "7mm" }}>
          {[A, B].map((e, i) => (
            <div key={i}>
              <div className="label" style={{ color: "var(--champ)" }}>Objekt {i ? "B" : "A"}</div>
              <div style={{ fontFamily: "var(--serif)", fontSize: "15pt", color: "#fff", marginTop: "1.5mm" }}>Wohnung {e.einheit.nr}</div>
              <div style={{ fontSize: "7.2pt", color: "#B8C2BC", marginTop: "1mm" }}>
                {[k.haus(e).strasse, `${e.einheit.zimmer} Zimmer`, `${de(e.einheit.qm)} m²`, e.einheit.lage, garagenText(e)].filter(Boolean).join(" · ")}
              </div>
            </div>
          ))}
          <div>
            <div className="label" style={{ color: "var(--champ)" }}>Ihr Eigenanteil nach Steuer</div>
            <div style={{ fontFamily: "var(--serif)", fontSize: "15pt", color: "#fff", marginTop: "1.5mm" }}>
              {eur(-A.monat.nach)} <span style={{ fontSize: "10pt", color: "#B8C2BC" }}>oder</span> {eur(-B.monat.nach)}
            </div>
            <div style={{ fontSize: "7.2pt", color: "#B8C2BC", marginTop: "1mm" }}>je Monat im 1. Jahr, Steuersatz {steuerWie(v.annahmen)}</div>
          </div>
        </div>
        <div style={{ fontSize: "7pt", color: "#B8C2BC", marginTop: "12mm" }}>
          Erstellt am {k.stand} auf Grundlage {v.kunde.saDatum ? `Ihrer Selbstauskunft vom ${tagDe(v.kunde.saDatum)}, ` : ""}der Exposés (Stand {k.stand}) und {k.haeuser && k.haus(B).wirtschaftsplan !== o.wirtschaftsplan ? `der Wirtschaftspläne beider Häuser` : wpGenitiv(o.wirtschaftsplan)}.<br />
          Beispielrechnung, keine Zusage. Keine Steuer- oder Rechtsberatung.
        </div>
      </div>
      <Fuss text={k.fuss} nr={1} hell />
    </section>
  );
}

// ---------------------------------------------------------------------------
// 2 Ausgangslage
// ---------------------------------------------------------------------------

function Ausgangslage({ k, nr }: { k: Kontext; nr: number }) {
  const { v, A, B, liste: L } = k;
  const { de, eur, pzGanz, t } = k.f;
  const ku = v.kunde;
  const steuer = pzGanz(v.annahmen.steuer);
  const frei = ku.netto - ku.mieteWarm - ku.lebenshaltung - ku.kreditRaten;
  const ueber = L.map((e) => frei + e.monat.nach);
  const monate = L.map((e, i) => (ueber[i] > 0 ? Math.ceil(e.nk / ueber[i]) : 0));
  const nkMax = Math.max(...L.map((e) => e.nk));
  const nachW = L.map((e) => e.monat.nach);
  const unbefristet = /unbefristet|permanent/i.test(ku.beschaeftigung);
  const traegt = ku.kapital >= nkMax;
  const keine = (s: string) => (s === "keine" ? t("keine", "none") : s);
  const eck: Array<[ReactNode, ReactNode]> = [
    [t("Beschäftigung", "Employment"), ku.beschaeftigung || t("laut Selbstauskunft", "as per self-disclosure")],
    [t("Familienstand · Kinder", "Marital status · children"), `${ku.familienstand || t("nicht angegeben", "not stated")} · ${keine(ku.kinder)}`],
    [t("Antrag", "Application"), ku.antrag],
    [t("Wohnsituation", "Housing"), ku.wohnsituation || t("nicht angegeben", "not stated")],
    [t("Lebenshaltung", "Living costs"), eur(ku.lebenshaltung, 0)],
    [t("Laufende Kredite", "Current loans"), keine(ku.kredite)],
    [<>{t("Frei im Monat", "Free each month")}<span className="kl">{t(`Einkommen minus Miete${ku.kreditRaten ? ", Kredite" : ""} und Lebenshaltung`, `Income minus rent${ku.kreditRaten ? ", loans" : ""} and living costs`)}</span></>, `${t("rund", "about")} ${eur(Math.round(frei / 10) * 10, 0)}`],
  ];
  const hundert = (x: number) => eur(Math.round(x / 100) * 100, 0);
  const monateText = Math.min(...monate) === Math.max(...monate) ? String(Math.min(...monate)) : `${Math.min(...monate)} ${t("bis", "to")} ${Math.max(...monate)}`;
  const leit: Array<[string, string]> = [
    [t("Nebenkosten aus Ihrem Ersparten.", "Purchase costs from your savings."),
      (B
        ? t(`Beim Kauf zahlen Sie einmalig rund ${hundert(A.nk)} (Wohnung ${A.einheit.nr}) bzw. ${hundert(B.nk)} (Wohnung ${B.einheit.nr}) für Grunderwerbsteuer, Notar und Grundbuch. `,
          `On purchase you pay a one-off of about ${hundert(A.nk)} (apartment ${A.einheit.nr}) or ${hundert(B.nk)} (apartment ${B.einheit.nr}) for land transfer tax, notary and land registry. `)
        : t(`Beim Kauf zahlen Sie einmalig rund ${hundert(A.nk)} für Grunderwerbsteuer, Notar und Grundbuch. `,
          `On purchase you pay a one-off of about ${hundert(A.nk)} for land transfer tax, notary and land registry. `))
      + (ku.kapital ? t(`Das bezahlen Sie aus Ihren ${eur(ku.kapital, 0)} Erspartem. `, `You pay this from your ${eur(ku.kapital, 0)} of savings. `) : "")
      + (Math.min(...ueber) > 0
        ? t(`Danach legen Sie jeden Monat wieder etwas zurück: Von Ihrem Gehalt bleiben nach Miete, Lebenshaltung und Wohnung rund ${hundert(Math.min(...ueber))} übrig. So ist Ihr Erspartes nach etwa ${monateText} Monaten wieder aufgefüllt.`,
          `After that you put money aside again every month: after rent, living costs and the apartment, about ${hundert(Math.min(...ueber))} of your salary remains. Your savings are replenished after about ${monateText} months.`)
        : "")],
    [t("Monatlich spürbar, nicht belastend.", "Noticeable each month, not a burden."),
      (B
        ? t(`Ihr Eigenanteil nach Steuer liegt je nach Wohnung bei rund ${eur(-Math.max(...nachW), 0)} bis ${eur(-Math.min(...nachW), 0)} im Monat.`,
          `Depending on the apartment, your own contribution after tax is about ${eur(-Math.max(...nachW), 0)} to ${eur(-Math.min(...nachW), 0)} a month.`)
        : t(`Ihr Eigenanteil nach Steuer liegt bei rund ${eur(-A.monat.nach, 0)} im Monat.`, `Your own contribution after tax is about ${eur(-A.monat.nach, 0)} a month.`))
      + (frei > 0 ? t(" Das ist ein kleiner Teil dessen, was Ihnen heute frei bleibt.", " That is a small part of what you have left over today.") : "")],
    [t("Der Steuerhebel.", "The tax lever."), t(`Jeder Euro Verlust aus der Vermietung senkt die Steuer in dieser Rechnung um ${de(v.annahmen.steuer * 100, 0)} Cent. Mit einem Freibetrag beim Finanzamt kommt das jeden Monat mit dem Gehalt (wann genau: Seite ${k.seiteFreibetrag}).`,
      `Every euro of rental loss lowers the tax in this calculation by ${de(v.annahmen.steuer * 100, 0)} cents. With a tax allowance from the tax office, this arrives every month with your salary (exactly when: page ${k.seiteFreibetrag}).`)],
    ...(ku.jahreBisRente ? [[t("Ihr langer Horizont.", "Your long horizon."), t(`Bei rund ${ku.jahreBisRente} Jahren bis zur Rente zählt nicht nur der günstigste Start, sondern eine Belastung, die über die nächsten 30 Jahre gut passt.`,
      `With about ${ku.jahreBisRente} years to retirement, what counts is not only the cheapest start but a monthly amount that fits well over the next 30 years.`)] as [string, string]] : []),
  ];
  // „Sie sind unbefristet angestellt, haben keine Kredite und ein Guthaben, das die Kaufnebenkosten trägt.“
  const teile = [
    unbefristet ? t("sind unbefristet angestellt", "are permanently employed") : "",
    ku.kreditRaten ? t(`zahlen ${eur(ku.kreditRaten, 0)} im Monat für laufende Kredite`, `pay ${eur(ku.kreditRaten, 0)} a month for current loans`) : t("haben keine Kredite", "have no loans"),
  ].filter(Boolean);
  const lead = t(
    `Sie ${teile.join(", ")}${traegt ? `${ku.kreditRaten ? " und haben" : " und"} ein Guthaben, das die Kaufnebenkosten trägt` : ""}`,
    `You ${teile.join(", ")}${traegt ? `${ku.kreditRaten ? " and have" : " and"} savings that cover the purchase costs` : ""}`,
  );
  return (
    <Seite nr={nr} kick={t("Ihre Ausgangslage", "Your starting point")} fuss={k.fuss}>
      <h2>{unbefristet && !ku.kreditRaten && traegt
        ? t(<>Sicheres Einkommen, viel Zeit: <em>der ideale Startpunkt.</em></>, <>Secure income, plenty of time: <em>the ideal starting point.</em></>)
        : t(<>Ihre Zahlen: <em>die Grundlage dieser Rechnung.</em></>, <>Your figures: <em>the basis of this calculation.</em></>)}</h2>
      <p className="lead">
        {lead ? `${lead}. ` : ""}{t(`Gerechnet wird mit einem Grenzsteuersatz von ${steuer}.`, `The calculation uses a marginal tax rate of ${steuer}.`)}
        {ku.jahreBisRente ? t(` Und Sie haben bis zur Rente rund ${ku.jahreBisRente} Jahre Zeit, in der eine Wohnung für Sie arbeiten kann.`, ` And you have about ${ku.jahreBisRente} years until retirement in which an apartment can work for you.`) : ""}
      </p>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: "6mm" }}>
        <div className="tile"><div className="label">{t("Nettoeinkommen", "Net income")}</div><div className="n">{eur(ku.netto, 0)}</div>
          <div className="s">{t("im Monat.", "per month.")}{ku.bruttoJahr ? t(` Rund ${eur(Math.round(ku.bruttoJahr / 1000) * 1000, 0)} brutto im Jahr.`, ` About ${eur(Math.round(ku.bruttoJahr / 1000) * 1000, 0)} gross a year.`) : ""}</div></div>
        <div className="tile"><div className="label">{t("Gerechneter Grenzsteuersatz", "Marginal tax rate used")}</div><div className="n">{steuer}</div>
          <div className="s">{[ku.steuerklasse ? t(`Steuerklasse ${ku.steuerklasse}`, `Tax class ${ku.steuerklasse}`) : "", ku.familienstand,
            ku.kinder === "keine" ? t("keine Kinder", "no children") : t(`${ku.kinder} Kind${ku.kinder === "1" ? "" : "er"}`, `${ku.kinder} child${ku.kinder === "1" ? "" : "ren"}`)].filter(Boolean).join(", ")}.
            {t(" Die tatsächliche Ersparnis hängt vom persönlichen Steuersatz ab.", " The actual saving depends on your personal tax rate.")}</div></div>
        <div className="tile dk"><div className="label">{t("Ihr Kapital", "Your capital")}</div><div className="n">{eur(ku.kapital, 0)}</div>
          <div className="s">{t("Bank- und Sparguthaben laut Selbstauskunft.", "Bank and savings balances as per self-disclosure.")}{ku.kreditRaten ? "" : t(" Keine Kredite, kein Leasing.", " No loans, no leasing.")}</div></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "9mm", marginTop: "8mm" }}>
        <div><div className="label" style={{ marginBottom: "1.5mm" }}>{t("Ihre Eckdaten laut Selbstauskunft", "Your key data as per self-disclosure")}</div><Zeilen rows={eck} /></div>
        <div><div className="label" style={{ marginBottom: "2.5mm" }}>{t("Daraus unsere Leitplanken", "Our guidelines from this")}</div>
          {leit.map(([a, b]) => (
            <p key={a} style={{ marginBottom: "3mm", fontSize: "7.6pt", color: "var(--muted)" }}><b style={{ color: "var(--navy)", fontWeight: 500 }}>{a}</b> {b}</p>
          ))}
        </div>
      </div>
      <div className="note" style={{ marginTop: "8mm" }}>
        {t(<>
          Steuerersparnis gerechnet mit einem Grenzsteuersatz von {steuer}; die tatsächliche Ersparnis hängt vom persönlichen Steuersatz ab.
          Weitere Anlagen wie Depot oder Versicherungen sind nur eingerechnet, soweit sie in der Selbstauskunft stehen. Bitte den letzten
          Steuerbescheid oder eine Lohnsteuerbescheinigung sowie aktuelle Depot- und Versicherungsstände nachreichen, falls vorhanden; dann rechnen wir genau.
        </>, <>
          Tax saving calculated with a marginal tax rate of {steuer}; the actual saving depends on your personal tax rate.
          Other assets such as securities or insurance policies are only included if they appear in the self-disclosure. Please send us your latest
          tax assessment or wage tax certificate and current securities and insurance statements, if available; we will then calculate precisely.
        </>)}
      </div>
    </Seite>
  );
}

// ---------------------------------------------------------------------------
// 3 Die beiden Wohnungen
// ---------------------------------------------------------------------------

function Wohnungen({ k, nr }: { k: Kontext; nr: number }) {
  const { A, B } = k;
  const { de, eur, t } = k.f;
  // Die ausführliche Berechnung des Investmentrechners zeigt hier kein Hausfoto (Christian, 29.10.2026).
  const ohneFoto = !!k.v.dokument;
  const karte = (e: EinheitErgebnis, b: boolean) => {
    const x = e.einheit;
    const rows: Array<[ReactNode, ReactNode]> = [
      [t("Wohnung", "Apartment"), [t(`${x.zimmer} Zimmer`, `${x.zimmer} rooms`), `${de(x.qm)} m²`, x.lage].filter(Boolean).join(" · ")],
      [t("Kaufpreis Wohnung", "Purchase price apartment"), eur(x.kpWohnung, 0) + (x.kpListe > x.kpWohnung ? t(` statt ${eur(x.kpListe, 0)}`, ` instead of ${eur(x.kpListe, 0)}`) : "")],
      ...(x.garagen ? [[x.garagen > 1 ? t("Garage 1 (im Kaufpreis)", "Garage 1 (in the purchase price)") : t("Garage (im Kaufpreis)", "Garage (in the purchase price)"), eur(x.garageKp, 0)] as [string, string]] : []),
      ...(x.garagen > 1 ? [[t(`Garage 2${x.garagen > 2 ? ` bis ${x.garagen}` : ""} (ohne Aufpreis)`, `Garage 2${x.garagen > 2 ? ` to ${x.garagen}` : ""} (no surcharge)`), eur(0, 0)] as [string, string]] : []),
      [t("Kaufpreis gesamt", "Total purchase price"), eur(e.kp, 0)],
      [t("Preis je m² Wohnung", "Price per m² apartment"), eur(e.qmPreis)],
      [t("Kaltmiete heute (Mieter)", "Net rent today (tenant)"), `${eur(x.mieteIst)} · ${de(e.mieteIstQm)} €/m²`],
      [e.luecke > 0 ? t("Kaltmiete subventioniert", "Net rent subsidised") : t("Kaltmiete gerechnet", "Net rent used"), `${eur(e.mieteSub)} · ${de(x.mieteSubQm)} €/m²`],
    ];
    return (
      <div>
        {k.B && <span className={`badge${b ? " b" : ""}`}>{t("Objekt", "Property")} {b ? "B" : "A"}</span>}
        <div style={{ fontFamily: "var(--serif)", fontSize: "14pt", color: "var(--navy)", marginTop: "2mm" }}>{t("Wohnung", "Apartment")} {x.nr}</div>
        <div className="small" style={{ marginBottom: "2mm" }}>{[k.haus(e).strasse, x.lage].filter(Boolean).join(", ")}</div>
        <Zeilen rows={rows} />
      </div>
    );
  };
  /** Die Punkte zum Haus der Wohnung `e`; `jeWohnung` für den Satz zur Garage. */
  const hausListe = (e: EinheitErgebnis, jeWohnung: boolean) => {
    const o = k.haus(e);
    const vm = o.vergleichsmieteQm;
    const mieteQm = e.einheit.mieteSubQm;
    const g = e.einheit.garagen;
    return [
      ...o.hausPunkte.map((p) => punktText(k.f, p)),
      g ? (jeWohnung
        ? (g > 1 ? t(`Je Wohnung ${g} Garagen: eine im Kaufpreis, weitere ohne Aufpreis`, `${g} garages per apartment: one in the purchase price, the others at no surcharge`) : t("Je Wohnung eine eigene Garage im Kaufpreis", "Each apartment with its own garage in the purchase price"))
        : (g > 1 ? t(`${g} Garagen: eine im Kaufpreis, weitere ohne Aufpreis`, `${g} garages: one in the purchase price, the others at no surcharge`) : t("Eigene Garage im Kaufpreis", "Own garage in the purchase price"))) : "",
      vm ? t(`Vergleichsmiete am Ort${o.vergleichsmieteQuelle ? ` laut ${o.vergleichsmieteQuelle}` : ""} ${de(vm)} €/m²${vm > mieteQm ? `, über den gerechneten ${de(mieteQm)} €/m²` : ""}`,
        `Local comparable rent${o.vergleichsmieteQuelle ? ` according to ${o.vergleichsmieteQuelle}` : ""} ${de(vm)} €/m²${vm > mieteQm ? `, above the ${de(mieteQm)} €/m² used` : ""}`) : "",
      o.verwaltung && !o.hausPunkte.some((p) => p.includes(o.verwaltung)) ? t(`Verwaltung ${o.verwaltung}`, `Managed by ${o.verwaltung}`) : "",
    ].filter(Boolean);
  };
  const luecke = k.liste.some((e) => e.luecke > 0) ? t(" und damit die Lücke, die der Bauträger ausgleicht", " and therefore the gap the developer makes up") : "";
  const foto = (o: VergleichObjekt, hoehe: string) => <div style={{ height: hoehe, borderRadius: "2.5mm", background: o.fotoHaus ? `url("${o.fotoHaus}") center/cover` : "var(--paper)" }} />;
  const hausBlock = (o: VergleichObjekt, punkte: string[], label: string) => (
    <div>
      <div className="label" style={{ marginBottom: "2mm" }}>{label}</div>
      <div style={{ fontFamily: "var(--serif)", fontSize: "12pt", color: "var(--navy)", marginBottom: "2.5mm" }}>{o.strasse}{o.ortZeile ? `, ${o.ortZeile}` : ""}</div>
      <ul className="li">{punkte.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );

  if (!B) {
    const o = k.haus(A);
    return (
      <Seite nr={nr} kick={t("Haus und Wohnung", "Building and apartment")} fuss={k.fuss}>
        <h2>{o.strasse}, {t("Wohnung", "apartment")} {A.einheit.nr}: <em>{t("Lage, Haus und Wohnung.", "location, building and apartment.")}</em></h2>
        <p className="lead">
          {t(`Wohnung ${A.einheit.nr} liegt in ${o.strasse}`, `Apartment ${A.einheit.nr} is located at ${o.strasse}`)}{o.ortZeile ? `, ${o.ortZeile}` : ""}: {t(`${A.einheit.zimmer} Zimmer`, `${A.einheit.zimmer} rooms`)}, {de(A.einheit.qm)} m²{A.einheit.lage ? `, ${A.einheit.lage}` : ""}.
          {A.luecke > 0 ? t(" Gerechnet ist mit der subventionierten Miete; die Lücke zur heutigen Miete gleicht der Bauträger aus.", " The calculation uses the subsidised rent; the developer makes up the gap to today's rent.") : ""}
        </p>
        {ohneFoto ? (
          // Ohne Foto: erst die Wohnung, dann das Haus.
          <div className="grid" style={{ gridTemplateColumns: "1.1fr 1fr", gap: "9mm", marginTop: "6mm" }}>
            {karte(A, false)}
            {hausBlock(o, hausListe(A, false), t("Das Haus", "The building"))}
          </div>
        ) : (
          <>
            <div className="grid" style={{ gridTemplateColumns: "1.05fr 1fr", gap: "6mm", marginTop: "5mm" }}>
              {foto(o, "78mm")}
              {hausBlock(o, hausListe(A, false), t("Das Haus", "The building"))}
            </div>
            <div style={{ marginTop: "7mm" }}>{karte(A, false)}</div>
          </>
        )}
      </Seite>
    );
  }

  if (k.haeuser) {
    const spalte = (e: EinheitErgebnis, b: boolean) => {
      const o = k.haus(e);
      return (
        <div>
          {!ohneFoto && foto(o, "64mm")}
          <div className="label" style={{ margin: "3mm 0 1mm" }}>{t("Haus", "Building")} {b ? "B" : "A"}</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: "11pt", color: "var(--navy)", marginBottom: "2mm" }}>{o.strasse}{o.ortZeile ? `, ${o.ortZeile}` : ""}</div>
          <ul className="li" style={{ marginBottom: "4mm", minHeight: "30mm" }}>{hausListe(e, false).map((x) => <li key={x}>{x}</li>)}</ul>
          {karte(e, b)}
        </div>
      );
    };
    return (
      <Seite nr={nr} kick={t("Die beiden Wohnungen", "The two apartments")} fuss={k.fuss}>
        <h2>{t(<>Zwei Häuser, zwei Wohnungen: <em>Lage, Haus und Wohnung im Vergleich.</em></>, <>Two buildings, two apartments: <em>location, building and apartment compared.</em></>)}</h2>
        <p className="lead">
          {t(`Wohnung ${A.einheit.nr} liegt in ${k.haus(A).strasse}, Wohnung ${B.einheit.nr} in ${k.haus(B).strasse}. Unterschiedlich sind Haus und Lage, Größe, Preis, die heutige Miete${luecke}.`,
            `Apartment ${A.einheit.nr} is located at ${k.haus(A).strasse}, apartment ${B.einheit.nr} at ${k.haus(B).strasse}. They differ in building and location, size, price, today's rent${luecke}.`)}
        </p>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "9mm", marginTop: "5mm" }}>{spalte(A, false)}{spalte(B, true)}</div>
      </Seite>
    );
  }

  const o = k.haus(A);
  const haus = hausBlock(o, hausListe(A, true), t("Das Haus: für beide Wohnungen gleich", "The building: the same for both apartments"));
  return (
    <Seite nr={nr} kick={t("Die beiden Wohnungen", "The two apartments")} fuss={k.fuss}>
      <h2>{t(<>Ein Haus, zwei Wohnungen: <em>gleiche Lage, verschiedene Größe.</em></>, <>One building, two apartments: <em>same location, different size.</em></>)}</h2>
      <p className="lead">
        {t(`Beide Wohnungen liegen in ${o.strasse}. Lage, Haus und Hausverwaltung sind gleich. Unterschiedlich sind Größe, Preis, die heutige Miete${luecke}.`,
          `Both apartments are located at ${o.strasse}. Location, building and property management are the same. They differ in size, price, today's rent${luecke}.`)}
      </p>
      {ohneFoto ? (
        <>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "9mm", marginTop: "6mm" }}>{karte(A, false)}{karte(B, true)}</div>
          <div style={{ marginTop: "7mm" }}>{haus}</div>
        </>
      ) : (
        <>
          <div className="grid" style={{ gridTemplateColumns: "1.05fr 1fr", gap: "6mm", marginTop: "5mm" }}>{foto(o, "78mm")}{haus}</div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "9mm", marginTop: "7mm" }}>{karte(A, false)}{karte(B, true)}</div>
        </>
      )}
    </Seite>
  );
}

// ---------------------------------------------------------------------------
// 4 Vergleich nebeneinander
// ---------------------------------------------------------------------------

type Sieger = "A" | "B" | null;
const sieger = (a: number, b: number, kleinerBesser: boolean): Sieger =>
  Math.abs(a - b) < 0.005 ? null : (kleinerBesser ? a < b : a > b) ? "A" : "B";

function Vergleich({ k, B, nr }: { k: Kontext; B: EinheitErgebnis; nr: number }) {
  const { v, A } = k;
  const { de, eur, tsd, pz, pzGanz, t } = k.f;
  const an = v.annahmen;
  const am = A.monat, bm = B.monat, ah = A.hausgeld, bh = B.hausgeld;
  const g = A.einheit.garagen;
  const z = (lbl: ReactNode, va: ReactNode, vb: ReactNode, win: Sieger = null, cls = "", key?: string) => (
    <tr className={cls} key={key ?? String(lbl)}>
      <td>{lbl}</td><td className={`c${win === "A" ? " win" : ""}`}>{va}</td><td className={`c${win === "B" ? " win" : ""}`}>{vb}</td>
    </tr>
  );
  const kg = (e: EinheitErgebnis) => (e.einheit.garagen ? ` + ${garagenText(e, false, k.f)}` : "");
  const mietLabel = k.haeuser && (A.einheit.mieteSubQm !== B.einheit.mieteSubQm || A.einheit.garageMiete1 !== B.einheit.garageMiete1)
    ? t("Miete im Monat, 1. Jahr (gerechnet, inkl. Garage)", "Rent per month, year 1 (calculated, incl. garage)")
    : t(`Miete im Monat, 1. Jahr (${de(A.einheit.mieteSubQm)} €/m²${g ? ` + ${g > 1 ? `${g} × ${eur(A.einheit.garageMiete1, 0)} Garage` : `Garage ${eur(A.einheit.garageMiete1, 0)}`}` : ""})`,
      `Rent per month, year 1 (${de(A.einheit.mieteSubQm)} €/m²${g ? ` + ${g > 1 ? `${g} × ${eur(A.einheit.garageMiete1, 0)} garage` : `garage ${eur(A.einheit.garageMiete1, 0)}`}` : ""})`);
  const afaPz = de(100 / A.einheit.afaJahre, 1);
  const guenstiger = A.monat.nach >= B.monat.nach ? A : B;
  const staerke = (e: EinheitErgebnis, o: EinheitErgebnis): [string, string] => {
    const teile: string[] = [];
    if (e.nk < o.nk) teile.push(t(`rund ${eur(o.nk - e.nk, 0)} weniger Nebenkosten`, `about ${eur(o.nk - e.nk, 0)} less in purchase costs`));
    if (e.monat.nach > o.monat.nach) teile.push(t(`rund ${eur(Math.abs(e.monat.nach - o.monat.nach), 0)} weniger Eigenanteil im Monat`, `about ${eur(Math.abs(e.monat.nach - o.monat.nach), 0)} less own contribution per month`));
    if (e.einheit.zimmer > o.einheit.zimmer) teile.push(t(`${e.einheit.zimmer} Zimmer`, `${e.einheit.zimmer} rooms`));
    if (e.qmPreis < o.qmPreis) teile.push(t("günstiger je m²", "cheaper per m²"));
    if (e.lueckeQuote < o.lueckeQuote) teile.push(e.luecke > 0 ? t(`eine Mietlücke von nur ${eur(e.luecke)}`, `a rent gap of only ${eur(e.luecke)}`) : t("keine Mietlücke", "no rent gap"));
    if (e.entw[30].erloes > o.entw[30].erloes) teile.push(t(`nach 30 Jahren rund ${tsd(e.entw[30].erloes - o.entw[30].erloes)} mehr Erlös nach Kreditablösung`, `about ${tsd(e.entw[30].erloes - o.entw[30].erloes)} more proceeds after repaying the loan after 30 years`));
    const titel = e === guenstiger ? t("Der kleinere Einstieg", "The smaller entry") : t("Mehr Wohnung, mehr Vermögen", "More apartment, more wealth");
    if (k.haeuser && e.einheit.afaJahre < o.einheit.afaJahre) teile.push(t(`die schnellere Abschreibung (${jahreAfa(k.f, e.einheit.afaJahre)} statt ${jahreAfa(k.f, o.einheit.afaJahre)} Jahre)`, `faster depreciation (${jahreAfa(k.f, e.einheit.afaJahre)} instead of ${jahreAfa(k.f, o.einheit.afaJahre)} years)`));
    const satz = teile.length ? `${teile.join(", ").replace(/^./, (c) => c.toUpperCase())}.` : t("Gleichwertig in den gerechneten Kriterien.", "Equal on the calculated criteria.");
    return [titel, satz];
  };
  const afaZeile = (e: EinheitErgebnis) => t(`≈ ${afaPz} % über ${jahreAfa(k.f, e.einheit.afaJahre)} Jahre: ${eur(e.jahr.afa, 0)}/J.`, `≈ ${afaPz}% over ${jahreAfa(k.f, e.einheit.afaJahre)} years: ${eur(e.jahr.afa, 0)}/yr`);
  return (
    <Seite nr={nr} kick={t("Vergleich nebeneinander", "Side-by-side comparison")} fuss={k.fuss}>
      <h2>{k.haeuser
        ? t(<>Zwei Häuser im direkten Vergleich. <em>Der Unterschied liegt im Detail.</em></>, <>Two buildings compared directly. <em>The difference is in the detail.</em></>)
        : t(<>Gleiches Haus, gleiche Lage. <em>Der Unterschied liegt im Detail.</em></>, <>Same building, same location. <em>The difference is in the detail.</em></>)}</h2>
      <p className="lead" style={{ fontSize: "8pt" }}>{t(`Grün markiert, wo eine Wohnung vorne liegt. Alle Zahlen gelten für Sie persönlich im 1. Jahr, wenn nicht anders angegeben. Hausgeld laut ${wpBeide(k)}.`,
        `Green marks where an apartment is ahead. All figures apply to you personally in year 1 unless stated otherwise. Service charge as per ${wpBeide(k)}.`)}</p>
      <table className="t v" style={{ marginTop: "3mm" }}>
        <tbody>
          <tr><th /><th><span className="badge">A</span> {k.haus(A).strasse}, {t("WE", "Apt.")} {A.einheit.nr}</th><th><span className="badge b">B</span> {k.haus(B).strasse}, {t("WE", "Apt.")} {B.einheit.nr}</th></tr>
          {z(k.haeuser ? t("Haus und Lage", "Building and location") : t("Lage im Haus", "Position in the building"), k.haeuser ? `${k.haus(A).strasse}, ${A.einheit.lage}` : A.einheit.lage, k.haeuser ? `${k.haus(B).strasse}, ${B.einheit.lage}` : B.einheit.lage)}
          {z(t("Wohnung", "Apartment"), `${t(`${A.einheit.zimmer} Zimmer`, `${A.einheit.zimmer} rooms`)}, ${de(A.einheit.qm)} m²${kg(A)}`, `${t(`${B.einheit.zimmer} Zimmer`, `${B.einheit.zimmer} rooms`)}, ${de(B.einheit.qm)} m²${kg(B)}`, sieger(A.einheit.qm, B.einheit.qm, false))}
          {z(g > 1 ? t("Kaufpreis (weitere Garagen ohne Aufpreis)", "Purchase price (further garages at no surcharge)") : t("Kaufpreis", "Purchase price"), `${eur(A.kp, 0)}${A.einheit.garagen ? t(" inkl. Garage", " incl. garage") : ""}`, `${eur(B.kp, 0)}${B.einheit.garagen ? t(" inkl. Garage", " incl. garage") : ""}`)}
          {z(t("Preis je m² Wohnung", "Price per m² apartment"), eur(A.qmPreis), eur(B.qmPreis), sieger(A.qmPreis, B.qmPreis, true))}
          {z(t(`Kaufnebenkosten (aus Eigenkapital, ${pz(an.knk)})`, `Purchase costs (from equity, ${pz(an.knk)})`), eur(A.nk, 0), eur(B.nk, 0), sieger(A.nk, B.nk, true))}
          {z(t("Kaltmiete heute (zahlt der Mieter)", "Net rent today (paid by the tenant)"), `${eur(A.einheit.mieteIst)} (${de(A.mieteIstQm)} €/m²)`, `${eur(B.einheit.mieteIst)} (${de(B.mieteIstQm)} €/m²)`)}
          {z(mietLabel, eur(am.einnahmen), eur(bm.einnahmen))}
          {(A.luecke > 0 || B.luecke > 0) && z(t("davon Mietlücke, die der Bauträger zahlt", "of which rent gap paid by the developer"), `${eur(Math.max(0, A.luecke))} (${pz(Math.max(0, A.lueckeQuote))})`, `${eur(Math.max(0, B.luecke))} (${pz(Math.max(0, B.lueckeQuote))})`, sieger(A.lueckeQuote, B.lueckeQuote, true), "sub")}
          {z(t("Hausgeld umlagefähig (zahlt der Mieter)", "Service charge recoverable (paid by the tenant)"), eur(ah.u), eur(bh.u), null, "sub")}
          {z(t("Hausgeld nicht umlagefähig (Verwaltung u. a.)", "Service charge non-recoverable (management etc.)"), eur(ah.n), eur(bh.n), null, "sub")}
          {z(t(`= Hausgeld (${wpBeide(k)})`, `= Service charge (${wpBeide(k)})`), eur(ah.summe), eur(bh.summe))}
          {z(t("Erhaltungsrücklage (separat)", "Maintenance reserve (separate)"), eur(ah.r), eur(bh.r), null, "sub")}
          {z(t("= Vorauszahlung gesamt an die Verwaltung", "= Total advance payment to the management"), eur(ah.voraus), eur(bh.voraus))}
          {z(t("Ihr Anteil: nicht umlagefähig + Rücklage", "Your share: non-recoverable + reserve"), eur(ah.eigentuemer), eur(bh.eigentuemer), sieger(ah.eigentuemer, bh.eigentuemer, true))}
          {z(t(`Kreditrate (Zins ${pz(an.zins)} + Tilgung ${pz(an.tilgung)})`, `Loan instalment (interest ${pz(an.zins)} + repayment ${pz(an.tilgung)})`), eur(am.zins + am.tilgung), eur(bm.zins + bm.tilgung))}
          {z(t("Abschreibung", "Depreciation") + (A.einheit.afaJahre < 50 ? t(" (mit Gutachten)", " (with expert report)") : ""), afaZeile(A), afaZeile(B))}
          {z(t("1 · Zuzahlung vor Steuer", "1 · Top-up before tax"), eur(-am.vor), eur(-bm.vor), null, "e1")}
          {z(t(`2 · Das spart Ihnen das Finanzamt (${pzGanz(an.steuer)})`, `2 · Your tax saving (${pzGanz(an.steuer)})`), eur(am.ersparnis), eur(bm.ersparnis), null, "hi")}
          {z(<>{t("3 · Zuzahlung nach Steuererstattung", "3 · Top-up after tax refund")}<span style={{ display: "block", fontSize: "7.4pt", fontWeight: 300, color: "#B8C2BC", marginTop: ".4mm" }}>{t("Ihr Eigenanteil im Monat", "Your own contribution per month")}</span></>, eur(-am.nach), eur(-bm.nach), null, "e3", "e3")}
          {z(t("Tilgung im Monat (senkt Ihre Restschuld)", "Repayment per month (reduces your remaining debt)"), eur(am.tilgung), eur(bm.tilgung), sieger(am.tilgung, bm.tilgung, false))}
          {z(t("Verkaufssumme nach 30 Jahren (einmalig)", "Sale price after 30 years (one-off)"), tsd(A.entw[30].wert), tsd(B.entw[30].wert), sieger(A.entw[30].wert, B.entw[30].wert, false))}
          {z(t("abzüglich Restschuld des Kredits", "less remaining loan debt"), `− ${tsd(A.entw[30].rest)}`, `− ${tsd(B.entw[30].rest)}`, null, "sub")}
          {z(t("= Ihr Erlös nach Kreditablösung", "= Your proceeds after repaying the loan"), tsd(A.entw[30].erloes), tsd(B.entw[30].erloes), sieger(A.entw[30].erloes, B.entw[30].erloes, false), "sum")}
        </tbody>
      </table>
      <p className="small" style={{ marginTop: "1.5mm" }}>
        {g > 1 && <b style={{ fontWeight: 500, color: "var(--navy)" }}>{t(`Weitere Garage ohne Aufpreis; Miete ${eur(A.einheit.garageMiete1, 0)} im 1. Jahr vom Bauträger getragen, danach Vermietung. `, `Further garage at no surcharge; rent of ${eur(A.einheit.garageMiete1, 0)} paid by the developer in year 1, then let. `)}</b>}
        {t(`Verkaufssumme: angenommener Verkaufspreis bei ${pzGanz(an.wertPa)} Wertentwicklung im Jahr, vor Verkaufskosten. Nach mehr als zehn Jahren Haltedauer ist der Gewinn aus dem Verkauf einer privat vermieteten Wohnung nach § 23 EStG in der Regel steuerfrei (Hinweis, keine Steuerberatung).`,
          `Sale price: assumed selling price at ${pzGanz(an.wertPa)} value growth a year, before selling costs. After a holding period of more than ten years, the gain from selling a privately let apartment is generally tax-free under section 23 of the German Income Tax Act (note, not tax advice).`)}
        {Math.min(A.einheit.afaJahre, B.einheit.afaJahre) >= 30
          ? t(` Die Abschreibung läuft bei beiden Wohnungen ${A.einheit.afaJahre === B.einheit.afaJahre ? `${jahreAfa(k.f, A.einheit.afaJahre)} Jahre` : `${jahreAfa(k.f, A.einheit.afaJahre)} bzw. ${jahreAfa(k.f, B.einheit.afaJahre)} Jahre`}, also länger als die Betrachtung; ein früher Verkauf ist deshalb nicht nötig.`,
            ` Depreciation runs for ${A.einheit.afaJahre === B.einheit.afaJahre ? `${jahreAfa(k.f, A.einheit.afaJahre)} years` : `${jahreAfa(k.f, A.einheit.afaJahre)} and ${jahreAfa(k.f, B.einheit.afaJahre)} years`} for the two apartments, longer than the period considered; an early sale is therefore not necessary.`) : ""}
      </p>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: "3.5mm" }}>
        {[A, B].map((e, i) => {
          const [titel, satz] = staerke(e, e === A ? B : A);
          return (
            <div className="tile" key={i}>
              <div className="label" style={i ? { color: "var(--orange-d)" } : undefined}>{t(`Stärken von ${i ? "B" : "A"} · Wohnung ${e.einheit.nr}`, `Strengths of ${i ? "B" : "A"} · apartment ${e.einheit.nr}`)}</div>
              <div style={{ fontFamily: "var(--serif)", fontSize: "11pt", marginTop: "1mm" }}>{titel}</div>
              <div className="s">{satz}</div>
            </div>
          );
        })}
      </div>
    </Seite>
  );
}

// ---------------------------------------------------------------------------
// Bausteine Monatsrechnung
// ---------------------------------------------------------------------------

function freibetragText(k: Kontext): ReactNode {
  const n = k.v.annahmen.lastenwechselMonate;
  return k.f.t(
    <>
      <b>Diesen Betrag zahlen Sie, sobald Ihr Freibetrag wirkt.</b> Nach dem Kauf beantragen Sie beim Finanzamt einen Freibetrag für die Lohnsteuer
      (§ 39a EStG); er kommt nicht automatisch. Der Antrag ist ab 1. November für das Folgejahr möglich; im Januar gestellt, wirkt er ab 1. Januar,
      später gestellt verteilt das Finanzamt ihn auf die restlichen Monate. Die Steuerersparnis kommt dann mit dem Gehalt. Verluste aus einer neu
      gekauften Wohnung berücksichtigt es dafür ab dem 1. Januar nach dem Übergang von Nutzen und Lasten (Lastenwechsel, § 37 Abs. 3 Satz 8 EStG);
      der Lastenwechsel liegt in der Regel rund {n} Monate nach dem Kauf. Bis dahin zahlen Sie den Betrag aus Schritt 1; die Differenz erhalten
      Sie über die Steuererklärung zurück (Höhe nach den tatsächlichen Werten des Kaufjahres). Mehr auf Seite {k.seiteFreibetrag}.
    </>,
    <>
      <b>You pay this amount once your tax allowance takes effect.</b> After the purchase you apply to the tax office for a wage tax allowance
      (section 39a German Income Tax Act); it is not granted automatically. The application is possible from 1 November for the following year; filed in January,
      it applies from 1 January, filed later the tax office spreads it over the remaining months. The tax saving then arrives with your salary. For a newly
      purchased apartment, losses are taken into account from 1 January after the transfer of benefits and burdens (handover, section 37 (3) sentence 8);
      the handover is usually about {n} months after the purchase. Until then you pay the amount from step 1; you receive the difference
      back through your tax return (based on the actual figures of the purchase year). More on page {k.seiteFreibetrag}.
    </>,
  );
}

function garageZeile(k: Kontext, e: EinheitErgebnis): [string, string, string] | null {
  const { eur, t } = k.f;
  const x = e.einheit;
  if (!x.garagen) return null;
  const ist = x.garageIstVon
    ? t(`Heute ${eur(x.garageIstVon, 0)}${x.garageIstBis && x.garageIstBis !== x.garageIstVon ? ` bis ${eur(x.garageIstBis, 0)}` : ""}; `,
      `Today ${eur(x.garageIstVon, 0)}${x.garageIstBis && x.garageIstBis !== x.garageIstVon ? ` to ${eur(x.garageIstBis, 0)}` : ""}; `)
    : "";
  if (x.garagen > 1) {
    return [t(`Garagenmiete, ${x.garagen} Garagen, 1. Jahr`, `Garage rent, ${x.garagen} garages, year 1`),
      t(`${x.garagen} × ${eur(x.garageMiete1, 0)}; im 1. Jahr vom Bauträger aufgestockt bzw. getragen, danach Vermietung.`, `${x.garagen} × ${eur(x.garageMiete1, 0)}; topped up or paid by the developer in year 1, then let.`),
      t(`Zusätzliche Einnahme aus ${x.garagen} Garagen.`, `Additional income from ${x.garagen} garages.`)];
  }
  return [t("Garagenmiete, 1. Jahr", "Garage rent, year 1"),
    `${ist}${x.garageIstVon ? t(`der Bauträger stockt 12 Monate auf ${eur(x.garageMiete1, 0)} auf.`, `the developer tops it up to ${eur(x.garageMiete1, 0)} for 12 months.`) : t(`${eur(x.garageMiete1, 0)} im Monat.`, `${eur(x.garageMiete1, 0)} per month.`)}`,
    t("Zusätzliche Einnahme aus der eigenen Garage.", "Additional income from your own garage.")];
}

function Einnahmen({ k, e }: { k: Kontext; e: EinheitErgebnis }) {
  const { de, eur, t } = k.f;
  const m = e.monat;
  const g = garageZeile(k, e);
  const zeilen: Array<[string, string, number]> = [
    [e.luecke > 0 ? t("Kaltmiete Wohnung (subventioniert)", "Net rent apartment (subsidised)") : t("Kaltmiete Wohnung", "Net rent apartment"),
      `${de(e.einheit.mieteSubQm)} €/m² × ${de(e.einheit.qm)} m².${e.luecke > 0 ? t(` Der Mieter zahlt heute ${eur(e.einheit.mieteIst)}; die Differenz von ${eur(e.luecke)} zahlt der Bauträger.`, ` The tenant pays ${eur(e.einheit.mieteIst)} today; the developer pays the difference of ${eur(e.luecke)}.`) : ""}`, m.miete],
    ...(g ? [[g[0], g[1], m.garage] as [string, string, number]] : []),
  ];
  return (
    <div className="blk"><div className="label">{t("Einnahmen je Monat", "Income per month")}</div>
      {zeilen.map(([a, i, w]) => <div className="z" key={a}><span>{a}<i>{i}</i></span><span>{eur(w)}</span></div>)}
      <div className="bar ein"><span>{t("Einnahmen", "Income")}</span><b>{eur(m.einnahmen)}</b></div>
    </div>
  );
}

function Ausgaben({ k, e }: { k: Kontext; e: EinheitErgebnis }) {
  const { eur, pz, t } = k.f;
  const m = e.monat;
  const an = k.v.annahmen;
  const wp = wpText(k.f, k.haus(e).wirtschaftsplan);
  const zeilen: Array<[string, string, number]> = [
    [t("Zins Bankdarlehen", "Interest bank loan"), t(`${pz(an.zins)} auf ${eur(e.darlehen, 0)}`, `${pz(an.zins)} on ${eur(e.darlehen, 0)}`), m.zins],
    [t("Tilgung Bankdarlehen", "Repayment bank loan"), t(`${pz(an.tilgung)} anfänglich`, `${pz(an.tilgung)} initially`), m.tilgung],
    [t("Hausgeld, nicht umlagefähig", "Service charge, non-recoverable"), wp, m.n],
    [t("Erhaltungsrücklage", "Maintenance reserve"), wp, m.r],
  ];
  return (
    <div className="blk"><div className="label">{t("Ausgaben je Monat", "Expenses per month")}</div>
      {zeilen.map(([a, i, w]) => <div className="z" key={a}><span>{a}<i>{i}</i></span><span>{eur(w)}</span></div>)}
      <div className="bar aus"><span>{t("Ausgaben", "Expenses")}</span><b>{eur(m.ausgaben)}</b></div>
    </div>
  );
}

function Treppe({ k, e }: { k: Kontext; e: EinheitErgebnis }) {
  const { eur, pzGanz, t } = k.f;
  const m = e.monat;
  return (
    <>
      <div className="tr"><div className="nr">1</div><div className="tx"><b>{t("Das zahlen Sie im Monat, bevor das Finanzamt etwas erstattet", "What you pay each month before any tax refund")}</b>
        <i>{t(`Ausgaben ${eur(m.ausgaben)} minus Einnahmen ${eur(m.einnahmen)}. Darin stecken ${eur(m.tilgung)} Tilgung, die Ihr Vermögen aufbauen.`, `Expenses ${eur(m.ausgaben)} minus income ${eur(m.einnahmen)}. This includes ${eur(m.tilgung)} of repayment that builds your wealth.`)}</i></div><div className="be">{eur(-m.vor)}</div></div>
      <div className="tr s2"><div className="nr">2</div><div className="tx"><b>{t("Das spart Ihnen das Finanzamt im Monat", "Your tax saving per month")}</b>
        <i>{t(`Zinsen, Abschreibung und Kosten sind höher als die Miete. Dieses Minus senkt Ihr zu versteuerndes Einkommen; ${pzGanz(k.v.annahmen.steuer)} davon bekommen Sie zurück.`, `Interest, depreciation and costs are higher than the rent. This loss lowers your taxable income; you get ${pzGanz(k.v.annahmen.steuer)} of it back.`)}</i></div><div className="be">{"−"} {eur(m.ersparnis)}</div></div>
      <div className="tr s3"><div className="nr">3</div><div className="tx"><b>{t("Das zahlen Sie tatsächlich im Monat (mit Steuervorteil)", "What you actually pay each month (with tax benefit)")}</b>
        <i>{t("Schritt 1 minus Schritt 2: Ihr echter Beitrag für die Wohnung, inklusive Tilgung.", "Step 1 minus step 2: your real contribution for the apartment, including repayment.")}</i></div><div className="be">{eur(-m.nach)}</div></div>
      <div className="frei">{freibetragText(k)}</div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 5/6 Ihre persönliche Rechnung
// ---------------------------------------------------------------------------

function subventionText(k: Kontext, e: EinheitErgebnis): ReactNode {
  const { de, eur, tsd, pz, pzGanz, t } = k.f;
  const x = e.einheit;
  const an = k.v.annahmen;
  const vm = k.haus(e).vergleichsmieteQm;
  if (e.luecke <= 0) {
    return t(<>Gerechnet ist mit der heutigen Miete von {de(e.mieteIstQm)} €/m²; eine Subvention ist nicht eingerechnet. In 36 Monatsraten tilgen Sie rund {tsd(e.tilgung36)}.</>,
      <>The calculation uses today's rent of {de(e.mieteIstQm)} €/m²; no subsidy is included. In 36 monthly instalments you repay about {tsd(e.tilgung36)}.</>);
  }
  const gLuecke = x.garagen && x.garageIstVon ? [x.garageMiete1 - (x.garageIstBis || x.garageIstVon), x.garageMiete1 - x.garageIstVon] : [0, 0];
  const lg = [e.luecke + gLuecke[0], e.luecke + gLuecke[1]];
  const netto = lg.map((l) => l * (1 - an.steuer));
  const spanne = (a: number, b: number) => (Math.abs(a - b) < 0.005 ? eur(a) : `${eur(a)} ${t("bis", "to")} ${eur(b)}`);
  const garageWort = x.garagen > 1 ? t("Garage 1", "garage 1") : t("Garage", "garage");
  const kopf = t(<>Gerechnet ist mit {de(x.mieteSubQm)} €/m², heute zahlt der Mieter {de(e.mieteIstQm)} €/m² ({eur(x.mieteIst)}). </>,
    <>The calculation uses {de(x.mieteSubQm)} €/m²; today the tenant pays {de(e.mieteIstQm)} €/m² ({eur(x.mieteIst)}). </>);
  const dauer = t(`trägt der Bauträger bis zur nächsten Mieterhöhung, längstens ${an.subventionMonate} Monate.`, `is paid by the developer until the next rent increase, for at most ${an.subventionMonate} months.`);
  const kappungHoch = x.mieteIst * (1 + an.kappung);
  if (kappungHoch < e.mieteSub) {
    const k15 = x.mieteIst * 1.15, k20 = x.mieteIst * 1.2;
    const kappungText = an.kappung >= 0.2
      ? t(<>höchstens um 20 % in drei Jahren möglich (in Gemeinden mit Kappungsgrenzenverordnung 15 %, § 558 BGB): rund {eur(k15, 0)} bis {eur(k20, 0)}. Ein Rest von rund {eur(e.mieteSub - k20, 0)} bis {eur(e.mieteSub - k15, 0)}</>,
        <>possible by at most 20% in three years (15% in municipalities with a capping regulation, section 558 German Civil Code): about {eur(k15, 0)} to {eur(k20, 0)}. A remainder of about {eur(e.mieteSub - k20, 0)} to {eur(e.mieteSub - k15, 0)}</>)
      : t(<>höchstens um {pzGanz(an.kappung)} in drei Jahren möglich (Kappungsgrenzenverordnung, § 558 BGB): rund {eur(kappungHoch, 0)}. Ein Rest von rund {eur(e.mieteSub - kappungHoch, 0)}</>,
        <>possible by at most {pzGanz(an.kappung)} in three years (capping regulation, section 558 German Civil Code): about {eur(kappungHoch, 0)}. A remainder of about {eur(e.mieteSub - kappungHoch, 0)}</>);
    return t(
      <>{kopf}Die Lücke von {eur(e.luecke)} ({pz(e.lueckeQuote)}) {dauer} Eine Erhöhung ist {kappungText} kann also bleiben, bis eine weitere
        Erhöhung möglich ist. In 36 Monatsraten tilgen Sie rund {tsd(e.tilgung36)}. Steigen Miete{x.garagen ? ` und ${garageWort}` : ""} gar nicht, fehlen {spanne(lg[0], lg[1])} im
        Monat; netto nach Steuer rund {spanne(netto[0], netto[1])}.</>,
      <>{kopf}The gap of {eur(e.luecke)} ({pz(e.lueckeQuote)}) {dauer} An increase is {kappungText} may therefore remain until a further
        increase is possible. In 36 monthly instalments you repay about {tsd(e.tilgung36)}. If rent{x.garagen ? ` and ${garageWort}` : ""} do not rise at all, {spanne(lg[0], lg[1])} a
        month are missing; net after tax about {spanne(netto[0], netto[1])}.</>,
    );
  }
  return t(
    <>{kopf}Die Lücke von nur {eur(e.luecke)} ({pz(e.lueckeQuote)}) {dauer}
      {vm ? ` Die Vergleichsmiete am Ort liegt bei ${de(vm)} €/m²${vm > x.mieteSubQm ? ", also deutlich darüber: Spielraum für eine Anpassung im gesetzlichen Rahmen ist vorhanden." : "."}` : ""}
      {" "}In 36 Monatsraten tilgen Sie rund {tsd(e.tilgung36)}. Steigen Miete{x.garagen ? ` und ${garageWort}` : ""} erst später, fehlen {spanne(lg[0], lg[1])} im Monat; netto nach Steuer rund {spanne(netto[0], netto[1])}.</>,
    <>{kopf}The gap of only {eur(e.luecke)} ({pz(e.lueckeQuote)}) {dauer}
      {vm ? ` The local comparable rent is ${de(vm)} €/m²${vm > x.mieteSubQm ? ", well above that: there is room for an adjustment within the legal framework." : "."}` : ""}
      {" "}In 36 monthly instalments you repay about {tsd(e.tilgung36)}. If rent{x.garagen ? ` and ${garageWort}` : ""} only rise later, {spanne(lg[0], lg[1])} a month are missing; net after tax about {spanne(netto[0], netto[1])}.</>,
  );
}

function Rechnung({ k, e, nr, b }: { k: Kontext; e: EinheitErgebnis; nr: number; b: boolean }) {
  const { v } = k;
  const { de, eur, tsd, pz, pzGanz, t } = k.f;
  const an = v.annahmen;
  const m = e.monat, j = e.jahr, x = e.einheit;
  const afaPz = de(100 / x.afaJahre, 1);
  const afaJ = jahreAfa(k.f, x.afaJahre);
  const ziel = x.mieteZielQm || an.mieteZielQm;
  const an_: Array<[ReactNode, ReactNode]> = [
    [x.garagen > 1 ? t("Kaufpreis inkl. Garage 1, voll finanziert (weitere ohne Aufpreis)", "Purchase price incl. garage 1, fully financed (others at no surcharge)")
      : x.garagen ? t("Kaufpreis inkl. Garage, voll finanziert", "Purchase price incl. garage, fully financed") : t("Kaufpreis, voll finanziert", "Purchase price, fully financed"), eur(e.kp, 0)],
    [t(`Kaufnebenkosten aus Eigenkapital (${pz(an.knk)})`, `Purchase costs from equity (${pz(an.knk)})`), eur(e.nk, 0)],
    [t(`AfA: ≈ ${afaPz} % (1/${afaJ})${x.afaJahre < 50 ? `, kürzere tatsächliche Nutzungsdauer ${afaJ} J., Gutachten nötig` : ""}`,
      `Depreciation: ≈ ${afaPz}% (1/${afaJ})${x.afaJahre < 50 ? `, shorter actual useful life of ${afaJ} yrs, expert report required` : ""}`), t(`${eur(j.afa, 0)} / Jahr`, `${eur(j.afa, 0)} / year`)],
    [t(`Bemessungsgrundlage (Gebäudeanteil ${pzGanz(an.gebaeudeanteil)} inkl. Nebenkosten)`, `Depreciation basis (building share ${pzGanz(an.gebaeudeanteil)} incl. purchase costs)`), eur(e.afaBasis, 0)],
    [t(`Miete im Szenario (Jahr 1 = ${an.startJahr})`, `Rent in the scenario (year 1 = ${an.startJahr})`),
      t(`${de(x.mieteSubQm)} €/m² auf ${de(ziel, ziel % 1 ? 2 : 0)} €/m² im Jahr ${an.mieteZielJahr}`, `${de(x.mieteSubQm)} €/m² rising to ${de(ziel, ziel % 1 ? 2 : 0)} €/m² in ${an.mieteZielJahr}`)],
    ...(x.garagen ? [[x.garagen > 1 ? t("Garagen im Szenario", "Garages in the scenario") : t("Garage im Szenario", "Garage in the scenario"),
      t(`${x.garagen > 1 ? "je " : ""}${eur(x.garageMiete1, 0)} auf ${eur(x.garageMieteZiel, 0)} im Jahr ${an.mieteZielJahr}`, `${x.garagen > 1 ? "each " : ""}${eur(x.garageMiete1, 0)} rising to ${eur(x.garageMieteZiel, 0)} in ${an.mieteZielJahr}`)] as [string, string]] : []),
  ];
  const e30 = e.entw[30];
  const h = e.hausgeld;
  return (
    <Seite nr={nr} kick={k.B ? t(`Ihre persönliche Rechnung · Objekt ${b ? "B" : "A"}`, `Your personal calculation · property ${b ? "B" : "A"}`) : t("Ihre persönliche Rechnung", "Your personal calculation")} fuss={k.fuss} klasse="sh">
      <h2>{k.haus(e).strasse}, {t("Wohnung", "apartment")} {x.nr}: <em>{t(`${eur(-m.nach)} im Monat für Ihre Kapitalanlage.`, `${eur(-m.nach)} a month for your investment.`)}</em></h2>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "4mm", marginTop: "4mm" }}>
        <div className="tile or"><div className="label">{t("Ihre Steuerersparnis im 1. Jahr", "Your tax saving in year 1")}</div><div className="n">{eur(j.ersparnis, 0)}</div><div className="s">{t(`${eur(m.ersparnis)} im Monat; in 30 Jahren zusammen rund ${tsd(e.steuer30)}`, `${eur(m.ersparnis)} a month; about ${tsd(e.steuer30)} in total over 30 years`)}</div></div>
        <div className="tile"><div className="label">{t("Tilgung im Monat", "Repayment per month")}</div><div className="n">{eur(m.tilgung)}</div><div className="s">{t("im 1. Jahr, steigt jedes Jahr. Senkt die Restschuld, das Geld bleibt Ihr Vermögen.", "in year 1, rising every year. It reduces the remaining debt; the money stays your wealth.")}</div></div>
        <div className="tile dk"><div className="label">{t("Ihr Eigenanteil nach Steuer", "Your own contribution after tax")}</div><div className="n">{eur(-m.nach)}</div><div className="s">{t(`im Monat im 1. Jahr, inklusive Tilgung. Vor Steuer ${eur(-m.vor)}.`, `per month in year 1, including repayment. Before tax ${eur(-m.vor)}.`)}</div></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1.12fr 1fr", gap: "6mm", marginTop: "4.5mm" }}>
        <div>
          <div className="label" style={{ marginBottom: "1mm" }}>{t("Ihr Monat im 1. Jahr", "Your month in year 1")}</div>
          <div className="grid eng" style={{ gridTemplateColumns: "1fr 1fr", gap: "3.5mm" }}><Einnahmen k={k} e={e} /><Ausgaben k={k} e={e} /></div>
          <Treppe k={k} e={e} />
        </div>
        <div>
          <div className="label" style={{ marginBottom: "1mm" }}>{t("Einmalig und Annahmen", "One-off and assumptions")}</div>
          <Zeilen rows={an_} />
          <div className="label" style={{ marginTop: "3mm" }}>{t("Hausgeld laut", "Service charge as per")} {wpText(k.f, k.haus(e).wirtschaftsplan)}</div>
          <table className="t" style={{ marginTop: ".5mm" }}><tbody>
            <tr><td>{t("umlagefähig (zahlt der Mieter)", "recoverable (paid by the tenant)")}</td><td className="r">{eur(h.u)}</td></tr>
            <tr><td>{t("nicht umlagefähig (tragen Sie)", "non-recoverable (paid by you)")}</td><td className="r">{eur(h.n)}</td></tr>
            <tr className="sum"><td>{t("= Hausgeld", "= Service charge")}</td><td className="r">{eur(h.summe)}</td></tr>
            <tr><td>{t("Erhaltungsrücklage, separat (tragen Sie)", "Maintenance reserve, separate (paid by you)")}</td><td className="r">{eur(h.r)}</td></tr>
            <tr className="sum"><td>{t("= Vorauszahlung gesamt", "= Total advance payment")}</td><td className="r">{eur(h.voraus)}</td></tr>
          </tbody></table>
          <div className="note or" style={{ marginTop: "3mm" }}><b>{e.luecke > 0 ? t("Wenn die Subvention endet.", "When the subsidy ends.") : t("Zur Miete.", "About the rent.")}</b> {subventionText(k, e)}</div>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "4mm", marginTop: "4mm" }}>
        <div className="tile"><div className="label">{t("Miete im Jahr 30 · monatlich", "Rent in year 30 · monthly")}</div><div className="n">{eur(e.miete30, 0)}</div>
          <div className="s">{t(`Kaltmiete${x.garagen ? ` inkl. ${garagenText(e, false)}` : ""} im Szenario, im 1. Jahr ${eur(m.einnahmen)}`, `Net rent${x.garagen ? ` incl. ${garagenText(e, false, k.f)}` : ""} in the scenario, ${eur(m.einnahmen)} in year 1`)}</div></div>
        <div className="tile"><div className="label">{t("Verkaufssumme nach 30 Jahren · einmalig", "Sale price after 30 years · one-off")}</div><div className="n">{tsd(e30.wert)}</div>
          <div className="s">{t(<>abzüglich Restschuld {tsd(e30.rest)} = <b>Ihr Erlös nach Kreditablösung {tsd(e30.erloes)}</b>. Nach mehr als zehn Jahren in der Regel steuerfrei (§ 23 EStG).</>,
            <>less remaining debt {tsd(e30.rest)} = <b>your proceeds after repaying the loan {tsd(e30.erloes)}</b>. Generally tax-free after more than ten years (section 23 German Income Tax Act).</>)}</div></div>
      </div>
    </Seite>
  );
}

// ---------------------------------------------------------------------------
// 7 Vermögensentwicklung
// ---------------------------------------------------------------------------

const FARBE_A = "#198A5F", FARBE_B = "#D9731A";

function ChartErloes({ A, B, f = DEUTSCH }: { A: EinheitErgebnis; B: EinheitErgebnis | null; f?: Format }) {
  const W = 600, H = 200, l = 40, r = 10, t = 10, b = 22;
  const hoechst = Math.max(...[A, B].filter((e): e is EinheitErgebnis => !!e).flatMap((e) => e.reihe.flatMap((p) => [p.wert - p.rest, p.zuz])));
  const ymax = Math.max(150000, Math.ceil(hoechst / 150000) * 150000);
  const X = (j: number) => l + ((W - l - r) * j) / 35;
  const Y = (v: number) => t + (H - t - b) * (1 - v / ymax);
  const linie = (e: EinheitErgebnis, art: "erl" | "zuz", farbe: string, dash?: string) => {
    const pts: Array<[number, number]> = [[0, art === "erl" ? 0 : e.nk], ...e.reihe.map((p) => [p.jahr, art === "erl" ? p.wert - p.rest : p.zuz] as [number, number])];
    return <polyline points={pts.map(([a, v]) => `${X(a).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")} fill="none" stroke={farbe} strokeWidth={art === "erl" ? 1.8 : 1.3} strokeDasharray={dash} />;
  };
  const stufen = Array.from({ length: ymax / 150000 + 1 }, (_, i) => i * 150000);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      {stufen.map((v) => (
        <g key={v}>
          <line x1={l} x2={W - r} y1={Y(v)} y2={Y(v)} stroke="#D3E0D9" strokeWidth={0.6} />
          <text x={l - 4} y={Y(v) + 2.5} textAnchor="end" fontSize={7} fill="#56635D">{f.t(`${f.de(v / 1000, 0)} T€`, `€${f.de(v / 1000, 0)}k`)}</text>
        </g>
      ))}
      {[0, 5, 10, 15, 20, 25, 30, 35].map((j) => <text key={j} x={X(j)} y={H - 8} textAnchor="middle" fontSize={7} fill="#56635D">{j === 0 ? f.t("heute", "today") : j}</text>)}
      {linie(A, "erl", FARBE_A)}{B && linie(B, "erl", FARBE_B)}
      {linie(A, "zuz", "#12362A", "4 3")}{B && linie(B, "zuz", FARBE_B, "1.5 2.5")}
    </svg>
  );
}

function ChartNach({ A, B, f = DEUTSCH }: { A: EinheitErgebnis; B: EinheitErgebnis | null; f?: Format }) {
  const W = 600, H = 140, l = 40, r = 10, t = 8, b = 20;
  const werte = [A, B].filter((e): e is EinheitErgebnis => !!e).flatMap((e) => e.reihe.slice(0, 30).map((p) => p.nach));
  const lo = Math.min(-100, Math.floor(Math.min(...werte) / 100) * 100);
  const hi = Math.max(0, Math.ceil(Math.max(...werte) / 100) * 100);
  const X = (j: number) => l + ((W - l - r) * (j - 1)) / 29;
  const Y = (v: number) => t + ((H - t - b) * (hi - v)) / (hi - lo);
  const stufen: number[] = [];
  for (let v = lo; v <= hi; v += 100) stufen.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      {stufen.map((v) => (
        <g key={v}>
          <line x1={l} x2={W - r} y1={Y(v)} y2={Y(v)} stroke="#D3E0D9" strokeWidth={0.6} />
          <text x={l - 4} y={Y(v) + 2.5} textAnchor="end" fontSize={7} fill="#56635D">{f.eur(v, 0)}</text>
        </g>
      ))}
      {[1, 5, 10, 15, 20, 25, 30].map((j) => <text key={j} x={X(j)} y={H - 6} textAnchor="middle" fontSize={7} fill="#56635D">{j === 1 ? f.t("Jahr 1", "Year 1") : j}</text>)}
      {([[A, FARBE_A, undefined], ...(B ? [[B, FARBE_B, "4 3"]] : [])] as Array<[EinheitErgebnis, string, string | undefined]>).map(([e, farbe, d], i) => (
        <polyline key={i} points={e.reihe.slice(0, 30).map((p) => `${X(p.jahr).toFixed(1)},${Y(p.nach).toFixed(1)}`).join(" ")} fill="none" stroke={farbe} strokeWidth={1.8} strokeDasharray={d} />
      ))}
    </svg>
  );
}

function Legende({ items }: { items: Array<[string, string, string?]> }) {
  return (
    <div style={{ display: "flex", gap: "6mm", fontSize: "6.6pt", color: "var(--muted)", marginTop: "1mm" }}>
      {items.map(([t, f, d]) => (
        <span key={t}><svg width="22" height="6" style={{ verticalAlign: "middle" }}><line x1="0" x2="22" y1="3" y2="3" stroke={f} strokeWidth="2" strokeDasharray={d} /></svg> {t}</span>
      ))}
    </div>
  );
}

function Entwicklung({ k, nr }: { k: Kontext; nr: number }) {
  const { v, A, B } = k;
  const { eur, tsd, pzGanz, t } = k.f;
  const an = v.annahmen;
  const afa = A.einheit.afaJahre;
  const afaEnde = Math.ceil(afa);
  return (
    <Seite nr={nr} kick={B ? t("Vermögensentwicklung im Vergleich", "Wealth development compared") : t("Vermögensentwicklung", "Wealth development")} fuss={k.fuss}>
      <h2>{t(<>Aus kleinen Monatsbeträgen <em>wird echtes Vermögen.</em></>, <>Small monthly amounts <em>become real wealth.</em></>)}</h2>
      <p className="lead" style={{ fontSize: "8pt" }}>{t(`Verkaufssumme ist der angenommene Verkaufspreis bei ${pzGanz(an.wertPa)} Wertentwicklung im Jahr. Davon wird die Restschuld abgelöst; was übrig bleibt, ist Ihr Erlös (durchgezogene Linien). Gestrichelt und gepunktet: was Sie selbst insgesamt zugezahlt haben, inklusive Kaufnebenkosten. Erlös minus Zuzahlung ist Ihr Plus.`,
        `The sale price is the assumed selling price at ${pzGanz(an.wertPa)} value growth a year. The remaining debt is repaid from it; what is left is your proceeds (solid lines). Dashed and dotted: what you have paid in yourself in total, including purchase costs. Proceeds minus top-ups is your gain.`)}</p>
      <div style={{ marginTop: "3mm" }}><ChartErloes A={A} B={B} f={k.f} /></div>
      <Legende items={B
        ? [[t("A Erlös nach Kreditablösung", "A proceeds after repaying the loan"), FARBE_A], [t("B Erlös nach Kreditablösung", "B proceeds after repaying the loan"), FARBE_B], [t("A Ihre Zuzahlung gesamt", "A your total top-ups"), "#12362A", "4 3"], [t("B Ihre Zuzahlung gesamt", "B your total top-ups"), FARBE_B, "1.5 2.5"]]
        : [[t("Erlös nach Kreditablösung", "Proceeds after repaying the loan"), FARBE_A], [t("Ihre Zuzahlung gesamt", "Your total top-ups"), "#12362A", "4 3"]]} />
      <table className="t" style={{ marginTop: "3mm" }}><tbody>
        <tr><th /><th className="r">{t("Verkaufssumme", "Sale price")}</th><th className="r">{t("Restschuld", "Remaining debt")}</th><th className="r">{t("Ihr Erlös", "Your proceeds")}</th><th className="r">{t("Ihre Zuzahlung", "Your top-ups")}</th><th className="r">{t("Ihr Plus", "Your gain")}</th></tr>
        {k.liste.map((e, i) => [
          <tr key={`k${i}`}><td colSpan={6} style={{ fontWeight: 500, paddingTop: "2mm" }}>{B && <span className={`badge${i ? " b" : ""}`}>{i ? "B" : "A"}</span>} {k.haus(e).strasse}, {t("WE", "apt.")} {e.einheit.nr}</td></tr>,
          ...([25, 30, 35] as const).map((y) => {
            const x = e.entw[y];
            return (
              <tr key={`${i}-${y}`}><td>{t(`nach ${y} Jahren`, `after ${y} years`)}</td><td className="r">{tsd(x.wert)}</td><td className="r">{Math.round(x.rest) ? `− ${tsd(x.rest)}` : eur(0, 0)}</td>
                <td className="r">{tsd(x.erloes)}</td><td className="r">{tsd(x.zuzahlung)}</td><td className="r" style={{ fontWeight: 500 }}>{tsd(x.plus)}</td></tr>
            );
          }),
        ])}
      </tbody></table>
      <p className="small" style={{ marginTop: "1.5mm" }}>
        {t(`Jahr 1 = ${an.startJahr}.`, `Year 1 = ${an.startJahr}.`)}{k.liste.every((e) => e.entw[35].rest < 1) ? t(` Nach 35 Jahren ist der Kredit${B ? " in beiden Fällen" : ""} getilgt.`, ` After 35 years the loan is repaid${B ? " in both cases" : ""}.`) : ""}
        {afa < 35 ? t(` Die Abschreibung endet nach Jahr ${afaEnde}; ab Jahr ${afaEnde + 1} entfällt ihre Steuerersparnis, das ist in den Werten berücksichtigt.`, ` Depreciation ends after year ${afaEnde}; from year ${afaEnde + 1} its tax saving no longer applies, which is reflected in the figures.`) : ""}
        {" "}{t(<>Alle Werte ungerundet gerechnet und auf 1.000 € gerundet, Rundungsdifferenzen möglich. Die Zuzahlungen gelten nur, wenn die angesetzten Mieten tatsächlich erzielt werden{A.einheit.garagen ? " (auch die Garage nach Ende der Aufstockung)" : ""}. Werte vor Verkaufskosten; Restschuld vereinfacht mit jährlicher Verrechnung (bei monatlicher Zahlung etwas niedriger).</>,
          <>All values calculated unrounded and rounded to €1,000; rounding differences are possible. The top-ups only apply if the assumed rents are actually achieved{A.einheit.garagen ? " (including the garage after the top-up ends)" : ""}. Values before selling costs; remaining debt simplified with annual settlement (slightly lower with monthly payments).</>)}
      </p>
      <div className="label" style={{ marginTop: "4mm" }}>{t("Ihr Eigenanteil nach Steuer je Monat, Jahr 1 bis 30", "Your own contribution after tax per month, years 1 to 30")}</div>
      <div style={{ marginTop: "1.5mm" }}><ChartNach A={A} B={B} f={k.f} /></div>
      <Legende items={B ? [[t(`A Wohnung ${A.einheit.nr}`, `A apartment ${A.einheit.nr}`), FARBE_A], [t(`B Wohnung ${B.einheit.nr}`, `B apartment ${B.einheit.nr}`), FARBE_B, "4 3"]] : [[t(`Wohnung ${A.einheit.nr}`, `Apartment ${A.einheit.nr}`), FARBE_A]]} />
      <p className="small" style={{ marginTop: "1.5mm" }}>
        {t(`Wohnung ${A.einheit.nr} liegt zwischen rund ${eur(-A.nachMax, 0)} und ${eur(-A.nachMin, 0)}`, `Apartment ${A.einheit.nr} ranges between about ${eur(-A.nachMax, 0)} and ${eur(-A.nachMin, 0)}`)}
        {B ? t(`, Wohnung ${B.einheit.nr} zwischen rund ${eur(-B.nachMax, 0)} und ${eur(-B.nachMin, 0)}`, `, apartment ${B.einheit.nr} between about ${eur(-B.nachMax, 0)} and ${eur(-B.nachMin, 0)}`) : ""}{t(" im Monat.", " a month.")}
        {" "}{t(`Szenario mit Mietsteigerung laut Exposé, Kosten +${pzGanz(an.kostenPa)} im Jahr, Steuersatz ${steuerWie(an, k.f)}; im Ruhestand ist der Steuersatz meist niedriger.`,
          `Scenario with rent growth as in the exposé, costs +${pzGanz(an.kostenPa)} a year, tax rate ${steuerWie(an, k.f)}; in retirement the tax rate is usually lower.`)}
      </p>
    </Seite>
  );
}

// ---------------------------------------------------------------------------
// 8 Empfehlung
// ---------------------------------------------------------------------------

/** Kriterien und Schritte aus kundenObjektvergleich.ts auf Englisch. */
const KRITERIEN_EN: Record<string, string> = {
  "Niedrige Monatsbelastung in den ersten Jahren": "Low monthly burden in the first years",
  "Weniger Eigenkapital für Nebenkosten": "Less equity for purchase costs",
  "Kleinere Mietlücke, weniger Abhängigkeit von der Subvention": "Smaller rent gap, less reliance on the subsidy",
  "Fläche und Preis je m²": "Floor area and price per m²",
  "Zimmerzahl": "Number of rooms",
  "Höhere Tilgung, schnellerer Vermögensaufbau": "Higher repayment, faster wealth building",
  "Erlös nach 30 Jahren": "Proceeds after 30 years",
  "Lage, Haus, Garage, Abschreibung": "Location, building, garage, depreciation",
};
const kriteriumText = (f: Format, s: string) =>
  f.en ? KRITERIEN_EN[s] ?? s.replace(/^(\d+) Zimmer: breitere Mieterschaft$/, "$1 rooms: wider range of tenants") : s;
const SCHRITTE_EN = [
  "Short conversation: your priorities, a viewing if needed",
  "Send your tax assessment or wage tax certificate, we calculate precisely",
  "Request financing from the bank, reserve the apartment",
  "Plan an expert report on the remaining useful life; after the handover, apply for a tax allowance at the tax office",
];

function Empfehlung({ k, B, nr }: { k: Kontext; B: EinheitErgebnis; nr: number }) {
  const { v, A } = k;
  const { eur, tsd, t } = k.f;
  const krit = kriterien(A, B, !k.haeuser);
  const wahl = empfohlen(A, B, !k.haeuser);
  const E = wahl === "A" ? A : B, O = wahl === "A" ? B : A;
  const tx = v.texte;
  const punkt = (w: string, s: "A" | "B") => {
    if (w === "=") return s === "A" ? <span style={{ color: "var(--muted)" }}>{t("gleich", "equal")}</span> : null;
    return w === s ? <span style={{ display: "inline-block", width: "2.4mm", height: "2.4mm", borderRadius: "50%", background: s === "A" ? FARBE_A : FARBE_B }} /> : null;
  };
  const guenstigerStart = A.monat.nach >= B.monat.nach ? A : B;
  const diff = eur(Math.abs(O.monat.nach - E.monat.nach), 0);
  const auto1 = guenstigerStart === E
    ? t(`Wohnung ${E.einheit.nr} startet günstiger: rund ${eur(-E.monat.nach, 0)} statt ${eur(-O.monat.nach, 0)} im Monat.`, `Apartment ${E.einheit.nr} starts cheaper: about ${eur(-E.monat.nach, 0)} instead of ${eur(-O.monat.nach, 0)} a month.`)
      + (E.luecke > 0 ? t(` Gerechnet ist dabei mit der subventionierten Miete; die Lücke von ${eur(E.luecke, 0)} trägt der Bauträger höchstens ${v.annahmen.subventionMonate} Monate.`, ` This uses the subsidised rent; the developer pays the gap of ${eur(E.luecke, 0)} for at most ${v.annahmen.subventionMonate} months.`) : "")
    : t(`Wohnung ${O.einheit.nr} startet etwas günstiger: rund ${eur(-O.monat.nach, 0)} statt ${eur(-E.monat.nach, 0)} im Monat, also nur rund ${diff} Unterschied.`, `Apartment ${O.einheit.nr} starts slightly cheaper: about ${eur(-O.monat.nach, 0)} instead of ${eur(-E.monat.nach, 0)} a month, a difference of only about ${diff}.`)
      + (O.luecke > 0 ? t(` Dafür zahlt der Mieter dort heute ${eur(O.einheit.mieteIst, 0)}, die Lücke von ${eur(O.luecke, 0)} trägt der Bauträger höchstens ${v.annahmen.subventionMonate} Monate.`, ` In return the tenant there pays ${eur(O.einheit.mieteIst, 0)} today; the developer pays the gap of ${eur(O.luecke, 0)} for at most ${v.annahmen.subventionMonate} months.`) : "");
  const vorteile = [
    E.luecke > 0 && E.lueckeQuote < O.lueckeQuote ? t(`hat die kleinere Mietlücke (${eur(E.luecke)})`, `has the smaller rent gap (${eur(E.luecke)})`) : "",
    E.luecke <= 0 && O.luecke > 0 ? t("ist ohne Mietlücke vermietet", "is let without a rent gap") : "",
    E.einheit.zimmer > O.einheit.zimmer ? t("bietet ein Zimmer mehr", "offers one more room") : "",
    E.qmPreis < O.qmPreis ? t("kostet weniger je m²", "costs less per m²") : "",
    E.monat.tilgung > O.monat.tilgung ? t("tilgt schneller", "repays faster") : "",
  ].filter(Boolean);
  const liste = vorteile.length > 1 ? `${vorteile.slice(0, -1).join(", ")} ${t("und", "and")} ${vorteile[vorteile.length - 1]}` : vorteile[0];
  const mehrErloes = E.entw[30].erloes > O.entw[30].erloes;
  const auto2 = (liste ? t(`Wohnung ${E.einheit.nr} ${liste}. `, `Apartment ${E.einheit.nr} ${liste}. `) : "")
    + (mehrErloes
      ? t(`Nach 30 Jahren haben Sie nach Ablösung des Kredits rund ${tsd(E.entw[30].erloes)} statt ${tsd(O.entw[30].erloes)}. Eine Wohnung für Ihre Altersvorsorge.`, `After 30 years, once the loan is repaid, you have about ${tsd(E.entw[30].erloes)} instead of ${tsd(O.entw[30].erloes)}. An apartment for your retirement provision.`)
      : t(`Nach 30 Jahren liegt der Erlös nach Ablösung des Kredits mit rund ${tsd(E.entw[30].erloes)} etwas unter den ${tsd(O.entw[30].erloes)} von Wohnung ${O.einheit.nr}.`, `After 30 years, the proceeds after repaying the loan of about ${tsd(E.entw[30].erloes)} are slightly below the ${tsd(O.entw[30].erloes)} of apartment ${O.einheit.nr}.`));
  const autoAndere = t(
    `Wenn Sie ${O.nk < E.nk ? `Ihr Guthaben stärker schonen wollen (rund ${eur(E.nk - O.nk, 0)} weniger Nebenkosten)` : "andere Schwerpunkte setzen"}${O.monat.nach > E.monat.nach ? " und im Monat weniger zuzahlen möchten" : ""}.`,
    `If you ${O.nk < E.nk ? `want to preserve more of your savings (about ${eur(E.nk - O.nk, 0)} less in purchase costs)` : "set other priorities"}${O.monat.nach > E.monat.nach ? " and want to pay less each month" : ""}.`,
  );
  // Eigene Texte des Beraters bleiben, wie sie eingetragen sind.
  const schritte = tx.naechsteSchritte.length ? tx.naechsteSchritte : t(STANDARD_SCHRITTE, SCHRITTE_EN);
  return (
    <Seite nr={nr} kick={t("Welche Wohnung passt zu Ihnen?", "Which apartment suits you?")} fuss={k.fuss}>
      <h2>{tx.empfehlungTitel ? tx.empfehlungTitel : t(<>Unsere ehrliche Einschätzung: <em>Wohnung {E.einheit.nr}, für Ihren langen Weg.</em></>, <>Our honest assessment: <em>apartment {E.einheit.nr}, for your long road ahead.</em></>)}</h2>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "8mm", marginTop: "6mm" }}>
        <div><table className="t"><tbody>
          <tr><th>{t("Kriterium", "Criterion")}</th><th className="r" style={{ textAlign: "center" }}>A</th><th className="r" style={{ textAlign: "center" }}>B</th></tr>
          {krit.map((x) => (
            <tr key={x.text}><td>{kriteriumText(k.f, x.text)}</td><td className="r" style={{ width: "12mm", textAlign: "center" }}>{punkt(x.gewinner, "A")}</td><td className="r" style={{ width: "12mm", textAlign: "center" }}>{punkt(x.gewinner, "B")}</td></tr>
          ))}
        </tbody></table></div>
        <div>
          <div className="tile dk" style={{ padding: "4.5mm 5mm" }}><div className="label">{t("Unsere Empfehlung", "Our recommendation")}</div>
            {(tx.empfehlung ? tx.empfehlung.split(/\n\s*\n/) : [auto1, auto2]).map((p, i) => (
              <div key={i} className="s" style={{ fontSize: "7.6pt", lineHeight: 1.5, marginTop: "2mm", whiteSpace: "pre-line" }}>{p}</div>
            ))}
          </div>
          <div className="note or" style={{ marginTop: "4mm" }}><b>{t(`Wann Wohnung ${O.einheit.nr} besser passt.`, `When apartment ${O.einheit.nr} is the better fit.`)}</b> {tx.wannAndere || autoAndere}</div>
        </div>
      </div>
      <div className="tile dk" style={{ marginTop: "9mm", display: "grid", gridTemplateColumns: "55mm 1fr", gap: "6mm", padding: "5mm 6mm" }}>
        <div><div className="label">{t("Ihr nächster Schritt", "Your next step")}</div><div style={{ fontFamily: "var(--serif)", fontSize: "14pt", color: "#fff", marginTop: "1.5mm" }}>{t("Gemeinsam die Entscheidung festmachen", "Making the decision together")}</div></div>
        <ol style={{ fontSize: "7.6pt", lineHeight: 1.6, color: "#E4ECE7", paddingLeft: "4mm" }}>
          {schritte.map((s) => <li key={s}>{s}</li>)}
        </ol>
      </div>
    </Seite>
  );
}

// ---------------------------------------------------------------------------
// 9/10 Investmentsheet
// ---------------------------------------------------------------------------

function Sheet({ k, e, nr }: { k: Kontext; e: EinheitErgebnis; nr: number }) {
  const { v } = k;
  const { de, eur, pz, pzGanz, t } = k.f;
  const an = v.annahmen;
  const m = e.monat, x = e.einheit;
  const kpi: Array<[string, string, string]> = [
    [t("Kaufpreis", "Purchase price"), eur(e.kp), x.garagen ? t(`inkl. Garage ${eur(x.garageKp, 0)}${x.garagen > 1 ? ", weitere gratis" : ""}`, `incl. garage ${eur(x.garageKp, 0)}${x.garagen > 1 ? ", others free" : ""}`) : t("Wohnung", "Apartment")],
    [t("Wohnfläche", "Living area"), `${de(x.qm)} m²`, [t(`${x.zimmer} Zimmer`, `${x.zimmer} rooms`), x.lage].filter(Boolean).join(" · ")],
    [t("Darlehen", "Loan"), eur(e.darlehen), t("100 % des Kaufpreises", "100% of the purchase price")],
    [t("Ihr Eigenkapital", "Your equity"), eur(e.nk), t(`Kaufnebenkosten ${pz(an.knk)}`, `Purchase costs ${pz(an.knk)}`)],
  ];
  const zl = (a: string, i: string, w: number) => <div className="zl" key={a}><span>{a}<i>{i}</i></span><span>{eur(w)}</span></div>;
  const kurz = [
    t(`Kaufpreis voll finanziert: ${pz(an.zins)} Zins, ${pz(an.tilgung)} Tilgung. Nebenkosten ${eur(e.nk, 0)} aus Eigenkapital.`, `Purchase price fully financed: ${pz(an.zins)} interest, ${pz(an.tilgung)} repayment. Purchase costs of ${eur(e.nk, 0)} from equity.`),
    t(`Steuer ${steuerWie(an, k.f)}. Herleitung und Annahmen: Seite ${k.seiteSteuer}.`, `Tax ${steuerWie(an, k.f)}. Derivation and assumptions: page ${k.seiteSteuer}.`),
    e.luecke > 0
      ? t(`Miete subventioniert auf ${de(x.mieteSubQm)} €/m² bis zur nächsten Mieterhöhung, längstens ${an.subventionMonate} Monate (Mieter zahlt heute ${eur(x.mieteIst)}).`, `Rent subsidised to ${de(x.mieteSubQm)} €/m² until the next rent increase, for at most ${an.subventionMonate} months (tenant pays ${eur(x.mieteIst)} today).`)
      : t(`Gerechnet mit der heutigen Miete von ${eur(x.mieteIst)}.`, `Calculated with today's rent of ${eur(x.mieteIst)}.`),
  ];
  const wp = wpText(k.f, k.haus(e).wirtschaftsplan);
  return (
    <section className="expose-page p ks">
      <div className="in">
        <LogoBox breite={17} lage={{ right: 0, top: "-8mm" }} />
        <div className="kick"><b>{String(nr).padStart(2, "0")}</b>{t(`Investmentsheet · Wohnung ${x.nr}`, `Investment sheet · apartment ${x.nr}`)}</div>
        <h2 style={{ fontSize: "22pt" }}>{t(<>Wohnung {x.nr}: <em>Ihre Zahlen im Monat.</em></>, <>Apartment {x.nr}: <em>your figures per month.</em></>)}</h2>
        <div style={{ fontSize: "9pt", color: "var(--muted)", marginTop: "1.5mm" }}>{t("Für", "For")} {t([v.kunde.anrede, v.kunde.vorname, v.kunde.nachname].filter(Boolean).join(" ") || "Sie", [v.kunde.vorname, v.kunde.nachname].filter(Boolean).join(" ") || "you")} · {k.haus(e).strasse}{k.haus(e).ortZeile ? `, ${k.haus(e).ortZeile}` : ""}</div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: "3.5mm", marginTop: "5mm" }}>
          {kpi.map(([a, b, c]) => <div className="kt" key={a}><div className="label">{a}</div><div className="n">{b}</div><div className="s">{c}</div></div>)}
        </div>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "8mm", marginTop: "5.5mm", alignItems: "start" }}>
          <div><div className="label">{t("Einnahmen je Monat", "Income per month")}</div>
            {zl(t("Kaltmiete Wohnung", "Net rent apartment"), e.luecke > 0 ? t(`subventioniert auf ${de(x.mieteSubQm)} €/m²`, `subsidised to ${de(x.mieteSubQm)} €/m²`) : `${de(x.mieteSubQm)} €/m²`, m.miete)}
            {x.garagen > 0 && zl(x.garagen > 1 ? t(`Garagenmiete, ${x.garagen} Garagen`, `Garage rent, ${x.garagen} garages`) : t("Garagenmiete", "Garage rent"),
              x.garagen > 1 ? t(`je ${eur(x.garageMiete1, 0)}, im 1. Jahr vom Bauträger getragen bzw. aufgestockt`, `${eur(x.garageMiete1, 0)} each, paid or topped up by the developer in year 1`)
                : t(`1. Jahr${x.garageIstVon ? `, der Bauträger stockt auf ${eur(x.garageMiete1, 0)} auf` : ""}`, `Year 1${x.garageIstVon ? `, the developer tops it up to ${eur(x.garageMiete1, 0)}` : ""}`), m.garage)}
            <div className="sb ein"><span>{t("Einnahmen", "Income")}</span><b>{eur(m.einnahmen)}</b></div></div>
          <div><div className="label">{t("Ausgaben je Monat", "Expenses per month")}</div>
            {zl(t("Zins Bankdarlehen", "Interest bank loan"), t(`${pz(an.zins)}, senkt Ihre Steuer`, `${pz(an.zins)}, lowers your tax`), m.zins)}
            {zl(t("Tilgung Bankdarlehen", "Repayment bank loan"), t(`${pz(an.tilgung)}, baut Ihr Vermögen auf`, `${pz(an.tilgung)}, builds your wealth`), m.tilgung)}
            {zl(t("Hausgeld, nicht umlagefähig", "Service charge, non-recoverable"), wp, m.n)}
            {zl(t("Erhaltungsrücklage", "Maintenance reserve"), t("Sparkonto des Hauses für Reparaturen", "The building's savings account for repairs"), m.r)}
            <div className="sb aus"><span>{t("Ausgaben", "Expenses")}</span><b>{eur(m.ausgaben)}</b></div></div>
        </div>
        <div className="label" style={{ marginTop: "5.5mm" }}>{t("Was Sie im Monat zahlen", "What you pay each month")}</div>
        <div className="st"><div className="nr">1</div><div><b>{t("Das zahlen Sie im Monat, bevor das Finanzamt etwas erstattet", "What you pay each month before any tax refund")}</b><i>{t("Ausgaben minus Einnahmen", "Expenses minus income")}</i></div><div className="be">{eur(-m.vor)}</div></div>
        <div className="st s2"><div className="nr">2</div><div><b>{t("Das erstattet Ihnen das Finanzamt im Monat", "What the tax office refunds you each month")}</b><i>{t(`Steuerersparnis, ${an.steuerArt === "einkommen" ? "" : "pauschal "}${pzGanz(an.steuer)}`, `Tax saving, ${an.steuerArt === "einkommen" ? "" : "flat "}${pzGanz(an.steuer)}`)}</i></div><div className="be">{"−"} {eur(m.ersparnis)}</div></div>
        <div className="st s3"><div className="nr">3</div><div><b>{t("Das zahlen Sie tatsächlich im Monat", "What you actually pay each month")}</b><i>{t("mit Steuervorteil, inklusive Tilgung", "with tax benefit, including repayment")}</i></div><div className="be">{eur(-m.nach)}</div></div>
        <div style={{ fontSize: "8.6pt", color: "var(--muted)", marginTop: "2.5mm" }}>{t(`Gilt, sobald Ihr Freibetrag wirkt (ab 1. Januar nach dem Lastenwechsel), Details Seite ${k.seiteFreibetrag}.`, `Applies once your tax allowance takes effect (from 1 January after the handover), details on page ${k.seiteFreibetrag}.`)}</div>
        <div className="note" style={{ marginTop: "4.5mm", fontSize: "8.6pt", padding: "3mm 4.5mm" }}><div className="label" style={{ marginBottom: "1.5mm" }}>{t("Das Wichtigste in Kürze", "Key points at a glance")}</div>
          <ul className="li">{kurz.map((s) => <li key={s} style={{ fontSize: "8.6pt", marginBottom: "1mm" }}>{s}</li>)}</ul></div>
      </div>
      <Fuss text={t(`Investmentsheet ${k.anrede} · ${k.haus(e).strasse}, Wohnung ${x.nr} · Stand ${k.stand}`, `Investment sheet ${k.anrede} · ${k.haus(e).strasse}, apartment ${x.nr} · as of ${k.stand}`)} nr={nr} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// 11 Hinweisseite § 39a
// ---------------------------------------------------------------------------

function Hinweis({ k, nr }: { k: Kontext; nr: number }) {
  const { stand } = k;
  const { eur, t } = k.f;
  const n = k.v.annahmen.lastenwechselMonate;
  const schritte: Array<[string, string]> = [
    [t("Kauf und Lastenwechsel", "Purchase and handover"), t(`Mit dem Übergang von Nutzen und Lasten gehört die Wohnung wirtschaftlich Ihnen; ab dann zählen Miete und Kosten für Sie. In der Regel ist das rund ${n} Monate nach dem Kauf.`,
      `With the transfer of benefits and burdens, the apartment belongs to you economically; from then on, rent and costs count for you. This is usually about ${n} months after the purchase.`)],
    [t("Antrag auf Lohnsteuer-Ermäßigung", "Application for wage tax reduction"), t("Beim Finanzamt beantragen Sie einen Freibetrag (§ 39a EStG). Er kommt nicht automatisch. Der Antrag ist ab dem 1. November für das Folgejahr möglich; im Januar gestellt, gilt er ab 1. Januar, später gestellt wird er auf die restlichen Monate verteilt (§ 39a Abs. 2 Sätze 2, 6, 7).",
      "You apply to the tax office for a tax allowance (section 39a German Income Tax Act). It is not granted automatically. The application is possible from 1 November for the following year; filed in January, it applies from 1 January, filed later it is spread over the remaining months (section 39a (2) sentences 2, 6, 7).")],
    [t("Freibetrag ab dem Jahr nach dem Kauf", "Allowance from the year after the purchase"), t("Verluste aus einer neu gekauften Wohnung zählen für den Freibetrag ab dem Kalenderjahr nach der Anschaffung (§ 37 Abs. 3 Satz 8 EStG).",
      "Losses from a newly purchased apartment count towards the allowance from the calendar year after the acquisition (section 37 (3) sentence 8 German Income Tax Act).")],
    [t("Ersparnis kommt mit dem Gehalt", "The saving arrives with your salary"), t("Das Finanzamt verteilt den Jahresbetrag auf die Monate. Ihr Arbeitgeber zieht weniger Lohnsteuer ab: Sie zahlen Schritt 3.",
      "The tax office spreads the annual amount over the months. Your employer deducts less wage tax: you pay step 3.")],
    [t("Bis dahin: Steuererklärung", "Until then: tax return"), t("Bis der Freibetrag wirkt, zahlen Sie den Betrag aus Schritt 1. Die Differenz erhalten Sie mit der Steuererklärung zurück, nach den tatsächlichen Werten des Kaufjahres.",
      "Until the allowance takes effect, you pay the amount from step 1. You receive the difference back with your tax return, based on the actual figures of the purchase year.")],
  ];
  const bild = (i: number) => <img src={P39A[i - 1]} alt={t(`Auszug § 39a EStG, Teil ${i}`, `Extract section 39a German Income Tax Act, part ${i}`)} style={{ width: "100%", display: "block", borderRadius: "1mm" }} />;
  return (
    <Seite nr={nr} kick={t("Wann die Steuerersparnis bei Ihnen ankommt", "When the tax saving reaches you")} fuss={k.fuss}>
      <h2>{t(<>Monatlich mit dem Gehalt: <em>so wirkt der Freibetrag.</em></>, <>Monthly with your salary: <em>how the tax allowance works.</em></>)}</h2>
      <p className="lead" style={{ fontSize: "8pt" }}>{t("Ohne Freibetrag erhalten Sie die Steuerersparnis einmal im Jahr mit dem Steuerbescheid. Mit einem Freibetrag auf der Lohnsteuerkarte (elektronische Lohnsteuerabzugsmerkmale) kommt sie jeden Monat mit dem Gehalt. Allgemeine Information, keine Steuerberatung.",
        "Without an allowance you receive the tax saving once a year with your tax assessment. With an allowance on your electronic wage tax card (ELStAM), it arrives every month with your salary. General information, not tax advice.")}</p>
      <div className="label" style={{ margin: "4mm 0 1.5mm" }}>{t("Auszug aus dem Gesetz: § 39a EStG", "Extract from the law (German original): section 39a EStG")}</div>
      <div style={{ border: ".3mm solid var(--line)", borderRadius: "2mm", padding: "2mm 3mm", background: "#fff" }}>
        {bild(1)}{bild(2)}
        <div style={{ fontSize: "6.6pt", color: "var(--muted)", margin: ".8mm 0" }}>{t("[…] Nummern 1 bis 4a ausgelassen", "[…] numbers 1 to 4a omitted")}</div>
        {bild(3)}
        <div style={{ fontSize: "6.6pt", color: "var(--muted)", margin: ".8mm 0" }}>{t("[…] Nummern 5 c bis 9 und Absatz 1 Sätze 2 bis 5 sowie Absatz 2 Sätze 1 bis 5 ausgelassen; es folgen Absatz 2 Satz 6 und 7:", "[…] numbers 5c to 9, paragraph 1 sentences 2 to 5 and paragraph 2 sentences 1 to 5 omitted; paragraph 2 sentences 6 and 7 follow:")}</div>
        {bild(4)}
      </div>
      <div style={{ fontSize: "6.4pt", color: "var(--muted)", marginTop: "1mm" }}>{t("Quelle: gesetze-im-internet.de, § 39a EStG, Stand 28.10.2026. Bildausschnitt der amtlichen Seite, Auslassungen markiert.", "Source: gesetze-im-internet.de, section 39a EStG, as of 28/10/2026. Image extract of the official page, omissions marked.")}</div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "6mm", marginTop: "3.5mm" }}>
        <div><div className="label" style={{ marginBottom: ".5mm" }}>{t("Der Ablauf in fünf Schritten", "The process in five steps")}</div>
          {schritte.map(([a, b], i) => (
            <div key={a} style={{ display: "grid", gridTemplateColumns: "7mm 1fr", gap: "2.5mm", padding: "1.7mm 0", borderBottom: ".2mm solid var(--line)" }}>
              <div style={{ width: "6mm", height: "6mm", borderRadius: "50%", background: "var(--champ)", color: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: "7.5pt" }}>{i + 1}</div>
              <div><b style={{ fontWeight: 500, fontSize: "7.8pt" }}>{a}</b><div style={{ fontSize: "6.8pt", color: "var(--muted)", lineHeight: 1.4 }}>{b}</div></div>
            </div>
          ))}
        </div>
        <div>
          <div className="note">{t(<><b>Wichtig für das erste Jahr:</b> Nr. 5 verweist auf § 37 Absatz 3 EStG. Dort heißt es in Satz 8: „Negative Einkünfte aus der Vermietung oder Verpachtung eines Gebäudes im Sinne des § 21 Absatz 1 Satz 1 Nummer 1 werden bei der Festsetzung der Vorauszahlungen nur für Kalenderjahre berücksichtigt, die nach der Anschaffung oder Fertigstellung dieses Gebäudes beginnen.“ (Quelle: gesetze-im-internet.de, § 37 EStG). Deshalb wirkt der Freibetrag ab dem 1. Januar nach dem Lastenwechsel.</>,
            <><b>Important for the first year:</b> number 5 refers to section 37 (3) EStG. Sentence 8 there states, in essence, that negative income from letting a building is only taken into account for advance payments for calendar years beginning after the building was acquired or completed (source: gesetze-im-internet.de, section 37 EStG). That is why the allowance takes effect from 1 January after the handover.</>)}</div>
          <div className="note or" style={{ marginTop: "3mm" }}><b>{t("Was das für Sie heißt:", "What this means for you:")}</b>{" "}
            {k.liste.map((e, i) => t(`Wohnung ${e.einheit.nr}: bis ${i ? "dahin" : "der Freibetrag wirkt"} ${eur(-e.monat.vor)}${i ? "" : " im Monat"}, danach ${eur(-e.monat.nach)}. `,
              `Apartment ${e.einheit.nr}: ${i ? "until then" : "until the allowance takes effect"} ${eur(-e.monat.vor)}${i ? "" : " a month"}, after that ${eur(-e.monat.nach)}. `)).join("")}
            {t(`Die Differenz (im Modell ${k.liste.map((e) => eur(e.monat.ersparnis)).join(" bzw. ")} je Monat) erhalten Sie für die Monate davor mit der Steuererklärung zurück. Das ist ein Modellwert: Im Kaufjahr zählen die tatsächlichen Einnahmen und Kosten, die zeitanteilige AfA und Ihr persönlicher Steuersatz. Stand ${stand}.`,
              `You receive the difference (in the model ${k.liste.map((e) => eur(e.monat.ersparnis)).join(" and ")} a month) for the months before that with your tax return. This is a model value: in the purchase year, the actual income and costs, pro-rata depreciation and your personal tax rate count. As of ${stand}.`)}</div>
        </div>
      </div>
    </Seite>
  );
}

// ---------------------------------------------------------------------------
// 12 Steuerersparnis im Detail und Annahmen
// ---------------------------------------------------------------------------

function SteuerDetail({ k, nr }: { k: Kontext; nr: number }) {
  const { v, A, B, liste: L } = k;
  const { de, eur, pz, pzGanz, t } = k.f;
  const an = v.annahmen;
  const steuer = pzGanz(an.steuer);
  const afaJ = A.einheit.afaJahre;
  const afaJText = jahreAfa(k.f, afaJ);
  const tab = (e: EinheitErgebnis, b: boolean) => {
    const j = e.jahr;
    return (
      <div>
        {B && <span className={`badge${b ? " b" : ""}`}>{b ? "B" : "A"}</span>} <b style={{ fontWeight: 500 }}>{t("Wohnung", "Apartment")} {e.einheit.nr}</b>
        <table className="t" style={{ marginTop: "2mm", fontSize: "8.6pt" }}><tbody>
          <tr><td>{e.einheit.garagen ? t(`Kaltmiete und ${garagenText(e, false)} im Jahr`, `Net rent and ${garagenText(e, false, k.f)} per year`) : t("Kaltmiete im Jahr", "Net rent per year")}</td><td className="r">+ {eur(j.miete)}</td></tr>
          <tr><td>{t("Schuldzinsen Bankdarlehen", "Interest on bank loan")}</td><td className="r">{"−"} {eur(j.zins)}</td></tr>
          <tr><td>{t("Nicht umlagefähiges Hausgeld", "Non-recoverable service charge")}</td><td className="r">{"−"} {eur(j.n)}</td></tr>
          <tr><td>{t(`Abschreibung (AfA 1/${jahreAfa(k.f, e.einheit.afaJahre)} auf ${eur(e.afaBasis, 0)})`, `Depreciation (1/${jahreAfa(k.f, e.einheit.afaJahre)} on ${eur(e.afaBasis, 0)})`)}</td><td className="r">{"−"} {eur(j.afa)}</td></tr>
          <tr className="sum"><td>{t("Ergebnis aus Vermietung im Jahr", "Rental result per year")}</td><td className="r">{eur(j.ergebnis)}</td></tr>
          <tr><td>{t(`× ${steuer} = Steuerersparnis im Jahr`, `× ${steuer} = tax saving per year`)}</td><td className="r">{eur(j.ersparnis)}</td></tr>
          <tr className="hi"><td>{t("÷ 12 = Steuerersparnis im Monat", "÷ 12 = tax saving per month")}</td><td className="r">{eur(e.monat.ersparnis)}</td></tr>
        </tbody></table>
      </div>
    );
  };
  const mieteQm = !B || A.einheit.mieteSubQm === B.einheit.mieteSubQm ? de(A.einheit.mieteSubQm) : `${de(A.einheit.mieteSubQm)} ${t("bzw.", "and")} ${de(B.einheit.mieteSubQm)}`;
  const hinw: ReactNode[] = [
    t(<><b>Nicht absetzbar:</b> Tilgung (sie baut Ihr Vermögen auf) und Erhaltungsrücklage (erst, wenn das Geld für Reparaturen verwendet wird).</>,
      <><b>Not deductible:</b> repayment (it builds your wealth) and the maintenance reserve (only once the money is used for repairs).</>),
    t(<><b>Abschreibung:</b> ≈ {de(100 / afaJ, 1)} % (1/{afaJText}) auf {pzGanz(an.gebaeudeanteil)} von Kaufpreis und Nebenkosten{afaJ < 50 ? "; setzt ein anerkanntes Gutachten zur Restnutzungsdauer voraus, gesetzlich wären es 2 %" : ""}.</>,
      <><b>Depreciation:</b> ≈ {de(100 / afaJ, 1)}% (1/{afaJText}) on {pzGanz(an.gebaeudeanteil)} of purchase price and purchase costs{afaJ < 50 ? "; requires a recognised expert report on the remaining useful life, the statutory rate would be 2%" : ""}.</>),
    t(<><b>Finanzierung:</b> Bankdarlehen über den Kaufpreis, Zins {pz(an.zins)}, Tilgung {pz(an.tilgung)}. Kaufnebenkosten ({pz(an.knk)}: Grunderwerbsteuer, Notar und Grundbuch) aus Eigenkapital.</>,
      <><b>Financing:</b> bank loan for the purchase price, interest {pz(an.zins)}, repayment {pz(an.tilgung)}. Purchase costs ({pz(an.knk)}: land transfer tax, notary and land registry) from equity.</>),
    t(<><b>Miete:</b> gerechnet mit {mieteQm} €/m²; der Mieter zahlt heute {B ? <>{eur(A.einheit.mieteIst)} (Wohnung {A.einheit.nr}) bzw. {eur(B.einheit.mieteIst)} (Wohnung {B.einheit.nr})</> : eur(A.einheit.mieteIst)}.
      {L.some((e) => e.luecke > 0) ? ` Die Lücke trägt der Bauträger bis zur nächsten Mieterhöhung, längstens ${an.subventionMonate} Monate.` : ""}
      {A.einheit.garagen ? ` Garage${A.einheit.garagen > 1 ? " 1" : ""} im 1. Jahr ${eur(A.einheit.garageMiete1, 0)}.` : ""}
      {A.einheit.garagen > 1 ? ` Weitere Garage ohne Aufpreis; Miete ${eur(A.einheit.garageMiete1, 0)} im 1. Jahr vom Bauträger getragen, danach Vermietung.` : ""}</>,
    <><b>Rent:</b> calculated with {mieteQm} €/m²; the tenant pays {B ? <>{eur(A.einheit.mieteIst)} (apartment {A.einheit.nr}) and {eur(B.einheit.mieteIst)} (apartment {B.einheit.nr})</> : eur(A.einheit.mieteIst)} today.
      {L.some((e) => e.luecke > 0) ? ` The developer pays the gap until the next rent increase, for at most ${an.subventionMonate} months.` : ""}
      {A.einheit.garagen ? ` Garage${A.einheit.garagen > 1 ? " 1" : ""} in year 1: ${eur(A.einheit.garageMiete1, 0)}.` : ""}
      {A.einheit.garagen > 1 ? ` Further garage at no surcharge; rent of ${eur(A.einheit.garageMiete1, 0)} paid by the developer in year 1, then let.` : ""}</>),
    t(<><b>Steuersatz:</b> Steuerersparnis gerechnet mit einem Grenzsteuersatz von {steuer}; die tatsächliche Ersparnis hängt vom persönlichen Steuersatz ab.</>,
      <><b>Tax rate:</b> tax saving calculated with a marginal tax rate of {steuer}; the actual saving depends on your personal tax rate.</>),
    t(<>Vereinfachte Rechnung für das 1. volle Jahr; Rundungsdifferenzen möglich.</>, <>Simplified calculation for the first full year; rounding differences are possible.</>),
  ];
  const hausgeldQuelle = k.haeuser
    ? L.map((e) => `${wpText(k.f, k.haus(e).wirtschaftsplan)}${k.haus(e).verwaltung ? ` (${k.haus(e).strasse}, ${t("Verwaltung", "managed by")} ${k.haus(e).verwaltung})` : ` (${k.haus(e).strasse})`}`).join(t(" und ", " and "))
    : `${wpText(k.f, v.objekt.wirtschaftsplan)}${v.objekt.verwaltung ? ` (${t("Verwaltung", "managed by")} ${v.objekt.verwaltung})` : ""}`;
  return (
    <Seite nr={nr} kick={t("Steuerersparnis im Detail und Annahmen", "Tax saving in detail and assumptions")} fuss={k.fuss}>
      <h2>{t(<>So entsteht die Steuerersparnis <em>im 1. Jahr.</em></>, <>How the tax saving arises <em>in year 1.</em></>)}</h2>
      <p className="lead" style={{ fontSize: "9pt" }}>{t(`Zinsen, Abschreibung und nicht umlagefähiges Hausgeld sind zusammen höher als die Miete. Dieses Minus senkt Ihr zu versteuerndes Einkommen; mit ${an.steuerArt === "einkommen" ? "" : "pauschal "}${steuer} gerechnet ergibt sich die Erstattung aus Schritt 2 ${B ? "der Investmentsheets" : "des Investmentsheets"}.`,
        `Interest, depreciation and non-recoverable service charge together are higher than the rent. This loss lowers your taxable income; calculated with ${an.steuerArt === "einkommen" ? "" : "a flat "}${steuer}, this gives the refund in step 2 of the investment sheet${B ? "s" : ""}.`)}</p>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "8mm", marginTop: "6mm" }}>{tab(A, false)}{B && tab(B, true)}</div>
      <div className="label" style={{ marginTop: "7mm", marginBottom: "2mm" }}>{t("Annahmen und Hinweise", "Assumptions and notes")}</div>
      <ul className="li">{hinw.map((h, i) => <li key={i} style={{ fontSize: "8.4pt", marginBottom: "1.6mm" }}>{h}</li>)}</ul>
      <p className="small" style={{ marginTop: "5mm", fontSize: "7pt" }}>
        {t(<>
          Beispielrechnung, keine Zusage und kein Angebot. Keine Steuer-, Rechts- oder Finanzierungsberatung; bitte mit Steuerberatung und Bank prüfen.
          Annahmen: Kaufpreis voll finanziert, Sollzins {pz(an.zins)} (angenommen bis zur vollständigen Tilgung; die Zinsbindung ist meist kürzer, danach gilt der dann übliche Zins),
          anfängliche Tilgung {pz(an.tilgung)}, Kaufnebenkosten aus Eigenkapital, Wertentwicklung {pzGanz(an.wertPa)} und Kostensteigerung {pzGanz(an.kostenPa)} im Jahr,
          Miete steigt linear und erreicht den Zielwert im Jahr {an.mieteZielJahr} (Jahr 1 = {an.startJahr}), Betrachtungszeitraum 30 Jahre; Abschreibung {afaJText} Jahre, danach ohne AfA gerechnet.
          Verkaufssumme: angenommener Verkaufspreis vor Verkaufskosten (z. B. Makler, Notar), davon wird die Restschuld abgelöst. Steuerfreiheit des Verkaufsgewinns nach mehr als
          zehn Jahren (§ 23 EStG) als allgemeiner Hinweis. Steuerersparnis gerechnet mit einem Grenzsteuersatz von {steuer} auf das Ergebnis aus Vermietung, wie in der
          Musterrechnung der Exposés; die tatsächliche Ersparnis hängt vom persönlichen Steuersatz ab. Ohne Kirchensteuer und ohne Solidaritätszuschlag, Einkommen über die Laufzeit gleich.
          {afaJ < 50 ? " Die AfA wegen kürzerer tatsächlicher Nutzungsdauer setzt ein Gutachten voraus; ob und in welcher Höhe sie anerkannt wird, entscheidet das Finanzamt." : ""}
          {L.some((e) => e.luecke > 0) || A.einheit.garagen ? " Mietsubvention und Garagenmiete laut Vereinbarungen des Bauträgers; maßgeblich sind die Verträge." : ""}
          {" "}Hausgeld laut {hausgeldQuelle}. Heutige Mieten laut {B ? "Exposés" : "Exposé"} (Stand {k.stand}). Verfügbarkeit der Wohnungen vorbehalten.
        </>, <>
          Example calculation, no commitment and no offer. No tax, legal or financing advice; please check with your tax adviser and bank.
          Assumptions: purchase price fully financed, borrowing rate {pz(an.zins)} (assumed until full repayment; the fixed-rate period is usually shorter, after which the then usual rate applies),
          initial repayment {pz(an.tilgung)}, purchase costs from equity, value growth {pzGanz(an.wertPa)} and cost increase {pzGanz(an.kostenPa)} a year,
          rent rises linearly and reaches the target value in {an.mieteZielJahr} (year 1 = {an.startJahr}), period considered 30 years; depreciation over {afaJText} years, calculated without depreciation thereafter.
          Sale price: assumed selling price before selling costs (e.g. agent, notary), from which the remaining debt is repaid. Tax exemption of the sale gain after more than
          ten years (section 23 German Income Tax Act) as a general note. Tax saving calculated with a marginal tax rate of {steuer} on the rental result, as in the
          example calculation of the exposés; the actual saving depends on your personal tax rate. Without church tax and solidarity surcharge, income constant over the term.
          {afaJ < 50 ? " Depreciation based on a shorter actual useful life requires an expert report; the tax office decides whether and to what extent it is recognised." : ""}
          {L.some((e) => e.luecke > 0) || A.einheit.garagen ? " Rent subsidy and garage rent as agreed by the developer; the contracts are decisive." : ""}
          {" "}Service charge as per {hausgeldQuelle}. Current rents as per the exposé{B ? "s" : ""} (as of {k.stand}). Subject to availability of the apartments.
        </>)}
      </p>
    </Seite>
  );
}

// ---------------------------------------------------------------------------
// Kaufnebenkosten: Erspartes oder Nachrangdarlehen (Christian, 28.10.2026)
// ---------------------------------------------------------------------------

function NachrangTabelle({ k, e, b }: { k: Kontext; e: EinheitErgebnis; b: boolean }) {
  const { eur, tsd, pz, pzGanz, t } = k.f;
  const an = k.v.annahmen;
  const nz = pz(an.nachrangZins), nt = pz(an.nachrangTilgung);
  const f = [0, 0.5, 1].map((a) => nachrangFall(e, a, an));
  const z = (lbl: ReactNode, werte: ReactNode[], cls = "") => (
    <tr className={cls}><td>{lbl}</td>{werte.map((w, i) => <td className="r" key={i}>{w}</td>)}</tr>
  );
  return (
    <div style={{ marginTop: "4mm" }}>
      {k.B && <span className={`badge${b ? " b" : ""}`}>{b ? "B" : "A"}</span>} <b style={{ fontWeight: 500 }}>{t("Wohnung", "Apartment")} {e.einheit.nr}</b>{" "}
      <span className="small">{t(`Kaufpreis ${eur(e.kp, 0)}${e.einheit.garagen ? " inkl. Garage" : ""}, Bankdarlehen ${eur(e.darlehen, 0)}`, `Purchase price ${eur(e.kp, 0)}${e.einheit.garagen ? " incl. garage" : ""}, bank loan ${eur(e.darlehen, 0)}`)}</span>
      <table className="t nrt" style={{ marginTop: "1.5mm" }}><tbody>
        <tr><th /><th className="r">{t(<>Aus Erspartem<br />(wie bisher)</>, <>From savings<br />(as before)</>)}</th><th className="r">{t(<>50 % über<br />Nachrang</>, <>50% via<br />junior loan</>)}</th><th className="r">{t(<>100 % über<br />Nachrang</>, <>100% via<br />junior loan</>)}</th></tr>
        {z(t(`Kaufnebenkosten gesamt (${pz(an.knk)})`, `Total purchase costs (${pz(an.knk)})`), f.map(() => eur(e.nk, 0)))}
        {z(t("davon über Nachrangdarlehen", "of which via junior loan"), f.map((x, i) => (i ? eur(x.nr, 0) : eur(0, 0))), "sub")}
        {z(t("Ihr Eigenkapital aus Erspartem", "Your equity from savings"), f.map((x) => eur(x.ek, 0)))}
        {z(t(`Rate Bankdarlehen (Zins ${pz(an.zins)} + Tilgung ${pz(an.tilgung)})`, `Bank loan instalment (interest ${pz(an.zins)} + repayment ${pz(an.tilgung)})`), f.map((x) => eur(x.bank)))}
        {z(t(`Rate Nachrangdarlehen (Zins ${nz} + Tilgung ${nt})`, `Junior loan instalment (interest ${nz} + repayment ${nt})`), f.map((x, i) => (i ? eur(x.rate) : eur(0))))}
        {z(t("1 · Zuzahlung vor Steuer", "1 · Top-up before tax"), f.map((x) => eur(-x.vor)), "sum")}
        {z(t(`2 · Das spart Ihnen das Finanzamt (${pzGanz(an.steuer)})`, `2 · Your tax saving (${pzGanz(an.steuer)})`), f.map((x) => eur(x.ersparnis)))}
        {z(t("3 · Zuzahlung nach Steuer: Ihr Eigenanteil im Monat", "3 · Top-up after tax: your own contribution per month"), f.map((x) => eur(-x.nach)), "dk")}
        {z(t("Nachrangdarlehen getilgt nach", "Junior loan repaid after"), f.map((x, i) => (i ? t(`rund ${x.jahre} Jahren`, `about ${x.jahre} years`) : t("entfällt", "n/a"))), "sub")}
        {z(t("Zinsen Nachrang über die Laufzeit, nach Steuer", "Junior loan interest over the term, after tax"), f.map((x, i) => (i ? `${t("rund", "about")} ${tsd(x.zinsenNetto)}` : eur(0, 0))), "sub")}
      </tbody></table>
    </div>
  );
}

function Nachrang({ k, nr }: { k: Kontext; nr: number }) {
  const { de, pz, t } = k.f;
  const an = k.v.annahmen;
  const nz = pz(an.nachrangZins), nt = pz(an.nachrangTilgung);
  return (
    <Seite nr={nr} kick={t("Kaufnebenkosten: Erspartes oder Nachrangdarlehen", "Purchase costs: savings or junior loan")} fuss={k.fuss}>
      <h2>{t(<>Weniger Eigenkapital einsetzen: <em>was das im Monat bedeutet.</em></>, <>Using less equity: <em>what it means each month.</em></>)}</h2>
      <p className="lead" style={{ fontSize: "8pt" }}>
        {t(`Bisher sind die Kaufnebenkosten aus Ihrem Ersparten gerechnet. Alternativ lassen sie sich zur Hälfte oder ganz über ein Nachrangdarlehen finanzieren, gerechnet mit ${nz} Zins und ${nt} Tilgung. Ihr Erspartes bleibt dann als Reserve, dafür steigt die Monatsbelastung. Die Zinsen des Nachrangdarlehens sind als Werbungskosten angesetzt.`,
          `So far the purchase costs are paid from your savings. Alternatively, half or all of them can be financed with a junior (subordinated) loan, calculated at ${nz} interest and ${nt} repayment. Your savings then remain as a reserve, but the monthly burden rises. The interest on the junior loan is treated as a deductible expense.`)}
      </p>
      {k.liste.map((e, i) => <NachrangTabelle key={i} k={k} e={e} b={i > 0} />)}
      <p className="small" style={{ marginTop: "3mm" }}>
        {t(`Zahlen für den Monat im 1. Jahr, Steuersatz ${steuerWie(an, k.f)} wie in der übrigen Rechnung. Nachrangdarlehen als Annuität mit ${nz} Zins und ${nt} anfänglicher Tilgung, jährlich verrechnet; danach entfällt die Rate. Die Zinsen über die Laufzeit sind nach Steuer angegeben (Zinsen × ${de((1 - an.steuer) * 100, 0)} %). Konditionen beispielhaft, das Angebot des Darlehensgebers steht aus. Keine Steuer- oder Finanzierungsberatung.`,
          `Figures per month in year 1, tax rate ${steuerWie(an, k.f)} as in the rest of the calculation. Junior loan as an annuity with ${nz} interest and ${nt} initial repayment, settled annually; the instalment ends afterwards. Interest over the term is shown after tax (interest × ${de((1 - an.steuer) * 100, 0)}%). Terms are examples; the lender's offer is pending. No tax or financing advice.`)}
      </p>
    </Seite>
  );
}

// ---------------------------------------------------------------------------
// Deckblatt im Stil der System-PDFs (pdfBranding.addCoverPage), ohne Foto
// ---------------------------------------------------------------------------

function DeckblattSystem({ k }: { k: Kontext }) {
  const { t } = k.f;
  const d = k.v.dokument!;
  const spalten: Array<[string, string]> = [
    [t("Erstellt für", "Prepared for"), [k.v.kunde.vorname, k.v.kunde.nachname].filter(Boolean).join(" ") || t("Kundin oder Kunde", "Client")],
    [t("Datum", "Date"), k.stand],
    [t("Version", "Version"), d.version || "1"],
    ...(d.erstelltVon ? [[t("Erstellt von", "Prepared by"), d.erstelltVon] as [string, string]] : []),
  ];
  return (
    <section className="expose-page p kov-system">
      <div className="kov-system-schein" />
      <div className="kov-system-karo" />
      <img src={LOGO_DUNKEL} alt="OS Real Estate" className="kov-system-logo" />
      <div className="kov-system-text">
        <div className="kov-system-kennung">{t("Ausführliche Investmentberechnung", "Detailed investment calculation")}{d.typ ? ` · ${d.typ}` : ""}</div>
        <div className="kov-system-titel">{d.titel || k.haus(k.A).strasse}</div>
        <div className="kov-system-linie" />
        <div className="kov-system-unter">{d.adresse}</div>
        {d.typ && <div className="kov-system-unter">{d.typ}</div>}
      </div>
      <div className="kov-system-fuss">
        {spalten.map(([a, b]) => <div key={a}><span>{a}</span><b>{b}</b></div>)}
      </div>
      <div className="kov-system-hinweis">{t("Beispielrechnung, keine Zusage. Keine Steuer- oder Rechtsberatung.", "Example calculation, no commitment. No tax or legal advice.")}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function kontextFuer(v: KundenObjektvergleich, A: EinheitErgebnis, B: EinheitErgebnis | null, sprache: "de" | "en" = "de") {
  const f = formatFuer(sprache === "en");
  const stand = f.tag(v.stand);
  const anrede = anredeName(v, f) || f.t("Sie", "you");
  const mitKunde = v.kunde.netto > 0;
  // Reihenfolge wie in der Vorlage; bei einer Wohnung ohne Vergleich und Empfehlung, ohne Kundendaten ohne Ausgangslage.
  const seiten = [
    "deckblatt", ...(mitKunde ? ["ausgangslage"] : []), "wohnungen", ...(B ? ["vergleich"] : []), "rechnungA", ...(B ? ["rechnungB"] : []),
    "entwicklung", ...(B ? ["empfehlung"] : []), "sheetA", ...(B ? ["sheetB"] : []), "hinweis", "steuer", "nachrang",
  ];
  const nr = (s: string) => seiten.indexOf(s) + 1;
  const k: Kontext = {
    v, A, B, liste: B ? [A, B] : [A], seiteFreibetrag: nr("hinweis"), seiteSteuer: nr("steuer"), stand, anrede, f,
    fuss: v.dokument
      ? f.t(`Ausführliche Investmentberechnung für ${anrede} · Stand ${stand}`, `Detailed investment calculation for ${anrede} · as of ${stand}`)
      : `Persönlicher Objektvergleich für ${anrede} · Stand ${stand}`,
    haeuser: !!B && haeuseruebergreifend(v), haus: (e) => objektVon(v, e === B ? 1 : 0),
  };
  return { k, seiten, nr, mitKunde };
}

export function KundenObjektvergleichDokument({ v, A, B = null, sprache = "de" }: { v: KundenObjektvergleich; A: EinheitErgebnis; B?: EinheitErgebnis | null; sprache?: "de" | "en" }) {
  // Das Fotodeckblatt (persönlicher Objektvergleich) gibt es nur auf Deutsch, Englisch nur mit Systemdeckblatt.
  const { k, seiten, nr, mitKunde } = kontextFuer(v, A, B, v.dokument || !B ? sprache : "de");
  return (
    <SeitenKontext.Provider value={seiten.length}>
      <SpracheKontext.Provider value={k.f}>
        <div className="kov" lang={k.f.en ? "en" : "de"}>
          {v.dokument || !B ? <DeckblattSystem k={k} /> : <Deckblatt k={k} B={B} />}
          {mitKunde && <Ausgangslage k={k} nr={nr("ausgangslage")} />}
          <Wohnungen k={k} nr={nr("wohnungen")} />
          {B && <Vergleich k={k} B={B} nr={nr("vergleich")} />}
          <Rechnung k={k} e={A} nr={nr("rechnungA")} b={false} />
          {B && <Rechnung k={k} e={B} nr={nr("rechnungB")} b />}
          <Entwicklung k={k} nr={nr("entwicklung")} />
          {B && <Empfehlung k={k} B={B} nr={nr("empfehlung")} />}
          <Sheet k={k} e={A} nr={nr("sheetA")} />
          {B && <Sheet k={k} e={B} nr={nr("sheetB")} />}
          <Hinweis k={k} nr={nr("hinweis")} />
          <SteuerDetail k={k} nr={nr("steuer")} />
          <Nachrang k={k} nr={nr("nachrang")} />
        </div>
      </SpracheKontext.Provider>
    </SeitenKontext.Provider>
  );
}

/**
 * Analyse-Ansicht des Investmentrechners (29.10.2026): dieselben Bausteine
 * und Zahlen wie die ausführliche Berechnung, als Karten statt A4-Seiten.
 * Immer Deutsch; die Sprachwahl gilt nur für das PDF.
 */
export function EinhauserAnalyse({ v, A, B = null }: { v: KundenObjektvergleich; A: EinheitErgebnis; B?: EinheitErgebnis | null }) {
  const { k } = kontextFuer(v, A, B);
  const { eur, tsd, pz } = k.f;
  const an = v.annahmen;
  return (
    <SeitenKontext.Provider value={0}>
      <div className="kov kov-analyse">
        {k.liste.map((e, i) => {
          const m = e.monat;
          return (
            <section className="kov-karte" key={i}>
              <div className="kick">{B ? <b>{i ? "B" : "A"}</b> : null}Ihre persönliche Rechnung · {k.haus(e).strasse}, Wohnung {e.einheit.nr}</div>
              <h2><em>{eur(-m.nach)} im Monat</em> nach Steuer, inklusive Tilgung.</h2>
              <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginTop: "4mm" }}>
                <div className="tile or"><div className="label">Steuerersparnis im 1. Jahr</div><div className="n">{eur(e.jahr.ersparnis, 0)}</div><div className="s">{eur(m.ersparnis)} im Monat, Steuersatz {steuerWie(an)}</div></div>
                <div className="tile"><div className="label">Tilgung im Monat</div><div className="n">{eur(m.tilgung)}</div><div className="s">Darlehen {eur(e.darlehen, 0)}, Zins {pz(an.zins)}, Tilgung {pz(an.tilgung)}</div></div>
                <div className="tile dk"><div className="label">Eigenanteil nach Steuer</div><div className="n">{eur(-m.nach)}</div><div className="s">Vor Steuer {eur(-m.vor)}. Kaufnebenkosten {eur(e.nk, 0)} aus Eigenkapital.</div></div>
              </div>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "5mm", marginTop: "4mm" }}><Einnahmen k={k} e={e} /><Ausgaben k={k} e={e} /></div>
              <Treppe k={k} e={e} />
            </section>
          );
        })}
        <section className="kov-karte">
          <div className="kick">Vermögensentwicklung</div>
          <div style={{ marginTop: "3mm" }}><ChartErloes A={A} B={B} /></div>
          <table className="t" style={{ marginTop: "3mm" }}><tbody>
            <tr><th /><th className="r">Verkaufssumme</th><th className="r">Restschuld</th><th className="r">Ihr Erlös</th><th className="r">Ihre Zuzahlung</th><th className="r">Ihr Plus</th></tr>
            {k.liste.map((e, i) => ([25, 30, 35] as const).map((y) => {
              const x = e.entw[y];
              return (
                <tr key={`${i}-${y}`}><td>{B ? `${i ? "B" : "A"} · ` : ""}nach {y} Jahren</td><td className="r">{tsd(x.wert)}</td><td className="r">{Math.round(x.rest) ? `− ${tsd(x.rest)}` : "0\u00a0€"}</td>
                  <td className="r">{tsd(x.erloes)}</td><td className="r">{tsd(x.zuzahlung)}</td><td className="r" style={{ fontWeight: 500 }}>{tsd(x.plus)}</td></tr>
              );
            }))}
          </tbody></table>
        </section>
        <section className="kov-karte">
          <div className="kick">Kaufnebenkosten: Erspartes oder Nachrangdarlehen</div>
          {k.liste.map((e, i) => <NachrangTabelle key={i} k={k} e={e} b={i > 0} />)}
        </section>
      </div>
    </SeitenKontext.Provider>
  );
}
