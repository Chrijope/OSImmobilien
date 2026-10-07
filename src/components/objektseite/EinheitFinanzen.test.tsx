import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EinheitFinanzen } from "./EinheitFinanzen";
import { berechneExpose } from "@/lib/exposeRechner";
import { annahmenVorbelegen, exposeObjektdatenAus } from "@/lib/exposeInhalt";
import { eur0, prozent } from "@/lib/objektKennzahlen";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * Der Reiter Finanzen der Einheiten-Seite: Parameterpanel links, Karten
 * rechts, alles aus berechneExpose. Geprüft wird, dass die Karten dieselben
 * Zahlen zeigen wie der Rechenkern und dass die Schalter der Vorlage wirken.
 */

beforeAll(() => {
  // Radix Slider misst die Bahn, jsdom kennt keinen ResizeObserver.
  class RO { observe() { /* leer */ } unobserve() { /* leer */ } disconnect() { /* leer */ } }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  // Radix Select braucht in jsdom diese Methoden.
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});

const HEUTE = new Date(2026, 8, 2);

const WOHNUNG: ObjektWohnung = {
  id: "w7", weNr: "WE 7", etage: "2. OG", lage: "rechts", groesse: 65, zimmer: 2, mieteGesamt: 863, vkGesamt: 246800, qmPreis: 0, rendite: 0,
  vermietet: true, status: "frei", stellplatzPreis: 12000, sanierungAnteilProzent: 7.1, hausgeldNichtUmlagefaehigEuro: 104, verwaltungSevMonat: 25,
};

const OBJEKT = {
  // Zahlen der Vorlage (Söflinger Straße 203, Ulm). PLZ 70173 Stuttgart, weil detectBundesland 89xxx pauschal Bayern zuordnet.
  id: "o1", titel: "Söflinger Straße 203", adresse: "Söflinger Straße 203", plz: "70173", ort: "Stuttgart", beschreibung: "", highlights: [],
  bildUrl: "", bilder: [], dokumente: [], wohnungen: [WOHNUNG], videoUrl: "", videoSichtbar: false, badge: "",
  groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true, erstellt_am: "2026-01-01",
  globalDaten: { baujahr: 1954, hausgeldMonat: 250 },
  afaDaten: { afaModell: "linear", afaSatz: 2.5, restnutzungsdauer: 40, grundstueckAnteil: 25 },
  sanierungskosten: 100000,
  meta: { sanierungen: [{ jahr: "2027", massnahme: "Fassade und Dach", betrag: 100000 }] },
} as unknown as ObjektData;

function renderFinanzen(objekt: ObjektData = OBJEKT, wohnung: ObjektWohnung = WOHNUNG) {
  return render(<MemoryRouter><EinheitFinanzen objekt={objekt} wohnung={wohnung} heute={HEUTE} /></MemoryRouter>);
}

const erwartet = (aenderung: Parameters<typeof berechneExpose>[1] extends infer A ? Partial<A> : never = {}) => {
  const v = annahmenVorbelegen(OBJEKT, WOHNUNG, null, HEUTE);
  return berechneExpose(exposeObjektdatenAus(OBJEKT, WOHNUNG, HEUTE), { ...v.annahmen, ...aenderung });
};

const thumb = (testId: string) => within(screen.getByTestId(testId)).getByRole("slider");
const text = (testId: string) => screen.getByTestId(testId).textContent ?? "";

describe("Reiter Finanzen der Einheiten-Seite", () => {
  it("zeigt die Karten mit denselben Zahlen wie berechneExpose", () => {
    renderFinanzen();
    const e = erwartet();
    expect(screen.getByTestId("finanzierungsparameter")).toBeInTheDocument();
    expect(text("fin-eigeninvestition")).toBe(eur0(e.kauf.eigenkapitaleinsatz));
    expect(text("fin-darlehen")).toBe(eur0(e.kauf.darlehen));
    expect(text("fin-rate")).toBe(eur0(e.finanzierung.monatsrate));
    expect(text("fin-brutto")).toBe(prozent(e.kennzahlen.mietrenditeProzent, 2));
    expect(text("fin-netto")).toBe(prozent(e.kennzahlen.nettomietrenditeProzent, 2));
    expect(text("kp-gesamt")).toBe(eur0(258800));
    expect(text("kp-gebaeude")).toBe(eur0(258800 * 0.75));
    expect(text("kp-afa-basis")).toBe(eur0(e.steuer.afaBasis));
    expect(text("kp-afa-satz")).toBe("2,5 %");
    expect(screen.queryByTestId("afa-angepasst")).not.toBeInTheDocument();
    expect(text("nk-grest")).toBe(eur0(e.kauf.nebenkosten.grunderwerbsteuer));
    expect(text("nk-notar")).toBe(eur0(e.kauf.nebenkosten.gebuehren.zeileNotarKaufvertrag));
    expect(text("nk-grundschuld")).toBe(eur0(e.kauf.nebenkosten.gebuehren.zeileGrundschuld));
    expect(text("nk-grundbuch")).toBe(eur0(e.kauf.nebenkosten.gebuehren.zeileGrundbuch));
    expect(text("nk-gesamt")).toContain(eur0(e.kauf.nebenkosten.summe));
    expect(screen.getByText(/Grunderwerbsteuer \(Baden-Württemberg, 5,0 %\)/)).toBeInTheDocument();
    expect(text("monat-miete")).toBe(eur0(e.monat.miete));
    expect(text("monat-steuervorteil")).toBe(eur0(e.monat.steuervorteil));
    expect(text("monat-ausgaben")).toBe(eur0(e.monat.ausgaben));
    expect(text("monat-eigenanteil")).toBe(eur0(Math.abs(e.monat.eigenanteil)));
    expect(text("monat-text")).toBe("Werte ab Oktober 2026");
    expect(text("restschuld-10")).toBe(eur0(e.jahresreihe[9].restschuldEnde));
    expect(text("vermoegen-10")).toContain(eur0(e.vermoegensaufbau[0].vermoegen));
  });

  it("Sanierungskarte: Maßnahme, Anteil und Steuerersparnis, nur mit Sanierungsdaten", () => {
    renderFinanzen();
    const e = erwartet();
    expect(e.steuer.sanierungsanteil).toBeCloseTo(7100, 6);
    expect(text("san-gesamt")).toBe(eur0(100000));
    expect(text("san-anteil")).toBe(eur0(7100));
    expect(text("san-ersparnis")).toBe(`≈ ${eur0(e.steuer.einmaligeSteuerersparnisSanierung)}`);
    expect(screen.getByText("Fertigstellung 2027")).toBeInTheDocument();
  });

  it("ohne Sanierungsdaten fehlt die Sanierungskarte", () => {
    renderFinanzen({ ...OBJEKT, sanierungskosten: 0, meta: {} } as ObjektData, { ...WOHNUNG, sanierungAnteilProzent: undefined });
    expect(screen.queryByTestId("karte-sanierung")).not.toBeInTheDocument();
  });

  it("Laufzeitmodus berechnet die Tilgung aus der Laufzeit", () => {
    renderFinanzen();
    fireEvent.click(screen.getByTestId("tilgungsmodus-laufzeit"));
    expect(screen.getByTestId("regler-laufzeit")).toBeInTheDocument();
    expect(screen.queryByTestId("regler-tilgung")).not.toBeInTheDocument();
    const e = erwartet({ tilgungsmodus: "laufzeit", laufzeitJahre: 30 });
    expect(text("tilgung-berechnet")).toBe(prozent(e.finanzierung.tilgungProzent, 2));
    expect(text("fin-tilgung")).toBe(prozent(e.finanzierung.tilgungProzent, 2));
    expect(screen.getByText("Tilgung (aus 30 Jahren Laufzeit)")).toBeInTheDocument();
    expect(text("fin-rate")).toBe(eur0(e.finanzierung.monatsrate));
    fireEvent.keyDown(thumb("regler-laufzeit"), { key: "ArrowLeft" });
    expect(screen.getByTestId("regler-laufzeit-wert")).toHaveTextContent("29 Jahre");
    expect(text("tilgung-berechnet")).toBe(prozent(erwartet({ tilgungsmodus: "laufzeit", laufzeitJahre: 29 }).finanzierung.tilgungProzent, 2));
  });

  it("zweites Darlehen wirkt auf Rate und Restschuld", () => {
    renderFinanzen();
    const ohne = erwartet();
    fireEvent.click(screen.getByTestId("schalter-zweites"));
    const betrag = within(screen.getByTestId("finanzierungsparameter")).getAllByRole("textbox")[1];
    fireEvent.focus(betrag);
    fireEvent.change(betrag, { target: { value: "50000" } });
    fireEvent.blur(betrag);
    const mit = erwartet({ zweitesDarlehenAktiv: true, zweitesDarlehenBetrag: 50000 });
    expect(mit.finanzierung.zweitesDarlehen?.betrag).toBe(50000);
    expect(text("zweites-rate")).toBe(eur0(mit.finanzierung.zweitesDarlehen?.monatsrate ?? 0));
    expect(text("fin-bankdarlehen")).toBe(eur0(208800));
    expect(text("fin-zweites")).toBe(eur0(50000));
    expect(text("fin-rate")).toBe(eur0(mit.finanzierung.monatsrate));
    expect(text("fin-rate")).not.toBe(eur0(ohne.finanzierung.monatsrate));
    expect(text("restschuld-10")).toBe(eur0(mit.jahresreihe[9].restschuldEnde));
    expect(text("restschuld-10")).not.toBe(eur0(ohne.jahresreihe[9].restschuldEnde));
  });

  it("Verkäufer übernimmt die Nebenkosten: Eigeninvestition 0", () => {
    renderFinanzen();
    fireEvent.click(screen.getByTestId("erweitert"));
    fireEvent.click(screen.getByTestId("schalter-verkaeufer"));
    expect(text("fin-eigeninvestition")).toBe(eur0(0));
    expect(text("fin-nebenkosten")).toBe(`${eur0(0)} (Verkäufer)`);
    // Die Nebenkosten selbst bleiben in ihrer Karte ausgewiesen.
    expect(text("nk-gesamt")).toContain(eur0(erwartet().kauf.nebenkosten.summe));
    // Ohne Nebenkosten, und seit dem 30.09.2026 ohne den als Erhaltungsaufwand abgezogenen Sanierungsanteil.
    expect(text("kp-afa-basis")).toBe(eur0(258800 * 0.75 - 7100));
  });

  it("SEV-Schalter nimmt die Mietverwaltung aus den Ausgaben", () => {
    renderFinanzen();
    expect(text("monat-sev")).toBe(eur0(25));
    fireEvent.click(screen.getByTestId("optionen"));
    fireEvent.click(screen.getByTestId("schalter-sev"));
    expect(screen.queryByTestId("monat-sev")).not.toBeInTheDocument();
    expect(text("monat-ausgaben")).toBe(eur0(erwartet({ mietverwaltungEinrechnen: false }).monat.ausgaben));
  });

  it('AfA-Satz anpassen zeigt „angepasst" und der Link setzt auf die hinterlegte AfA zurück', () => {
    renderFinanzen();
    fireEvent.click(screen.getByTestId("optionen"));
    fireEvent.keyDown(thumb("regler-afa"), { key: "ArrowRight" });
    expect(text("kp-afa-satz")).toBe("3,0 %");
    expect(screen.getByTestId("afa-angepasst")).toBeInTheDocument();
    expect(text("kp-afa-jahr")).toBe(eur0(erwartet({ afaProzent: 3 }).steuer.afaJahr));
    fireEvent.click(screen.getByTestId("afa-reset"));
    expect(text("kp-afa-satz")).toBe("2,5 %");
    expect(screen.queryByTestId("afa-angepasst")).not.toBeInTheDocument();
  });

  it("Kaltmiete lässt sich anpassen und zurücksetzen", () => {
    renderFinanzen();
    fireEvent.click(screen.getByTestId("optionen"));
    expect(text("regler-miete-wert")).toBe(eur0(863));
    // Der Regler rastet in Fünferschritten ein: von 863 auf 870.
    fireEvent.keyDown(thumb("regler-miete"), { key: "ArrowRight" });
    expect(text("regler-miete-wert")).toBe(eur0(870));
    expect(text("monat-miete")).toBe(eur0(870));
    fireEvent.click(screen.getByTestId("miete-reset"));
    expect(text("monat-miete")).toBe(eur0(863));
  });

  it("Familienstand und Eigenkapitalbetrag wirken", () => {
    renderFinanzen();
    const ledig = text("grenzsteuersatz");
    fireEvent.click(screen.getByTestId("familienstand-verheiratet"));
    expect(text("grenzsteuersatz")).not.toBe(ledig);
    expect(text("grenzsteuersatz")).toContain("Splitting");
    const betrag = within(screen.getByTestId("finanzierungsparameter")).getAllByRole("textbox")[0];
    fireEvent.focus(betrag);
    fireEvent.change(betrag, { target: { value: "25880" } });
    fireEvent.blur(betrag);
    expect(screen.getByTestId("regler-eigenkapital-wert")).toHaveTextContent("10,0 %");
    expect(text("fin-darlehen")).toBe(eur0(258800 * 0.9));
  });

  it("sagt oben, wofür der Reiter da ist und wann die Investmentkalkulation passt", () => {
    renderFinanzen();
    const zweck = screen.getByTestId("reiter-zweck");
    expect(zweck).toHaveTextContent("Schnelle Musterrechnung für diese Einheit mit Standardannahmen");
    expect(zweck).toHaveTextContent("erste Gespräch");
    expect(zweck).toHaveTextContent("Investmentkalkulation");
    expect(zweck.textContent).not.toMatch(/[–—]/);
  });

  it("Panel lässt sich schließen und über den Knopf wieder öffnen, Verlaufstabelle klappt auf", () => {
    renderFinanzen();
    fireEvent.click(screen.getByRole("button", { name: "Parameter schließen" }));
    expect(screen.queryByTestId("finanzierungsparameter")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("parameter-oeffnen"));
    expect(screen.getByTestId("finanzierungsparameter")).toBeInTheDocument();
    expect(screen.queryByTestId("verlauf-2026")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("verlauf-toggle"));
    expect(screen.getByTestId("verlauf-2026")).toBeInTheDocument();
    expect(text("verlauf-2035")).toContain(eur0(erwartet().jahresreihe[9].restschuldEnde));
  });
});
