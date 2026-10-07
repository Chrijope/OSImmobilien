import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { baueAntwort } from "../../supabase/functions/get-kundenansicht/antwort.ts";

/**
 * Der Kundenlink zur Objektübersicht (`/immobilie/:token`), Bauplan vom
 * 23.09.2026. Die Antworten baut `baueAntwort` aus Tabellenzeilen, also
 * dieselbe Positivliste wie im Server.
 */

const zustand = vi.hoisted(() => ({
  antworten: [] as Array<{ status: number; body: unknown }>,
  aufrufe: [] as Array<Record<string, unknown>>,
  pdf: [] as unknown[][],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    rpc: async () => ({ data: null, error: null }),
  },
}));
// Die Galerie hat ihren eigenen Test. Hier zählt nur, welche Fotos sie bekommt.
vi.mock("@/components/objektseite/Galerie", () => ({
  Galerie: ({ bilder, kundenModus }: { bilder: unknown[]; kundenModus?: boolean }) => (
    <div data-testid="galerie" data-anzahl={bilder.length} data-kunde={String(!!kundenModus)} />
  ),
}));
vi.mock("@/lib/kundenansichtExpose", () => ({
  kundenExposePdf: async (...args: unknown[]) => {
    zustand.pdf.push(args);
    return { blob: new Blob(["pdf"]), dateiname: "Expose.pdf" };
  },
}));

const { default: KundenansichtPublic } = await import("./KundenansichtPublic");

const TOKEN = "b".repeat(64);
const JETZT = new Date("2026-09-23T12:00:00Z");

function einheit(id: string, weNr: string, weiteres: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, objekt_id: "o1", we_nr: weNr, etage: "1. OG", lage: "", groesse: 55, zimmer: 2,
    miete_gesamt: 700, vk_gesamt: 210000, vermietet: true, status: "frei",
    meta: { investagonRaw: { visibility: 1, active: 1 }, bilder: [{ id: `b-${id}`, url: `https://cdn.example/${id}.jpg` }] },
    ...weiteres,
  };
}

function objektZeile(weiteres: Record<string, unknown> = {}, meta: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "o1", titel: "Parkstraße 8", adresse: "Parkstraße 8", plz: "86150", ort: "Augsburg", global_objekt: false,
    global_baujahr: 1965, global_verkaufspreis: 1_900_000, global_jahresnettomiete: 90_000,
    meta: { kurzbeschreibung: "Ein gepflegtes Haus in ruhiger Lage.", verwaltung: "Hausverwaltung Muster", ...meta },
    ...weiteres,
  };
}

const PARTNER = { name: "Petra Partner", email: "petra@example.org", telefon: "+49 151 1111111" };

function antwort(e: { objekt?: Record<string, unknown>; wohnungen: Array<Record<string, unknown>>; einstiegId: string | null; kontaktId?: string | null }) {
  return baueAntwort({
    objekt: e.objekt ?? objektZeile(),
    objektBilder: [{ id: "h1", url: "https://cdn.example/haus.jpg" }],
    wohnungen: e.wohnungen,
    objektDokumente: [],
    kontaktId: e.kontaktId ?? "k1",
    einstiegId: e.einstiegId,
    partner: PARTNER,
    jetzt: JETZT,
  });
}

const HAUS = [einheit("w3", "WE 3"), einheit("w7", "WE 7"), einheit("w9", "WE 9"), einheit("w2", "WE 2", { status: "reserviert", kunde_id: "fremd" })];

function Ort() {
  const l = useLocation();
  return <output data-testid="ort">{l.pathname}{l.search}</output>;
}

function zeige(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route path="/immobilie/:token" element={<KundenansichtPublic />} />
        <Route path="/immobilie/:token/wohnung/:weId" element={<KundenansichtPublic />} />
      </Routes>
      <Ort />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  zustand.antworten = [];
  zustand.aufrufe = [];
  zustand.pdf = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    zustand.aufrufe.push(JSON.parse(String(init.body)));
    const naechste = zustand.antworten.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(naechste.body), { status: naechste.status });
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  // Das Herunterladen klickt einen Link an, jsdom kann nicht navigieren.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  // Die Regler im Reiter Finanzen messen ihre Größe.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});

describe("Haus mit mehreren Wohnungen", () => {
  it("springt zur Einstiegswohnung, zählt einmal und zeigt Partner und Wohnung", async () => {
    zustand.antworten.push({ status: 200, body: antwort({ wohnungen: HAUS, einstiegId: "w7" }) });
    zeige(`/immobilie/${TOKEN}`);
    expect(await screen.findByRole("heading", { name: "Wohnung 7" })).toBeInTheDocument();
    expect(screen.getByTestId("ort")).toHaveTextContent(`/immobilie/${TOKEN}/wohnung/w7`);
    expect(zustand.aufrufe).toEqual([{ aktion: "laden", token: TOKEN, aufruf: true }]);
    expect(screen.getByTestId("kunden-ansprechpartner")).toHaveTextContent("Petra Partner");
    expect(screen.getByTestId("chip-verfuegbar")).toBeInTheDocument();
    // Nur die freien Wohnungen stehen zur Wahl, die reservierte fehlt ganz.
    const wechsel = screen.getByTestId("wohnungswechsel");
    expect(within(wechsel).getAllByRole("button").map((b) => b.textContent)).toEqual([
      expect.stringContaining("Wohnung 3"), expect.stringContaining("Wohnung 7"), expect.stringContaining("Wohnung 9"),
    ]);
    expect(screen.queryByText(/Wohnung 2\b/)).not.toBeInTheDocument();
  });

  it("wechselt ohne Neuladen, der Reiter bleibt, und der Weg zurück zum Haus geht", async () => {
    zustand.antworten.push({ status: 200, body: antwort({ wohnungen: HAUS, einstiegId: "w7" }) });
    zeige(`/immobilie/${TOKEN}`);
    await screen.findByRole("heading", { name: "Wohnung 7" });

    const finanzen = screen.getByRole("tab", { name: "Finanzen" });
    fireEvent.mouseDown(finanzen);
    fireEvent.click(finanzen);
    await waitFor(() => expect(screen.getByRole("tab", { name: "Finanzen" })).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByTestId("finanzen-hinweis")).toHaveTextContent("Beispielrechnung mit Standardannahmen, keine Finanzierungszusage.");

    fireEvent.click(within(screen.getByTestId("wohnungswechsel")).getByRole("button", { name: /Wohnung 9/ }));
    expect(await screen.findByRole("heading", { name: "Wohnung 9" })).toBeInTheDocument();
    expect(screen.getByTestId("ort")).toHaveTextContent(`/immobilie/${TOKEN}/wohnung/w9`);
    expect(screen.getByRole("tab", { name: "Finanzen" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: /Zur Hausübersicht/ }));
    expect(await screen.findByTestId("kunden-hausebene")).toBeInTheDocument();
    expect(screen.getByTestId("ort").textContent).toBe(`/immobilie/${TOKEN}`);
    expect(screen.getByTestId("anzahl-verfuegbar")).toHaveTextContent("3 Wohnungen verfügbar");
    // Selbst gewählte Hausübersicht: kein Sprung zurück und kein Hinweis „vergeben“.
    expect(screen.queryByTestId("hinweis-vergeben")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("zeile-w3"));
    expect(await screen.findByRole("heading", { name: "Wohnung 3" })).toBeInTheDocument();
    // Alles mit einem einzigen Laden.
    expect(zustand.aufrufe).toHaveLength(1);
  });

  it("zeigt nichts Internes", async () => {
    zustand.antworten.push({ status: 200, body: antwort({ wohnungen: HAUS, einstiegId: "w7" }) });
    zeige(`/immobilie/${TOKEN}`);
    await screen.findByRole("heading", { name: "Wohnung 7" });
    for (const intern of [/Kunde sieht/, /nur CRM/, /Einheit pflegen/, /Wohnung bearbeiten/, /Objekt bearbeiten/, /Investmentkalkulation/, /Exposé für Kunden/, /Kundenlink/, /\bCRM\b/, /Verkaufsstand/, /vorgemerkt/i]) {
      expect(screen.queryAllByText(intern)).toHaveLength(0);
    }
    expect(screen.queryAllByRole("tab").map((t) => t.textContent)).toEqual(["Übersicht", "Dokumente", "Finanzen", "Karte"]);
  });

  /*
   * Reiter „Karte“ (Christian, 24.09.2026): zuerst die Karte, daneben oder
   * darunter Mikro- und Makrolage. Die Standortanalyse geht durch dieselbe
   * Positivliste wie im Server; die Zeile hier ist absichtlich vergiftet.
   */
  it("zeigt im Reiter Karte die Karte mit Mikro- und Makrolage und nichts Internes", async () => {
    const objekt = objektZeile({}, {
      standortanalyse: {
        schema: 2, messfassung: 2, gemessen_am: "2026-09-23T20:00:00Z",
        objekt_koordinaten: { lat: 48.37, lng: 10.89 },
        genauigkeit: "adresse", gemessene_adresse: { adresse: "Parkstraße 8", plz: "86150", ort: "Augsburg" },
        mikrolage: {
          einkaufen: [{ name: "Testmarkt", typ: "Supermarkt", entfernung_m: 320, lat: 48.371, lng: 10.891, osm_id: 4711 }],
          hochschulen: [{ name: "Universität Nah", typ: "Hochschule", entfernung_m: 2400 }],
          kliniken: [{ name: "Klinikum Test", typ: "Krankenhaus", entfernung_m: 4100 }],
          gewerbe: [{ name: "GIFT Werk", typ: "Gewerbefläche", entfernung_m: 900 }],
        },
        mikrolage_hinweis: "Entfernungen als Luftlinie, Einrichtungen aus OpenStreetMap, Stand der Abfrage.",
        arbeitgeber: [{ name: "GIFT Erfunden AG", mitarbeiter: 5000 }],
        makrolage: { einwohner: 999999, beschreibung: "GIFT Regionstext" },
      },
    });
    zustand.antworten.push({ status: 200, body: antwort({ objekt, wohnungen: HAUS, einstiegId: "w7" }) });
    zeige(`/immobilie/${TOKEN}`);
    await screen.findByRole("heading", { name: "Wohnung 7" });
    // Die Karte steht nicht mehr unten in der Übersicht, sondern im eigenen Reiter.
    expect(screen.queryByTestId("kunden-lagekarte")).not.toBeInTheDocument();

    const karte = screen.getByRole("tab", { name: "Karte" });
    fireEvent.mouseDown(karte);
    fireEvent.click(karte);
    await waitFor(() => expect(screen.getByRole("tab", { name: "Karte" })).toHaveAttribute("aria-selected", "true"));
    const lage = screen.getByTestId("kunden-lagekarte");
    expect(within(lage).getByTestId("mikrolage-karte-feld")).toBeInTheDocument();
    expect(within(lage).getByTestId("mikrolage-einkaufen")).toHaveTextContent("Testmarkt");
    expect(within(lage).getByTestId("makrolage-hochschulen")).toHaveTextContent("Universität Nah");
    expect(within(lage).getByTestId("makrolage-kliniken")).toHaveTextContent("Klinikum Test");
    expect(screen.queryAllByText(/GIFT/)).toHaveLength(0);
    expect(document.body.textContent).not.toContain("999999");

    // Beim Wechsel der Wohnung bleibt der Reiter Karte stehen.
    fireEvent.click(within(screen.getByTestId("wohnungswechsel")).getByRole("button", { name: /Wohnung 9/ }));
    expect(await screen.findByRole("heading", { name: "Wohnung 9" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Karte" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("kunden-lagekarte")).toBeInTheDocument();
  });

  it("sagt im Reiter Karte ehrlich, wenn zur Lage nichts vorliegt", async () => {
    const objekt = objektZeile({ adresse: "", titel: "Objekt ohne Adresse", plz: "", ort: "" });
    zustand.antworten.push({ status: 200, body: antwort({ objekt, wohnungen: HAUS, einstiegId: "w7" }) });
    zeige(`/immobilie/${TOKEN}`);
    await screen.findByRole("heading", { name: "Wohnung 7" });
    const karte = screen.getByRole("tab", { name: "Karte" });
    fireEvent.mouseDown(karte);
    fireEvent.click(karte);
    expect(await screen.findByTestId("kunden-karte-leer")).toHaveTextContent("Zur Lage dieser Immobilie liegen noch keine Angaben vor.");
    expect(screen.queryByTestId("mikrolage-karte")).not.toBeInTheDocument();
  });

  it("zeigt unter Beschreibung und Standort die Marktargumente, nur den Wortlaut, auf Wohnung und Haus", async () => {
    const markt = [
      "Gefragter Arbeitsmarkt. Arbeitslosenquote 3,1 Prozent, Destatis, Stand 07/2026.",
      "Wachsende Stadt. 301.000 Einwohner, Statistisches Landesamt, Stand 12/2025.",
    ];
    const objekt = objektZeile({}, {
      marktargumente: markt,
      objekttexteKi: { kurzbeschreibung: "Anderer Text", marktargumente: markt.map((argument) => ({ argument, beleg: "Interne Belegzeile Markt" })) },
    });
    zustand.antworten.push({ status: 200, body: antwort({ objekt, wohnungen: HAUS, einstiegId: "w7" }) });
    zeige(`/immobilie/${TOKEN}`);
    await screen.findByRole("heading", { name: "Wohnung 7" });
    const block = screen.getByTestId("kunden-marktargumente");
    expect(within(screen.getByTestId("kunden-beschreibung")).getByTestId("kunden-marktargumente")).toBe(block);
    expect(block).toHaveTextContent("Markt und Standort");
    expect(block).toHaveTextContent("Gefragter Arbeitsmarkt Arbeitslosenquote 3,1 Prozent, Destatis, Stand 07/2026.");
    expect(block).toHaveTextContent("Aus der Marktanalyse, Quelle und Stand je Aussage.");
    // Wortgleich mit dem Lauf: Seit dem 24.09.2026 steht weder ein Vermerk „Automatisch erstellt“ noch der Beleg dabei.
    expect(block).not.toHaveTextContent("Automatisch erstellt");
    expect(screen.queryByText(/Interne Belegzeile/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Zur Hausübersicht/ }));
    await screen.findByTestId("kunden-hausebene");
    expect(screen.getByTestId("kunden-marktargumente")).toHaveTextContent("Wachsende Stadt");
  });

  it("zeigt ohne Marktargumente keinen Block „Markt und Standort“", async () => {
    zustand.antworten.push({ status: 200, body: antwort({ wohnungen: HAUS, einstiegId: "w7" }) });
    zeige(`/immobilie/${TOKEN}`);
    await screen.findByRole("heading", { name: "Wohnung 7" });
    expect(screen.getByTestId("kunden-beschreibung")).toBeInTheDocument();
    expect(screen.queryByTestId("kunden-marktargumente")).not.toBeInTheDocument();
    expect(screen.queryByText("Markt und Standort")).not.toBeInTheDocument();
  });

  it("zählt nicht, wenn der Partner den Link aus dem Kundenprofil öffnet (?vorschau=1)", async () => {
    zustand.antworten.push({ status: 200, body: antwort({ wohnungen: HAUS, einstiegId: "w7" }) });
    zeige(`/immobilie/${TOKEN}?vorschau=1`);
    await screen.findByRole("heading", { name: "Wohnung 7" });
    expect(zustand.aufrufe).toEqual([{ aktion: "laden", token: TOKEN }]);
    expect(screen.getByTestId("ort")).toHaveTextContent(`/immobilie/${TOKEN}/wohnung/w7?vorschau=1`);
  });

  it("sagt, dass die Wohnung aus dem Link vergeben ist, und zeigt die freien darunter", async () => {
    zustand.antworten.push({ status: 200, body: antwort({ wohnungen: HAUS, einstiegId: "w2" }) });
    zeige(`/immobilie/${TOKEN}`);
    expect(await screen.findByTestId("hinweis-vergeben")).toHaveTextContent("Diese Wohnung ist inzwischen vergeben. Dein Ansprechpartner zeigt dir gern Alternativen.");
    expect(screen.getByTestId("kunden-verfuegbare-wohnungen")).toHaveTextContent("Wohnung 3");
    expect(screen.getByTestId("ort").textContent).toBe(`/immobilie/${TOKEN}`);
  });

  it("zeigt die für genau diesen Kunden reservierte Einstiegswohnung mit „Für dich reserviert“", async () => {
    const wohnungen = [...HAUS, einheit("w5", "WE 5", { status: "reserviert", kunde_id: "k1" })];
    zustand.antworten.push({ status: 200, body: antwort({ wohnungen, einstiegId: "w5" }) });
    zeige(`/immobilie/${TOKEN}`);
    expect(await screen.findByRole("heading", { name: "Wohnung 5" })).toBeInTheDocument();
    expect(screen.getByTestId("chip-fuer-dich")).toHaveTextContent("Für dich reserviert");
  });

  it("lädt das Exposé dieser Wohnung als PDF-Datei", async () => {
    zustand.antworten.push({ status: 200, body: antwort({ wohnungen: HAUS, einstiegId: "w7" }) });
    zeige(`/immobilie/${TOKEN}`);
    await screen.findByRole("heading", { name: "Wohnung 7" });
    fireEvent.click(screen.getByTestId("expose-herunterladen"));
    await waitFor(() => expect(zustand.pdf).toHaveLength(1));
    const [objekt, wohnung, partner] = zustand.pdf[0] as [{ id: string }, { id: string } | null, { name: string }];
    expect(objekt.id).toBe("o1");
    expect(wohnung?.id).toBe("w7");
    expect(partner.name).toBe("Petra Partner");
  });
});

describe("Einzelobjekt und Globalobjekt", () => {
  it("zeigt beim Einzelobjekt nur die Wohnung, ohne Wechsel und ohne Hausübersicht", async () => {
    zustand.antworten.push({ status: 200, body: antwort({ objekt: objektZeile({}, { einzelwohnung: true }), wohnungen: [einheit("w1", "WE 1")], einstiegId: null }) });
    zeige(`/immobilie/${TOKEN}`);
    expect(await screen.findByRole("heading", { name: "Wohnung 1" })).toBeInTheDocument();
    expect(screen.queryByTestId("wohnungswechsel")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Zur Hausübersicht/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("kunden-objektangaben")).toHaveTextContent("Hausverwaltung Muster");
    expect(screen.getByTestId("ort").textContent).toBe(`/immobilie/${TOKEN}`);
  });

  it("zeigt beim Globalobjekt nur das Haus, mit Mietenspiegel ohne Einzelpreise und dem Exposé des Hauses", async () => {
    zustand.antworten.push({ status: 200, body: antwort({ objekt: objektZeile({ global_objekt: true }), wohnungen: [einheit("w1", "WE 1"), einheit("w2", "WE 2")], einstiegId: null }) });
    zeige(`/immobilie/${TOKEN}/wohnung/w1`);
    expect(await screen.findByTestId("kunden-hausebene-global")).toBeInTheDocument();
    // Eine Wohnung in der Adresse wird zum Haus.
    expect(screen.getByTestId("ort").textContent).toBe(`/immobilie/${TOKEN}`);
    const spiegel = screen.getByTestId("kunden-mietenspiegel");
    expect(within(spiegel).queryByText("Kaufpreis")).not.toBeInTheDocument();
    expect(within(spiegel).queryByText(/210\.000/)).not.toBeInTheDocument();
    expect(within(spiegel).getByText("WE 1")).toBeInTheDocument();
    expect(screen.getByTestId("kunden-kacheln")).toHaveTextContent("1.900.000");
    fireEvent.click(screen.getByTestId("expose-herunterladen"));
    await waitFor(() => expect(zustand.pdf).toHaveLength(1));
    expect(zustand.pdf[0][1]).toBeNull();
  });
});

describe("Wenn es nichts zu zeigen gibt", () => {
  it("zeigt bei abgelaufenem Link nur den Partner und den Satz zur Objektübersicht", async () => {
    zustand.antworten.push({ status: 410, body: { abgelaufen: true, ansprechpartner: PARTNER } });
    zeige(`/immobilie/${TOKEN}`);
    expect(await screen.findByTestId("link-nicht-mehr-gueltig")).toHaveTextContent("zu deiner Objektübersicht");
    expect(screen.getByTestId("abgelaufen-ansprechpartner")).toHaveTextContent("Petra Partner");
  });

  it("zeigt bei vergebenem Haus einen Hinweis mit dem Partner", async () => {
    zustand.antworten.push({ status: 200, body: { vergeben: true, struktur: "globalobjekt", ansprechpartner: PARTNER } });
    zeige(`/immobilie/${TOKEN}`);
    expect(await screen.findByTestId("kundenansicht-hinweis")).toHaveTextContent("Diese Immobilie ist inzwischen vergeben");
    expect(screen.getByTestId("kunden-ansprechpartner")).toHaveTextContent("Petra Partner");
  });

  it("sagt bei einer nicht ausgerollten Function nicht, der Link sei ungültig", async () => {
    // Die 404 von Supabase selbst, ohne `error`: Der Link stimmt, nur die Function fehlt.
    zustand.antworten.push({ status: 404, body: { code: "NOT_FOUND", message: "Requested function was not found" } });
    zeige(`/immobilie/${TOKEN}`);
    const hinweis = await screen.findByTestId("kundenansicht-hinweis");
    expect(hinweis).toHaveTextContent("Die Seite lässt sich gerade nicht laden");
    expect(hinweis).not.toHaveTextContent("nicht mehr gültig");
    expect(hinweis).not.toHaveTextContent(/404|Requested function/);
  });

  it("zeigt bei der eigenen 404 der Function „nicht verfügbar“", async () => {
    zustand.antworten.push({ status: 404, body: { error: "Diese Seite ist nicht verfügbar." } });
    zeige(`/immobilie/${TOKEN}`);
    expect(await screen.findByTestId("kundenansicht-hinweis")).toHaveTextContent("Diese Seite ist nicht verfügbar");
  });

  it("fragt mit einem kaputten Schlüssel gar nicht erst beim Server", async () => {
    zeige("/immobilie/kaputt");
    expect(await screen.findByTestId("kundenansicht-hinweis")).toHaveTextContent("Diese Seite ist nicht verfügbar");
    expect(zustand.aufrufe).toHaveLength(0);
  });
});
