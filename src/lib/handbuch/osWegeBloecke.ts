/**
 * Die zwei Wege als Bausteine für Handbuch und PDF (seit dem 17.10.2026):
 * Kapitel 6 bekommt „Mehr Netto vom Brutto“, Kapitel 8 „Eine, zwei, drei
 * Wohnungen“. Dieselben Zahlen zeigt die Ergebnisseite oben (WegeAnsicht).
 * Im Aufbau mit `inSprache` aufrufen, wie alle Texte des Handbuchs.
 */
import type { Block } from "./bausteine";
import { euro, saeulenGruppen, tx, waagerecht } from "./diagramme";
import type { NettoWeg, VorsorgeWeg } from "./osWege";

const prozent = (n: number) => tx(`${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`, `${n.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`);
const mio = (n: number) =>
  tx(
    `${(n / 1_000_000).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mio. €`,
    `€${(n / 1_000_000).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}m`,
  );

export function nettoBloecke(n: NettoWeg): Block[] {
  const w = n.wohnung;
  const nettoNeu = n.nettoHeute + n.mehrNetto;
  return [
    { typ: "h2", text: tx("Mehr Netto vom Brutto", "More net from your gross") },
    {
      typ: "zahlen",
      werte: [
        { wert: `−${euro(n.lohnsteuerHeute)}`, text: tx("Lohnsteuer heute, jeden Monat an das Finanzamt", "Income tax today, every month to the tax office") },
        { wert: `+${euro(n.mehrNetto)}`, text: tx(`mehr netto im Monat mit ${w.titel}`, `more net a month with ${w.titel}`) },
        { wert: euro(n.mehrNetto * 12), text: tx("im Jahr zurück", "back per year") },
      ],
    },
    {
      typ: "tabelle",
      titel: tx("Vom Brutto zum Netto, Monatsbeträge", "From gross to net, monthly amounts"),
      kopf: ["", tx("Heute", "Today"), tx("Mit Immobilie", "With property")],
      rechtsAb: 1,
      zeilen: [
        { zellen: [tx("Bruttogehalt", "Gross salary"), euro(n.bruttoMonat), euro(n.bruttoMonat)] },
        { zellen: [tx("Lohnsteuer", "Income tax"), `−${euro(n.lohnsteuerHeute)}`, `−${euro(n.lohnsteuerHeute - n.mehrNetto)}`], toene: [undefined, "minus", "minus"] },
        { zellen: [tx("Sozialabgaben", "Social security"), `−${euro(n.sozialabgaben)}`, `−${euro(n.sozialabgaben)}`], toene: [undefined, "minus", "minus"] },
        { zellen: [tx("Netto", "Net"), euro(n.nettoHeute), `${euro(nettoNeu)} (+${euro(n.mehrNetto)})`], summe: true },
      ],
    },
    {
      typ: "grafik",
      titel: tx("Der Hebel: die Abschreibung, mehr netto je Objekt", "The lever: depreciation, more net per property"),
      untertitel: tx(
        "Je Objekt die Beispielwohnung aus seinem Exposé, erstes Jahr, mit deinem Steuersatz. Hell: über deinem Rahmen.",
        "For each property the example flat from its listing, first year, at your tax rate. Light: above your budget.",
      ),
      zeichnung: waagerecht({
        zeilen: n.jeObjekt.map((o) => ({
          bezeichnung: `${o.wohnung.titel} · AfA ${prozent(o.wohnung.afaProzent)}`,
          wert: Math.round(o.mehrNetto),
          farbe: o.imRahmen ? (o.wohnung.afaProzent > 2 ? "akzent" : "tinte") : "grau",
        })),
        breite: 660,
        zeilenhoehe: 40,
        bezeichnungBreite: 280,
        beschreibung: tx("Mehr netto im Monat je Objekt im ersten Jahr.", "More net per month per property in the first year."),
      }),
    },
    {
      typ: "kasten",
      ton: "dich",
      titel: tx("Unterm Strich", "Bottom line"),
      text: tx(
        `Vor Steuer zahlst du für ${w.titel} im ersten Jahr ${euro(n.vorSteuer)} im Monat zu. Dein Finanzamt gibt dir ${euro(n.mehrNetto)} davon zurück, dein Anteil nach Steuer sind ${euro(Math.max(0, n.anteilNachSteuer))}. Gleichzeitig tilgst du anfangs rund ${euro(n.tilgungAnfang)} im Monat: Das landet in deinem eigenen Vermögen.`,
        `Before tax you pay ${euro(n.vorSteuer)} a month towards ${w.titel} in the first year. The tax office gives you ${euro(n.mehrNetto)} of that back, your share after tax is ${euro(Math.max(0, n.anteilNachSteuer))}. At the same time you repay around ${euro(n.tilgungAnfang)} a month at the start, which goes into your own wealth.`,
      ),
    },
    {
      typ: "fussnote",
      text: tx(
        `Beispielrechnung, keine Zusage und keine Steuerberatung. Brutto als Beispiel für deine Spanne, Grenzsteuersatz rund ${n.grenzsatz} %, kinderlos, ohne Kirchensteuer, Werte 2026. ${w.titel}, ${w.beispiel}, Kaufpreis ${euro(w.objekt.kaufpreis)}, Zahlen aus dem Exposé, voll finanziert zu 4,8 % Zins und 1,2 % Tilgung, AfA ${prozent(w.afaProzent)}${w.afaProzent > 2 ? " nur mit anerkanntem Restnutzungsdauer-Gutachten, sonst 2 %" : ""}. Über einen Lohnsteuerermäßigungsantrag kommt der Effekt jeden Monat an, sonst einmal im Jahr über die Steuererklärung. Die Zinsen sinken jährlich, damit auch der Effekt.`,
        `Example calculation, not a commitment and not tax advice. Gross as an example for your range, marginal tax rate about ${n.grenzsatz}%, no children, no church tax, 2026 values. ${w.titel}, ${w.beispiel}, purchase price ${euro(w.objekt.kaufpreis)}, figures from the listing, fully financed at 4.8% interest and 1.2% repayment, depreciation ${prozent(w.afaProzent)}${w.afaProzent > 2 ? " only with an accepted remaining useful life report, otherwise 2%" : ""}. With a wage tax reduction application the effect arrives every month, otherwise once a year with the tax return. Interest falls every year, and so does the effect.`,
      ),
    },
  ];
}

export function vorsorgeBloecke(v: VorsorgeWeg): Block[] {
  const s3 = v.stufen[2];
  return [
    { typ: "h2", text: tx("Altersvorsorge: mit jeder Wohnung wächst dein Vermögen", "Retirement provision: your wealth grows with every flat") },
    {
      typ: "absatz",
      text: tx(
        `Gerechnet mit ${v.alter} Jahren: heute eine Wohnung, nach drei und nach sechs Jahren die nächste, alle mit ${v.verkaufsAlter} verkauft. Mieter und Finanzamt tragen den größten Teil der Raten, zum Rentenbeginn bleibt dein Kapital.`,
        `Calculated at age ${v.alter}: one flat today, the next after three and after six years, all sold at ${v.verkaufsAlter}. Tenants and the tax office carry most of the instalments, and at retirement your capital remains.`,
      ),
    },
    {
      typ: "grafik",
      titel: tx(`Dein Kapital mit ${v.verkaufsAlter}, nach Verkauf und Ablösung`, `Your capital at ${v.verkaufsAlter}, after sale and repayment`),
      zeichnung: saeulenGruppen({
        gruppen: v.stufen.map((s) => ({ bezeichnung: s.anzahl === 1 ? tx("1 Wohnung", "1 flat") : tx(`${s.anzahl} Wohnungen`, `${s.anzahl} flats`), werte: [Math.round(s.kapital)] })),
        serienNamen: [tx("Kapital", "Capital")],
        farben: ["akzent"],
        breite: 660,
        hoehe: 260,
        hervor: 2,
        beschreibung: tx(
          `Kapital mit ${v.verkaufsAlter}: ${v.stufen.map((s) => mio(s.kapital)).join(", ")}.`,
          `Capital at ${v.verkaufsAlter}: ${v.stufen.map((s) => mio(s.kapital)).join(", ")}.`,
        ),
      }),
    },
    {
      typ: "tabelle",
      kopf: ["", tx("1 Wohnung", "1 flat"), tx("2 Wohnungen", "2 flats"), tx("3 Wohnungen", "3 flats")],
      rechtsAb: 1,
      zeilen: [
        { zellen: [tx("Zuzahlung vor Steuer, Jahr 1", "Contribution before tax, year 1"), ...v.stufen.map((s) => euro(s.vorSteuer))] },
        { zellen: [tx("Dein Anteil nach Steuer, Ø 10 Jahre", "Your share after tax, avg. 10 years"), ...v.stufen.map((s) => euro(s.anteil))] },
        { zellen: [tx(`Immobilienwert mit ${v.verkaufsAlter}`, `Property value at ${v.verkaufsAlter}`), ...v.stufen.map((s) => mio(s.verkaufswert))] },
        { zellen: [tx(`Kapital mit ${v.verkaufsAlter}`, `Capital at ${v.verkaufsAlter}`), ...v.stufen.map((s) => mio(s.kapital))] },
        { zellen: [tx("Zusatzrente im Monat", "Additional pension per month"), ...v.stufen.map((s) => `≈ ${euro(s.renteMonat)}`)], summe: true },
      ],
    },
    {
      typ: "liste",
      punkte: s3.wohnungen.map((w) =>
        tx(
          `Mit ${w.kaufAlter}: ${w.wohnung.titel}, ${w.wohnung.ort}, ${euro(w.wohnung.objekt.kaufpreis)}`,
          `At ${w.kaufAlter}: ${w.wohnung.titel}, ${w.wohnung.ort}, ${euro(w.wohnung.objekt.kaufpreis)}`,
        ),
      ),
    },
    {
      typ: "fussnote",
      text: tx(
        `Beispielrechnung, keine Zusage. Wohnungen aus unserem Bestand mit den Zahlen ihrer Exposés, Miete und Wert wie im Exposé-Szenario, 4,8 % Zins und 1,2 % Tilgung bis zum Verkauf, Verkauf nach Ablauf der zehnjährigen Spekulationsfrist (§ 23 EStG), 4 % Verkaufskosten. Zusatzrente: Kapital ohne Zinsen auf 25 Jahre verteilt.${v.ueberRahmen ? " Zusammen liegen die Kaufpreise über deinem heutigen Rahmen: Die Bank prüft jeden weiteren Kauf neu." : ""} Dein Alter stellst du auf der Seite mit dem Regler ein, das PDF rechnet mit diesem Alter.`,
        `Example calculation, not a commitment. Flats from our portfolio with the figures from their listings, rent and value as in the listing scenario, 4.8% interest and 1.2% repayment until the sale, sale after the ten-year holding period (§ 23 EStG), 4% selling costs. Additional pension: capital spread over 25 years without interest.${v.ueberRahmen ? " Together the purchase prices are above your current budget: the bank checks every further purchase anew." : ""} You set your age with the slider on the page, and the PDF uses that age.`,
      ),
    },
  ];
}
