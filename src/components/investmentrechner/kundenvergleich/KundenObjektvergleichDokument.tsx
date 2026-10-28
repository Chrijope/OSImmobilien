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
import type { ReactNode } from "react";
import "./kundenObjektvergleich.css";
import {
  STANDARD_SCHRITTE, empfohlen, kriterien, rundeHalbAuf,
  type EinheitErgebnis, type KundenObjektvergleich,
} from "@/lib/investmentrechner/kundenObjektvergleich";

const LOGO = "/images/objektvergleich/logo-hell.png";
const SEITEN = 12;
const SEITE_FREIBETRAG = 11;

// ---------------------------------------------------------------------------
// Formate wie in der Vorlage: kaufmännisch gerundet, Minus als „−“, „ €“ geschützt
// ---------------------------------------------------------------------------

export function de(x: number, d = 2): string {
  const q = rundeHalbAuf(Math.abs(x), d);
  const s = q.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  return (x < 0 && q !== 0 ? "−" : "") + s;
}
export const eur = (x: number, d = 2) => `${de(x, d)} €`;
export const tsd = (x: number) => `${de(Math.round(x / 1000) * 1000, 0)} €`;
const pz = (x: number, d = 1) => `${de(x * 100, d)} %`;
const pzGanz = (x: number) => `${de(x * 100, x * 100 === Math.round(x * 100) ? 0 : 1)} %`;
const tagDe = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join(".") : iso);

interface Kontext {
  v: KundenObjektvergleich;
  A: EinheitErgebnis;
  B: EinheitErgebnis;
  stand: string;
  anrede: string;
  fuss: string;
}

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
      <span><b style={hell ? { color: "var(--champ)" } : undefined}>Vertraulich · {nr} / {SEITEN}</b></span>
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

function Deckblatt({ k }: { k: Kontext }) {
  const { v, A, B } = k;
  const o = v.objekt;
  return (
    <section className="expose-page p" style={{ background: "var(--navy)", color: "#E4ECE7" }}>
      {o.fotoTitel && <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "150mm", background: `url("${o.fotoTitel}") center 40%/cover` }} />}
      <div style={{ position: "absolute", left: 0, right: 0, top: "95mm", height: "56mm", background: "linear-gradient(rgba(18,54,42,0),var(--navy))" }} />
      <div style={{ position: "absolute", left: "16mm", top: "12mm", fontSize: "6.6pt", letterSpacing: ".2em", textTransform: "uppercase", background: "rgba(18,54,42,.75)", color: "#fff", padding: "1.2mm 3mm", borderRadius: 999 }}>
        {o.strasse}{o.ortZeile ? ` · ${o.ortZeile.replace(/^\d{5}\s*/, "")}` : ""}
      </div>
      <LogoBox breite={24} lage={{ right: "14mm", top: "9mm" }} />
      <div style={{ position: "absolute", left: "16mm", right: "16mm", top: "150mm" }}>
        <div className="kick" style={{ color: "var(--champ)" }}><b style={{ color: "var(--champ)" }}>01</b>Persönlicher Objektvergleich</div>
        <div style={{ fontFamily: "var(--serif)", fontSize: "32pt", lineHeight: 1.08, color: "#fff", marginTop: "5mm" }}>
          Ihr Objektvergleich,<br />{k.anrede}
        </div>
        <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "14pt", color: "var(--champ)", marginTop: "4mm" }}>
          Ein Haus, zwei Wohnungen: welche passt besser zu Ihnen?
        </div>
        <div style={{ height: ".2mm", background: "rgba(167,215,197,.35)", margin: "9mm 0 6mm" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.15fr", gap: "7mm" }}>
          {[A, B].map((e, i) => (
            <div key={i}>
              <div className="label" style={{ color: "var(--champ)" }}>Objekt {i ? "B" : "A"}</div>
              <div style={{ fontFamily: "var(--serif)", fontSize: "15pt", color: "#fff", marginTop: "1.5mm" }}>Wohnung {e.einheit.nr}</div>
              <div style={{ fontSize: "7.2pt", color: "#B8C2BC", marginTop: "1mm" }}>
                {[o.strasse, `${e.einheit.zimmer} Zimmer`, `${de(e.einheit.qm)} m²`, e.einheit.lage, garagenText(e)].filter(Boolean).join(" · ")}
              </div>
            </div>
          ))}
          <div>
            <div className="label" style={{ color: "var(--champ)" }}>Ihr Eigenanteil nach Steuer</div>
            <div style={{ fontFamily: "var(--serif)", fontSize: "15pt", color: "#fff", marginTop: "1.5mm" }}>
              {eur(-A.monat.nach)} <span style={{ fontSize: "10pt", color: "#B8C2BC" }}>oder</span> {eur(-B.monat.nach)}
            </div>
            <div style={{ fontSize: "7.2pt", color: "#B8C2BC", marginTop: "1mm" }}>je Monat im 1. Jahr, Steuersatz pauschal {pzGanz(v.annahmen.steuer)} wie im Exposé</div>
          </div>
        </div>
        <div style={{ fontSize: "7pt", color: "#B8C2BC", marginTop: "12mm" }}>
          Erstellt am {k.stand} auf Grundlage {v.kunde.saDatum ? `Ihrer Selbstauskunft vom ${tagDe(v.kunde.saDatum)}, ` : ""}der Exposés (Stand {k.stand}) und {/^Wirtschaftsplan \d{4}$/.test(o.wirtschaftsplan) ? `des Wirtschaftsplans ${o.wirtschaftsplan.slice(-4)}` : `laut ${o.wirtschaftsplan}`}.<br />
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

function Ausgangslage({ k }: { k: Kontext }) {
  const { v, A, B } = k;
  const ku = v.kunde;
  const steuer = pzGanz(v.annahmen.steuer);
  const frei = ku.netto - ku.mieteWarm - ku.lebenshaltung - ku.kreditRaten;
  const ueber = [A, B].map((e) => frei + e.monat.nach);
  const monate = [A, B].map((e, i) => (ueber[i] > 0 ? Math.ceil(e.nk / ueber[i]) : 0));
  const nkMax = Math.max(A.nk, B.nk);
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
      `Beim Kauf zahlen Sie einmalig rund ${hundert(A.nk)} € (Wohnung ${A.einheit.nr}) bzw. ${hundert(B.nk)} € (Wohnung ${B.einheit.nr}) für Grunderwerbsteuer, Notar und Grundbuch. `
      + (ku.kapital ? `Das bezahlen Sie aus Ihren ${eur(ku.kapital, 0)} Erspartem. ` : "")
      + (Math.min(...ueber) > 0
        ? `Danach legen Sie jeden Monat wieder etwas zurück: Von Ihrem Gehalt bleiben nach Miete, Lebenshaltung und Wohnung rund ${hundert(Math.min(...ueber))} € übrig. So ist Ihr Erspartes nach etwa ${Math.min(...monate)} bis ${Math.max(...monate)} Monaten wieder aufgefüllt.`
        : "")],
    ["Monatlich spürbar, nicht belastend.",
      `Ihr Eigenanteil nach Steuer liegt je nach Wohnung bei rund ${de(-Math.max(A.monat.nach, B.monat.nach), 0)} € bis ${de(-Math.min(A.monat.nach, B.monat.nach), 0)} € im Monat.`
      + (frei > 0 ? " Das ist ein kleiner Teil dessen, was Ihnen heute frei bleibt." : "")],
    ["Der Steuerhebel.", `Jeder Euro Verlust aus der Vermietung senkt die Steuer in dieser Rechnung um ${de(v.annahmen.steuer * 100, 0)} Cent. Mit einem Freibetrag beim Finanzamt kommt das jeden Monat mit dem Gehalt (wann genau: Seite ${SEITE_FREIBETRAG}).`],
    ...(ku.jahreBisRente ? [["Ihr langer Horizont.", `Bei rund ${ku.jahreBisRente} Jahren bis zur Rente zählt nicht nur der günstigste Start, sondern eine Belastung, die über die nächsten 30 Jahre gut passt.`] as [string, string]] : []),
  ];
  // „Sie sind unbefristet angestellt, haben keine Kredite und ein Guthaben, das die Kaufnebenkosten trägt.“
  const teile = [
    unbefristet ? "sind unbefristet angestellt" : "",
    ku.kreditRaten ? `zahlen ${eur(ku.kreditRaten, 0)} im Monat für laufende Kredite` : "haben keine Kredite",
  ].filter(Boolean);
  const lead = `Sie ${teile.join(", ")}${traegt ? `${ku.kreditRaten ? " und haben" : " und"} ein Guthaben, das die Kaufnebenkosten trägt` : ""}`;
  return (
    <Seite nr={2} kick="Ihre Ausgangslage" fuss={k.fuss}>
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

function Wohnungen({ k }: { k: Kontext }) {
  const { v, A, B } = k;
  const o = v.objekt;
  const karte = (e: EinheitErgebnis, b: boolean) => {
    const x = e.einheit;
    const rows: Array<[ReactNode, ReactNode]> = [
      ["Wohnung", `${x.zimmer} Zimmer · ${de(x.qm)} m² · ${x.lage}`],
      ["Kaufpreis Wohnung", eur(x.kpWohnung, 0) + (x.kpListe > x.kpWohnung ? ` statt ${eur(x.kpListe, 0)}` : "")],
      ...(x.garagen ? [[x.garagen > 1 ? "Garage 1 (im Kaufpreis)" : "Garage (im Kaufpreis)", eur(x.garageKp, 0)] as [string, string]] : []),
      ...(x.garagen > 1 ? [[`Garage 2${x.garagen > 2 ? ` bis ${x.garagen}` : ""} (ohne Aufpreis)`, "0 €"] as [string, string]] : []),
      ["Kaufpreis gesamt", eur(e.kp, 0)],
      ["Preis je m² Wohnung", eur(e.qmPreis)],
      ["Kaltmiete heute (Mieter)", `${eur(x.mieteIst)} · ${de(e.mieteIstQm)} €/m²`],
      [e.luecke > 0 ? "Kaltmiete subventioniert" : "Kaltmiete gerechnet", `${eur(e.mieteSub)} · ${de(x.mieteSubQm)} €/m²`],
    ];
    return (
      <div>
        <span className={`badge${b ? " b" : ""}`}>Objekt {b ? "B" : "A"}</span>
        <div style={{ fontFamily: "var(--serif)", fontSize: "14pt", color: "var(--navy)", marginTop: "2mm" }}>Wohnung {x.nr}</div>
        <div className="small" style={{ marginBottom: "2mm" }}>{o.strasse}, {x.lage}</div>
        <Zeilen rows={rows} />
      </div>
    );
  };
  const vm = o.vergleichsmieteQm;
  const mieteQm = A.einheit.mieteSubQm;
  const haus = [
    ...o.hausPunkte,
    A.einheit.garagen ? (A.einheit.garagen > 1 ? `Je Wohnung ${A.einheit.garagen} Garagen: eine im Kaufpreis, weitere ohne Aufpreis` : "Je Wohnung eine eigene Garage im Kaufpreis") : "",
    vm ? `Vergleichsmiete am Ort${o.vergleichsmieteQuelle ? ` laut ${o.vergleichsmieteQuelle}` : ""} ${de(vm)} €/m²${vm > mieteQm ? `, über den gerechneten ${de(mieteQm)} €/m²` : ""}` : "",
    o.verwaltung && !o.hausPunkte.some((p) => p.includes(o.verwaltung)) ? `Verwaltung ${o.verwaltung}` : "",
  ].filter(Boolean);
  return (
    <Seite nr={3} kick="Die beiden Wohnungen" fuss={k.fuss}>
      <h2>Ein Haus, zwei Wohnungen: <em>gleiche Lage, verschiedene Größe.</em></h2>
      <p className="lead">
        Beide Wohnungen liegen in {o.strasse}. Lage, Haus und Hausverwaltung sind gleich. Unterschiedlich sind Größe, Preis, die heutige Miete
        {A.luecke > 0 || B.luecke > 0 ? " und damit die Lücke, die der Bauträger ausgleicht" : ""}.
      </p>
      <div className="grid" style={{ gridTemplateColumns: "1.05fr 1fr", gap: "6mm", marginTop: "5mm" }}>
        <div style={{ height: "78mm", borderRadius: "2.5mm", background: o.fotoHaus ? `url("${o.fotoHaus}") center/cover` : "var(--paper)" }} />
        <div>
          <div className="label" style={{ marginBottom: "2mm" }}>Das Haus: für beide Wohnungen gleich</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: "12pt", color: "var(--navy)", marginBottom: "2.5mm" }}>{o.strasse}{o.ortZeile ? `, ${o.ortZeile}` : ""}</div>
          <ul className="li">{haus.map((x) => <li key={x}>{x}</li>)}</ul>
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

function Vergleich({ k }: { k: Kontext }) {
  const { v, A, B } = k;
  const an = v.annahmen;
  const am = A.monat, bm = B.monat, ah = A.hausgeld, bh = B.hausgeld;
  const g = A.einheit.garagen;
  const z = (lbl: ReactNode, va: ReactNode, vb: ReactNode, win: Sieger = null, cls = "", key?: string) => (
    <tr className={cls} key={key ?? String(lbl)}>
      <td>{lbl}</td><td className={`c${win === "A" ? " win" : ""}`}>{va}</td><td className={`c${win === "B" ? " win" : ""}`}>{vb}</td>
    </tr>
  );
  const kg = (e: EinheitErgebnis) => (e.einheit.garagen ? ` + ${garagenText(e, false)}` : "");
  const mietLabel = `Miete im Monat, 1. Jahr (${de(A.einheit.mieteSubQm)} €/m²${g ? ` + ${g > 1 ? `${g} × ${de(A.einheit.garageMiete1, 0)} € Garage` : `Garage ${de(A.einheit.garageMiete1, 0)} €`}` : ""})`;
  const afaPz = de(100 / A.einheit.afaJahre, 1);
  const guenstiger = A.monat.nach >= B.monat.nach ? A : B;
  const staerke = (e: EinheitErgebnis, o: EinheitErgebnis): [string, string] => {
    const teile: string[] = [];
    if (e.nk < o.nk) teile.push(`rund ${eur(o.nk - e.nk, 0)} weniger Nebenkosten`);
    if (e.monat.nach > o.monat.nach) teile.push(`rund ${de(Math.abs(e.monat.nach - o.monat.nach), 0)} € weniger Eigenanteil im Monat`);
    if (e.einheit.zimmer > o.einheit.zimmer) teile.push(`${e.einheit.zimmer} Zimmer`);
    if (e.qmPreis < o.qmPreis) teile.push("günstiger je m²");
    if (e.lueckeQuote < o.lueckeQuote) teile.push(e.luecke > 0 ? `eine Mietlücke von nur ${eur(e.luecke)}` : "keine Mietlücke");
    if (e.entw[30].erloes > o.entw[30].erloes) teile.push(`nach 30 Jahren rund ${tsd(e.entw[30].erloes - o.entw[30].erloes)} mehr Erlös nach Kreditablösung`);
    const titel = e === guenstiger ? "Der kleinere Einstieg" : "Mehr Wohnung, mehr Vermögen";
    const satz = teile.length ? `${teile.join(", ").replace(/^./, (c) => c.toUpperCase())}.` : "Gleichwertig in den gerechneten Kriterien.";
    return [titel, satz];
  };
  return (
    <Seite nr={4} kick="Vergleich nebeneinander" fuss={k.fuss}>
      <h2>Gleiches Haus, gleiche Lage. <em>Der Unterschied liegt im Detail.</em></h2>
      <p className="lead" style={{ fontSize: "8pt" }}>Grün markiert, wo eine Wohnung vorne liegt. Alle Zahlen gelten für Sie persönlich im 1. Jahr, wenn nicht anders angegeben. Hausgeld laut {v.objekt.wirtschaftsplan}.</p>
      <table className="t v" style={{ marginTop: "3mm" }}>
        <tbody>
          <tr><th /><th><span className="badge">A</span> {v.objekt.strasse}, WE {A.einheit.nr}</th><th><span className="badge b">B</span> {v.objekt.strasse}, WE {B.einheit.nr}</th></tr>
          {z("Lage im Haus", A.einheit.lage, B.einheit.lage)}
          {z("Wohnung", `${A.einheit.zimmer} Zimmer, ${de(A.einheit.qm)} m²${kg(A)}`, `${B.einheit.zimmer} Zimmer, ${de(B.einheit.qm)} m²${kg(B)}`, sieger(A.einheit.qm, B.einheit.qm, false))}
          {z(g > 1 ? "Kaufpreis (weitere Garagen ohne Aufpreis)" : "Kaufpreis", `${eur(A.kp, 0)}${g ? " inkl. Garage" : ""}`, `${eur(B.kp, 0)}${g ? " inkl. Garage" : ""}`)}
          {z("Preis je m² Wohnung", eur(A.qmPreis), eur(B.qmPreis), sieger(A.qmPreis, B.qmPreis, true))}
          {z(`Kaufnebenkosten (aus Eigenkapital, ${pz(an.knk)})`, eur(A.nk, 0), eur(B.nk, 0), sieger(A.nk, B.nk, true))}
          {z("Kaltmiete heute (zahlt der Mieter)", `${eur(A.einheit.mieteIst)} (${de(A.mieteIstQm)} €/m²)`, `${eur(B.einheit.mieteIst)} (${de(B.mieteIstQm)} €/m²)`)}
          {z(mietLabel, eur(am.einnahmen), eur(bm.einnahmen))}
          {(A.luecke > 0 || B.luecke > 0) && z("davon Mietlücke, die der Bauträger zahlt", `${eur(Math.max(0, A.luecke))} (${pz(Math.max(0, A.lueckeQuote))})`, `${eur(Math.max(0, B.luecke))} (${pz(Math.max(0, B.lueckeQuote))})`, sieger(A.lueckeQuote, B.lueckeQuote, true), "sub")}
          {z("Hausgeld umlagefähig (zahlt der Mieter)", eur(ah.u), eur(bh.u), null, "sub")}
          {z("Hausgeld nicht umlagefähig (Verwaltung u. a.)", eur(ah.n), eur(bh.n), null, "sub")}
          {z(`= Hausgeld (${v.objekt.wirtschaftsplan})`, eur(ah.summe), eur(bh.summe))}
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
        {A.einheit.afaJahre >= 30 ? ` Die Abschreibung läuft bei beiden Wohnungen ${A.einheit.afaJahre} Jahre, also länger als die Betrachtung; ein früher Verkauf ist deshalb nicht nötig.` : ""}
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
      Sie über die Steuererklärung zurück (Höhe nach den tatsächlichen Werten des Kaufjahres). Mehr auf Seite {SEITE_FREIBETRAG}.
    </>
  );
}

function garageZeile(k: Kontext, e: EinheitErgebnis): [string, string, string] | null {
  const x = e.einheit;
  if (!x.garagen) return null;
  const ist = x.garageIstVon ? `Heute ${de(x.garageIstVon, 0)}${x.garageIstBis && x.garageIstBis !== x.garageIstVon ? ` bis ${de(x.garageIstBis, 0)}` : ""} €; ` : "";
  if (x.garagen > 1) return [`Garagenmiete, ${x.garagen} Garagen, 1. Jahr`, `${x.garagen} × ${de(x.garageMiete1, 0)} €; im 1. Jahr vom Bauträger aufgestockt bzw. getragen, danach Vermietung.`, `Zusätzliche Einnahme aus ${x.garagen} Garagen.`];
  return ["Garagenmiete, 1. Jahr", `${ist}${x.garageIstVon ? `der Bauträger stockt 12 Monate auf ${de(x.garageMiete1, 0)} € auf.` : `${de(x.garageMiete1, 0)} € im Monat.`}`, "Zusätzliche Einnahme aus der eigenen Garage."];
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
  const wp = k.v.objekt.wirtschaftsplan;
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
  const vm = k.v.objekt.vergleichsmieteQm;
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
    [`Miete im Szenario (Jahr 1 = ${an.startJahr})`, `${de(x.mieteSubQm)} €/m² auf ${de(an.mieteZielQm, an.mieteZielQm % 1 ? 2 : 0)} €/m² im Jahr ${an.mieteZielJahr}`],
    ...(x.garagen ? [[x.garagen > 1 ? "Garagen im Szenario" : "Garage im Szenario", `${x.garagen > 1 ? "je " : ""}${de(x.garageMiete1, 0)} € auf ${de(x.garageMieteZiel, 0)} € im Jahr ${an.mieteZielJahr}`] as [string, string]] : []),
  ];
  const e30 = e.entw[30];
  const h = e.hausgeld;
  return (
    <Seite nr={nr} kick={`Ihre persönliche Rechnung · Objekt ${b ? "B" : "A"}`} fuss={k.fuss} klasse="sh">
      <h2>{v.objekt.strasse}, Wohnung {x.nr}: <em>{eur(-m.nach)} im Monat für Ihre Kapitalanlage.</em></h2>
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
          <div className="label" style={{ marginTop: "3mm" }}>Hausgeld laut {v.objekt.wirtschaftsplan}</div>
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

function ChartErloes({ A, B }: { A: EinheitErgebnis; B: EinheitErgebnis }) {
  const W = 600, H = 200, l = 40, r = 10, t = 10, b = 22;
  const hoechst = Math.max(...[A, B].flatMap((e) => e.reihe.flatMap((p) => [p.wert - p.rest, p.zuz])));
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
      {linie(A, "erl", FARBE_A)}{linie(B, "erl", FARBE_B)}
      {linie(A, "zuz", "#12362A", "4 3")}{linie(B, "zuz", FARBE_B, "1.5 2.5")}
    </svg>
  );
}

function ChartNach({ A, B }: { A: EinheitErgebnis; B: EinheitErgebnis }) {
  const W = 600, H = 140, l = 40, r = 10, t = 8, b = 20;
  const werte = [A, B].flatMap((e) => e.reihe.slice(0, 30).map((p) => p.nach));
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
      {([[A, FARBE_A, undefined], [B, FARBE_B, "4 3"]] as const).map(([e, f, d], i) => (
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

function Entwicklung({ k }: { k: Kontext }) {
  const { v, A, B } = k;
  const an = v.annahmen;
  const afa = A.einheit.afaJahre;
  return (
    <Seite nr={7} kick="Vermögensentwicklung im Vergleich" fuss={k.fuss}>
      <h2>Aus kleinen Monatsbeträgen <em>wird echtes Vermögen.</em></h2>
      <p className="lead" style={{ fontSize: "8pt" }}>Verkaufssumme ist der angenommene Verkaufspreis bei {pzGanz(an.wertPa)} Wertentwicklung im Jahr. Davon wird die Restschuld abgelöst; was übrig bleibt, ist Ihr Erlös (durchgezogene Linien). Gestrichelt und gepunktet: was Sie selbst insgesamt zugezahlt haben, inklusive Kaufnebenkosten. Erlös minus Zuzahlung ist Ihr Plus.</p>
      <div style={{ marginTop: "3mm" }}><ChartErloes A={A} B={B} /></div>
      <Legende items={[["A Erlös nach Kreditablösung", FARBE_A], ["B Erlös nach Kreditablösung", FARBE_B], ["A Ihre Zuzahlung gesamt", "#12362A", "4 3"], ["B Ihre Zuzahlung gesamt", FARBE_B, "1.5 2.5"]]} />
      <table className="t" style={{ marginTop: "3mm" }}><tbody>
        <tr><th /><th className="r">Verkaufssumme</th><th className="r">Restschuld</th><th className="r">Ihr Erlös</th><th className="r">Ihre Zuzahlung</th><th className="r">Ihr Plus</th></tr>
        {[A, B].map((e, i) => [
          <tr key={`k${i}`}><td colSpan={6} style={{ fontWeight: 500, paddingTop: "2mm" }}><span className={`badge${i ? " b" : ""}`}>{i ? "B" : "A"}</span> {v.objekt.strasse}, WE {e.einheit.nr}</td></tr>,
          ...([25, 30, 35] as const).map((y) => {
            const x = e.entw[y];
            return (
              <tr key={`${i}-${y}`}><td>nach {y} Jahren</td><td className="r">{tsd(x.wert)}</td><td className="r">{Math.round(x.rest) ? `− ${tsd(x.rest)}` : "0 €"}</td>
                <td className="r">{tsd(x.erloes)}</td><td className="r">{tsd(x.zuzahlung)}</td><td className="r" style={{ fontWeight: 500 }}>{tsd(x.plus)}</td></tr>
            );
          }),
        ])}
      </tbody></table>
      <p className="small" style={{ marginTop: "1.5mm" }}>
        Jahr 1 = {an.startJahr}.{A.entw[35].rest < 1 && B.entw[35].rest < 1 ? " Nach 35 Jahren ist der Kredit in beiden Fällen getilgt." : ""}
        {afa < 35 ? ` Die Abschreibung endet nach Jahr ${afa}; ab Jahr ${afa + 1} entfällt ihre Steuerersparnis, das ist in den Werten berücksichtigt.` : ""}
        {" "}Alle Werte ungerundet gerechnet und auf 1.000 € gerundet, Rundungsdifferenzen möglich. Die Zuzahlungen gelten nur, wenn die angesetzten Mieten tatsächlich erzielt werden{A.einheit.garagen ? " (auch die Garage nach Ende der Aufstockung)" : ""}. Werte vor Verkaufskosten; Restschuld vereinfacht mit jährlicher Verrechnung (bei monatlicher Zahlung etwas niedriger).
      </p>
      <div className="label" style={{ marginTop: "4mm" }}>Ihr Eigenanteil nach Steuer je Monat, Jahr 1 bis 30</div>
      <div style={{ marginTop: "1.5mm" }}><ChartNach A={A} B={B} /></div>
      <Legende items={[[`A Wohnung ${A.einheit.nr}`, FARBE_A], [`B Wohnung ${B.einheit.nr}`, FARBE_B, "4 3"]]} />
      <p className="small" style={{ marginTop: "1.5mm" }}>
        Wohnung {A.einheit.nr} liegt zwischen rund {de(-A.nachMax, 0)}&nbsp;€ und {de(-A.nachMin, 0)}&nbsp;€, Wohnung {B.einheit.nr} zwischen rund {de(-B.nachMax, 0)}&nbsp;€ und {de(-B.nachMin, 0)}&nbsp;€ im Monat.
        Szenario mit Mietsteigerung laut Exposé, Kosten +{pzGanz(an.kostenPa)} im Jahr, Steuersatz pauschal {pzGanz(an.steuer)}; im Ruhestand ist der Steuersatz meist niedriger.
      </p>
    </Seite>
  );
}

// ---------------------------------------------------------------------------
// 8 Empfehlung
// ---------------------------------------------------------------------------

function Empfehlung({ k }: { k: Kontext }) {
  const { v, A, B } = k;
  const krit = kriterien(A, B);
  const wahl = empfohlen(A, B);
  const E = wahl === "A" ? A : B, O = wahl === "A" ? B : A;
  const t = v.texte;
  const punkt = (w: string, s: "A" | "B") => {
    if (w === "=") return s === "A" ? <span style={{ color: "var(--muted)" }}>gleich</span> : null;
    return w === s ? <span style={{ display: "inline-block", width: "2.4mm", height: "2.4mm", borderRadius: "50%", background: s === "A" ? FARBE_A : FARBE_B }} /> : null;
  };
  const guenstigerStart = A.monat.nach >= B.monat.nach ? A : B;
  const auto1 = guenstigerStart === E
    ? `Wohnung ${E.einheit.nr} startet günstiger: rund ${eur(-E.monat.nach, 0)} statt ${eur(-O.monat.nach, 0)} im Monat. Nach 30 Jahren bleiben nach Ablösung des Kredits rund ${tsd(E.entw[30].erloes)} gegenüber ${tsd(O.entw[30].erloes)}.`
    : `Wohnung ${O.einheit.nr} startet etwas günstiger: rund ${eur(-O.monat.nach, 0)} statt ${eur(-E.monat.nach, 0)} im Monat, also nur rund ${de(Math.abs(O.monat.nach - E.monat.nach), 0)} € Unterschied.`
      + (O.luecke > 0 ? ` Dafür zahlt der Mieter dort heute ${eur(O.einheit.mieteIst, 0)}, die Lücke von ${eur(O.luecke, 0)} trägt der Bauträger höchstens ${v.annahmen.subventionMonate} Monate.` : "");
  const auto2 = `Wohnung ${E.einheit.nr}${E.luecke > 0 && E.lueckeQuote < O.lueckeQuote ? ` hat die kleinere Mietlücke (${eur(E.luecke)})` : ""}${E.einheit.zimmer > O.einheit.zimmer ? `${E.luecke > 0 && E.lueckeQuote < O.lueckeQuote ? "," : ""} bietet ein Zimmer mehr` : ""}`
    + `${E.qmPreis < O.qmPreis ? " und kostet weniger je m²" : ""}; nach 30 Jahren haben Sie nach Ablösung des Kredits rund ${tsd(E.entw[30].erloes)} statt ${tsd(O.entw[30].erloes)}. Eine Wohnung für Ihre Altersvorsorge.`;
  const autoAndere = `Wenn Sie ${O.nk < E.nk ? `Ihr Guthaben stärker schonen wollen (rund ${eur(E.nk - O.nk, 0)} weniger Nebenkosten)` : "andere Schwerpunkte setzen"}${O.monat.nach > E.monat.nach ? " und im Monat weniger zuzahlen möchten" : ""}.`;
  const schritte = t.naechsteSchritte.length ? t.naechsteSchritte : STANDARD_SCHRITTE;
  return (
    <Seite nr={8} kick="Welche Wohnung passt zu Ihnen?" fuss={k.fuss}>
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
    ["Wohnfläche", `${de(x.qm)} m²`, `${x.zimmer} Zimmer · ${x.lage}`],
    ["Darlehen", eur(e.darlehen), "100 % des Kaufpreises"],
    ["Ihr Eigenkapital", eur(e.nk), `Kaufnebenkosten ${pz(an.knk)}`],
  ];
  const zl = (a: string, i: string, w: number) => <div className="zl" key={a}><span>{a}<i>{i}</i></span><span>{eur(w)}</span></div>;
  const kurz = [
    `Kaufpreis voll finanziert: ${pz(an.zins)} Zins, ${pz(an.tilgung)} Tilgung. Nebenkosten ${eur(e.nk, 0)} aus Eigenkapital.`,
    `Steuer pauschal ${pzGanz(an.steuer)} wie im Exposé. Herleitung und Annahmen: Seite 12.`,
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
        <div style={{ fontSize: "9pt", color: "var(--muted)", marginTop: "1.5mm" }}>Für {[v.kunde.anrede, v.kunde.vorname, v.kunde.nachname].filter(Boolean).join(" ") || "Sie"} · {v.objekt.strasse}{v.objekt.ortZeile ? `, ${v.objekt.ortZeile}` : ""}</div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: "3.5mm", marginTop: "5mm" }}>
          {kpi.map(([a, b, c]) => <div className="kt" key={a}><div className="label">{a}</div><div className="n">{b}</div><div className="s">{c}</div></div>)}
        </div>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "8mm", marginTop: "5.5mm", alignItems: "start" }}>
          <div><div className="label">Einnahmen je Monat</div>
            {zl("Kaltmiete Wohnung", e.luecke > 0 ? `subventioniert auf ${de(x.mieteSubQm)} €/m²` : `${de(x.mieteSubQm)} €/m²`, m.miete)}
            {x.garagen > 0 && zl(x.garagen > 1 ? `Garagenmiete, ${x.garagen} Garagen` : "Garagenmiete", x.garagen > 1 ? `je ${de(x.garageMiete1, 0)} €, im 1. Jahr vom Bauträger getragen bzw. aufgestockt` : `1. Jahr${x.garageIstVon ? `, der Bauträger stockt auf ${de(x.garageMiete1, 0)} € auf` : ""}`, m.garage)}
            <div className="sb ein"><span>Einnahmen</span><b>{eur(m.einnahmen)}</b></div></div>
          <div><div className="label">Ausgaben je Monat</div>
            {zl("Zins Bankdarlehen", `${pz(an.zins)}, senkt Ihre Steuer`, m.zins)}
            {zl("Tilgung Bankdarlehen", `${pz(an.tilgung)}, baut Ihr Vermögen auf`, m.tilgung)}
            {zl("Hausgeld, nicht umlagefähig", v.objekt.wirtschaftsplan, m.n)}
            {zl("Erhaltungsrücklage", "Sparkonto des Hauses für Reparaturen", m.r)}
            <div className="sb aus"><span>Ausgaben</span><b>{eur(m.ausgaben)}</b></div></div>
        </div>
        <div className="label" style={{ marginTop: "5.5mm" }}>Was Sie im Monat zahlen</div>
        <div className="st"><div className="nr">1</div><div><b>Das zahlen Sie im Monat, bevor das Finanzamt etwas erstattet</b><i>Ausgaben minus Einnahmen</i></div><div className="be">{eur(-m.vor)}</div></div>
        <div className="st s2"><div className="nr">2</div><div><b>Das erstattet Ihnen das Finanzamt im Monat</b><i>Steuerersparnis, pauschal {pzGanz(an.steuer)}</i></div><div className="be">{"−"} {eur(m.ersparnis)}</div></div>
        <div className="st s3"><div className="nr">3</div><div><b>Das zahlen Sie tatsächlich im Monat</b><i>mit Steuervorteil, inklusive Tilgung</i></div><div className="be">{eur(-m.nach)}</div></div>
        <div style={{ fontSize: "8.6pt", color: "var(--muted)", marginTop: "2.5mm" }}>Gilt, sobald Ihr Freibetrag wirkt (ab 1. Januar nach dem Lastenwechsel), Details Seite {SEITE_FREIBETRAG}.</div>
        <div className="note" style={{ marginTop: "4.5mm", fontSize: "8.6pt", padding: "3mm 4.5mm" }}><div className="label" style={{ marginBottom: "1.5mm" }}>Das Wichtigste in Kürze</div>
          <ul className="li">{kurz.map((s) => <li key={s} style={{ fontSize: "8.6pt", marginBottom: "1mm" }}>{s}</li>)}</ul></div>
      </div>
      <Fuss text={`Investmentsheet ${k.anrede} · ${v.objekt.strasse}, Wohnung ${x.nr} · Stand ${k.stand}`} nr={nr} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// 11 Hinweisseite § 39a
// ---------------------------------------------------------------------------

function Hinweis({ k }: { k: Kontext }) {
  const { A, B, stand } = k;
  const n = k.v.annahmen.lastenwechselMonate;
  const schritte: Array<[string, string]> = [
    ["Kauf und Lastenwechsel", `Mit dem Übergang von Nutzen und Lasten gehört die Wohnung wirtschaftlich Ihnen; ab dann zählen Miete und Kosten für Sie. In der Regel ist das rund ${n} Monate nach dem Kauf.`],
    ["Antrag auf Lohnsteuer-Ermäßigung", "Beim Finanzamt beantragen Sie einen Freibetrag (§ 39a EStG). Er kommt nicht automatisch. Der Antrag ist ab dem 1. November für das Folgejahr möglich; im Januar gestellt, gilt er ab 1. Januar, später gestellt wird er auf die restlichen Monate verteilt (§ 39a Abs. 2 Sätze 2, 6, 7)."],
    ["Freibetrag ab dem Jahr nach dem Kauf", "Verluste aus einer neu gekauften Wohnung zählen für den Freibetrag ab dem Kalenderjahr nach der Anschaffung (§ 37 Abs. 3 Satz 8 EStG)."],
    ["Ersparnis kommt mit dem Gehalt", "Das Finanzamt verteilt den Jahresbetrag auf die Monate. Ihr Arbeitgeber zieht weniger Lohnsteuer ab: Sie zahlen Schritt 3."],
    ["Bis dahin: Steuererklärung", "Bis der Freibetrag wirkt, zahlen Sie den Betrag aus Schritt 1. Die Differenz erhalten Sie mit der Steuererklärung zurück, nach den tatsächlichen Werten des Kaufjahres."],
  ];
  const bild = (i: number) => <img src={`/images/objektvergleich/p39a-${i}.png`} alt={`Auszug § 39a EStG, Teil ${i}`} style={{ width: "100%", display: "block", borderRadius: "1mm" }} />;
  return (
    <Seite nr={11} kick="Wann die Steuerersparnis bei Ihnen ankommt" fuss={k.fuss}>
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
          <div className="note or" style={{ marginTop: "3mm" }}><b>Was das für Sie heißt:</b> Wohnung {A.einheit.nr}: bis der Freibetrag wirkt {eur(-A.monat.vor)} im Monat, danach {eur(-A.monat.nach)}. Wohnung {B.einheit.nr}: bis dahin {eur(-B.monat.vor)}, danach {eur(-B.monat.nach)}. Die Differenz (im Modell {eur(A.monat.ersparnis)} bzw. {eur(B.monat.ersparnis)} je Monat) erhalten Sie für die Monate davor mit der Steuererklärung zurück. Das ist ein Modellwert: Im Kaufjahr zählen die tatsächlichen Einnahmen und Kosten, die zeitanteilige AfA und Ihr persönlicher Steuersatz. Stand {stand}.</div>
        </div>
      </div>
    </Seite>
  );
}

// ---------------------------------------------------------------------------
// 12 Steuerersparnis im Detail und Annahmen
// ---------------------------------------------------------------------------

function SteuerDetail({ k }: { k: Kontext }) {
  const { v, A, B } = k;
  const an = v.annahmen;
  const steuer = pzGanz(an.steuer);
  const afaJ = A.einheit.afaJahre;
  const tab = (e: EinheitErgebnis, b: boolean) => {
    const j = e.jahr;
    return (
      <div>
        <span className={`badge${b ? " b" : ""}`}>{b ? "B" : "A"}</span> <b style={{ fontWeight: 500 }}>Wohnung {e.einheit.nr}</b>
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
    <><b>Miete:</b> gerechnet mit {de(A.einheit.mieteSubQm)} €/m²; der Mieter zahlt heute {eur(A.einheit.mieteIst)} (Wohnung {A.einheit.nr}) bzw. {eur(B.einheit.mieteIst)} (Wohnung {B.einheit.nr}).
      {A.luecke > 0 || B.luecke > 0 ? ` Die Lücke trägt der Bauträger bis zur nächsten Mieterhöhung, längstens ${an.subventionMonate} Monate.` : ""}
      {A.einheit.garagen ? ` Garage${A.einheit.garagen > 1 ? " 1" : ""} im 1. Jahr ${eur(A.einheit.garageMiete1, 0)}.` : ""}
      {A.einheit.garagen > 1 ? ` Weitere Garage ohne Aufpreis; Miete ${eur(A.einheit.garageMiete1, 0)} im 1. Jahr vom Bauträger getragen, danach Vermietung.` : ""}</>,
    <><b>Steuersatz:</b> Steuerersparnis gerechnet mit einem Grenzsteuersatz von {steuer}; die tatsächliche Ersparnis hängt vom persönlichen Steuersatz ab.</>,
    <>Vereinfachte Rechnung für das 1. volle Jahr; Rundungsdifferenzen möglich.</>,
  ];
  return (
    <Seite nr={12} kick="Steuerersparnis im Detail und Annahmen" fuss={k.fuss}>
      <h2>So entsteht die Steuerersparnis <em>im 1. Jahr.</em></h2>
      <p className="lead" style={{ fontSize: "9pt" }}>Zinsen, Abschreibung und nicht umlagefähiges Hausgeld sind zusammen höher als die Miete. Dieses Minus senkt Ihr zu versteuerndes Einkommen; mit pauschal {steuer} gerechnet ergibt sich die Erstattung aus Schritt 2 der Investmentsheets.</p>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "8mm", marginTop: "6mm" }}>{tab(A, false)}{tab(B, true)}</div>
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
        {A.luecke > 0 || B.luecke > 0 || A.einheit.garagen ? " Mietsubvention und Garagenmiete laut Vereinbarungen des Bauträgers; maßgeblich sind die Verträge." : ""}
        {" "}Hausgeld laut {v.objekt.wirtschaftsplan}{v.objekt.verwaltung ? ` (Verwaltung ${v.objekt.verwaltung})` : ""}. Heutige Mieten laut Exposés (Stand {k.stand}). Verfügbarkeit der Wohnungen vorbehalten.
      </p>
    </Seite>
  );
}

// ---------------------------------------------------------------------------

export function KundenObjektvergleichDokument({ v, A, B }: { v: KundenObjektvergleich; A: EinheitErgebnis; B: EinheitErgebnis }) {
  const stand = tagDe(v.stand);
  const anrede = anredeName(v) || "Sie";
  const k: Kontext = { v, A, B, stand, anrede, fuss: `Persönlicher Objektvergleich für ${anrede} · Stand ${stand}` };
  return (
    <div className="kov">
      <Deckblatt k={k} />
      <Ausgangslage k={k} />
      <Wohnungen k={k} />
      <Vergleich k={k} />
      <Rechnung k={k} e={A} nr={5} b={false} />
      <Rechnung k={k} e={B} nr={6} b />
      <Entwicklung k={k} />
      <Empfehlung k={k} />
      <Sheet k={k} e={A} nr={9} />
      <Sheet k={k} e={B} nr={10} />
      <Hinweis k={k} />
      <SteuerDetail k={k} />
    </div>
  );
}
