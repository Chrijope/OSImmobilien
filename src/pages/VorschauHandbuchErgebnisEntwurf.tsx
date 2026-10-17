/**
 * ENTWURF zur Freigabe (17.10.2026): die Ergebnisseite des Handbuchs in der
 * Sprache von „Mehr Netto vom Brutto“, „Arbeitsleistung und
 * Immobilienvermögen“ (Beratungspräsentation) und der neuen
 * Analysetool-Ergebnisseite. Wird unten in /vorschau/handbuch-entwurf gezeigt.
 *
 * Gerechnet wird wie im Analysetool (Sitzung analysetool-ergebnis,
 * `analyseVorsorge.ts`, noch nicht auf main): dieselben fünf Exposé-Wohnungen,
 * derselbe Exposé-Rechner (`berechneExpose`), 4,8 % Zins, 1,2 % Tilgung,
 * Kauf heute, nach drei und nach sechs Jahren, Verkauf mit 67.
 * Brutto zu Netto mit dem Steuerrechner des CRM.
 * ponytail: Daten hier kopiert; beim Bau gemeinsames Modul mit dem Analysetool.
 */
import { useMemo, useState } from "react";
import { berechneExpose, type ExposeObjektdaten } from "@/lib/exposeRechner";
import { standardAnnahmen } from "@/lib/exposeAnnahmen";
import { tilgungsplan } from "@/lib/finanzierung";
import { sozialabgaben, steuerlastAusZvE, zvEAusBrutto, type SteuerEingaben } from "@/lib/steuerRechner";
import { BRUTTO_STELLVERTRETER, handbuchRahmen, type HandbuchAntworten } from "../../supabase/functions/_shared/handbuch-funnel.ts";
import { FARBE, Folie, Fussnote, Karte, Kopf, Wert } from "@/components/beratung/folienBausteine";
import "@/styles/praesentation-liquid.css";
import "@/styles/beratung-os.css";

type Konzept = "steuer" | "alter";
interface Wohnung {
  id: string;
  titel: string;
  ort: string;
  beispiel: string;
  konzept: Konzept;
  bild: string;
  objekt: ExposeObjektdaten;
  afa: number;
  miete2060: number;
  nkVerkaeufer?: boolean;
}

/* Wie OS_WOHNUNGEN im Analysetool, Zahlen aus den Exposés (14. bis 16.10.2026). */
const WOHNUNGEN: Wohnung[] = [
  { id: "barfuss", titel: "Barfusstraße 9", ort: "Berlin-Wedding", beispiel: "WE 07, 72 m²", konzept: "steuer", bild: "/images/mikroseite/barfuss-fassade.jpg",
    objekt: { kaufpreis: 374_400, wohnflaeche: 72, kaltmieteMonat: 972, hausgeldNichtUmlegbarMonat: 71.9, ruecklageMonat: 39.4, bundeslandId: "be", kaufnebenkostenProzent: 8, gebaeudeanteilProzent: 93 }, afa: 5.6, miete2060: 18 },
  { id: "hauff", titel: "Hauffstraße 38", ort: "Schwielowsee", beispiel: "WE 05, 70,9 m², mit Garage", konzept: "alter", bild: "/images/mikroseite/hauff-garten.jpg",
    objekt: { kaufpreis: 280_170, wohnflaeche: 70.9, kaltmieteMonat: 1021.7, stellplatzMieteMonat: 100, hausgeldNichtUmlegbarMonat: 190.77, ruecklageMonat: 61.47, bundeslandId: "bb", kaufnebenkostenProzent: 8.5, gebaeudeanteilProzent: 80 }, afa: 3.1, miete2060: 20 },
  { id: "zossen", titel: "Luisenstraße 72", ort: "Zossen-Wünsdorf", beispiel: "Doppelhaushälfte, 91 m²", konzept: "alter", bild: "/images/mikroseite/zossen-luisenstrasse.jpg",
    objekt: { kaufpreis: 379_000, wohnflaeche: 91, kaltmieteMonat: 1600, ruecklageMonat: 91, bundeslandId: "bb", kaufnebenkostenProzent: 8.5, gebaeudeanteilProzent: 64.47 }, afa: 8.3, miete2060: 20 },
  { id: "brueck", titel: "Marktstraße 6", ort: "Brück", beispiel: "WE 08, 80 m²", konzept: "alter", bild: "/images/handbuch/brueck-1.jpg",
    objekt: { kaufpreis: 185_000, wohnflaeche: 80, kaltmieteMonat: 721.62, hausgeldNichtUmlegbarMonat: 54.8, ruecklageMonat: 40.2, bundeslandId: "bb", kaufnebenkostenProzent: 8.5, gebaeudeanteilProzent: 80 }, afa: 2, miete2060: 18 },
  { id: "cottbus", titel: "Jamlitzer Straße 9/10", ort: "Cottbus", beispiel: "WE 01, 22 m²", konzept: "alter", bild: "/images/handbuch/cottbus-luftbild.jpg",
    objekt: { kaufpreis: 79_995, wohnflaeche: 22, kaltmieteMonat: 340, ruecklageMonat: 22, bundeslandId: "bb", kaufnebenkostenProzent: 8.5, gebaeudeanteilProzent: 20 }, afa: 4, miete2060: 340 / 22, nkVerkaeufer: true },
];

const ZINS = 4.8;
const TILGUNG = 1.2;
const RENTENALTER = 67;
const RUHESTAND_MONATE = 25 * 12;

const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
const mio = (n: number) => `${(n / 1_000_000).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mio. €`;

function rechne(w: Wohnung, jahre: number, afa = w.afa) {
  const heute = (w.objekt.kaltmieteMonat - (w.objekt.stellplatzMieteMonat ?? 0)) / (w.objekt.wohnflaeche ?? 1);
  const steigerung = (Math.pow(w.miete2060 / heute, 1 / 34) - 1) * 100;
  const e = berechneExpose(w.objekt, {
    ...standardAnnahmen(2026),
    zinsProzent: ZINS,
    tilgungProzent: TILGUNG,
    mietsteigerungProzent: steigerung,
    afaProzent: afa,
    grenzsteuersatzManuellProzent: 42,
    nebenkostenTraegtVerkaeufer: !!w.nkVerkaeufer,
    haltedauerJahre: jahre,
  });
  const j1 = e.jahresreihe[0];
  const zehn = e.jahresreihe.slice(0, 10);
  const ende = e.jahresreihe[Math.min(jahre, e.jahresreihe.length) - 1];
  const plan = tilgungsplan(e.kauf.darlehen, jahre, ZINS / 100, TILGUNG / 100);
  const restschuld = plan[plan.length - 1]?.restschuldEnde ?? e.kauf.darlehen;
  const wert = ende.immobilienwertEnde;
  return {
    j1,
    vorSteuerMonat: j1.eigenanteilMonat + j1.steuerwirkungOhneSanierung / 12,
    anteilZehn: zehn.reduce((s, j) => s + j.eigenanteilMonat, 0) / zehn.length,
    wert,
    erloes: Math.max(0, wert - restschuld - wert * 0.04),
    nebenkosten: e.kauf.nebenkostenKunde,
  };
}

/** Lohnsteuer im Monat bei diesem zvE, mit Soli, ohne Kirchensteuer. */
function lohnsteuerMonat(zve: number, e: SteuerEingaben) {
  return steuerlastAusZvE(zve, e).summe / 12;
}

export default function VorschauHandbuchErgebnisEntwurf({ a, vorname }: { a: HandbuchAntworten; vorname: string }) {
  const [alter, setAlter] = useState(35);
  const r = handbuchRahmen(a);
  const brutto = BRUTTO_STELLVERTRETER[a.brutto];
  const steuerE: SteuerEingaben = {
    jahresbrutto: brutto,
    steuerklasse: a.gemeinsamVeranlagt ? "III" : "I",
    kinder: 0,
    kirchensteuer: false,
    bestehendeImmobilien: 0,
    hebelziel: "ausgewogen",
  } as SteuerEingaben;
  const zve = zvEAusBrutto(brutto, steuerE);
  const lsHeute = lohnsteuerMonat(zve, steuerE);
  const sozial = sozialabgaben(brutto, 0) / 12;
  const nettoHeute = brutto / 12 - lsHeute - sozial;

  // Mehr Netto: die Wohnung im Rahmen mit dem größten Steuervorteil im ersten Jahr.
  const steuerWohnung = useMemo(() => {
    const kandidaten = WOHNUNGEN.filter((w) => w.objekt.kaufpreis <= r.bis);
    const liste = (kandidaten.length ? kandidaten : [...WOHNUNGEN].sort((x, y) => x.objekt.kaufpreis - y.objekt.kaufpreis).slice(0, 1)).map((w) => {
      const z = rechne(w, 10);
      const mehr = lsHeute - lohnsteuerMonat(zve + z.j1.ergebnisVermietung, steuerE);
      return { w, z, mehr };
    });
    return liste.sort((x, y) => y.mehr - x.mehr)[0];
  }, [r.bis, lsHeute, zve, a.gemeinsamVeranlagt]); // eslint-disable-line react-hooks/exhaustive-deps
  const w = steuerWohnung.w;
  const mehr = Math.max(0, steuerWohnung.mehr);
  // Mehr netto je Objekt, wie die Objektkarten im Analysetool.
  const jeObjekt = WOHNUNGEN.map((x) => ({
    x,
    mehr: Math.max(0, lsHeute - lohnsteuerMonat(zve + rechne(x, 10).j1.ergebnisVermietung, steuerE)),
    imRahmen: x.objekt.kaufpreis <= r.bis,
  })).sort((p, q) => q.mehr - p.mehr);
  const maxMehr = Math.max(...jeObjekt.map((o) => o.mehr), 1);
  const anteilNach = steuerWohnung.z.vorSteuerMonat - mehr;
  const tilgungMonat = steuerWohnung.z.j1.tilgung / 12;

  // Altersvorsorge: bis zu drei Wohnungen, heute, nach 3 und nach 6 Jahren, Verkauf mit 67.
  const verkauf = Math.max(RENTENALTER, alter + 10);
  const fokus: Konzept = a.ziel === "steuer" ? "steuer" : "alter";
  const auswahl = useMemo(() => {
    const sortiert = [...WOHNUNGEN].sort((x, y) => Number(y.konzept === fokus) - Number(x.konzept === fokus));
    const gewaehlt: Wohnung[] = [];
    let summe = 0;
    for (const x of sortiert) if (gewaehlt.length < 3 && summe + x.objekt.kaufpreis <= Math.max(r.bis, 1)) { gewaehlt.push(x); summe += x.objekt.kaufpreis; }
    for (const x of [...WOHNUNGEN].sort((p, q) => p.objekt.kaufpreis - q.objekt.kaufpreis)) if (gewaehlt.length < 3 && !gewaehlt.includes(x)) gewaehlt.push(x);
    return gewaehlt;
  }, [r.bis, fokus]);
  const stufen = [1, 2, 3].map((n) => {
    const teile = auswahl.slice(0, n).map((x, i) => ({ x, z: rechne(x, verkauf - (alter + i * 3)) }));
    const kapital = teile.reduce((s, t) => s + t.z.erloes, 0);
    return {
      n,
      teile,
      vorSteuer: teile.reduce((s, t) => s + t.z.vorSteuerMonat, 0),
      anteil: teile.reduce((s, t) => s + t.z.anteilZehn, 0),
      wert: teile.reduce((s, t) => s + t.z.wert, 0),
      kapital,
      rente: kapital / RUHESTAND_MONATE,
    };
  });
  const maxKapital = Math.max(...stufen.map((s) => s.kapital), 1);

  const balken = (teile: Array<{ wert: number; farbe: string; text: string }>, gesamt: number) => (
    <div className="flex h-10 w-full overflow-hidden rounded-lg">
      {teile.map((t) => (
        <div key={t.text} className="flex items-center justify-center text-[11px] font-semibold whitespace-nowrap overflow-hidden" style={{ width: `${(t.wert / gesamt) * 100}%`, background: t.farbe, color: "#14231B" }} title={t.text}>
          {t.wert / gesamt > 0.35 ? t.text : ""}
        </div>
      ))}
    </div>
  );

  return (
    <div className="bos bos-crm" lang="de">
      <div className="sticky top-0 z-20 text-center text-xs sm:text-sm px-4 py-2 font-medium" style={{ background: FARBE.gold, color: FARBE.aufGold }}>
        Entwurf zur Freigabe · neue Ergebnisseite für {vorname} · Antworten oben ändern rechnet neu
      </div>

      {/* 1. Mehr Netto vom Brutto */}
      <Folie id="netto" ton="tief" kicker="Weg 1 · Mehr Netto vom Brutto" titel={`Hol dir einen Teil deiner [[Lohnsteuer]] zurück`}>
        <div className="mt-8 grid md:grid-cols-2 gap-4">
          <Karte dunkel>
            <Kopf dunkel>Heute, jeden Monat</Kopf>
            <Wert farbe={FARBE.hellText}>−{eur(lsHeute)}</Wert>
            <p className="mt-2 text-sm" style={{ color: FARBE.hellGedaempft }}>
              Lohnsteuer an das Finanzamt, von {eur(brutto / 12)} brutto. Geld, das weg ist, ohne Gegenwert für dich.
            </p>
          </Karte>
          <Karte dunkel rand={FARBE.gold}>
            <Kopf dunkel>Mit OS Real Estate, jeden Monat</Kopf>
            <Wert farbe={FARBE.gold}>+{eur(mehr)}</Wert>
            <p className="mt-2 text-sm" style={{ color: FARBE.hellGedaempft }}>
              mehr netto mit einer Wohnung wie {w.titel} ({w.beispiel}). {eur(mehr * 12)} im Jahr.
            </p>
          </Karte>
        </div>

        <Karte dunkel className="mt-4 md:p-7">
          <Kopf dunkel>Vom Brutto zum Netto, Monatsbeträge</Kopf>
          {[
            { t: "Heute", ls: lsHeute, netto: nettoHeute },
            { t: "Mit Immobilie", ls: lsHeute - mehr, netto: nettoHeute + mehr },
          ].map((z) => (
            <div key={z.t} className="mt-4">
              <div className="flex justify-between text-sm mb-1.5">
                <span>{z.t}</span>
                <span className="font-semibold tabular-nums">Netto {eur(z.netto)}</span>
              </div>
              {balken(
                [
                  { wert: z.netto, farbe: "#CFE3D8", text: `Netto ${eur(z.netto)}` },
                  { wert: z.ls, farbe: FARBE.gold, text: `Lohnsteuer ${eur(z.ls)}` },
                  { wert: sozial, farbe: "#8FA89A", text: `Sozialabgaben ${eur(sozial)}` },
                ],
                brutto / 12,
              )}
              <p className="mt-1 text-xs tabular-nums" style={{ color: FARBE.hellGedaempft }}>
                <span style={{ color: FARBE.gold }}>Lohnsteuer {eur(z.ls)}</span> · Sozialabgaben {eur(sozial)}
              </p>
            </div>
          ))}
          <p className="mt-3 text-xs" style={{ color: FARBE.hellGedaempft }}>
            Brutto bleibt gleich. Die Sozialabgaben bleiben gleich, sie bauen deine Rente und Versicherung auf. Weniger wird nur die Lohnsteuer.
          </p>
        </Karte>

        <div className="mt-4 grid md:grid-cols-[1.3fr_1fr] gap-4">
          <Karte dunkel>
            <Kopf dunkel>Der Hebel: die Abschreibung (AfA), mehr netto je Objekt</Kopf>
            {jeObjekt.map((o) => (
              <div key={o.x.id} className="mt-3">
                <div className="flex justify-between gap-3 text-sm">
                  <span style={{ color: FARBE.hellGedaempft }}>
                    {o.x.titel} · AfA {o.x.afa.toLocaleString("de-DE")} %{o.x.afa > 2 ? " mit Gutachten" : ""}
                    {!o.imRahmen && <span className="ml-1 text-[11px]">(über deinem Rahmen)</span>}
                  </span>
                  <span className="font-semibold tabular-nums" style={{ color: o.x.afa > 2 ? FARBE.gold : FARBE.hellText }}>+{eur(o.mehr)}</span>
                </div>
                <div className="mt-1 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(o.mehr / maxMehr) * 100}%`, background: o.x.afa > 2 ? FARBE.gold : "#8FA89A", opacity: o.imRahmen ? 1 : 0.5 }} />
                </div>
              </div>
            ))}
            <p className="mt-3 text-xs" style={{ color: FARBE.hellGedaempft }}>
              Je höher die Abschreibung, desto mehr netto. Die erhöhte AfA setzt ein Restnutzungsdauer-Gutachten voraus, das das Finanzamt anerkennt. Sonst gilt 2 %. Je Objekt die Beispielwohnung aus seinem Exposé, erstes Jahr.
            </p>
          </Karte>
          <Karte dunkel rand={FARBE.gold}>
            <Kopf dunkel>Unterm Strich</Kopf>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt style={{ color: FARBE.hellGedaempft }}>Zuzahlung vor Steuer</dt><dd className="tabular-nums">{eur(steuerWohnung.z.vorSteuerMonat)}</dd></div>
              <div className="flex justify-between"><dt style={{ color: FARBE.hellGedaempft }}>Mehr netto</dt><dd className="tabular-nums" style={{ color: FARBE.gold }}>−{eur(mehr)}</dd></div>
              <div className="flex justify-between border-t pt-2" style={{ borderColor: "rgba(255,255,255,0.15)" }}><dt className="font-semibold">Dein Anteil nach Steuer</dt><dd className="font-semibold tabular-nums">{eur(Math.max(0, anteilNach))}</dd></div>
              <div className="flex justify-between"><dt style={{ color: FARBE.hellGedaempft }}>Davon Tilgung, dein Vermögen</dt><dd className="tabular-nums">{eur(tilgungMonat)}</dd></div>
            </dl>
            <p className="mt-3 text-sm" style={{ color: FARBE.hellText }}>Deine Steuerersparnis zahlt deine Wohnung mit. Was du selbst einzahlst, landet in deinem eigenen Vermögen.</p>
          </Karte>
        </div>
        <Fussnote dunkel>
          Beispielrechnung, keine Zusage. {eur(brutto)} brutto im Jahr als Beispiel für deine Spanne, Steuerklasse {a.gemeinsamVeranlagt ? "III" : "I"}, kinderlos, ohne Kirchensteuer, Werte 2026.
          {` ${w.titel}, ${w.beispiel}, Kaufpreis ${eur(w.objekt.kaufpreis)}, Zahlen aus dem Exposé, voll finanziert zu 4,8 % Zins und 1,2 % Tilgung, erstes Jahr.`} Über einen
          Lohnsteuerermäßigungsantrag kommt der Effekt jeden Monat an, sonst einmal im Jahr über die Steuererklärung. Die Zinsen sinken jährlich, damit auch der Effekt.
        </Fussnote>
      </Folie>

      {/* 2. Altersvorsorge */}
      <Folie id="alter" ton="gruen" kicker="Weg 2 · Altersvorsorge" titel="Mit jeder Wohnung wächst [[dein Vermögen]]">
        <label className="mt-6 flex flex-wrap items-center gap-3 text-sm" style={{ color: FARBE.hellGedaempft }}>
          Dein Alter heute (im Entwurf zum Ausprobieren):
          <input type="range" min={25} max={55} value={alter} onChange={(e) => setAlter(Number(e.target.value))} />
          <b style={{ color: FARBE.hellText }}>{alter} Jahre</b>
        </label>
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          {stufen.map((s) => (
            <Karte key={s.n} dunkel rand={s.n === 3 ? FARBE.gold : undefined}>
              <Kopf dunkel>{s.n === 1 ? "1 Wohnung" : `${s.n} Wohnungen`}</Kopf>
              <div className="mt-3 h-28 flex items-end">
                <div className="w-full rounded-t-md" style={{ height: `${(s.kapital / maxKapital) * 100}%`, background: s.n === 3 ? FARBE.gold : "rgba(204,172,5,0.55)" }} />
              </div>
              <Wert klein farbe={FARBE.gold}>{mio(s.kapital)}</Wert>
              <p className="mt-1 text-xs" style={{ color: FARBE.hellGedaempft }}>Kapital mit {verkauf} nach Verkauf und Ablösung</p>
              <p className="mt-3 text-lg font-semibold">≈ {eur(s.rente)} im Monat</p>
              <p className="text-xs" style={{ color: FARBE.hellGedaempft }}>Zusatzrente über 25 Jahre</p>
              <ul className="mt-3 space-y-1 text-xs" style={{ color: FARBE.hellGedaempft }}>
                {s.teile.map((t, i) => (
                  <li key={t.x.id + i}>mit {alter + i * 3}: {t.x.titel}, {eur(t.x.objekt.kaufpreis)}</li>
                ))}
              </ul>
            </Karte>
          ))}
        </div>
        <Karte dunkel className="mt-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead style={{ background: "transparent" }}>
              <tr style={{ color: FARBE.hellGedaempft, background: "transparent" }}>
                <th className="text-left font-medium py-1.5" style={{ background: "transparent" }} />
                {stufen.map((s) => <th key={s.n} className="text-right font-medium" style={{ background: "transparent", color: FARBE.hellGedaempft }}>{s.n === 1 ? "1 Wohnung" : `${s.n} Wohnungen`}</th>)}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[
                ["Zuzahlung vor Steuer, Jahr 1", (s: (typeof stufen)[number]) => eur(s.vorSteuer)],
                ["Dein Anteil nach Steuer, Ø 10 Jahre", (s: (typeof stufen)[number]) => eur(s.anteil)],
                [`Immobilienwert mit ${verkauf}`, (s: (typeof stufen)[number]) => mio(s.wert)],
                [`Kapital mit ${verkauf}`, (s: (typeof stufen)[number]) => mio(s.kapital)],
                ["Zusatzrente im Monat", (s: (typeof stufen)[number]) => `≈ ${eur(s.rente)}`],
              ].map(([t, f]) => (
                <tr key={t as string} className="border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                  <td className="py-2" style={{ color: FARBE.hellGedaempft }}>{t as string}</td>
                  {stufen.map((s) => <td key={s.n} className="text-right">{(f as (s: (typeof stufen)[number]) => string)(s)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Karte>
        <Fussnote dunkel>
          Beispielrechnung, keine Zusage. Wohnungen aus unserem Bestand mit den Zahlen ihrer Exposés, gekauft mit {alter}, {alter + 3} und {alter + 6} Jahren,
          alle mit {verkauf} verkauft (nach mindestens 10 Jahren steuerfrei), 4 % Verkaufskosten, Wert und Miete wie im Exposé-Szenario, 4,8 % Zins und 1,2 %
          Tilgung bis zum Verkauf. Zusatzrente: Kapital ohne Zinsen auf 25 Jahre verteilt. Die Bank prüft jeden weiteren Kauf neu.
        </Fussnote>
      </Folie>

      <Folie id="weiter" ton="hell" kicker="Danach wie bisher" titel="Deine Objekte und [[dein Handbuch]]">
        <p className="mt-6 max-w-3xl text-base leading-relaxed" style={{ color: FARBE.grau }}>
          Darunter folgen wie heute dein Rahmen, unsere Objekte zu deinem Rahmen und das Handbuch mit allen 14 Kapiteln. Beim Bau bekommen Kapitel 6, 7 und 9
          dieselben Grafiken wie oben, auch im PDF, damit Handbuch, Analysetool, Beratungspräsentation und Exposé gleich rechnen und gleich sprechen.
        </p>
      </Folie>
    </div>
  );
}
