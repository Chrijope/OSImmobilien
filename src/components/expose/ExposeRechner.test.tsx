import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ExposeRechner, type AnnahmenHerkunftKarte } from "./ExposeRechner";
import { standardAnnahmen, type ExposeAnnahmen } from "@/lib/exposeAnnahmen";
import { berechneExpose, businessCase, monatsuebersicht, type ExposeObjektdaten } from "@/lib/exposeRechner";
import { eur0 } from "@/lib/objektKennzahlen";

/**
 * Der Rechner in Abschnitt 6: Regler ändern das Ergebnis live, Werte aus der
 * Selbstauskunft sind gekennzeichnet, gesperrte Regler lassen sich nicht
 * bewegen. Gerechnet wird echt mit berechneExpose, nicht mit einer Attrappe.
 */

beforeAll(() => {
  // Radix Slider misst die Bahn, jsdom kennt keinen ResizeObserver.
  class RO { observe() { /* leer */ } unobserve() { /* leer */ } disconnect() { /* leer */ } }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

const OBJEKT: ExposeObjektdaten = {
  kaufpreis: 232000,
  stellplatzpreis: 9500,
  wohnflaeche: 61.4,
  kaltmieteMonat: 790,
  hausgeldGesamtMonat: 180,
  hausgeldNichtUmlegbarMonat: 45,
  mietverwaltungMonat: 0,
  bundeslandId: "by",
  baujahr: 1962,
  sanierungskostenGesamt: 100000,
  miteigentumsanteilProzent: 7.1,
  sanierungFertigstellungJahr: 2027,
};

function Umgebung({ start, herkunft = {}, gesperrt, onWert }: {
  start?: Partial<ExposeAnnahmen>; herkunft?: AnnahmenHerkunftKarte; gesperrt?: boolean; onWert?: (a: ExposeAnnahmen) => void;
}) {
  const [annahmen, setAnnahmen] = useState<ExposeAnnahmen>({ ...standardAnnahmen(2026), instandhaltungsart: "erhaltungsaufwand", ...start });
  return (
    <ExposeRechner
      objektdaten={OBJEKT}
      annahmen={annahmen}
      onAnnahmen={(ae) => setAnnahmen((a) => { const n = { ...a, ...ae }; onWert?.(n); return n; })}
      herkunft={herkunft}
      gesperrt={gesperrt}
    />
  );
}

const thumb = (testId: string) => within(screen.getByTestId(testId)).getByRole("slider");

describe("Exposé-Rechner", () => {
  it("zeigt Kaufpreisblock und Eigenanteil aus berechneExpose", () => {
    render(<Umgebung />);
    const erwartet = berechneExpose(OBJEKT, { ...standardAnnahmen(2026), instandhaltungsart: "erhaltungsaufwand" });
    expect(screen.getByTestId("gesamtinvestition")).toHaveTextContent("241.500 €");
    // Grunderwerbsteuer 3,5 % plus Notar und Grundbuch nach GNotKG-Tabelle (3.884 Euro), seit dem
    // 30.09.2026 auf 241.500 − 7.100 Sanierungsanteil = 234.400: 8.204 plus 3.884.
    expect(screen.getByTestId("nebenkosten")).toHaveTextContent(/12\.08[78] €/);
    expect(screen.getByTestId("darlehen")).toHaveTextContent("241.500 €");
    expect(screen.getByTestId("eigenanteil").textContent).toBe(eur0(Math.abs(erwartet.monat.eigenanteil)));
    expect(screen.getByTestId("sanierung-karte")).toBeInTheDocument();
    expect(screen.getByTestId("sanierungsanteil")).toHaveTextContent("7.100 €");
    expect(screen.getByTestId("ek-rendite")).toHaveTextContent("%");
    expect(screen.getByTestId("faktor-je-euro")).toHaveTextContent("€");
  });

  it("rechnet live neu, wenn der Zinsregler bewegt wird", () => {
    const werte: ExposeAnnahmen[] = [];
    render(<Umgebung onWert={(a) => werte.push(a)} />);
    const vorher = screen.getByTestId("monat-rate").textContent;
    fireEvent.keyDown(thumb("regler-zins"), { key: "ArrowRight" });
    expect(werte.at(-1)?.zinsProzent).toBeCloseTo(4.35, 5);
    expect(screen.getByTestId("regler-zins-wert")).toHaveTextContent("4,35 %");
    expect(screen.getByTestId("monat-rate").textContent).not.toBe(vorher);
  });

  it("senkt mit Eigenkapital das Darlehen und erhöht den Eigenkapitaleinsatz", () => {
    render(<Umgebung start={{ eigenkapitalProzent: 20 }} />);
    expect(screen.getByTestId("darlehen")).toHaveTextContent("193.200 €");
    // Nebenkosten 11.869 (Grundschuld nur auf das Bankdarlehen von 193.200, alles ohne den
    // Sanierungsanteil) plus 48.300 Eigenkapital.
    expect(screen.getByTestId("eigenkapitaleinsatz")).toHaveTextContent(/60\.16[89] €/);
    // Wie in der Vorlage: Prozent am Regler, der Betrag im Eingabefeld darunter.
    expect(screen.getByTestId("regler-eigenkapital-wert")).toHaveTextContent("20,00 %");
    expect(screen.getByTestId("eigenkapital-betrag")).toHaveValue(48300);
  });

  it("kennzeichnet Werte aus der Selbstauskunft", () => {
    render(<Umgebung start={{ zvE: 84000, verheiratet: true }} herkunft={{ zvE: "selbstauskunft", verheiratet: "selbstauskunft", afaProzent: "objekt" }} />);
    expect(screen.getByTestId("anzahl-selbstauskunft")).toHaveTextContent("2 Werte aus deiner Selbstauskunft");
    const chips = screen.getAllByTestId("herkunft-chip").map((c) => c.textContent);
    expect(chips.filter((c) => c === "Selbstauskunft")).toHaveLength(2);
    expect(screen.getByTestId("regler-zve-wert")).toHaveTextContent("84.000 €");
    expect(screen.getByTestId("grenzsteuersatz")).toHaveTextContent(/nach Tarif/);
  });

  it("schaltet Verheiratet um und ändert den Grenzsteuersatz", () => {
    render(<Umgebung start={{ zvE: 60000 }} />);
    const vorher = screen.getByTestId("grenzsteuersatz").textContent;
    fireEvent.click(screen.getByTestId("schalter-verheiratet"));
    expect(screen.getByTestId("grenzsteuersatz").textContent).not.toBe(vorher);
  });

  it("verschiebt das Betrachtungsjahr und zeigt Werte des späteren Jahres", () => {
    render(<Umgebung />);
    const miete2026 = screen.getByTestId("monat-miete").textContent;
    fireEvent.keyDown(thumb("regler-betrachtungsjahr"), { key: "ArrowRight" });
    expect(screen.getByTestId("regler-betrachtungsjahr-wert")).toHaveTextContent("2027");
    expect(screen.getByTestId("monat-miete").textContent).not.toBe(miete2026);
  });

  it("wechselt den Horizont des Vermögensaufbaus", () => {
    render(<Umgebung />);
    const zehn = screen.getByTestId("euro-vermoegen").textContent;
    fireEvent.click(screen.getByTestId("horizont-20"));
    expect(screen.getByTestId("horizont-20")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("euro-vermoegen").textContent).not.toBe(zehn);
  });

  it("lässt gesperrte Regler nicht bewegen", () => {
    const werte: ExposeAnnahmen[] = [];
    render(<Umgebung gesperrt onWert={(a) => werte.push(a)} />);
    expect(thumb("regler-zins")).toHaveAttribute("data-disabled");
    fireEvent.keyDown(thumb("regler-zins"), { key: "ArrowRight" });
    expect(werte).toHaveLength(0);
    expect(screen.getByText(/hat dein Ansprechpartner festgelegt/)).toBeInTheDocument();
  });

  it("öffnet alle Annahmen mit den weiteren Reglern", () => {
    render(<Umgebung />);
    expect(screen.queryByTestId("regler-mietsteigerung")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("alle-annahmen"));
    expect(screen.getByTestId("regler-mietsteigerung")).toBeInTheDocument();
    expect(screen.getByTestId("regler-afa")).toBeInTheDocument();
  });

  it("reicht das Ergebnis nach außen", () => {
    const erhalten = vi.fn();
    render(<ExposeRechner objektdaten={OBJEKT} annahmen={standardAnnahmen(2026)} onAnnahmen={() => undefined} herkunft={{}} onErgebnis={erhalten} />);
    expect(erhalten).toHaveBeenCalled();
    expect(erhalten.mock.calls[0][0].kauf.gesamtinvestition).toBe(241500);
  });
});

describe("Exposé-Rechner nach der Invenio-Vorlage", () => {
  const MIT_SANIERUNG = { ...standardAnnahmen(2026), instandhaltungsart: "erhaltungsaufwand" as const };
  const ohneSanierung: ExposeObjektdaten = { ...OBJEKT, sanierungskostenGesamt: 0, miteigentumsanteilProzent: 0, sanierungFertigstellungJahr: null };

  afterEach(() => { vi.useRealTimers(); });

  it("baut den Abschnitt in der Reihenfolge der Vorlage auf", () => {
    render(<Umgebung />);
    const folge = ["business-case", "finanzierungsparameter", "regler-betrachtungsjahr", "monatsuebersicht", "vermoegensaufbau", "sanierung-karte", "euro-karte"]
      .map((id) => screen.getByTestId(id));
    for (let i = 1; i < folge.length; i++) {
      expect(folge[i - 1].compareDocumentPosition(folge[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // Die beiden Karten stehen unter dem aufklappbaren Vermögensaufbau, nicht darin.
    expect(screen.getByTestId("vermoegensaufbau")).not.toContainElement(screen.getByTestId("euro-karte"));
    expect(screen.getByTestId("vermoegensaufbau")).toContainElement(screen.getByTestId("rendite-streifen"));
  });

  it("Business Case: Überschrift mit Finanzierungsquote, Positionen und Summen aus businessCase", () => {
    render(<Umgebung />);
    const bc = businessCase(berechneExpose(OBJEKT, MIT_SANIERUNG));
    expect(screen.getByTestId("business-case-titel")).toHaveTextContent("Business Case, 100,0 % Finanzierung");
    expect(screen.getByTestId("business-case-titel").textContent).not.toMatch(/[–—]/);
    expect(screen.getByTestId("bc-kaufpreis")).toHaveTextContent("232.000 €");
    expect(screen.getByTestId("bc-stellplatz")).toHaveTextContent("9.500 €");
    expect(screen.getByTestId("eigenkapitaleinsatz").textContent).toBe(eur0(bc.zeilen.at(-1)?.betrag ?? 0));
    expect(screen.queryByTestId("bc-eigenkapital")).not.toBeInTheDocument();
  });

  it("sagt unter der Gesamtinvestition, dass die Kaufnebenkosten dazukommen, außer der Verkäufer trägt sie", () => {
    const { unmount } = render(<Umgebung />);
    expect(screen.getByTestId("gesamtinvestition-zusatz")).toHaveTextContent("Kaufnebenkosten zahlst du zusätzlich");
    unmount();
    render(<Umgebung start={{ nebenkostenTraegtVerkaeufer: true }} />);
    expect(screen.queryByTestId("gesamtinvestition-zusatz")).not.toBeInTheDocument();
  });

  it("Eigenkapital über das Betragsfeld: Finanzierungsquote, Eigenkapitalzeile, Darlehen und Rendite ändern sich", () => {
    render(<Umgebung />);
    const renditeVorher = screen.getByTestId("ek-rendite").textContent;
    const rateVorher = screen.getByTestId("monat-rate").textContent;
    fireEvent.change(screen.getByTestId("eigenkapital-betrag"), { target: { value: "12075" } });
    expect(screen.getByTestId("regler-eigenkapital-wert")).toHaveTextContent("5,00 %");
    expect(screen.getByTestId("business-case-titel")).toHaveTextContent("Business Case, 95,0 % Finanzierung");
    expect(screen.getByTestId("bc-eigenkapital")).toHaveTextContent("12.075 €");
    expect(screen.getByTestId("darlehen")).toHaveTextContent("229.425 €");
    expect(screen.getByTestId("monat-rate").textContent).not.toBe(rateVorher);
    expect(screen.getByTestId("ek-rendite").textContent).not.toBe(renditeVorher);
  });

  it("Monatsübersicht: Einnahmen, Ausgaben und Eigeninvestition wie monatsuebersicht", () => {
    render(<Umgebung />);
    const mu = monatsuebersicht(berechneExpose(OBJEKT, MIT_SANIERUNG).monat);
    expect(screen.getByTestId("monat-miete").textContent).toBe(eur0(mu.einnahmen[0].betrag));
    expect(screen.getByTestId("monat-steuervorteil").textContent).toBe(eur0(mu.einnahmen[1].betrag));
    expect(screen.getByTestId("monat-rate").textContent).toBe(eur0(mu.ausgaben[0].betrag));
    // Ohne getrennte Rücklage eine Zeile für das nicht umlegbare Hausgeld, Mietverwaltung 0 € fehlt.
    expect(screen.getByTestId("monat-hausgeld")).toHaveTextContent("45 €");
    expect(screen.queryByTestId("monat-mietverwaltung")).not.toBeInTheDocument();
    expect(screen.getByTestId("monat-einnahmen").textContent).toBe(eur0(mu.summeEinnahmen));
    expect(screen.getByTestId("monat-ausgaben").textContent).toBe(eur0(mu.summeAusgaben));
    expect(screen.getByTestId("eigeninvestition")).toHaveTextContent("Monatliche Eigeninvestition");
    expect(screen.getByTestId("eigenanteil").textContent).toBe(eur0(mu.eigeninvestition));
  });

  it("zeigt „Werte ab …“ im Startjahr und das Jahr, sobald ein späteres gewählt ist", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 23));
    render(<Umgebung />);
    expect(screen.getByTestId("monat-hinweis")).toHaveTextContent("Werte ab Oktober 2026");
    fireEvent.keyDown(thumb("regler-betrachtungsjahr"), { key: "ArrowRight" });
    expect(screen.getByTestId("monat-hinweis")).toHaveTextContent("Werte im Jahr 2027");
  });

  it("Vermögensaufbau: Schaubild, Rendite und Karte je Horizont aus derselben Rechnung", () => {
    render(<Umgebung />);
    const e = berechneExpose(OBJEKT, MIT_SANIERUNG);
    const gesamteigenkapital = businessCase(e).zeilen.at(-1)?.betrag ?? 0;
    for (const n of [10, 20, 30, 40]) {
      fireEvent.click(screen.getByTestId(`horizont-${n}`));
      const h = e.vermoegensaufbau.find((x) => x.jahre === n);
      if (!h) throw new Error(`Horizont ${n} fehlt`);
      expect(screen.getByTestId("va-jahre")).toHaveTextContent(`${n} JAHRE`);
      expect(screen.getByTestId("va-kaufpreis")).toHaveTextContent("241.500 €");
      expect(screen.getByTestId("va-immobilienwert").textContent).toBe(eur0(h.immobilienwert));
      expect(screen.getByTestId("va-restschuld").textContent).toBe(eur0(h.restschuld));
      expect(screen.getByTestId("ertrag-verkauf").textContent).toBe(eur0(h.ertragBeiVerkauf));
      expect(screen.getByTestId("euro-vermoegen").textContent).toBe(eur0(h.vermoegen));
      expect(screen.getByTestId("euro-eigenkapital").textContent).toBe(eur0(gesamteigenkapital));
      expect(screen.getByTestId("ek-rendite")).toHaveTextContent(`${(h.eigenkapitalrenditeProzent ?? 0).toFixed(1).replace(".", ",")} %`);
      expect(screen.getByTestId("euro-karte")).toHaveTextContent(`Vermögensaufbau nach ${n} Jahren`);
    }
    expect(screen.getByTestId("va-restschuld")).toHaveTextContent("0 €");
  });

  it("die Tilgung ändert Finanzierung, Restschuld und Beschriftung im Schaubild", () => {
    render(<Umgebung />);
    const restVorher = screen.getByTestId("va-restschuld").textContent;
    expect(screen.getByTestId("vermoegen-diagramm")).toHaveTextContent("TILGUNG 1,0 % P. A.");
    for (let i = 0; i < 5; i++) fireEvent.keyDown(thumb("regler-tilgung"), { key: "ArrowRight" });
    expect(screen.getByTestId("regler-tilgung-wert")).toHaveTextContent("1,50 %");
    expect(screen.getByTestId("vermoegen-diagramm")).toHaveTextContent("TILGUNG 1,5 % P. A.");
    expect(screen.getByTestId("va-restschuld").textContent).not.toBe(restVorher);
  });

  it("zeigt die Sanierungskarte nur mit Sanierungsdaten, die Vermögenskarte dann allein über die Breite", () => {
    const { unmount } = render(<Umgebung />);
    expect(screen.getByTestId("sanierung-karte")).toHaveTextContent("Sanierung am Gemeinschaftseigentum (Fertigstellung 2027)");
    expect(screen.getByTestId("einmalige-steuerersparnis")).toHaveTextContent(/≈ [\d.]+ €/);
    unmount();
    render(<ExposeRechner objektdaten={ohneSanierung} annahmen={standardAnnahmen(2026)} onAnnahmen={() => undefined} herkunft={{}} />);
    expect(screen.queryByTestId("sanierung-karte")).not.toBeInTheDocument();
    expect(screen.getByTestId("euro-karte").parentElement).toHaveClass("wk-allein");
  });

  it("Kundenlink mit neutralen Annahmen: Standardwerte, keine Kennzeichnung aus der Selbstauskunft", () => {
    render(<ExposeRechner objektdaten={OBJEKT} annahmen={standardAnnahmen(2026)} onAnnahmen={() => undefined} herkunft={{}} />);
    expect(screen.queryByTestId("anzahl-selbstauskunft")).not.toBeInTheDocument();
    expect(screen.queryByTestId("herkunft-chip")).not.toBeInTheDocument();
    expect(screen.getByTestId("regler-eigenkapital-wert")).toHaveTextContent("0,00 %");
    expect(screen.getByTestId("eigenkapital-betrag")).toHaveValue(0);
    expect(screen.getByTestId("regler-zins-wert")).toHaveTextContent("4,30 %");
    expect(screen.getByTestId("regler-tilgung-wert")).toHaveTextContent("1,00 %");
    expect(screen.getByTestId("regler-zve-wert")).toHaveTextContent("60.000 €");
    expect(screen.getByTestId("schalter-verheiratet")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("schalter-lohnsteuer")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("wachstumsannahmen")).toHaveTextContent("Mietsteigerung 2,0 % | Kostensteigerung 2,0 % | Wertentwicklung 2,0 % p. a.");
  });

  it("Farbrollen: zentrale Beträge dunkel, Ergebnisse und Vorteile grün, Grau für neutrale Kästen, kein Orange", () => {
    const { container } = render(<Umgebung />);
    // Seit dem 23.09.2026 kein Orange mehr: Es wirkte wie ein Warnsignal.
    expect(container.querySelectorAll("[class*='akzent']")).toHaveLength(0);
    // Gesamtinvestition, Gesamteigenkapitaleinsatz und die monatliche Eigeninvestition stehen fett in der Textfarbe.
    for (const id of ["gesamtinvestition", "eigenkapitaleinsatz", "eigenanteil"]) {
      expect(screen.getByTestId(id)).toHaveClass("wk-betrag-stark");
    }
    expect(screen.getByTestId("eigeninvestition")).toHaveTextContent("Monatliche Eigeninvestition");
    expect(screen.getByTestId("eigeninvestition")).toHaveClass("wk-kasten-blau");
    // Vermögensaufbau: Ertrag bei Verkauf und jährliche Eigenkapitalrendite grün, ihre Kästen grün hinterlegt.
    for (const id of ["ek-rendite", "ertrag-verkauf", "einmalige-steuerersparnis", "faktor-je-euro", "monat-steuervorteil"]) {
      expect(screen.getByTestId(id)).toHaveClass("wk-betrag-positiv");
    }
    expect(screen.getByTestId("rendite-streifen")).toHaveClass("wk-kasten-positiv");
    const mobil = [...container.querySelectorAll(".wk-diagramm-mobil .wk-mobil-kasten")].find((k) => /Ertrag bei Verkauf/.test(k.textContent ?? ""));
    expect(mobil).toHaveClass("wk-kasten-positiv");
    expect(mobil!.querySelector("strong")).toHaveClass("wk-betrag-positiv");
    for (const id of ["bc-kaufpreis", "nebenkosten", "monat-rate", "va-restschuld", "va-kaufpreis"]) {
      expect(screen.getByTestId(id)).not.toHaveClass("wk-betrag-stark");
      expect(screen.getByTestId(id)).not.toHaveClass("wk-betrag-positiv");
    }
    const kaesten = [...container.querySelectorAll("rect")].map((r) => r.getAttribute("class"));
    expect(kaesten).toEqual(["wk-kasten-neutral", "wk-kasten-blau", "wk-kasten-positiv", "wk-kasten-neutral"]);
  });

  it("färbt Summen dunkel und die grünen Kästen mit mindestens 4,5:1", () => {
    const css = readFileSync(resolve(__dirname, "exposeRechner.css"), "utf-8");
    expect(css).toMatch(/\.wk-betrag-stark \{ color: var\(--wk-text\); font-weight: 700; \}/);
    expect(css).toMatch(/\.wk-bc-zeile\.wk-summe \{[^}]*border-top: 1\.5px solid var\(--wk-text\);[^}]*color: var\(--wk-text\);/);
    expect(css).toMatch(/rect\.wk-kasten-positiv \{ fill: var\(--wk-positiv-hell\)/);
    expect(css).toMatch(/text\.wk-betrag-positiv \{ fill: var\(--wk-positiv\)/);
    // Grün #187745 auf dem hellen Grün #EAF6EF, die Werte aus premiumExpose.css.
    const lum = (hex: string) => {
      const k = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
    };
    expect((lum("#EAF6EF") + 0.05) / (lum("#187745") + 0.05)).toBeGreaterThanOrEqual(4.5);
    const premium = readFileSync(resolve(__dirname, "premiumExpose.css"), "utf-8");
    expect(premium).toContain("--positiv:#187745;--positiv-hell:#EAF6EF");
  });

  it("Überschuss statt Eigeninvestition, wenn die Miete alles trägt, dann grün", () => {
    render(<ExposeRechner objektdaten={{ ...OBJEKT, kaltmieteMonat: 2500 }} annahmen={standardAnnahmen(2026)} onAnnahmen={() => undefined} herkunft={{}} />);
    expect(screen.getByTestId("eigeninvestition")).toHaveTextContent("Monatlicher Überschuss");
    expect(screen.getByTestId("eigeninvestition")).toHaveClass("wk-kasten-positiv");
    expect(screen.getByTestId("eigenanteil")).toHaveClass("wk-betrag-positiv");
  });

  it("ohne Eigenkapitaleinsatz bleibt die Rendite unbestimmt, statt eine Zahl zu erfinden", () => {
    const annahmen = { ...standardAnnahmen(2026), zweitesDarlehenAktiv: true, zweitesDarlehenBetrag: 50000, zweitesDarlehenErsetzt: "eigenkapital" as const };
    render(<ExposeRechner objektdaten={OBJEKT} annahmen={annahmen} onAnnahmen={() => undefined} herkunft={{}} />);
    expect(screen.getByTestId("eigenkapitaleinsatz")).toHaveTextContent("0 €");
    expect(screen.getByTestId("bc-eigenkapitalersatz").textContent).toMatch(/^-12\.08\d\s€$/);
    expect(screen.getByTestId("ek-rendite")).toHaveTextContent("nicht bestimmbar");
    expect(screen.getByTestId("faktor-je-euro")).toHaveTextContent("nicht berechenbar");
  });

  it("zeigt für den Druck feste Werte statt Schaltern und Eingabefeld", () => {
    render(<Umgebung start={{ eigenkapitalProzent: 10 }} />);
    const druck = [...document.querySelectorAll(".wk-nur-druck, .wk-nur-druck-block")].map((el) => el.textContent);
    expect(druck).toContain(eur0(24150));
    expect(druck).toContain(": nein");
    expect(druck).toContain(": ja");
    expect(druck.some((t) => t?.startsWith("Weitere Annahmen: Leerstand 0,0 %"))).toBe(true);
  });

  it("enthält in sichtbaren Texten keine Gedankenstriche", () => {
    render(<Umgebung />);
    expect(screen.getByTestId("expose-rechner").textContent).not.toMatch(/[–—]/);
  });
});
