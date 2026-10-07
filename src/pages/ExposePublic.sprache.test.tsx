import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

/**
 * Kundensprache, Etappe 3, S2: Das Exposé mit persönlichem Link zeigt sich in
 * der Sprache des Kunden. `get-expose` schickt sie zu einem gültigen Token
 * mit (`sprache`), auch in der Antwort „abgelaufen“. `?lang=` in der Adresse
 * geht vor. Ohne Token ist das Exposé anonym und ohne `?lang=` deutsch.
 */

beforeAll(() => {
  class RO { observe() { /* leer */ } unobserve() { /* leer */ } disconnect() { /* leer */ } }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

vi.mock("@/integrations/supabase/client", () => {
  const kette: Record<string, unknown> = {};
  for (const m of ["select", "eq", "maybeSingle"]) kette[m] = () => kette;
  kette.then = (res: (v: unknown) => unknown) => Promise.resolve(res({ data: null, error: null }));
  return { supabase: { from: () => kette, rpc: () => Promise.resolve({ data: null, error: null }) } };
});
vi.mock("@/lib/storage", () => ({ objektUnterlagenBefristen: async <T,>(o: T) => o }));

const TOKEN = "ef".repeat(32);

function payload(extra: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) {
  return {
    objekt: {
      id: "o1", titel: "Objekt am Park", adresse: "Parkstraße 8", plz: "86150", ort: "Augsburg", sichtbar: true, global_baujahr: 1984,
      meta: {
        kurzbeschreibung: "Ruhige Wohnung am Park.",
        standortargumente: ["Lage. Nah am Zentrum."],
        standortanalyse: { schema: 2, objekt_koordinaten: { lat: 48.3, lng: 10.9 }, mikrolage: { einkaufen: [{ name: "REWE", typ: "Supermarkt", entfernung_m: 300, lat: 48.301, lng: 10.901 }] } },
        ...meta,
      },
    },
    bilder: [],
    dokumente: [],
    wohnungen: [{ id: "w7", we_nr: "7", groesse: 65, zimmer: 3, vk_gesamt: 240000, miete_gesamt: 800, status: "frei", meta: {} }],
    ansprechpartner: { name: "Paula Partner", telefon: "+49 89 123456", email: "paula@example.com" },
    ...extra,
  };
}

let antwort: Record<string, unknown> = payload();
vi.stubGlobal("fetch", (url: string) => {
  if (String(url).includes("aktion=datei")) return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(antwort) });
});

const { default: ExposePublic } = await import("./ExposePublic");

function renderMit(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route path="/expose/:id/wohnung/:weId" element={<ExposePublic />} />
        <Route path="/expose/:id" element={<ExposePublic />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  antwort = payload();
  document.documentElement.removeAttribute("lang");
});

describe("Sprache vom Server", () => {
  it("mit Token und sprache en: Seite, Rechner und Kontakt englisch", async () => {
    antwort = payload({ sprache: "en" });
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}`);
    const objektdaten = await screen.findByTestId("abschnitt-objektdaten");
    expect(objektdaten).toHaveTextContent("Property details");
    expect(screen.getByTestId("abschnitt-start")).toHaveTextContent("Your property as an investment");
    const rechner = screen.getByTestId("expose-rechner");
    expect(rechner).toHaveAttribute("lang", "en");
    expect(within(rechner).getByTestId("finanzierungsparameter")).toHaveTextContent("Financing parameters");
    expect(within(rechner).getByTestId("business-case-titel")).toHaveTextContent(/^Business case, [\d.]+% financing$/);
    expect(screen.getByTestId("abschnitt-kontakt")).toHaveTextContent("Your contact person at OS Immobilien");
    expect(screen.getByTestId("abschnitt-rechtliches")).toHaveTextContent("German version prevails");
    expect(document.documentElement.getAttribute("lang")).toBe("en");
    // Keine deutschen Abschnittsüberschriften mehr.
    expect(document.body.textContent).not.toMatch(/Nächste Schritte|Wirtschaftlichkeit|Chancen und Risiken|Dein Ansprechpartner/);
    expect(document.body.textContent).not.toMatch(/[–—]/);
    expect(document.body.textContent).not.toMatch(/advisor/i);
  });

  it("die Mikrolage folgt der Sprache", async () => {
    antwort = payload({ sprache: "en" });
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}`);
    const liste = await screen.findByTestId("mikrolage-liste");
    expect(liste).toHaveTextContent("Shopping");
    expect(liste).toHaveTextContent("Supermarket");
    expect(liste).toHaveTextContent("REWE");
  });
});

describe("Rückfall Deutsch", () => {
  it("mit Token, aber ohne sprache: deutsch", async () => {
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}`);
    expect(await screen.findByTestId("abschnitt-objektdaten")).toHaveTextContent("Objektdaten");
    expect(screen.getByTestId("expose-rechner")).toHaveAttribute("lang", "de");
    expect(document.documentElement.getAttribute("lang")).toBe("de");
  });

  it("ohne Token zählt eine Sprache vom Server nicht: deutsch", async () => {
    antwort = payload({ sprache: "en" });
    renderMit("/expose/o1/wohnung/w7");
    expect(await screen.findByTestId("abschnitt-objektdaten")).toHaveTextContent("Objektdaten");
  });
});

describe("?lang= in der Adresse geht vor", () => {
  it("Server en, ?lang=de: deutsch", async () => {
    antwort = payload({ sprache: "en" });
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}&lang=de`);
    expect(await screen.findByTestId("abschnitt-objektdaten")).toHaveTextContent("Objektdaten");
    expect(screen.getByTestId("finanzierungsparameter")).toHaveTextContent("Finanzierungsparameter");
  });

  it("Server de, ?lang=en: englisch", async () => {
    antwort = payload({ sprache: "de" });
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}&lang=en`);
    expect(await screen.findByTestId("abschnitt-objektdaten")).toHaveTextContent("Property details");
  });

  it("„View“ in der Einheitentabelle nimmt Schlüssel, Vorschau und lang mit, aber kein aufruf", async () => {
    antwort = payload({ sprache: "en" });
    renderMit(`/expose/o1?token=${TOKEN}&lang=en&vorschau=1`);
    const tabelle = await screen.findByTestId("einheiten-tabelle");
    const link = within(tabelle).getByRole("link", { name: "Exposé for unit 7" });
    const ziel = new URL(link.getAttribute("href") || "", "http://x");
    expect(ziel.pathname).toBe("/expose/o1/wohnung/w7");
    expect(ziel.searchParams.get("token")).toBe(TOKEN);
    expect(ziel.searchParams.get("lang")).toBe("en");
    expect(ziel.searchParams.get("vorschau")).toBe("1");
    expect(ziel.searchParams.has("aufruf")).toBe(false);
  });

  it("anonym mit ?lang=en: englisch", async () => {
    renderMit("/expose/o1?lang=en");
    expect(await screen.findByTestId("abschnitt-objektdaten")).toHaveTextContent("Property details");
  });
});

describe("Abgelaufener Link", () => {
  it("mit sprache en: der Hinweis englisch", async () => {
    antwort = { abgelaufen: true, sprache: "en", ansprechpartner: { name: "Paula Partner", email: "paula@example.com" } };
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}`);
    const hinweis = await screen.findByTestId("link-nicht-mehr-gueltig");
    expect(hinweis).toHaveTextContent("This link is no longer valid");
    expect(hinweis).toHaveTextContent("Your contact");
    expect(hinweis).toHaveTextContent("Paula Partner");
  });

  it("ohne sprache: deutsch", async () => {
    antwort = { abgelaufen: true };
    renderMit(`/expose/o1?token=${TOKEN}`);
    expect(await screen.findByTestId("link-nicht-mehr-gueltig")).toHaveTextContent("Dieser Link ist nicht mehr gültig");
  });
});

describe("Objekttexte aus der Datenbank (Entscheidung 12)", () => {
  it("Englisch ohne objekttexteKiEn: deutscher Text mit Vermerk", async () => {
    antwort = payload({ sprache: "en" });
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}`);
    const block = await screen.findByTestId("beschreibung-block");
    expect(block).toHaveTextContent("Ruhige Wohnung am Park.");
    expect(within(block).getByTestId("nur-deutsch-hinweis")).toHaveTextContent("Description available in German only");
    expect(screen.getByTestId("abschnitt-standort")).toHaveTextContent("Description available in German only");
  });

  it("Englisch mit objekttexteKiEn: englischer Text ohne Vermerk", async () => {
    antwort = payload({ sprache: "en" }, { objekttexteKiEn: { kurzbeschreibung: "Quiet flat by the park.", standortargumente: ["Location. Close to the centre."] } });
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}`);
    const block = await screen.findByTestId("beschreibung-block");
    expect(block).toHaveTextContent("Quiet flat by the park.");
    expect(screen.queryAllByTestId("nur-deutsch-hinweis")).toHaveLength(0);
    expect(screen.getByTestId("standort-argumente")).toHaveTextContent("Close to the centre.");
  });

  it("Deutsch: nie ein Vermerk, auch wenn es eine englische Fassung gibt", async () => {
    antwort = payload({}, { objekttexteKiEn: { kurzbeschreibung: "Quiet flat by the park." } });
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}`);
    expect(await screen.findByTestId("beschreibung-block")).toHaveTextContent("Ruhige Wohnung am Park.");
    expect(screen.queryAllByTestId("nur-deutsch-hinweis")).toHaveLength(0);
  });
});
