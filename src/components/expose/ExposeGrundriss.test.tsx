import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ObjektData, ObjektDokument } from "@/lib/objekteStore";
import { annahmenVorbelegen, baueExposeInhalt, type ExposeGrundriss } from "@/lib/exposeInhalt";
import { baueObjektExposeInhalt } from "@/lib/exposePublicDaten";
import { ExposeAnsicht } from "./ExposeAnsicht";
import { LEERE_ERGAENZUNG } from "./exposeInvestagon";

/**
 * Der Abschnitt Grundriss seit dem 23.09.2026: nur mit Plan, der Plan der
 * richtigen Einheit, mit Vollbild und Original. Die übrigen Unterlagen
 * stehen unter den Objektdaten und gehen ohne Plan nicht verloren.
 *
 * Seit dem 24.09.2026 genau ein Plan je Einheit, und zwar klein.
 */

beforeAll(() => {
  class RO { observe() { /* leer */ } unobserve() { /* leer */ } disconnect() { /* leer */ } }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});
// Keine Anfrage ins Netz, auch nicht von der Karte.
beforeEach(() => { vi.stubGlobal("fetch", async () => ({ ok: false, status: 599, json: async () => ({}) })); });
afterEach(() => { vi.unstubAllGlobals(); });

const MEDIEN = "https://abc.supabase.co/storage/v1/object/public/objekt-medien/objekte/o1";
const dok = (id: string, name: string, url: string, extra: Partial<ObjektDokument> = {}): ObjektDokument =>
  ({ id, name, url, typ: "custom", kategorie: "objektunterlagen", sichtbar: true, ...extra });

function objektMit(dokumente: ObjektDokument[], meta: Record<string, unknown> = {}): ObjektData {
  return {
    id: "o1", titel: "Haus am Park", adresse: "Parkweg 1", plz: "89077", ort: "Ulm", beschreibung: "", highlights: [],
    bildUrl: "", bilder: [], dokumente, videoUrl: "", videoSichtbar: false, badge: "", groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0,
    renditeVon: 0, renditeBis: 0, sichtbar: true, status: "freigegeben", erstellt_am: "2026-01-01",
    globalDaten: { gesamtQm: 0, etagen: 3, baujahr: 1990, grundstueckQm: 0, verkaufspreis: 0, qmPreis: 0, rendite: 0, jahresnettomiete: 0, hausgeldMonat: 0, kaufnebenkosten: 0, grundstueckAnteil: 0 },
    meta,
    wohnungen: [
      { id: "w7", weNr: "WE 7", etage: "1", lage: "", groesse: 60, zimmer: 2, mieteGesamt: 700, vkGesamt: 200000, qmPreis: 0, rendite: 0, vermietet: false, status: "frei" },
      { id: "w8", weNr: "WE 8", etage: "2", lage: "", groesse: 70, zimmer: 3, mieteGesamt: 800, vkGesamt: 240000, qmPreis: 0, rendite: 0, vermietet: false, status: "frei" },
    ],
  } as unknown as ObjektData;
}

function zeige(objekt: ObjektData, wohnungId: string | null, grundrisseVomServer: ExposeGrundriss[] = []) {
  const wohnung = objekt.wohnungen.find((w) => w.id === wohnungId);
  const inhalt = wohnung ? baueExposeInhalt({ objekt, wohnung, heute: new Date(2026, 8, 23) }) : baueObjektExposeInhalt({ objekt, heute: new Date(2026, 8, 23) });
  const { annahmen } = annahmenVorbelegen(objekt, wohnung ?? objekt.wohnungen[0], null);
  render(
    <MemoryRouter>
      <ExposeAnsicht inhalt={inhalt} rechner={{ annahmen, onAnnahmen: () => undefined, herkunft: {} }} investagon={{ ...LEERE_ERGAENZUNG, grundrisse: grundrisseVomServer }} />
    </MemoryRouter>,
  );
  return inhalt;
}

const zaehler = () => Number((screen.getByTestId("leiste-zaehler").textContent ?? "").split("/")[1]);

describe("Abschnitt Grundriss", () => {
  it("fehlt ohne Plan, die übrigen Unterlagen stehen unter den Objektdaten, die Leiste zählt einen weniger", () => {
    const unterlagen = [dok("d-ex", "Exposé", `${MEDIEN}/expose.pdf`), dok("d-ea", "Energieausweis", `${MEDIEN}/ea.pdf`)];
    zeige(objektMit(unterlagen), "w7");
    expect(screen.queryByTestId("abschnitt-grundriss")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Exposé-Abschnitte" }).querySelector("button[aria-label='Grundriss']")).toBeNull();
    const liste = within(screen.getByTestId("abschnitt-objektdaten")).getByTestId("objekt-unterlagen");
    expect(liste).toHaveTextContent("Exposé");
    expect(liste).toHaveTextContent("Energieausweis");
    const ohnePlan = zaehler();
    document.body.innerHTML = "";

    zeige(objektMit([...unterlagen, dok("d-g7", "Grundriss WE 7.png", `${MEDIEN}/g7.png`)]), "w7");
    expect(screen.getByTestId("abschnitt-grundriss")).toBeInTheDocument();
    expect(zaehler()).toBe(ohnePlan + 1);
  });

  it("zeigt den Plan mit Vollbild und Original, und nicht noch einmal unter den Unterlagen", () => {
    zeige(objektMit([dok("d-g7", "Grundriss_WE_7.png", `${MEDIEN}/g7.png`), dok("d-ex", "Exposé", `${MEDIEN}/expose.pdf`)]), "w7");
    const abschnitt = screen.getByTestId("abschnitt-grundriss");
    expect(within(abschnitt).getByRole("heading", { name: "Grundriss WE 7" })).toBeInTheDocument();
    expect(within(abschnitt).getByAltText("Grundriss WE 7")).toHaveAttribute("src", `${MEDIEN}/g7.png`);
    expect(within(abschnitt).getByTestId("grundriss-vollbild")).toBeInTheDocument();
    expect(within(abschnitt).getByTestId("grundriss-original")).toHaveAttribute("href", `${MEDIEN}/g7.png`);
    expect(screen.getByTestId("objekt-unterlagen")).not.toHaveTextContent("Grundriss");
  });

  it("zeigt nie den Plan einer fremden Wohnung, in keiner Schreibweise", () => {
    // „GR_WE08“ allein wäre nach der Ampel Sonstiges (gelb) und ohne Freigabe ohnehin gesperrt.
    const fremd = [dok("d-g8", "Grundriss Whg. 8", `${MEDIEN}/g8.png`), dok("d-g8b", "Grundriss_WE08_moebliert.jpg", `${MEDIEN}/gr8.jpg`)];
    zeige(objektMit(fremd), "w7");
    expect(screen.queryByTestId("abschnitt-grundriss")).not.toBeInTheDocument();
    document.body.innerHTML = "";
    zeige(objektMit(fremd), "w8");
    // Zwei Pläne der WE 8, gezeigt wird seit dem 24.09.2026 genau einer.
    expect(within(screen.getByTestId("abschnitt-grundriss")).getAllByTestId("grundriss-plan")).toHaveLength(1);
  });

  it("zeigt keinen gesperrten, internen oder roten Plan", () => {
    const gesperrt = [
      dok("d-1", "Grundriss WE 7", `${MEDIEN}/g7.png`, { kundenFreigabe: "gesperrt" }),
      dok("d-2", "Grundriss WE 7 intern", `${MEDIEN}/g7i.png`, { kategorie: "intern" }),
      dok("d-3", "Mietvertrag WE 7 Anlage Grundriss", `${MEDIEN}/mv.pdf`),
    ];
    zeige(objektMit(gesperrt), "w7");
    expect(screen.queryByTestId("abschnitt-grundriss")).not.toBeInTheDocument();
  });

  it("findet den Investagon-Plan an der Kategorie, auch wenn der Import die Zeile intern ablegt", () => {
    const roh = { files: [{ id: 1, category: "layout", title: "Scan 0042", original_filename: "Scan_0042.jpg", filename: "https://tool.investagon.com/a/Scan_0042.jpg" }] };
    const zeile = dok("d-s", "Scan 0042", "/investagon-dokument/o1/1a2b3c4d-Scan_0042.jpg", { kategorie: "intern", sichtbar: false });
    // Ein Einzelobjekt: Der Plan am Objekt ohne Nummer gehört der einen Einheit.
    const inhalt = baueExposeInhalt({ objekt: objektMit([zeile], { investagonRaw: roh, einzelwohnung: true }), wohnung: objektMit([]).wohnungen[0] });
    expect(inhalt.grundriss.dokumente).toEqual([{ id: "d-s", name: "Scan 0042", url: "/investagon-dokument/o1/1a2b3c4d-Scan_0042.jpg", istBild: true }]);
  });

  it("nimmt im Kundenlink die geprüfte Liste des Servers und zeigt denselben Plan nicht doppelt", () => {
    const signiert = "https://abc.supabase.co/storage/v1/object/sign/objekt-dokumente/g7.png?token=kurz";
    zeige(objektMit([dok("d-g7", "Grundriss WE 7.png", `${MEDIEN}/g7.png`)]), "w7", [{ id: "d-g7", name: "Grundriss WE 7.png", url: signiert, istBild: true }]);
    const plaene = within(screen.getByTestId("abschnitt-grundriss")).getAllByTestId("grundriss-plan");
    expect(plaene).toHaveLength(1);
    expect(within(plaene[0]).getByRole("img")).toHaveAttribute("src", signiert);
  });

  it("zeigt einer Einheit genau einen Grundriss, auch wenn der Server noch mehrere liefert", () => {
    const signiert = (n: string) => `https://abc.supabase.co/storage/v1/object/sign/objekt-dokumente/${n}.png?token=kurz`;
    // Bis die Function neu ausgerollt ist, schickt der Kundenlink bis zu drei.
    const vomServer = ["g7a", "g7b", "g7c"].map((n) => ({ id: n, name: `Grundriss WE 7 ${n}.png`, url: signiert(n), istBild: true }));
    zeige(objektMit([
      dok("d-g7", "Grundriss WE 7.png", `${MEDIEN}/g7.png`),
      dok("d-g7m", "Grundriss WE 7 möbliert.png", `${MEDIEN}/g7m.png`),
      dok("d-h", "Grundrisse Haus 1.png", `${MEDIEN}/haus.png`),
    ]), "w7", vomServer);
    const plaene = within(screen.getByTestId("abschnitt-grundriss")).getAllByTestId("grundriss-plan");
    expect(plaene).toHaveLength(1);
    expect(within(plaene[0]).getByRole("img")).toHaveAttribute("src", signiert("g7a"));
    // Ein einzelner Plan steht klein in der Mitte, ohne Streifen und ohne Beschriftung als Ersatz.
    expect(screen.queryByTestId("grundriss-streifen")).not.toBeInTheDocument();
    expect(screen.queryByTestId("grundriss-ersatz")).not.toBeInTheDocument();
    document.body.innerHTML = "";

    // Ohne Server-Liste wählt das Exposé selbst, ebenfalls genau einen.
    const inhalt = zeige(objektMit([dok("d-g7", "Grundriss WE 7.png", `${MEDIEN}/g7.png`), dok("d-g7m", "Grundriss WE 7 möbliert.png", `${MEDIEN}/g7m.png`)]), "w7");
    expect(inhalt.grundriss.dokumente).toHaveLength(1);
    expect(within(screen.getByTestId("abschnitt-grundriss")).getAllByTestId("grundriss-plan")).toHaveLength(1);
  });

  it("zeigt ohne eigenen Plan den Plan des Geschosses, ehrlich als Geschossplan beschriftet", () => {
    // WE 8 liegt laut Datensatz im Geschoss „2“, der Plan heißt „Grundriss 2. OG“.
    zeige(objektMit([dok("d-og2", "Grundriss 2. OG.png", `${MEDIEN}/og2.png`), dok("d-og1", "Grundriss 1. OG.png", `${MEDIEN}/og1.png`), dok("d-h", "Grundrisse Haus gesamt.png", `${MEDIEN}/haus.png`)]), "w8");
    const plaene = within(screen.getByTestId("abschnitt-grundriss")).getAllByTestId("grundriss-plan");
    expect(plaene).toHaveLength(1);
    expect(within(plaene[0]).getByRole("img")).toHaveAttribute("src", `${MEDIEN}/og2.png`);
    expect(within(plaene[0]).getByTestId("grundriss-ersatz")).toHaveTextContent("Geschossplan");
    expect(within(plaene[0]).getByTestId("grundriss-ersatz")).toHaveTextContent("Ein eigener Grundriss dieser Wohnung liegt nicht vor.");
    document.body.innerHTML = "";
    // Ohne Plan des eigenen Geschosses der Hausplan, als Hausplan beschriftet.
    zeige(objektMit([dok("d-og1", "Grundriss 1. OG.png", `${MEDIEN}/og1.png`), dok("d-h", "Grundrisse Haus gesamt.png", `${MEDIEN}/haus.png`)]), "w8");
    expect(screen.getByTestId("grundriss-ersatz")).toHaveTextContent("Hausplan");
    document.body.innerHTML = "";
    // Gibt es auch den nicht, gibt es keinen Grundriss.
    zeige(objektMit([dok("d-og1", "Grundriss 1. OG.png", `${MEDIEN}/og1.png`)]), "w8");
    expect(screen.queryByTestId("abschnitt-grundriss")).not.toBeInTheDocument();
  });

  it("zeigt im Exposé des ganzen Objekts alle Pläne in einem Streifen: einer sichtbar, „1 von 3“, Pfeile und Pfeiltasten", () => {
    zeige(objektMit(["1", "2", "3"].map((n) => dok(`d-h${n}`, `Grundrisse Haus ${n}.png`, `${MEDIEN}/h${n}.png`))), null);
    const streifen = screen.getByTestId("grundriss-streifen");
    expect(within(streifen).getAllByTestId("grundriss-plan")).toHaveLength(3);
    expect(screen.getByTestId("grundriss-zaehler")).toHaveTextContent("1 von 3");
    expect(screen.getByTestId("grundriss-zurueck")).toBeDisabled();
    fireEvent.click(screen.getByTestId("grundriss-weiter"));
    expect(screen.getByTestId("grundriss-zaehler")).toHaveTextContent("2 von 3");
    const bahn = screen.getByTestId("grundriss-bahn");
    expect(bahn).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(bahn, { key: "End" });
    expect(screen.getByTestId("grundriss-zaehler")).toHaveTextContent("3 von 3");
    expect(screen.getByTestId("grundriss-weiter")).toBeDisabled();
    fireEvent.keyDown(bahn, { key: "ArrowLeft" });
    expect(screen.getByTestId("grundriss-zaehler")).toHaveTextContent("2 von 3");
    expect(streifen).toHaveAttribute("aria-roledescription", "Karussell");
  });

  it("zeigt im Exposé des Objekts den Plan des Hauses, nicht den einer Einheit", () => {
    // „Pläne Haus 1“ ohne das Wort Grundriss wäre nach der Ampel Sonstiges, also gesperrt.
    zeige(objektMit([dok("d-g7", "Grundriss WE 7", `${MEDIEN}/g7.png`), dok("d-h", "Grundrisse Haus 1.png", `${MEDIEN}/haus.png`)]), null);
    const abschnitt = screen.getByTestId("abschnitt-grundriss");
    expect(abschnitt).toHaveTextContent("Grundrisse Haus 1");
    expect(abschnitt).not.toHaveTextContent("Grundriss WE 7");
  });
});

describe("Grundriss im Druck und auf dem Handy", () => {
  const css = readFileSync(resolve(__dirname, "premiumExpose.css"), "utf8");
  const klein = readFileSync(resolve(__dirname, "exposeLageGrundriss.css"), "utf8");
  it("hält den Grundriss klein, am Bildschirm wie im Druck, und schlägt die Regeln aus premiumExpose.css", () => {
    expect(readFileSync(resolve(__dirname, "GrundrissVorschau.tsx"), "utf8")).toContain('import "./exposeLageGrundriss.css";');
    expect(klein).toMatch(/\.premium-expose \.grundriss-plaene \{\s*max-width: 560px;/);
    expect(klein).toMatch(/\.premium-expose \.grundriss-plaene \.floor img \{\s*max-height: 380px;/);
    const druck = klein.slice(klein.indexOf("@media print"));
    expect(druck).toMatch(/\.premium-expose \.grundriss-plaene \.floor img \{\s*max-height: 105mm;/);
    // Im Druck lässt sich nicht blättern: Der Streifen wird zum Raster, die Pfeile fallen weg.
    expect(druck).toMatch(/\.streifen-bahn \{\s*display: grid;\s*grid-template-columns: repeat\(3/);
    expect(klein).toMatch(/\.streifen-bahn \{\s*display: flex;\s*overflow-x: auto;\s*scroll-snap-type: x mandatory;/);
    expect(readFileSync(resolve(__dirname, "GrundrissStreifen.tsx"), "utf8")).toContain('className="streifen-leiste screen-only"');
  });

  it("blendet Vollbild und Original im Druck aus und lässt die Knöpfe auf dem Handy die Breite teilen", () => {
    expect(readFileSync(resolve(__dirname, "GrundrissVorschau.tsx"), "utf8")).toContain('className="plan-aktionen screen-only"');
    const handy = css.split("\n").find((z) => z.startsWith("@media(max-width:800px){.premium-expose .floor{padding:8px}")) ?? "";
    expect(handy).toContain(".premium-expose .plan-aktionen{width:100%}");
    expect(handy).toContain(".premium-expose .floor img{max-height:none}");
    expect(css).toContain(".premium-expose .plan-aktionen .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px");
  });
});
