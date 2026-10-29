/**
 * Persönlicher Objektvergleich als Dokument (Christian, 28.10.2026).
 *
 * Zwölf A4-Seiten im Aufbau des Vergleichs vom 28.10.2026 (Vorlage
 * `build.py`): Deckblatt, Ausgangslage, Wohnungen, Vergleich, Rechnung A und
 * B, Vermögensentwicklung, Empfehlung, Investmentsheet A und B, Freibetrag
 * nach § 39a, Steuerersparnis im Detail. Jede Seite ist eine `.expose-page`,
 * damit der vorhandene Bild-PDF-Export (`erzeugeBerechnungsansichtPdf`) sie
 * fotografieren kann. Zahlen aus `kundenObjektvergleich.ts`.
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

export function de(x: number, d = 2): string {
  const q = rundeHalbAuf(Math.abs(x), d);
  const s = q.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  return (x < 0 && q !== 0 ? "−" : "") + s;
}
export const eur = (x: number, d = 2) => `${de(x, d)}\u00a0€`;
export const tsd = (x: number) => `${de(Math.round(x / 1000) * 1000, 0)}\u00a0€`;
const pz = (x: number, d = 1) => `${de(x * 100, d)}\u00a0%`;
const pzGanz = (x: number) => `${de(x * 100, x * 100 === Math.round(x * 100) ? 0 : 1)}\u00a0%`;
const tagDe = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join(".") : iso);

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
}

/** „des Wirtschaftsplans 2027“ bzw. „laut …“, für den Satz auf dem Deckblatt. */
const wpGenitiv = (wp: string) => (/^Wirtschaftsplan \d{4}$/.test(wp) ? `des Wirtschaftsplans ${wp.slice(-4)}` : `laut ${wp}`);
/** Wirtschaftsplan beider Häuser, gleich oder verschieden. */
const wpBeide = (k: Kontext) => {
  const a = k.haus(k.A).wirtschaftsplan, b = k.B ? k.haus(k.B).wirtschaftsplan : a;
  return a === b ? a : `${a} bzw. ${b}`;
};

/** „pauschal 42 % wie im Exposé“ oder, aus dem Einkommen gerechnet, „von 38,2 % aus Ihrem Einkommen“. */
const steuerWie = (an: VergleichAnnahmen) =>
  an.steuerArt === "einkommen" ? `${pzGanz(an.steuer)}, gerechnet aus Ihrem Einkommen` : `pauschal ${pzGanz(an.steuer)} wie im Exposé`;

/** „Frau Muster“, ohne Anrede „Anna Muster“. */
function anredeName(v: KundenObjektvergleich): string {
  const k = v.kunde;
  if (/^(frau|herr)$/i.test(k.anrede) && k.nachname) return `${k.anrede[0].toUpperCase()}${k.anrede.slice(1).toLowerCase()} ${k.nachname}`;
  return [k.vorname, k.nachname].filter(Boolean).join(" ");
}

function garagenText(e: EinheitErgebnis, mit = true): string {
  const g = e.einheit.garagen;
  if (!g) return "";
  return mit ? (g === 1 ? "mit Garage" : `mit ${g} Garagen`) : (g === 1 ? "Garage" : `${g} Garagen`);
}

function Fuss({ text, nr, hell }: { text: string; nr: number; hell?: boolean }) {
  return (
    <div className="foot" style={hell ? { borderTopColor: "rgba(167,215,197,.25)", color: "#8FA39A" } : undefined}>
      <span>{text}</span>
      <span><b style={hell ? { color: "var(--champ)" } : undefined}>Vertraulich · {nr} / {useContext(SeitenKontext)}</b></span>
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
  const ku = v.kunde;
  const steuer = pzGanz(v.annahmen.steuer);
  const frei = ku.netto - ku.mieteWarm - ku.lebenshaltung - ku.kreditRaten;
  const ueber = L.map((e) => frei + e.monat.nach);
  const monate = L.map((e, i) => (ueber[i] > 0 ? Math.ceil(e.nk / ueber[i]) : 0));
  const nkMax = Math.max(...L.map((e) => e.nk));
  const nachW = L.map((e) => e.monat.nach);
  const unbefristet = /unbefristet/i.test(ku.beschaeftigung);
  const traegt = ku.kapital >= nkMax;
  const eck: Array<[ReactNode, ReactNode]> = [
    ["Beschäftigung", ku.beschaeftigung || "laut Selbstauskunft"],
    ["Familienstand · Kinder", `${ku.familienstand || "nicht angegeben"} · ${ku.kinder}`],
    ["Antrag", ku.antrag],
    ["Wohnsituation", ku.wohnsituation || "nicht angegeben"],
    ["Lebenshaltung", eur(ku.lebenshaltung, 0)],
    ["Laufende Kredite", ku.kredite],
    [<>Frei im Monat<span className="kl">Einkommen minus Miete{ku.kreditRaten ? ", Kredite" : ""} und Lebenshaltung</span></>, `rund ${eur(Math.round(frei / 10) * 10, 0)}`],
  ];
  const hundert = (x: number) => de(Math.round(x / 100) * 100, 0);
  const leit: Array<[string, string]> = [
    ["Nebenkosten aus Ihrem Ersparten.",
      (B ? `Beim Kauf zahlen Sie einmalig rund ${hundert(A.nk)}\u00a0€ (Wohnung ${A.einheit.nr}) bzw. ${hundert(B.nk)}\u00a0€ (Wohnung ${B.einheit.nr}) für Grunderwerbsteuer, Notar und Grundbuch. `
        : `Beim Kauf zahlen Sie einmalig rund ${hundert(A.nk)}\u00a0€ für Grunderwerbsteuer, Notar und Grundbuch. `)
      + (ku.kapital ? `Das bezahlen Sie aus Ihren ${eur(ku.kapital, 0)} Erspartem. ` : "")
      + (Math.min(...ueber) > 0
        ? `Danach legen Sie jeden Monat wieder etwas zurück: Von Ihrem Gehalt bleiben nach Miete, Lebenshaltung und Wohnung rund ${hundert(Math.min(...ueber))}\u00a0€ übrig. So ist Ihr Erspartes nach etwa ${Math.min(...monate) === Math.max(...monate) ? Math.min(...monate) : `${Math.min(...monate)} bis ${Math.max(...monate)}`} Monaten wieder aufgefüllt.`
        : "")],
    ["Monatlich spürbar, nicht belastend.",
      (B ? `Ihr Eigenanteil nach Steuer liegt je nach Wohnung bei rund ${de(-Math.max(...nachW), 0)}\u00a0€ bis ${de(-Math.min(...nachW), 0)}\u00a0€ im Monat.`
        : `Ihr Eigenanteil nach Steuer liegt bei rund ${de(-A.monat.nach, 0)}\u00a0€ im Monat.`)
      + (frei > 0 ? " Das ist ein kleiner Teil dessen, was Ihnen heute frei bleibt." : "")],
    ["Der Steuerhebel.", `Jeder Euro Verlust aus der Vermietung senkt die Steuer in dieser Rechnung um ${de(v.annahmen.steuer * 100, 0)} Cent. Mit einem Freibetrag beim Finanzamt kommt das jeden Monat mit dem Gehalt (wann genau: Seite ${k.seiteFreibetrag}).`],
    ...(ku.jahreBisRente ? [["Ihr langer Horizont.", `Bei rund ${ku.jahreBisRente} Jahren bis zur Rente zählt nicht nur der günstigste Start, sondern eine Belastung, die über die nächsten 30 Jahre gut passt.`] as [string, string]] : []),
  ];
  // „Sie sind unbefristet angestellt, haben keine Kredite und ein Guthaben, das die Kaufnebenkosten trägt.“
  const teile = [
    unbefristet ? "sind unbefristet angestellt" : "",
    ku.kreditRaten ? `zahlen ${eur(ku.kreditRaten, 0)} im Monat für laufende Kredite` : "haben keine Kredite",
  ].filter(Boolean);
  const lead = `Sie ${teile.join(", ")}${traegt ? `${ku.kreditRaten ? " und haben" : " und"} ein Guthaben, das die Kaufnebenkosten trägt` : ""}`;
  return (
    <Seite nr={nr} kick="Ihre Ausgangslage" fuss={k.fuss}>
      <h2>{unbefristet && !ku.kreditRaten && traegt ? <>Sicheres Einkommen, viel Zeit: <em>der ideale Startpunkt.</em></> : <>Ihre Zahlen: <em>die Grundlage dieser Rechnung.</em></>}</h2>
      <p className="lead">
        {lead ? `${lead}. ` : ""}Gerechnet wird mit einem Grenzsteuersatz von {steuer}.
        {ku.jahreBisRente ? ` Und Sie haben bis zur Rente rund ${ku.jahreBisRente} Jahre Zeit, in der eine Wohnung für Sie arbeiten kann.` : ""}
      </p>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: "6mm" }}>
        <div className="tile"><div className="label">Nettoeinkommen</div><div className="n">{eur(ku.netto, 0)}</div>
          <div className="s">im Monat.{ku.bruttoJahr ? ` Rund ${eur(Math.round(ku.bruttoJahr / 1000) * 1000, 0)} brutto im Jahr.` : ""}</div></div>
        <div className="tile"><div className="label">Gerechneter Grenzsteuersatz</div><div className="n">{steuer}</div>
          <div className="s">{[ku.steuerklasse ? `Steuerklasse ${ku.steuerklasse}` : "", ku.familienstand, ku.kinder === "keine" ? "keine Kinder" : `${ku.kinder} Kind${ku.kinder === "1" ? "" : "er"}`].filter(Boolean).join(", ")}. Die tatsächliche Ersparnis hängt vom persönlichen Steuersatz ab.</div></div>
        <div className="tile dk"><div className="label">Ihr Kapital</div><div className="n">{eur(ku.kapital, 0)}</div>
          <div className="s">Bank- und Sparguthaben laut Selbstauskunft.{ku.kreditRaten ? "" : " Keine Kredite, kein Leasing."}</div></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "9mm", marginTop: "8mm" }}>
        <div><div className="label" style={{ marginBottom: "1.5mm" }}>Ihre Eckdaten laut Selbstauskunft</div><Zeilen rows={eck} /></div>
        <div><div className="label" style={{ marginBottom: "2.5mm" }}>Daraus unsere Leitplanken</div>
          {leit.map(([a, b]) => (
            <p key={a} style={{ marginBottom: "3mm", fontSize: "7.6pt", color: "var(--muted)" }}><b style={{ color: "var(--navy)", fontWeight: 500 }}>{a}</b> {b}</p>
          ))}
        </div>
      </div>
      <div className="note" style={{ marginTop: "8mm" }}>
        Steuerersparnis gerechnet mit einem Grenzsteuersatz von {steuer}; die tatsächliche Ersparnis hängt vom persönlichen Steuersatz ab.
        Weitere Anlagen wie Depot oder Versicherungen sind nur eingerechnet, soweit sie in der Selbstauskunft stehen. Bitte den letzten
        Steuerbescheid oder eine Lohnsteuerbescheinigung sowie aktuelle Depot- und Versicherungsstände nachreichen, falls vorhanden; dann rechnen wir genau.
      </div>
    </Seite>
  );
}

// ---------------------------------------------------------------------------
// 3 Die beiden Wohnungen
// ---------------------------------------------------------------------------

function Wohnungen({ k, nr }: { k: Kontext; nr: number }) {
  const { A, B } = k;
  const karte = (e: EinheitErgebnis, b: boolean) => {
    const x = e.einheit;
    const rows: Array<[ReactNode, ReactNode]> = [
      ["Wohnung", [`${x.zimmer} Zimmer`, `${de(x.qm)} m²`, x.lage].filter(Boolean).join(" · ")],
      ["Kaufpreis Wohnung", eur(x.kpWohnung, 0) + (x.kpListe > x.kpWohnung ? ` statt ${eur(x.kpListe, 0)}` : "")],
      ...(x.garagen ? [[x.garagen > 1 ? "Garage 1 (im Kaufpreis)" : "Garage (im Kaufpreis)", eur(x.garageKp, 0)] as [string, string]] : []),
      ...(x.garagen > 1 ? [[`Garage 2${x.garagen > 2 ? ` bis ${x.garagen}` : ""} (ohne Aufpreis)`, "0\u00a0€"] as [string, string]] : []),
      ["Kaufpreis gesamt", eur(e.kp, 0)],
      ["Preis je m² Wohnung", eur(e.qmPreis)],
      ["Kaltmiete heute (Mieter)", `${eur(x.mieteIst)} · ${de(e.mieteIstQm)} €/m²`],
      [e.luecke > 0 ? "Kaltmiete subventioniert" : "Kaltmiete gerechnet", `${eur(e.mieteSub)} · ${de(x.mieteSubQm)} €/m²`],
    ];
    return (
      <div>
        {k.B && <span className={`badge${b ? " b" : ""}`}>Objekt {b ? "B" : "A"}</span>}
        <div style={{ fontFamily: "var(--serif)", fontSize: "14pt", color: "var(--navy)", marginTop: "2mm" }}>Wohnung {x.nr}</div>
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
      ...o.hausPunkte,
      g ? (jeWohnung
        ? (g > 1 ? `Je Wohnung ${g} Garagen: eine im Kaufpreis, weitere ohne Aufpreis` : "Je Wohnung eine eigene Garage im Kaufpreis")
        : (g > 1 ? `${g} Garagen: eine im Kaufpreis, weitere ohne Aufpreis` : "Eigene Garage im Kaufpreis")) : "",
      vm ? `Vergleichsmiete am Ort${o.vergleichsmieteQuelle ? ` laut ${o.vergleichsmieteQuelle}` : ""} ${de(vm)} €/m²${vm > mieteQm ? `, über den gerechneten ${de(mieteQm)} €/m²` : ""}` : "",
      o.verwaltung && !o.hausPunkte.some((p) => p.includes(o.verwaltung)) ? `Verwaltung ${o.verwaltung}` : "",
    ].filter(Boolean);
  };
  const luecke = k.liste.some((e) => e.luecke > 0) ? " und damit die Lücke, die der Bauträger ausgleicht" : "";

  if (!B) {
    const o = k.haus(A);
    return (
      <Seite nr={nr} kick="Haus und Wohnung" fuss={k.fuss}>
        <h2>{o.strasse}, Wohnung {A.einheit.nr}: <em>Lage, Haus und Wohnung.</em></h2>
        <p className="lead">
          Wohnung {A.einheit.nr} liegt in {o.strasse}{o.ortZeile ? `, ${o.ortZeile}` : ""}: {A.einheit.zimmer} Zimmer, {de(A.einheit.qm)} m²{A.einheit.lage ? `, ${A.einheit.lage}` : ""}.
          {A.luecke > 0 ? " Gerechnet ist mit der subventionierten Miete; die Lücke zur heutigen Miete gleicht der Bauträger aus." : ""}
        </p>
        <div className="grid" style={{ gridTemplateColumns: "1.05fr 1fr", gap: "6mm", marginTop: "5mm" }}>
          <div style={{ height: "78mm", borderRadius: "2.5mm", background: o.fotoHaus ? `url("${o.fotoHaus}") center/cover` : "var(--paper)" }} />
          <div>
            <div className="label" style={{ marginBottom: "2mm" }}>Das Haus</div>
            <div style={{ fontFamily: "var(--serif)", fontSize: "12pt", color: "var(--navy)", marginBottom: "2.5mm" }}>{o.strasse}{o.ortZeile ? `, ${o.ortZeile}` : ""}</div>
            <ul className="li">{hausListe(A, false).map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        </div>
        <div style={{ marginTop: "7mm" }}>{karte(A, false)}</div>
      </Seite>
    );
  }

  if (k.haeuser) {
    const spalte = (e: EinheitErgebnis, b: boolean) => {
      const o = k.haus(e);
      return (
        <div>
          <div style={{ height: "64mm", borderRadius: "2.5mm", background: o.fotoHaus ? `url("${o.fotoHaus}") center/cover` : "var(--paper)" }} />
          <div className="label" style={{ margin: "3mm 0 1mm" }}>Haus {b ? "B" : "A"}</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: "11pt", color: "var(--navy)", marginBottom: "2mm" }}>{o.strasse}{o.ortZeile ? `, ${o.ortZeile}` : ""}</div>
          <ul className="li" style={{ marginBottom: "4mm", minHeight: "30mm" }}>{hausListe(e, false).map((x) => <li key={x}>{x}</li>)}</ul>
          {karte(e, b)}
        </div>
      );
    };
    return (
      <Seite nr={nr} kick="Die beiden Wohnungen" fuss={k.fuss}>
        <h2>Zwei Häuser, zwei Wohnungen: <em>Lage, Haus und Wohnung im Vergleich.</em></h2>
        <p className="lead">
          Wohnung {A.einheit.nr} liegt in {k.haus(A).strasse}, Wohnung {B.einheit.nr} in {k.haus(B).strasse}. Unterschiedlich sind Haus und Lage,
          Größe, Preis, die heutige Miete{luecke}.
        </p>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "9mm", marginTop: "5mm" }}>{spalte(A, false)}{spalte(B, true)}</div>
      </Seite>
    );
  }

  const o = k.haus(A);
  return (
    <Seite nr={nr} kick="Die beiden Wohnungen" fuss={k.fuss}>
      <h2>Ein Haus, zwei Wohnungen: <em>gleiche Lage, verschiedene Größe.</em></h2>
      <p className="lead">
        Beide Wohnungen liegen in {o.strasse}. Lage, Haus und Hausverwaltung sind gleich. Unterschiedlich sind Größe, Preis, die heutige Miete{luecke}.
      </p>
      <div className="grid" style={{ gridTemplateColumns: "1.05fr 1fr", gap: "6mm", marginTop: "5mm" }}>
        <div style={{ height: "78mm", borderRadius: "2.5mm", background: o.fotoHaus ? `url("${o.fotoHaus}") center/cover` : "var(--paper)" }} />
        <div>
          <div className="label" style={{ marginBottom: "2mm" }}>Das Haus: für beide Wohnungen gleich</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: "12pt", color: "var(--navy)", marginBottom: "2.5mm" }}>{o.strasse}{o.ortZeile ? `, ${o.ortZeile}` : ""}</div>
          <ul className="li">{hausListe(A, true).map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "9mm", marginTop: "7mm" }}>{karte(A, false)}{karte(B, true)}</div>
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
  const an = v.annahmen;
  const am = A.monat, bm = B.monat, ah = A.hausgeld, bh = B.hausgeld;
  const g = A.einheit.garagen;
  const z = (lbl: ReactNode, va: ReactNode, vb: ReactNode, win: Sieger = null, cls = "", key?: string) => (
    <tr className={cls} key={key ?? String(lbl)}>
      <td>{lbl}</td><td className={`c${win === "A" ? " win" : ""}`}>{va}</td><td className={`c${win === "B" ? " win" : ""}`}>{vb}</td>
    </tr>
  );
  const kg = (e: EinheitErgebnis) => (e.einheit.garagen ? ` + ${garagenText(e, false)}` : "");
  const mietLabel = k.haeuser && (A.einheit.mieteSubQm !== B.einheit.mieteSubQm || A.einheit.garageMiete1 !== B.einheit.garageMiete1)
    ? "Miete im Monat, 1. Jahr (gerechnet, inkl. Garage)"
    : `Miete im Monat, 1. Jahr (${de(A.einheit.mieteSubQm)} €/m²${g ? ` + ${g > 1 ? `${g} × ${de(A.einheit.garageMiete1, 0)}\u00a0€ Garage` : `Garage ${de(A.einheit.garageMiete1, 0)}\u00a0€`}` : ""})`;
  const afaPz = de(100 / A.einheit.afaJahre, 1);
  const guenstiger = A.monat.nach >= B.monat.nach ? A : B;
  const staerke = (e: EinheitErgebnis, o: EinheitErgebnis): [string, string] => {
    const teile: string[] = [];
    if (e.nk < o.nk) teile.push(`rund ${eur(o.nk - e.nk, 0)} weniger Nebenkosten`);
    if (e.monat.nach > o.monat.nach) teile.push(`rund ${de(Math.abs(e.monat.nach - o.monat.nach), 0)}\u00a0€ weniger Eigenanteil im Monat`);
    if (e.einheit.zimmer > o.einheit.zimmer) teile.push(`${e.einheit.zimmer} Zimmer`);
    if (e.qmPreis < o.qmPreis) teile.push("günstiger je m²");
    if (e.lueckeQuote < o.lueckeQuote) teile.push(e.luecke > 0 ? `eine Mietlücke von nur ${eur(e.luecke)}` : "keine Mietlücke");
    if (e.entw[30].erloes > o.entw[30].erloes) teile.push(`nach 30 Jahren rund ${tsd(e.entw[30].erloes - o.entw[30].erloes)} mehr Erlös nach Kreditablösung`);
    const titel = e === guenstiger ? "Der kleinere Einstieg" : "Mehr Wohnung, mehr Vermögen";
    if (k.haeuser && e.einheit.afaJahre < o.einheit.afaJahre) teile.push(`die schnellere Abschreibung (${e.einheit.afaJahre} statt ${o.einheit.afaJahre} Jahre)`);
    const satz = teile.length ? `${teile.join(", ").replace(/^./, (c) => c.toUpperCase())}.` : "Gleichwertig in den gerechneten Kriterien.";
    return [titel, satz];
  };
  return (
    <Seite nr={nr} kick="Vergleich nebeneinander" fuss={k.fuss}>
      <h2>{k.haeuser ? <>Zwei Häuser im direkten Vergleich. <em>Der Unterschied liegt im Detail.</em></> : <>Gleiches Haus, gleiche Lage. <em>Der Unterschied liegt im Detail.</em></>}</h2>
      <p className="lead" style={{ fontSize: "8pt" }}>Grün markiert, wo eine Wohnung vorne liegt. Alle Zahlen gelten für Sie persönlich im 1. Jahr, wenn nicht anders angegeben. Hausgeld laut {wpBeide(k)}.</p>
      <table className="t v" style={{ marginTop: "3mm" }}>
        <tbody>
          <tr><th /><th><span className="badge">A</span> {k.haus(A).strasse}, WE {A.einheit.nr}</th><th><span className="badge b">B</span> {k.haus(B).strasse}, WE {B.einheit.nr}</th></tr>
          {z(k.haeuser ? "Haus und Lage" : "Lage im Haus", k.haeuser ? `${k.haus(A).strasse}, ${A.einheit.lage}` : A.einheit.lage, k.haeuser ? `${k.haus(B).strasse}, ${B.einheit.lage}` : B.einheit.lage)}
          {z("Wohnung", `${A.einheit.zimmer} Zimmer, ${de(A.einheit.qm)} m²${kg(A)}`, `${B.einheit.zimmer} Zimmer, ${de(B.einheit.qm)} m²${kg(B)}`, sieger(A.einheit.qm, B.einheit.qm, false))}
          {z(g > 1 ? "Kaufpreis (weitere Garagen ohne Aufpreis)" : "Kaufpreis", `${eur(A.kp, 0)}${A.einheit.garagen ? " inkl. Garage" : ""}`, `${eur(B.kp, 0)}${B.einheit.garagen ? " inkl. Garage" : ""}`)}
          {z("Preis je m² Wohnung", eur(A.qmPreis), eur(B.qmPreis), sieger(A.qmPreis, B.qmPreis, true))}
          {z(`Kaufnebenkosten (aus Eigenkapital, ${pz(an.knk)})`, eur(A.nk, 0), eur(B.nk, 0), sieger(A.nk, B.nk, true))}
          {z("Kaltmiete heute (zahlt der Mieter)", `${eur(A.einheit.mieteIst)} (${de(A.mieteIstQm)} €/m²)`, `${eur(B.einheit.mieteIst)} (${de(B.mieteIstQm)} €/m²)`)}
          {z(mietLabel, eur(am.einnahmen), eur(bm.einnahmen))}
          {(A.luecke > 0 || B.luecke > 0) && z("davon Mietlücke, die der Bauträger zahlt", `${eur(Math.max(0, A.luecke))} (${pz(Math.max(0, A.lueckeQuote))})`, `${eur(Math.max(0, B.luecke))} (${pz(Math.max(0, B.lueckeQuote))})`, sieger(A.lueckeQuote, B.lueckeQuote, true), "sub")}
          {z("Hausgeld umlagefähig (zahlt der Mieter)", eur(ah.u), eur(bh.u), null, "sub")}
          {z("Hausgeld nicht umlagefähig (Verwaltung u. a.)", eur(ah.n), eur(bh.n), null, "sub")}
          {z(`= Hausgeld (${wpBeide(k)})`, eur(ah.summe), eur(bh.summe))}
          {z("Erhaltungsrücklage (separat)", eur(ah.r), eur(bh.r), null, "sub")}
          {z("= Vorauszahlung gesamt an die Verwaltung", eur(ah.voraus), eur(bh.voraus))}
          {z("Ihr Anteil: nicht umlagefähig + Rücklage", eur(ah.eigentuemer), eur(bh.eigentuemer), sieger(ah.eigentuemer, bh.eigentuemer, true))}
          {z(`Kreditrate (Zins ${pz(an.zins)} + Tilgung ${pz(an.tilgung)})`, eur(am.zins + am.tilgung), eur(bm.zins + bm.tilgung))}
          {z("Abschreibung" + (A.einheit.afaJahre < 50 ? " (mit Gutachten)" : ""), `≈ ${afaPz} % über ${A.einheit.afaJahre} Jahre: ${eur(A.jahr.afa, 0)}/J.`, `≈ ${afaPz} % über ${B.einheit.afaJahre} Jahre: ${eur(B.jahr.afa, 0)}/J.`)}
          {z("1 · Zuzahlung vor Steuer", eur(-am.vor), eur(-bm.vor), null, "e1")}
          {z(`2 · Das spart Ihnen das Finanzamt (${pzGanz(an.steuer)})`, eur(am.ersparnis), eur(bm.ersparnis), null, "hi")}
          {z(<>3 · Zuzahlung nach Steuererstattung<span style={{ display: "block", fontSize: "7.4pt", fontWeight: 300, color: "#B8C2BC", marginTop: ".4mm" }}>Ihr Eigenanteil im Monat</span></>, eur(-am.nach), eur(-bm.nach), null, "e3", "e3")}
          {z("Tilgung im Monat (senkt Ihre Restschuld)", eur(am.tilgung), eur(bm.tilgung), sieger(am.tilgung, bm.tilgung, false))}
          {z("Verkaufssumme nach 30 Jahren (einmalig)", tsd(A.entw[30].wert), tsd(B.entw[30].wert), sieger(A.entw[30].wert, B.entw[30].wert, false))}
          {z("abzüglich Restschuld des Kredits", `− ${tsd(A.entw[30].rest)}`, `− ${tsd(B.entw[30].rest)}`, null, "sub")}
          {z("= Ihr Erlös nach Kreditablösung", tsd(A.entw[30].erloes), tsd(B.entw[30].erloes), sieger(A.entw[30].erloes, B.entw[30].erloes, false), "sum")}
        </tbody>
      </table>
      <p className="small" style={{ marginTop: "1.5mm" }}>
        {g > 1 && <b style={{ fontWeight: 500, color: "var(--navy)" }}>Weitere Garage ohne Aufpreis; Miete {eur(A.einheit.garageMiete1, 0)} im 1. Jahr vom Bauträger getragen, danach Vermietung. </b>}
        Verkaufssumme: angenommener Verkaufspreis bei {pzGanz(an.wertPa)} Wertentwicklung im Jahr, vor Verkaufskosten. Nach mehr als zehn Jahren Haltedauer ist der Gewinn aus
        dem Verkauf einer privat vermieteten Wohnung nach § 23 EStG in der Regel steuerfrei (Hinweis, keine Steuerberatung).
        {Math.min(A.einheit.afaJahre, B.einheit.afaJahre) >= 30
          ? ` Die Abschreibung läuft bei beiden Wohnungen ${A.einheit.afaJahre === B.einheit.afaJahre ? `${A.einheit.afaJahre} Jahre` : `${A.einheit.afaJahre} bzw. ${B.einheit.afaJahre} Jahre`}, also länger als die Betrachtung; ein früher Verkauf ist deshalb nicht nötig.` : ""}
      </p>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: "3.5mm" }}>
        {[A, B].map((e, i) => {
          const [titel, satz] = staerke(e, e === A ? B : A);
          return (
            <div className="tile" key={i}>
              <div className="label" style={i ? { color: "var(--orange-d)" } : undefined}>Stärken von {i ? "B" : "A"} · Wohnung {e.einheit.nr}</div>
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
  return (
    <>
      <b>Diesen Betrag zahlen Sie, sobald Ihr Freibetrag wirkt.</b> Nach dem Kauf beantragen Sie beim Finanzamt einen Freibetrag für die Lohnsteuer
      (§ 39a EStG); er kommt nicht automatisch. Der Antrag ist ab 1. November für das Folgejahr möglich; im Januar gestellt, wirkt er ab 1. Januar,
      später gestellt verteilt das Finanzamt ihn auf die restlichen Monate. Die Steuerersparnis kommt dann mit dem Gehalt. Verluste aus einer neu
      gekauften Wohnung berücksichtigt es dafür ab dem 1. Januar nach dem Übergang von Nutzen und Lasten (Lastenwechsel, § 37 Abs. 3 Satz 8 EStG);
      der Lastenwechsel liegt in der Regel rund {n} Monate nach dem Kauf. Bis dahin zahlen Sie den Betrag aus Schritt 1; die Differenz erhalten
      Sie über die Steuererklärung zurück (Höhe nach den tatsächlichen Werten des Kaufjahres). Mehr auf Seite {k.seiteFreibetrag}.
    </>
  );
}

function garageZeile(k: Kontext, e: EinheitErgebnis): [string, string, string] | null {
  const x = e.einheit;
  if (!x.garagen) return null;
  const ist = x.garageIstVon ? `Heute ${de(x.garageIstVon, 0)}${x.garageIstBis && x.garageIstBis !== x.garageIstVon ? ` bis ${de(x.garageIstBis, 0)}` : ""}\u00a0€; ` : "";
  if (x.garagen > 1) return [`Garagenmiete, ${x.garagen} Garagen, 1. Jahr`, `${x.garagen} × ${de(x.garageMiete1, 0)}\u00a0€; im 1. Jahr vom Bauträger aufgestockt bzw. getragen, danach Vermietung.`, `Zusätzliche Einnahme aus ${x.garagen} Garagen.`];
  return ["Garagenmiete, 1. Jahr", `${ist}${x.garageIstVon ? `der Bauträger stockt 12 Monate auf ${de(x.garageMiete1, 0)}\u00a0€ auf.` : `${de(x.garageMiete1, 0)}\u00a0€ im Monat.`}`, "Zusätzliche Einnahme aus der eigenen Garage."];
}

function Einnahmen({ k, e }: { k: Kontext; e: EinheitErgebnis }) {
  const m = e.monat;
  const g = garageZeile(k, e);
  const zeilen: Array<[string, string, number]> = [
    [e.luecke > 0 ? "Kaltmiete Wohnung (subventioniert)" : "Kaltmiete Wohnung",
      `${de(e.einheit.mieteSubQm)} €/m² × ${de(e.einheit.qm)} m².${e.luecke > 0 ? ` Der Mieter zahlt heute ${eur(e.einheit.mieteIst)}; die Differenz von ${eur(e.luecke)} zahlt der Bauträger.` : ""}`, m.miete],
    ...(g ? [[g[0], g[1], m.garage] as [string, string, number]] : []),
  ];
  return (
    <div className="blk"><div className="label">Einnahmen je Monat</div>
      {zeilen.map(([a, i, w]) => <div className="z" key={a}><span>{a}<i>{i}</i></span><span>{eur(w)}</span></div>)}
      <div className="bar ein"><span>Einnahmen</span><b>{eur(m.einnahmen)}</b></div>
    </div>
  );
}

function Ausgaben({ k, e }: { k: Kontext; e: EinheitErgebnis }) {
  const m = e.monat;
  const an = k.v.annahmen;
  const wp = k.haus(e).wirtschaftsplan;
  const zeilen: Array<[string, string, number]> = [
    ["Zins Bankdarlehen", `${pz(an.zins)} auf ${eur(e.darlehen, 0)}`, m.zins],
    ["Tilgung Bankdarlehen", `${pz(an.tilgung)} anfänglich`, m.tilgung],
    ["Hausgeld, nicht umlagefähig", wp, m.n],
    ["Erhaltungsrücklage", wp, m.r],
  ];
  return (
    <div className="blk"><div className="label">Ausgaben je Monat</div>
      {zeilen.map(([a, i, w]) => <div className="z" key={a}><span>{a}<i>{i}</i></span><span>{eur(w)}</span></div>)}
      <div className="bar aus"><span>Ausgaben</span><b>{eur(m.ausgaben)}</b></div>
    </div>
  );
}

function Treppe({ k, e }: { k: Kontext; e: EinheitErgebnis }) {
  const m = e.monat;
  return (
    <>
      <div className="tr"><div className="nr">1</div><div className="tx"><b>Das zahlen Sie im Monat, bevor das Finanzamt etwas erstattet</b>
        <i>Ausgaben {eur(m.ausgaben)} minus Einnahmen {eur(m.einnahmen)}. Darin stecken {eur(m.tilgung)} Tilgung, die Ihr Vermögen aufbauen.</i></div><div className="be">{eur(-m.vor)}</div></div>
      <div className="tr s2"><div className="nr">2</div><div className="tx"><b>Das spart Ihnen das Finanzamt im Monat</b>
        <i>Zinsen, Abschreibung und Kosten sind höher als die Miete. Dieses Minus senkt Ihr zu versteuerndes Einkommen; {pzGanz(k.v.annahmen.steuer)} davon bekommen Sie zurück.</i></div><div className="be">{"−"} {eur(m.ersparnis)}</div></div>
      <div className="tr s3"><div className="nr">3</div><div className="tx"><b>Das zahlen Sie tatsächlich im Monat (mit Steuervorteil)</b>
        <i>Schritt 1 minus Schritt 2: Ihr echter Beitrag für die Wohnung, inklusive Tilgung.</i></div><div className="be">{eur(-m.nach)}</div></div>
      <div className="frei">{freibetragText(k)}</div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 5/6 Ihre persönliche Rechnung
// ---------------------------------------------------------------------------

function subventionText(k: Kontext, e: EinheitErgebnis): ReactNode {
  const x = e.einheit;
  const an = k.v.annahmen;
  const vm = k.haus(e).vergleichsmieteQm;
  if (e.luecke <= 0) {
    return <>Gerechnet ist mit der heutigen Miete von {de(e.mieteIstQm)} €/m²; eine Subvention ist nicht eingerechnet. In 36 Monatsraten tilgen Sie rund {tsd(e.tilgung36)}.</>;
  }
  const gLuecke = x.garagen && x.garageIstVon ? [x.garageMiete1 - (x.garageIstBis || x.garageIstVon), x.garageMiete1 - x.garageIstVon] : [0, 0];
  const lg = [e.luecke + gLuecke[0], e.luecke + gLuecke[1]];
  const netto = lg.map((l) => l * (1 - an.steuer));
  const spanne = (a: number, b: number) => (Math.abs(a - b) < 0.005 ? eur(a) : `${eur(a)} bis ${eur(b)}`);
  const garageWort = x.garagen > 1 ? "Garage 1" : "Garage";
  const kopf = <>Gerechnet ist mit {de(x.mieteSubQm)} €/m², heute zahlt der Mieter {de(e.mieteIstQm)} €/m² ({eur(x.mieteIst)}). </>;
  const dauer = `trägt der Bauträger bis zur nächsten Mieterhöhung, längstens ${an.subventionMonate} Monate.`;
  const kappungHoch = x.mieteIst * (1 + an.kappung);
  if (kappungHoch < e.mieteSub) {
    const k15 = x.mieteIst * 1.15, k20 = x.mieteIst * 1.2;
    const kappungText = an.kappung >= 0.2
      ? <>höchstens um 20 % in drei Jahren möglich (in Gemeinden mit Kappungsgrenzenverordnung 15 %, § 558 BGB): rund {eur(k15, 0)} bis {eur(k20, 0)}. Ein Rest von rund {eur(e.mieteSub - k20, 0)} bis {eur(e.mieteSub - k15, 0)}</>
      : <>höchstens um {pzGanz(an.kappung)} in drei Jahren möglich (Kappungsgrenzenverordnung, § 558 BGB): rund {eur(kappungHoch, 0)}. Ein Rest von rund {eur(e.mieteSub - kappungHoch, 0)}</>;
    return (
      <>{kopf}Die Lücke von {eur(e.luecke)} ({pz(e.lueckeQuote)}) {dauer} Eine Erhöhung ist {kappungText} kann also bleiben, bis eine weitere
        Erhöhung möglich ist. In 36 Monatsraten tilgen Sie rund {tsd(e.tilgung36)}. Steigen Miete{x.garagen ? ` und ${garageWort}` : ""} gar nicht, fehlen {spanne(lg[0], lg[1])} im
        Monat; netto nach Steuer rund {spanne(netto[0], netto[1])}.</>
    );
  }
  return (
    <>{kopf}Die Lücke von nur {eur(e.luecke)} ({pz(e.lueckeQuote)}) {dauer}
      {vm ? ` Die Vergleichsmiete am Ort liegt bei ${de(vm)} €/m²${vm > x.mieteSubQm ? ", also deutlich darüber: Spielraum für eine Anpassung im gesetzlichen Rahmen ist vorhanden." : "."}` : ""}
      {" "}In 36 Monatsraten tilgen Sie rund {tsd(e.tilgung36)}. Steigen Miete{x.garagen ? ` und ${garageWort}` : ""} erst später, fehlen {spanne(lg[0], lg[1])} im Monat; netto nach Steuer rund {spanne(netto[0], netto[1])}.</>
  );
}

function Rechnung({ k, e, nr, b }: { k: Kontext; e: EinheitErgebnis; nr: number; b: boolean }) {
  const { v } = k;
  const an = v.annahmen;
  const m = e.monat, j = e.jahr, x = e.einheit;
  const afaPz = de(100 / x.afaJahre, 1);
  const an_: Array<[ReactNode, ReactNode]> = [
    [x.garagen > 1 ? "Kaufpreis inkl. Garage 1, voll finanziert (weitere ohne Aufpreis)" : x.garagen ? "Kaufpreis inkl. Garage, voll finanziert" : "Kaufpreis, voll finanziert", eur(e.kp, 0)],
    [`Kaufnebenkosten aus Eigenkapital (${pz(an.knk)})`, eur(e.nk, 0)],
    [`AfA: ≈ ${afaPz} % (1/${x.afaJahre})${x.afaJahre < 50 ? `, kürzere tatsächliche Nutzungsdauer ${x.afaJahre} J., Gutachten nötig` : ""}`, `${eur(j.afa, 0)} / Jahr`],
    [`Bemessungsgrundlage (Gebäudeanteil ${pzGanz(an.gebaeudeanteil)} inkl. Nebenkosten)`, eur(e.afaBasis, 0)],
    [`Miete im Szenario (Jahr 1 = ${an.startJahr})`, `${de(x.mieteSubQm)} €/m² auf ${de(x.mieteZielQm || an.mieteZielQm, (x.mieteZielQm || an.mieteZielQm) % 1 ? 2 : 0)} €/m² im Jahr ${an.mieteZielJahr}`],
    ...(x.garagen ? [[x.garagen > 1 ? "Garagen im Szenario" : "Garage im Szenario", `${x.garagen > 1 ? "je " : ""}${de(x.garageMiete1, 0)}\u00a0€ auf ${de(x.garageMieteZiel, 0)}\u00a0€ im Jahr ${an.mieteZielJahr}`] as [string, string]] : []),
  ];
  const e30 = e.entw[30];
  const h = e.hausgeld;
  return (
    <Seite nr={nr} kick={k.B ? `Ihre persönliche Rechnung · Objekt ${b ? "B" : "A"}` : "Ihre persönliche Rechnung"} fuss={k.fuss} klasse="sh">
      <h2>{k.haus(e).strasse}, Wohnung {x.nr}: <em>{eur(-m.nach)} im Monat für Ihre Kapitalanlage.</em></h2>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "4mm", marginTop: "4mm" }}>
        <div className="tile or"><div className="label">Ihre Steuerersparnis im 1. Jahr</div><div className="n">{eur(j.ersparnis, 0)}</div><div className="s">{eur(m.ersparnis)} im Monat; in 30 Jahren zusammen rund {tsd(e.steuer30)}</div></div>
        <div className="tile"><div className="label">Tilgung im Monat</div><div className="n">{eur(m.tilgung)}</div><div className="s">im 1. Jahr, steigt jedes Jahr. Senkt die Restschuld, das Geld bleibt Ihr Vermögen.</div></div>
        <div className="tile dk"><div className="label">Ihr Eigenanteil nach Steuer</div><div className="n">{eur(-m.nach)}</div><div className="s">im Monat im 1. Jahr, inklusive Tilgung. Vor Steuer {eur(-m.vor)}.</div></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1.12fr 1fr", gap: "6mm", marginTop: "4.5mm" }}>
        <div>
          <div className="label" style={{ marginBottom: "1mm" }}>Ihr Monat im 1. Jahr</div>
          <div className="grid eng" style={{ gridTemplateColumns: "1fr 1fr", gap: "3.5mm" }}><Einnahmen k={k} e={e} /><Ausgaben k={k} e={e} /></div>
          <Treppe k={k} e={e} />
        </div>
        <div>
          <div className="label" style={{ marginBottom: "1mm" }}>Einmalig und Annahmen</div>
          <Zeilen rows={an_} />
          <div className="label" style={{ marginTop: "3mm" }}>Hausgeld laut {k.haus(e).wirtschaftsplan}</div>
          <table className="t" style={{ marginTop: ".5mm" }}><tbody>
            <tr><td>umlagefähig (zahlt der Mieter)</td><td className="r">{eur(h.u)}</td></tr>
            <tr><td>nicht umlagefähig (tragen Sie)</td><td className="r">{eur(h.n)}</td></tr>
            <tr className="sum"><td>= Hausgeld</td><td className="r">{eur(h.summe)}</td></tr>
            <tr><td>Erhaltungsrücklage, separat (tragen Sie)</td><td className="r">{eur(h.r)}</td></tr>
            <tr className="sum"><td>= Vorauszahlung gesamt</td><td className="r">{eur(h.voraus)}</td></tr>
          </tbody></table>
          <div className="note or" style={{ marginTop: "3mm" }}><b>{e.luecke > 0 ? "Wenn die Subvention endet." : "Zur Miete."}</b> {subventionText(k, e)}</div>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "4mm", marginTop: "4mm" }}>
        <div className="tile"><div className="label">Miete im Jahr 30 · monatlich</div><div className="n">{eur(e.miete30, 0)}</div><div className="s">Kaltmiete{x.garagen ? ` inkl. ${garagenText(e, false)}` : ""} im Szenario, im 1. Jahr {eur(m.einnahmen)}</div></div>
        <div className="tile"><div className="label">Verkaufssumme nach 30 Jahren · einmalig</div><div className="n">{tsd(e30.wert)}</div>
          <div className="s">abzüglich Restschuld {tsd(e30.rest)} = <b>Ihr Erlös nach Kreditablösung {tsd(e30.erloes)}</b>. Nach mehr als zehn Jahren in der Regel steuerfrei (§ 23 EStG).</div></div>
      </div>
    </Seite>
  );
}

// ---------------------------------------------------------------------------
// 7 Vermögensentwicklung
// ---------------------------------------------------------------------------

const FARBE_A = "#198A5F", FARBE_B = "#D9731A";

function ChartErloes({ A, B }: { A: EinheitErgebnis; B: EinheitErgebnis | null }) {
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
          <text x={l - 4} y={Y(v) + 2.5} textAnchor="end" fontSize={7} fill="#56635D">{de(v / 1000, 0)} T€</text>
        </g>
      ))}
      {[0, 5, 10, 15, 20, 25, 30, 35].map((j) => <text key={j} x={X(j)} y={H - 8} textAnchor="middle" fontSize={7} fill="#56635D">{j === 0 ? "heute" : j}</text>)}
      {linie(A, "erl", FARBE_A)}{B && linie(B, "erl", FARBE_B)}
      {linie(A, "zuz", "#12362A", "4 3")}{B && linie(B, "zuz", FARBE_B, "1.5 2.5")}
    </svg>
  );
}

function ChartNach({ A, B }: { A: EinheitErgebnis; B: EinheitErgebnis | null }) {
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
          <text x={l - 4} y={Y(v) + 2.5} textAnchor="end" fontSize={7} fill="#56635D">{de(v, 0)} €</text>
        </g>
      ))}
      {[1, 5, 10, 15, 20, 25, 30].map((j) => <text key={j} x={X(j)} y={H - 6} textAnchor="middle" fontSize={7} fill="#56635D">{j === 1 ? "Jahr 1" : j}</text>)}
      {([[A, FARBE_A, undefined], ...(B ? [[B, FARBE_B, "4 3"]] : [])] as Array<[EinheitErgebnis, string, string | undefined]>).map(([e, f, d], i) => (
        <polyline key={i} points={e.reihe.slice(0, 30).map((p) => `${X(p.jahr).toFixed(1)},${Y(p.nach).toFixed(1)}`).join(" ")} fill="none" stroke={f} strokeWidth={1.8} strokeDasharray={d} />
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
  const an = v.annahmen;
  const afa = A.einheit.afaJahre;
  const afaEnde = Math.ceil(afa);
  return (
    <Seite nr={nr} kick={B ? "Vermögensentwicklung im Vergleich" : "Vermögensentwicklung"} fuss={k.fuss}>
      <h2>Aus kleinen Monatsbeträgen <em>wird echtes Vermögen.</em></h2>
      <p className="lead" style={{ fontSize: "8pt" }}>Verkaufssumme ist der angenommene Verkaufspreis bei {pzGanz(an.wertPa)} Wertentwicklung im Jahr. Davon wird die Restschuld abgelöst; was übrig bleibt, ist Ihr Erlös (durchgezogene Linien). Gestrichelt und gepunktet: was Sie selbst insgesamt zugezahlt haben, inklusive Kaufnebenkosten. Erlös minus Zuzahlung ist Ihr Plus.</p>
      <div style={{ marginTop: "3mm" }}><ChartErloes A={A} B={B} /></div>
      <Legende items={B
        ? [["A Erlös nach Kreditablösung", FARBE_A], ["B Erlös nach Kreditablösung", FARBE_B], ["A Ihre Zuzahlung gesamt", "#12362A", "4 3"], ["B Ihre Zuzahlung gesamt", FARBE_B, "1.5 2.5"]]
        : [["Erlös nach Kreditablösung", FARBE_A], ["Ihre Zuzahlung gesamt", "#12362A", "4 3"]]} />
      <table className="t" style={{ marginTop: "3mm" }}><tbody>
        <tr><th /><th className="r">Verkaufssumme</th><th className="r">Restschuld</th><th className="r">Ihr Erlös</th><th className="r">Ihre Zuzahlung</th><th className="r">Ihr Plus</th></tr>
        {k.liste.map((e, i) => [
          <tr key={`k${i}`}><td colSpan={6} style={{ fontWeight: 500, paddingTop: "2mm" }}>{B && <span className={`badge${i ? " b" : ""}`}>{i ? "B" : "A"}</span>} {k.haus(e).strasse}, WE {e.einheit.nr}</td></tr>,
          ...([25, 30, 35] as const).map((y) => {
            const x = e.entw[y];
            return (
              <tr key={`${i}-${y}`}><td>nach {y} Jahren</td><td className="r">{tsd(x.wert)}</td><td className="r">{Math.round(x.rest) ? `− ${tsd(x.rest)}` : "0\u00a0€"}</td>
                <td className="r">{tsd(x.erloes)}</td><td className="r">{tsd(x.zuzahlung)}</td><td className="r" style={{ fontWeight: 500 }}>{tsd(x.plus)}</td></tr>
            );
          }),
        ])}
      </tbody></table>
      <p className="small" style={{ marginTop: "1.5mm" }}>
        Jahr 1 = {an.startJahr}.{k.liste.every((e) => e.entw[35].rest < 1) ? ` Nach 35 Jahren ist der Kredit${B ? " in beiden Fällen" : ""} getilgt.` : ""}
        {afa < 35 ? ` Die Abschreibung endet nach Jahr ${afaEnde}; ab Jahr ${afaEnde + 1} entfällt ihre Steuerersparnis, das ist in den Werten berücksichtigt.` : ""}
        {" "}Alle Werte ungerundet gerechnet und auf 1.000 € gerundet, Rundungsdifferenzen möglich. Die Zuzahlungen gelten nur, wenn die angesetzten Mieten tatsächlich erzielt werden{A.einheit.garagen ? " (auch die Garage nach Ende der Aufstockung)" : ""}. Werte vor Verkaufskosten; Restschuld vereinfacht mit jährlicher Verrechnung (bei monatlicher Zahlung etwas niedriger).
      </p>
      <div className="label" style={{ marginTop: "4mm" }}>Ihr Eigenanteil nach Steuer je Monat, Jahr 1 bis 30</div>
      <div style={{ marginTop: "1.5mm" }}><ChartNach A={A} B={B} /></div>
      <Legende items={B ? [[`A Wohnung ${A.einheit.nr}`, FARBE_A], [`B Wohnung ${B.einheit.nr}`, FARBE_B, "4 3"]] : [[`Wohnung ${A.einheit.nr}`, FARBE_A]]} />
      <p className="small" style={{ marginTop: "1.5mm" }}>
        Wohnung {A.einheit.nr} liegt zwischen rund {de(-A.nachMax, 0)}&nbsp;€ und {de(-A.nachMin, 0)}&nbsp;€{B ? <>, Wohnung {B.einheit.nr} zwischen rund {de(-B.nachMax, 0)}&nbsp;€ und {de(-B.nachMin, 0)}&nbsp;€</> : ""} im Monat.
        Szenario mit Mietsteigerung laut Exposé, Kosten +{pzGanz(an.kostenPa)} im Jahr, Steuersatz {steuerWie(an)}; im Ruhestand ist der Steuersatz meist niedriger.
      </p>
    </Seite>
  );
}

// ---------------------------------------------------------------------------
// 8 Empfehlung
// ---------------------------------------------------------------------------

function Empfehlung({ k, B, nr }: { k: Kontext; B: EinheitErgebnis; nr: number }) {
  const { v, A } = k;
  const krit = kriterien(A, B, !k.haeuser);
  const wahl = empfohlen(A, B, !k.haeuser);
  const E = wahl === "A" ? A : B, O = wahl === "A" ? B : A;
  const t = v.texte;
  const punkt = (w: string, s: "A" | "B") => {
    if (w === "=") return s === "A" ? <span style={{ color: "var(--muted)" }}>gleich</span> : null;
    return w === s ? <span style={{ display: "inline-block", width: "2.4mm", height: "2.4mm", borderRadius: "50%", background: s === "A" ? FARBE_A : FARBE_B }} /> : null;
  };
  const guenstigerStart = A.monat.nach >= B.monat.nach ? A : B;
  const auto1 = guenstigerStart === E
    ? `Wohnung ${E.einheit.nr} startet günstiger: rund ${eur(-E.monat.nach, 0)} statt ${eur(-O.monat.nach, 0)} im Monat.`
      + (E.luecke > 0 ? ` Gerechnet ist dabei mit der subventionierten Miete; die Lücke von ${eur(E.luecke, 0)} trägt der Bauträger höchstens ${v.annahmen.subventionMonate} Monate.` : "")
    : `Wohnung ${O.einheit.nr} startet etwas günstiger: rund ${eur(-O.monat.nach, 0)} statt ${eur(-E.monat.nach, 0)} im Monat, also nur rund ${de(Math.abs(O.monat.nach - E.monat.nach), 0)}\u00a0€ Unterschied.`
      + (O.luecke > 0 ? ` Dafür zahlt der Mieter dort heute ${eur(O.einheit.mieteIst, 0)}, die Lücke von ${eur(O.luecke, 0)} trägt der Bauträger höchstens ${v.annahmen.subventionMonate} Monate.` : "");
  const vorteile = [
    E.luecke > 0 && E.lueckeQuote < O.lueckeQuote ? `hat die kleinere Mietlücke (${eur(E.luecke)})` : "",
    E.luecke <= 0 && O.luecke > 0 ? "ist ohne Mietlücke vermietet" : "",
    E.einheit.zimmer > O.einheit.zimmer ? "bietet ein Zimmer mehr" : "",
    E.qmPreis < O.qmPreis ? "kostet weniger je m²" : "",
    E.monat.tilgung > O.monat.tilgung ? "tilgt schneller" : "",
  ].filter(Boolean);
  const liste = vorteile.length > 1 ? `${vorteile.slice(0, -1).join(", ")} und ${vorteile[vorteile.length - 1]}` : vorteile[0];
  const mehrErloes = E.entw[30].erloes > O.entw[30].erloes;
  const auto2 = (liste ? `Wohnung ${E.einheit.nr} ${liste}. ` : "")
    + (mehrErloes
      ? `Nach 30 Jahren haben Sie nach Ablösung des Kredits rund ${tsd(E.entw[30].erloes)} statt ${tsd(O.entw[30].erloes)}. Eine Wohnung für Ihre Altersvorsorge.`
      : `Nach 30 Jahren liegt der Erlös nach Ablösung des Kredits mit rund ${tsd(E.entw[30].erloes)} etwas unter den ${tsd(O.entw[30].erloes)} von Wohnung ${O.einheit.nr}.`);
  const autoAndere = `Wenn Sie ${O.nk < E.nk ? `Ihr Guthaben stärker schonen wollen (rund ${eur(E.nk - O.nk, 0)} weniger Nebenkosten)` : "andere Schwerpunkte setzen"}${O.monat.nach > E.monat.nach ? " und im Monat weniger zuzahlen möchten" : ""}.`;
  const schritte = t.naechsteSchritte.length ? t.naechsteSchritte : STANDARD_SCHRITTE;
  return (
    <Seite nr={nr} kick="Welche Wohnung passt zu Ihnen?" fuss={k.fuss}>
      <h2>{t.empfehlungTitel ? t.empfehlungTitel : <>Unsere ehrliche Einschätzung: <em>Wohnung {E.einheit.nr}, für Ihren langen Weg.</em></>}</h2>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "8mm", marginTop: "6mm" }}>
        <div><table className="t"><tbody>
          <tr><th>Kriterium</th><th className="r" style={{ textAlign: "center" }}>A</th><th className="r" style={{ textAlign: "center" }}>B</th></tr>
          {krit.map((x) => (
            <tr key={x.text}><td>{x.text}</td><td className="r" style={{ width: "12mm", textAlign: "center" }}>{punkt(x.gewinner, "A")}</td><td className="r" style={{ width: "12mm", textAlign: "center" }}>{punkt(x.gewinner, "B")}</td></tr>
          ))}
        </tbody></table></div>
        <div>
          <div className="tile dk" style={{ padding: "4.5mm 5mm" }}><div className="label">Unsere Empfehlung</div>
            {(t.empfehlung ? t.empfehlung.split(/\n\s*\n/) : [auto1, auto2]).map((p, i) => (
              <div key={i} className="s" style={{ fontSize: "7.6pt", lineHeight: 1.5, marginTop: "2mm", whiteSpace: "pre-line" }}>{p}</div>
            ))}
          </div>
          <div className="note or" style={{ marginTop: "4mm" }}><b>Wann Wohnung {O.einheit.nr} besser passt.</b> {t.wannAndere || autoAndere}</div>
        </div>
      </div>
      <div className="tile dk" style={{ marginTop: "9mm", display: "grid", gridTemplateColumns: "55mm 1fr", gap: "6mm", padding: "5mm 6mm" }}>
        <div><div className="label">Ihr nächster Schritt</div><div style={{ fontFamily: "var(--serif)", fontSize: "14pt", color: "#fff", marginTop: "1.5mm" }}>Gemeinsam die Entscheidung festmachen</div></div>
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
  const an = v.annahmen;
  const m = e.monat, x = e.einheit;
  const kpi: Array<[string, string, string]> = [
    ["Kaufpreis", eur(e.kp), x.garagen ? `inkl. Garage ${eur(x.garageKp, 0)}${x.garagen > 1 ? ", weitere gratis" : ""}` : "Wohnung"],
    ["Wohnfläche", `${de(x.qm)} m²`, [`${x.zimmer} Zimmer`, x.lage].filter(Boolean).join(" · ")],
    ["Darlehen", eur(e.darlehen), "100 % des Kaufpreises"],
    ["Ihr Eigenkapital", eur(e.nk), `Kaufnebenkosten ${pz(an.knk)}`],
  ];
  const zl = (a: string, i: string, w: number) => <div className="zl" key={a}><span>{a}<i>{i}</i></span><span>{eur(w)}</span></div>;
  const kurz = [
    `Kaufpreis voll finanziert: ${pz(an.zins)} Zins, ${pz(an.tilgung)} Tilgung. Nebenkosten ${eur(e.nk, 0)} aus Eigenkapital.`,
    `Steuer ${steuerWie(an)}. Herleitung und Annahmen: Seite ${k.seiteSteuer}.`,
    e.luecke > 0
      ? `Miete subventioniert auf ${de(x.mieteSubQm)} €/m² bis zur nächsten Mieterhöhung, längstens ${an.subventionMonate} Monate (Mieter zahlt heute ${eur(x.mieteIst)}).`
      : `Gerechnet mit der heutigen Miete von ${eur(x.mieteIst)}.`,
  ];
  return (
    <section className="expose-page p ks">
      <div className="in">
        <LogoBox breite={17} lage={{ right: 0, top: "-8mm" }} />
        <div className="kick"><b>{String(nr).padStart(2, "0")}</b>Investmentsheet · Wohnung {x.nr}</div>
        <h2 style={{ fontSize: "22pt" }}>Wohnung {x.nr}: <em>Ihre Zahlen im Monat.</em></h2>
        <div style={{ fontSize: "9pt", color: "var(--muted)", marginTop: "1.5mm" }}>Für {[v.kunde.anrede, v.kunde.vorname, v.kunde.nachname].filter(Boolean).join(" ") || "Sie"} · {k.haus(e).strasse}{k.haus(e).ortZeile ? `, ${k.haus(e).ortZeile}` : ""}</div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: "3.5mm", marginTop: "5mm" }}>
          {kpi.map(([a, b, c]) => <div className="kt" key={a}><div className="label">{a}</div><div className="n">{b}</div><div className="s">{c}</div></div>)}
        </div>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "8mm", marginTop: "5.5mm", alignItems: "start" }}>
          <div><div className="label">Einnahmen je Monat</div>
            {zl("Kaltmiete Wohnung", e.luecke > 0 ? `subventioniert auf ${de(x.mieteSubQm)} €/m²` : `${de(x.mieteSubQm)} €/m²`, m.miete)}
            {x.garagen > 0 && zl(x.garagen > 1 ? `Garagenmiete, ${x.garagen} Garagen` : "Garagenmiete", x.garagen > 1 ? `je ${de(x.garageMiete1, 0)}\u00a0€, im 1. Jahr vom Bauträger getragen bzw. aufgestockt` : `1. Jahr${x.garageIstVon ? `, der Bauträger stockt auf ${de(x.garageMiete1, 0)}\u00a0€ auf` : ""}`, m.garage)}
            <div className="sb ein"><span>Einnahmen</span><b>{eur(m.einnahmen)}</b></div></div>
          <div><div className="label">Ausgaben je Monat</div>
            {zl("Zins Bankdarlehen", `${pz(an.zins)}, senkt Ihre Steuer`, m.zins)}
            {zl("Tilgung Bankdarlehen", `${pz(an.tilgung)}, baut Ihr Vermögen auf`, m.tilgung)}
            {zl("Hausgeld, nicht umlagefähig", k.haus(e).wirtschaftsplan, m.n)}
            {zl("Erhaltungsrücklage", "Sparkonto des Hauses für Reparaturen", m.r)}
            <div className="sb aus"><span>Ausgaben</span><b>{eur(m.ausgaben)}</b></div></div>
        </div>
        <div className="label" style={{ marginTop: "5.5mm" }}>Was Sie im Monat zahlen</div>
        <div className="st"><div className="nr">1</div><div><b>Das zahlen Sie im Monat, bevor das Finanzamt etwas erstattet</b><i>Ausgaben minus Einnahmen</i></div><div className="be">{eur(-m.vor)}</div></div>
        <div className="st s2"><div className="nr">2</div><div><b>Das erstattet Ihnen das Finanzamt im Monat</b><i>Steuerersparnis, {an.steuerArt === "einkommen" ? "" : "pauschal "}{pzGanz(an.steuer)}</i></div><div className="be">{"−"} {eur(m.ersparnis)}</div></div>
        <div className="st s3"><div className="nr">3</div><div><b>Das zahlen Sie tatsächlich im Monat</b><i>mit Steuervorteil, inklusive Tilgung</i></div><div className="be">{eur(-m.nach)}</div></div>
        <div style={{ fontSize: "8.6pt", color: "var(--muted)", marginTop: "2.5mm" }}>Gilt, sobald Ihr Freibetrag wirkt (ab 1. Januar nach dem Lastenwechsel), Details Seite {k.seiteFreibetrag}.</div>
        <div className="note" style={{ marginTop: "4.5mm", fontSize: "8.6pt", padding: "3mm 4.5mm" }}><div className="label" style={{ marginBottom: "1.5mm" }}>Das Wichtigste in Kürze</div>
          <ul className="li">{kurz.map((s) => <li key={s} style={{ fontSize: "8.6pt", marginBottom: "1mm" }}>{s}</li>)}</ul></div>
      </div>
      <Fuss text={`Investmentsheet ${k.anrede} · ${k.haus(e).strasse}, Wohnung ${x.nr} · Stand ${k.stand}`} nr={nr} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// 11 Hinweisseite § 39a
// ---------------------------------------------------------------------------

function Hinweis({ k, nr }: { k: Kontext; nr: number }) {
  const { stand } = k;
  const n = k.v.annahmen.lastenwechselMonate;
  const schritte: Array<[string, string]> = [
    ["Kauf und Lastenwechsel", `Mit dem Übergang von Nutzen und Lasten gehört die Wohnung wirtschaftlich Ihnen; ab dann zählen Miete und Kosten für Sie. In der Regel ist das rund ${n} Monate nach dem Kauf.`],
    ["Antrag auf Lohnsteuer-Ermäßigung", "Beim Finanzamt beantragen Sie einen Freibetrag (§ 39a EStG). Er kommt nicht automatisch. Der Antrag ist ab dem 1. November für das Folgejahr möglich; im Januar gestellt, gilt er ab 1. Januar, später gestellt wird er auf die restlichen Monate verteilt (§ 39a Abs. 2 Sätze 2, 6, 7)."],
    ["Freibetrag ab dem Jahr nach dem Kauf", "Verluste aus einer neu gekauften Wohnung zählen für den Freibetrag ab dem Kalenderjahr nach der Anschaffung (§ 37 Abs. 3 Satz 8 EStG)."],
    ["Ersparnis kommt mit dem Gehalt", "Das Finanzamt verteilt den Jahresbetrag auf die Monate. Ihr Arbeitgeber zieht weniger Lohnsteuer ab: Sie zahlen Schritt 3."],
    ["Bis dahin: Steuererklärung", "Bis der Freibetrag wirkt, zahlen Sie den Betrag aus Schritt 1. Die Differenz erhalten Sie mit der Steuererklärung zurück, nach den tatsächlichen Werten des Kaufjahres."],
  ];
  const bild = (i: number) => <img src={P39A[i - 1]} alt={`Auszug § 39a EStG, Teil ${i}`} style={{ width: "100%", display: "block", borderRadius: "1mm" }} />;
  return (
    <Seite nr={nr} kick="Wann die Steuerersparnis bei Ihnen ankommt" fuss={k.fuss}>
      <h2>Monatlich mit dem Gehalt: <em>so wirkt der Freibetrag.</em></h2>
      <p className="lead" style={{ fontSize: "8pt" }}>Ohne Freibetrag erhalten Sie die Steuerersparnis einmal im Jahr mit dem Steuerbescheid. Mit einem Freibetrag auf der Lohnsteuerkarte (elektronische Lohnsteuerabzugsmerkmale) kommt sie jeden Monat mit dem Gehalt. Allgemeine Information, keine Steuerberatung.</p>
      <div className="label" style={{ margin: "4mm 0 1.5mm" }}>Auszug aus dem Gesetz: § 39a EStG</div>
      <div style={{ border: ".3mm solid var(--line)", borderRadius: "2mm", padding: "2mm 3mm", background: "#fff" }}>
        {bild(1)}{bild(2)}
        <div style={{ fontSize: "6.6pt", color: "var(--muted)", margin: ".8mm 0" }}>[…] Nummern 1 bis 4a ausgelassen</div>
        {bild(3)}
        <div style={{ fontSize: "6.6pt", color: "var(--muted)", margin: ".8mm 0" }}>[…] Nummern 5 c bis 9 und Absatz 1 Sätze 2 bis 5 sowie Absatz 2 Sätze 1 bis 5 ausgelassen; es folgen Absatz 2 Satz 6 und 7:</div>
        {bild(4)}
      </div>
      <div style={{ fontSize: "6.4pt", color: "var(--muted)", marginTop: "1mm" }}>Quelle: gesetze-im-internet.de, § 39a EStG, Stand 28.10.2026. Bildausschnitt der amtlichen Seite, Auslassungen markiert.</div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "6mm", marginTop: "3.5mm" }}>
        <div><div className="label" style={{ marginBottom: ".5mm" }}>Der Ablauf in fünf Schritten</div>
          {schritte.map(([a, b], i) => (
            <div key={a} style={{ display: "grid", gridTemplateColumns: "7mm 1fr", gap: "2.5mm", padding: "1.7mm 0", borderBottom: ".2mm solid var(--line)" }}>
              <div style={{ width: "6mm", height: "6mm", borderRadius: "50%", background: "var(--champ)", color: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: "7.5pt" }}>{i + 1}</div>
              <div><b style={{ fontWeight: 500, fontSize: "7.8pt" }}>{a}</b><div style={{ fontSize: "6.8pt", color: "var(--muted)", lineHeight: 1.4 }}>{b}</div></div>
            </div>
          ))}
        </div>
        <div>
          <div className="note"><b>Wichtig für das erste Jahr:</b> Nr. 5 verweist auf § 37 Absatz 3 EStG. Dort heißt es in Satz 8: „Negative Einkünfte aus der Vermietung oder Verpachtung eines Gebäudes im Sinne des § 21 Absatz 1 Satz 1 Nummer 1 werden bei der Festsetzung der Vorauszahlungen nur für Kalenderjahre berücksichtigt, die nach der Anschaffung oder Fertigstellung dieses Gebäudes beginnen.“ (Quelle: gesetze-im-internet.de, § 37 EStG). Deshalb wirkt der Freibetrag ab dem 1. Januar nach dem Lastenwechsel.</div>
          <div className="note or" style={{ marginTop: "3mm" }}><b>Was das für Sie heißt:</b> {k.liste.map((e, i) => `Wohnung ${e.einheit.nr}: bis ${i ? "dahin" : "der Freibetrag wirkt"} ${eur(-e.monat.vor)}${i ? "" : " im Monat"}, danach ${eur(-e.monat.nach)}. `).join("")}Die Differenz (im Modell {k.liste.map((e) => eur(e.monat.ersparnis)).join(" bzw. ")} je Monat) erhalten Sie für die Monate davor mit der Steuererklärung zurück. Das ist ein Modellwert: Im Kaufjahr zählen die tatsächlichen Einnahmen und Kosten, die zeitanteilige AfA und Ihr persönlicher Steuersatz. Stand {stand}.</div>
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
  const an = v.annahmen;
  const steuer = pzGanz(an.steuer);
  const afaJ = A.einheit.afaJahre;
  const tab = (e: EinheitErgebnis, b: boolean) => {
    const j = e.jahr;
    return (
      <div>
        {B && <span className={`badge${b ? " b" : ""}`}>{b ? "B" : "A"}</span>} <b style={{ fontWeight: 500 }}>Wohnung {e.einheit.nr}</b>
        <table className="t" style={{ marginTop: "2mm", fontSize: "8.6pt" }}><tbody>
          <tr><td>{e.einheit.garagen ? `Kaltmiete und ${garagenText(e, false)} im Jahr` : "Kaltmiete im Jahr"}</td><td className="r">+ {eur(j.miete)}</td></tr>
          <tr><td>Schuldzinsen Bankdarlehen</td><td className="r">{"−"} {eur(j.zins)}</td></tr>
          <tr><td>Nicht umlagefähiges Hausgeld</td><td className="r">{"−"} {eur(j.n)}</td></tr>
          <tr><td>Abschreibung (AfA 1/{e.einheit.afaJahre} auf {eur(e.afaBasis, 0)})</td><td className="r">{"−"} {eur(j.afa)}</td></tr>
          <tr className="sum"><td>Ergebnis aus Vermietung im Jahr</td><td className="r">{eur(j.ergebnis)}</td></tr>
          <tr><td>× {steuer} = Steuerersparnis im Jahr</td><td className="r">{eur(j.ersparnis)}</td></tr>
          <tr className="hi"><td>÷ 12 = Steuerersparnis im Monat</td><td className="r">{eur(e.monat.ersparnis)}</td></tr>
        </tbody></table>
      </div>
    );
  };
  const hinw: ReactNode[] = [
    <><b>Nicht absetzbar:</b> Tilgung (sie baut Ihr Vermögen auf) und Erhaltungsrücklage (erst, wenn das Geld für Reparaturen verwendet wird).</>,
    <><b>Abschreibung:</b> ≈ {de(100 / afaJ, 1)} % (1/{afaJ}) auf {pzGanz(an.gebaeudeanteil)} von Kaufpreis und Nebenkosten{afaJ < 50 ? "; setzt ein anerkanntes Gutachten zur Restnutzungsdauer voraus, gesetzlich wären es 2 %" : ""}.</>,
    <><b>Finanzierung:</b> Bankdarlehen über den Kaufpreis, Zins {pz(an.zins)}, Tilgung {pz(an.tilgung)}. Kaufnebenkosten ({pz(an.knk)}: Grunderwerbsteuer, Notar und Grundbuch) aus Eigenkapital.</>,
    <><b>Miete:</b> gerechnet mit {!B || A.einheit.mieteSubQm === B.einheit.mieteSubQm ? de(A.einheit.mieteSubQm) : `${de(A.einheit.mieteSubQm)} bzw. ${de(B.einheit.mieteSubQm)}`} €/m²; der Mieter zahlt heute {B ? <>{eur(A.einheit.mieteIst)} (Wohnung {A.einheit.nr}) bzw. {eur(B.einheit.mieteIst)} (Wohnung {B.einheit.nr})</> : eur(A.einheit.mieteIst)}.
      {L.some((e) => e.luecke > 0) ? ` Die Lücke trägt der Bauträger bis zur nächsten Mieterhöhung, längstens ${an.subventionMonate} Monate.` : ""}
      {A.einheit.garagen ? ` Garage${A.einheit.garagen > 1 ? " 1" : ""} im 1. Jahr ${eur(A.einheit.garageMiete1, 0)}.` : ""}
      {A.einheit.garagen > 1 ? ` Weitere Garage ohne Aufpreis; Miete ${eur(A.einheit.garageMiete1, 0)} im 1. Jahr vom Bauträger getragen, danach Vermietung.` : ""}</>,
    <><b>Steuersatz:</b> Steuerersparnis gerechnet mit einem Grenzsteuersatz von {steuer}; die tatsächliche Ersparnis hängt vom persönlichen Steuersatz ab.</>,
    <>Vereinfachte Rechnung für das 1. volle Jahr; Rundungsdifferenzen möglich.</>,
  ];
  return (
    <Seite nr={nr} kick="Steuerersparnis im Detail und Annahmen" fuss={k.fuss}>
      <h2>So entsteht die Steuerersparnis <em>im 1. Jahr.</em></h2>
      <p className="lead" style={{ fontSize: "9pt" }}>Zinsen, Abschreibung und nicht umlagefähiges Hausgeld sind zusammen höher als die Miete. Dieses Minus senkt Ihr zu versteuerndes Einkommen; mit {v.annahmen.steuerArt === "einkommen" ? "" : "pauschal "}{steuer} gerechnet ergibt sich die Erstattung aus Schritt 2 {B ? "der Investmentsheets" : "des Investmentsheets"}.</p>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "8mm", marginTop: "6mm" }}>{tab(A, false)}{B && tab(B, true)}</div>
      <div className="label" style={{ marginTop: "7mm", marginBottom: "2mm" }}>Annahmen und Hinweise</div>
      <ul className="li">{hinw.map((h, i) => <li key={i} style={{ fontSize: "8.4pt", marginBottom: "1.6mm" }}>{h}</li>)}</ul>
      <p className="small" style={{ marginTop: "5mm", fontSize: "7pt" }}>
        Beispielrechnung, keine Zusage und kein Angebot. Keine Steuer-, Rechts- oder Finanzierungsberatung; bitte mit Steuerberatung und Bank prüfen.
        Annahmen: Kaufpreis voll finanziert, Sollzins {pz(an.zins)} (angenommen bis zur vollständigen Tilgung; die Zinsbindung ist meist kürzer, danach gilt der dann übliche Zins),
        anfängliche Tilgung {pz(an.tilgung)}, Kaufnebenkosten aus Eigenkapital, Wertentwicklung {pzGanz(an.wertPa)} und Kostensteigerung {pzGanz(an.kostenPa)} im Jahr,
        Miete steigt linear und erreicht den Zielwert im Jahr {an.mieteZielJahr} (Jahr 1 = {an.startJahr}), Betrachtungszeitraum 30 Jahre; Abschreibung {afaJ} Jahre, danach ohne AfA gerechnet.
        Verkaufssumme: angenommener Verkaufspreis vor Verkaufskosten (z. B. Makler, Notar), davon wird die Restschuld abgelöst. Steuerfreiheit des Verkaufsgewinns nach mehr als
        zehn Jahren (§ 23 EStG) als allgemeiner Hinweis. Steuerersparnis gerechnet mit einem Grenzsteuersatz von {steuer} auf das Ergebnis aus Vermietung, wie in der
        Musterrechnung der Exposés; die tatsächliche Ersparnis hängt vom persönlichen Steuersatz ab. Ohne Kirchensteuer und ohne Solidaritätszuschlag, Einkommen über die Laufzeit gleich.
        {afaJ < 50 ? " Die AfA wegen kürzerer tatsächlicher Nutzungsdauer setzt ein Gutachten voraus; ob und in welcher Höhe sie anerkannt wird, entscheidet das Finanzamt." : ""}
        {L.some((e) => e.luecke > 0) || A.einheit.garagen ? " Mietsubvention und Garagenmiete laut Vereinbarungen des Bauträgers; maßgeblich sind die Verträge." : ""}
        {" "}Hausgeld laut {k.haeuser
          ? L.map((e) => `${k.haus(e).wirtschaftsplan}${k.haus(e).verwaltung ? ` (${k.haus(e).strasse}, Verwaltung ${k.haus(e).verwaltung})` : ` (${k.haus(e).strasse})`}`).join(" und ")
          : `${v.objekt.wirtschaftsplan}${v.objekt.verwaltung ? ` (Verwaltung ${v.objekt.verwaltung})` : ""}`}. Heutige Mieten laut {B ? "Exposés" : "Exposé"} (Stand {k.stand}). Verfügbarkeit der Wohnungen vorbehalten.
      </p>
    </Seite>
  );
}

// ---------------------------------------------------------------------------
// Kaufnebenkosten: Erspartes oder Nachrangdarlehen (Christian, 28.10.2026)
// ---------------------------------------------------------------------------

function NachrangTabelle({ k, e, b }: { k: Kontext; e: EinheitErgebnis; b: boolean }) {
    const an = k.v.annahmen;
    const nz = pz(an.nachrangZins), nt = pz(an.nachrangTilgung);
    const f = [0, 0.5, 1].map((a) => nachrangFall(e, a, an));
    const z = (lbl: ReactNode, werte: ReactNode[], cls = "") => (
      <tr className={cls}><td>{lbl}</td>{werte.map((w, i) => <td className="r" key={i}>{w}</td>)}</tr>
    );
    return (
      <div style={{ marginTop: "4mm" }}>
        {k.B && <span className={`badge${b ? " b" : ""}`}>{b ? "B" : "A"}</span>} <b style={{ fontWeight: 500 }}>Wohnung {e.einheit.nr}</b>{" "}
        <span className="small">Kaufpreis {eur(e.kp, 0)}{e.einheit.garagen ? " inkl. Garage" : ""}, Bankdarlehen {eur(e.darlehen, 0)}</span>
        <table className="t nrt" style={{ marginTop: "1.5mm" }}><tbody>
          <tr><th /><th className="r">Aus Erspartem<br />(wie bisher)</th><th className="r">50 % über<br />Nachrang</th><th className="r">100 % über<br />Nachrang</th></tr>
          {z(`Kaufnebenkosten gesamt (${pz(an.knk)})`, f.map(() => eur(e.nk, 0)))}
          {z("davon über Nachrangdarlehen", f.map((x, i) => (i ? eur(x.nr, 0) : "0\u00a0€")), "sub")}
          {z("Ihr Eigenkapital aus Erspartem", f.map((x) => eur(x.ek, 0)))}
          {z(`Rate Bankdarlehen (Zins ${pz(an.zins)} + Tilgung ${pz(an.tilgung)})`, f.map((x) => eur(x.bank)))}
          {z(`Rate Nachrangdarlehen (Zins ${nz} + Tilgung ${nt})`, f.map((x, i) => (i ? eur(x.rate) : eur(0))))}
          {z("1 · Zuzahlung vor Steuer", f.map((x) => eur(-x.vor)), "sum")}
          {z(`2 · Das spart Ihnen das Finanzamt (${pzGanz(an.steuer)})`, f.map((x) => eur(x.ersparnis)))}
          {z("3 · Zuzahlung nach Steuer: Ihr Eigenanteil im Monat", f.map((x) => eur(-x.nach)), "dk")}
          {z("Nachrangdarlehen getilgt nach", f.map((x, i) => (i ? `rund ${x.jahre} Jahren` : "entfällt")), "sub")}
          {z("Zinsen Nachrang über die Laufzeit, nach Steuer", f.map((x, i) => (i ? `rund ${tsd(x.zinsenNetto)}` : "0\u00a0€")), "sub")}
        </tbody></table>
      </div>
    );
}

function Nachrang({ k, nr }: { k: Kontext; nr: number }) {
  const an = k.v.annahmen;
  const nz = pz(an.nachrangZins), nt = pz(an.nachrangTilgung);
  return (
    <Seite nr={nr} kick="Kaufnebenkosten: Erspartes oder Nachrangdarlehen" fuss={k.fuss}>
      <h2>Weniger Eigenkapital einsetzen: <em>was das im Monat bedeutet.</em></h2>
      <p className="lead" style={{ fontSize: "8pt" }}>
        Bisher sind die Kaufnebenkosten aus Ihrem Ersparten gerechnet. Alternativ lassen sie sich zur Hälfte oder ganz über ein Nachrangdarlehen finanzieren,
        gerechnet mit {nz} Zins und {nt} Tilgung. Ihr Erspartes bleibt dann als Reserve, dafür steigt die Monatsbelastung. Die Zinsen des
        Nachrangdarlehens sind als Werbungskosten angesetzt.
      </p>
      {k.liste.map((e, i) => <NachrangTabelle key={i} k={k} e={e} b={i > 0} />)}
      <p className="small" style={{ marginTop: "3mm" }}>
        Zahlen für den Monat im 1. Jahr, Steuersatz {steuerWie(an)} wie in der übrigen Rechnung. Nachrangdarlehen als Annuität mit {nz} Zins
        und {nt} anfänglicher Tilgung, jährlich verrechnet; danach entfällt die Rate. Die Zinsen über die Laufzeit sind nach Steuer angegeben
        (Zinsen × {de((1 - an.steuer) * 100, 0)} %). Konditionen beispielhaft, das Angebot des Darlehensgebers steht aus. Keine Steuer- oder Finanzierungsberatung.
      </p>
    </Seite>
  );
}

// ---------------------------------------------------------------------------
// Deckblatt im Stil der System-PDFs (pdfBranding.addCoverPage), ohne Foto
// ---------------------------------------------------------------------------

function DeckblattSystem({ k }: { k: Kontext }) {
  const d = k.v.dokument!;
  const spalten: Array<[string, string]> = [
    ["Erstellt für", [k.v.kunde.vorname, k.v.kunde.nachname].filter(Boolean).join(" ") || "Kundin oder Kunde"],
    ["Datum", k.stand],
    ["Version", d.version || "1"],
    ...(d.erstelltVon ? [["Erstellt von", d.erstelltVon] as [string, string]] : []),
  ];
  return (
    <section className="expose-page p kov-system">
      <div className="kov-system-schein" />
      <div className="kov-system-karo" />
      <img src={LOGO_DUNKEL} alt="OS Real Estate" className="kov-system-logo" />
      <div className="kov-system-text">
        <div className="kov-system-kennung">Ausführliche Investmentberechnung{d.typ ? ` · ${d.typ}` : ""}</div>
        <div className="kov-system-titel">{d.titel || k.haus(k.A).strasse}</div>
        <div className="kov-system-linie" />
        <div className="kov-system-unter">{d.adresse}</div>
        {d.typ && <div className="kov-system-unter">{d.typ}</div>}
      </div>
      <div className="kov-system-fuss">
        {spalten.map(([a, b]) => <div key={a}><span>{a}</span><b>{b}</b></div>)}
      </div>
      <div className="kov-system-hinweis">Beispielrechnung, keine Zusage. Keine Steuer- oder Rechtsberatung.</div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function kontextFuer(v: KundenObjektvergleich, A: EinheitErgebnis, B: EinheitErgebnis | null) {
  const stand = tagDe(v.stand);
  const anrede = anredeName(v) || "Sie";
  const mitKunde = v.kunde.netto > 0;
  // Reihenfolge wie in der Vorlage; bei einer Wohnung ohne Vergleich und Empfehlung, ohne Kundendaten ohne Ausgangslage.
  const seiten = [
    "deckblatt", ...(mitKunde ? ["ausgangslage"] : []), "wohnungen", ...(B ? ["vergleich"] : []), "rechnungA", ...(B ? ["rechnungB"] : []),
    "entwicklung", ...(B ? ["empfehlung"] : []), "sheetA", ...(B ? ["sheetB"] : []), "hinweis", "steuer", "nachrang",
  ];
  const nr = (s: string) => seiten.indexOf(s) + 1;
  const k: Kontext = {
    v, A, B, liste: B ? [A, B] : [A], seiteFreibetrag: nr("hinweis"), seiteSteuer: nr("steuer"), stand, anrede,
    fuss: v.dokument ? `Ausführliche Investmentberechnung für ${anrede} · Stand ${stand}` : `Persönlicher Objektvergleich für ${anrede} · Stand ${stand}`,
    haeuser: !!B && haeuseruebergreifend(v), haus: (e) => objektVon(v, e === B ? 1 : 0),
  };
  return { k, seiten, nr, mitKunde };
}

export function KundenObjektvergleichDokument({ v, A, B = null }: { v: KundenObjektvergleich; A: EinheitErgebnis; B?: EinheitErgebnis | null }) {
  const { k, seiten, nr, mitKunde } = kontextFuer(v, A, B);
  return (
    <SeitenKontext.Provider value={seiten.length}>
      <div className="kov">
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
    </SeitenKontext.Provider>
  );
}

/**
 * Analyse-Ansicht des Investmentrechners (29.10.2026): dieselben Bausteine
 * und Zahlen wie die ausführliche Berechnung, als Karten statt A4-Seiten.
 */
export function EinhauserAnalyse({ v, A, B = null }: { v: KundenObjektvergleich; A: EinheitErgebnis; B?: EinheitErgebnis | null }) {
  const { k } = kontextFuer(v, A, B);
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
