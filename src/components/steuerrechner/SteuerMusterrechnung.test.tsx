/**
 * Die Beispielrechnung auf der Ergebnisseite.
 *
 * Geprueft wird genau das, was hier schiefgehen kann und schon einmal
 * schiefgegangen ist:
 *
 *   1  Beschriftung und Wert muessen zusammenpassen. Beim Erhaltungsaufwand
 *      stand einmal die Ersparnis unter dem Namen des Aufwands, und die Zahl
 *      sah deshalb um ein Vielfaches zu niedrig aus. Beide Groessen stehen
 *      jetzt getrennt, und dieser Test haelt sie auseinander.
 *   2  Es darf keine zweite Wahrheit entstehen. Die grosse Zahl im Kopf der
 *      Beispielrechnung muss dieselbe sein, die der Rechenkern als unteres
 *      Ende der Zehnjahresspanne liefert.
 *   3  Die Aufteilung „wer zahlt die monatlichen Kosten“ muss aufgehen. Drei
 *      Anteile, die zusammen nicht die Gesamtkosten ergeben, waeren eine
 *      falsche Aussage in der wichtigsten Grafik der Seite.
 *   4  Es muss erkennbar ein BEISPIEL sein und nicht das eigene Ergebnis.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import SteuerMusterrechnung from "./SteuerMusterrechnung";
import { berechne, QUOTEN, BETRACHTUNG_JAHRE } from "@/lib/steuerRechner";
import { standardAntworten, zuEingaben, type SteuerAntworten } from "@/lib/steuerrechnerStrecke";

const ANTWORTEN: SteuerAntworten = {
  ...standardAntworten(),
  jahresbrutto: 85000,
  beschaeftigung: "angestellt",
  startzeitpunkt: "sofort",
};

const ergebnis = () => berechne(zuEingaben(ANTWORTEN));

/* Wie in `SteuerErgebnis.test.tsx`: Zwischen Betrag und Waehrungszeichen
   steht ein geschuetztes Leerzeichen. Testing Library vereinheitlicht den
   Text im Dokument, nicht aber den Suchbegriff, deshalb hier dasselbe. */
const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  })
    .format(Math.round(n))
    .replace(/\s/g, " ");

/**
 * Die Zeile zu einer Bezeichnung, also der Kasten, der Beschriftung UND
 * Betrag traegt. Genau auf diesen Kasten kommt es an: Nur wer beides
 * zusammen prueft, merkt, wenn ein Betrag unter der falschen Beschriftung
 * steht.
 *
 * Die Aufstellungen benutzen `div`, die Aufteilung der Monatskosten `li`.
 */
function zeileZu(text: string | RegExp): HTMLElement {
  const beschriftung = screen.getByText(text);
  const zeile = beschriftung.closest("li") ?? beschriftung.closest("div.flex");
  if (!zeile) throw new Error(`Zur Beschriftung "${String(text)}" gibt es keine Zeile`);
  return zeile as HTMLElement;
}

describe("Die Beispielrechnung", () => {
  it("ist als Beispiel ausgewiesen und nennt das typisierte Objekt", () => {
    render(<SteuerMusterrechnung ergebnis={ergebnis()} onHandlung={vi.fn()} />);
    expect(screen.getByText("Beispielrechnung")).toBeTruthy();
    expect(screen.getAllByText(/typisierten Objekt/).length).toBeGreaterThan(0);
    // Der Haftungshinweis bleibt sichtbar, auch in der Beispielrechnung.
    expect(screen.getAllByText(/keine Steuerberatung/i).length).toBeGreaterThan(0);
  });

  it("zeigt im Kopf dieselbe Zehnjahreszahl wie der Rechenkern", () => {
    const r = ergebnis();
    render(<SteuerMusterrechnung ergebnis={r} onHandlung={vi.fn()} />);
    /* Die Beispielrechnung folgt seit dem 17.09.2026 dem LEITWEG, also
       demselben Abschreibungssatz wie der Kopf der Seite. Die abgesicherte
       Zahl ohne Gutachten steht daneben. */
    expect(screen.getAllByText(eur(r.spanne.zehnJahre.bis)).length).toBeGreaterThan(0);
    // Der Monatswert ist die Jahresersparnis durch zwoelf, nicht irgendeine Zahl.
    expect(
      screen.getByText(
        new RegExp(`${eur(r.spanne.erhoeht.ersparnisJahr)}.*${eur(r.spanne.erhoeht.ersparnisJahr / 12)}`),
      ),
    ).toBeTruthy();
    expect(document.body.textContent?.replace(/\s/g, " ")).toContain(
      eur(r.spanne.zehnJahre.von),
    );
  });

  it("haelt Erhaltungsaufwand und die Ersparnis daraus auseinander", () => {
    const r = ergebnis();
    render(<SteuerMusterrechnung ergebnis={r} onHandlung={vi.fn()} />);

    const aufwand = zeileZu("Erhaltungsaufwand, den du bezahlst");
    expect(within(aufwand).getByText(`bis zu ${eur(r.spanne.erhaltung.bruttoAufwand)}`)).toBeTruthy();

    const ersparnis = zeileZu("Steuerersparnis daraus");
    expect(
      within(ersparnis).getByText(`bis zu ${eur(r.spanne.erhaltung.ersparnisEinmalig)}`),
    ).toBeTruthy();

    /* Die beiden duerfen nicht derselbe Betrag sein, sonst waere wieder eine
       der beiden Zahlen an die falsche Stelle geraten. */
    expect(r.spanne.erhaltung.bruttoAufwand).toBeGreaterThan(
      r.spanne.erhaltung.ersparnisEinmalig,
    );
  });

  it("rechnet die Eckdaten aus dem typisierten Objekt und dem Bundesland", () => {
    const r = ergebnis();
    const o = r.spanne.objekt;
    render(<SteuerMusterrechnung ergebnis={r} onHandlung={vi.fn()} />);

    expect(within(zeileZu("Kaufpreis")).getByText(eur(o.preis))).toBeTruthy();
    expect(
      within(zeileZu("Darlehenssumme")).getByText(eur(o.preis)),
    ).toBeTruthy();
    expect(
      within(zeileZu("Eigenkapital, dein Kapitaleinsatz")).getByText(
        eur(o.preis * (r.nebenkostenProzent / 100)),
      ),
    ).toBeTruthy();
    expect(
      within(zeileZu("Kaltmiete monatlich, Soll")).getByText(eur(o.kaltmieteSoll / 12)),
    ).toBeTruthy();
    // Das Mietausfallwagnis steht als eigene Zeile da und ist nicht still in
    // die Miete hineingerechnet.
    expect(
      within(zeileZu("Mietausfallwagnis")).getByText(`-${eur(o.mietausfall / 12)}`),
    ).toBeTruthy();
    expect(
      within(zeileZu("Kaltmiete, mit der gerechnet wird")).getByText(eur(o.kaltmiete / 12)),
    ).toBeTruthy();
    expect(within(zeileZu("Haltedauer")).getByText(`${BETRACHTUNG_JAHRE} Jahre`)).toBeTruthy();
  });

  it("zeigt den steuerlichen Verlust und die Ersparnis des ersten Jahres aus dem Rechenkern", () => {
    const r = ergebnis();
    render(<SteuerMusterrechnung ergebnis={r} onHandlung={vi.fn()} />);
    expect(
      within(zeileZu("Steuerlicher Verlust aus Vermietung")).getByText(
        `-${eur(r.spanne.erhoeht.verlust)}`,
      ),
    ).toBeTruthy();
    expect(
      within(zeileZu("Deine Steuerersparnis im ersten Jahr")).getByText(
        eur(r.spanne.erhoeht.ersparnisJahr),
      ),
    ).toBeTruthy();
    expect(
      within(zeileZu("Abschreibung Gebäude")).getByText(`-${eur(r.spanne.erhoeht.afaJahr)}`),
    ).toBeTruthy();
    /* Der gesetzliche Satz muss in derselben Zeile als Rueckfall stehen, sonst
       sieht der Leser nur die guenstigere der beiden Zahlen. */
    expect(zeileZu("Abschreibung Gebäude").textContent?.replace(/\s/g, " ")).toContain(
      eur(r.spanne.regulaer.afaJahr),
    );
  });

  it("teilt die monatlichen Kosten vollstaendig auf Mieter, Finanzamt und dich auf", () => {
    const r = ergebnis();
    render(<SteuerMusterrechnung ergebnis={r} onHandlung={vi.fn()} />);

    /* Dieselbe Ableitung wie in der Komponente, damit der Test wirklich die
       Aufteilung prueft und nicht nur die Anwesenheit dreier Zahlen. Die
       Grundlage ist der Plan des Rechenkerns, nicht mehr eine eigene Rechnung
       aus Quoten. */
    const j1 = r.spanne.plan[0];
    const gesamt = (j1.zinsen + j1.tilgung + j1.kosten) / 12;
    const mieter = Math.min(j1.miete / 12, gesamt);
    const finanzamt = Math.min(j1.ersparnis / 12, Math.max(0, gesamt - mieter));
    const du = Math.max(0, gesamt - mieter - finanzamt);

    expect(within(zeileZu("Der Mieter")).getByText(eur(mieter))).toBeTruthy();
    expect(within(zeileZu("Das Finanzamt")).getByText(eur(finanzamt))).toBeTruthy();
    expect(within(zeileZu("Du")).getByText(eur(du))).toBeTruthy();

    /* Die Aufteilung geht auf: kein Rest, keine Ueberdeckung. */
    expect(mieter + finanzamt + du).toBeCloseTo(gesamt, 6);
  });

  /*
   * Die Zehnjahressicht steht seit dem 17.09.2026 in der Ergebniskarte und
   * nicht mehr hier. Was hier bleibt, ist das erste Jahr, und es folgt
   * derselben Ordnung: Aufbau, Zahlungsstrom, Einsatz, Summe. Vorher zog die
   * Zehnjahreskarte den Kapitaleinsatz ab und die Jahreskarte nicht.
   */
  it("rechnet das erste Jahr in derselben Ordnung wie die Zehnjahressicht", () => {
    const r = ergebnis();
    const j1 = r.spanne.plan[0];
    const v = r.spanne.vermoegen;
    render(<SteuerMusterrechnung ergebnis={r} onHandlung={vi.fn()} />);

    const wertsteigerungJahr1 = v.wertsteigerung / BETRACHTUNG_JAHRE;
    const aufbau = j1.tilgung + wertsteigerungJahr1;

    expect(within(zeileZu("Tilgung")).getByText(`+ ${eur(j1.tilgung)}`)).toBeTruthy();
    expect(
      within(zeileZu("Vermögensaufbau im ersten Jahr")).getByText(eur(aufbau)),
    ).toBeTruthy();
    expect(
      within(zeileZu("Deine Zuzahlung im ersten Jahr")).getByText(
        `- ${eur(Math.abs(j1.cashflowNachSteuer))}`,
      ),
    ).toBeTruthy();
    expect(
      within(zeileZu("Dein Einsatz beim Kauf")).getByText(`- ${eur(v.eigenkapital)}`),
    ).toBeTruthy();
    expect(
      within(zeileZu("Unter dem Strich nach einem Jahr")).getByText(
        eur(aufbau + j1.cashflowNachSteuer - v.eigenkapital),
      ),
    ).toBeTruthy();
  });

  it("verspricht nicht, dass die Wohnung sich selbst traegt", () => {
    // Vorher stand hier „Die Wohnung finanziert sich zum groessten Teil aus der
    // Miete und aus der Steuer“. Das klang wie eine Zusage und stimmte nur,
    // weil die laufenden Kosten zu niedrig angesetzt waren.
    const r = ergebnis();
    render(<SteuerMusterrechnung ergebnis={r} onHandlung={vi.fn()} />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/finanziert sich zum größten Teil/);
    expect(text).not.toMatch(/kommt nicht von dir/);
    // Stattdessen die Aussage, die auch nach den hoeheren laufenden Kosten
    // noch stimmt: Was zugezahlt wird, ist Tilgung und damit Vermoegen.
    expect(text).toMatch(/geht damit vollständig in die Tilgung|Tilgung, also Geld, das nicht weg ist/);
  });
});
