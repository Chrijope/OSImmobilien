import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { baueAntwort } from "../../supabase/functions/get-kundenansicht/antwort.ts";
import { KUNDENANSICHT_TEXTE } from "@/components/kundenansicht/kundenansichtTexte";
import { OBJEKTSEITE_KUNDEN_TEXTE } from "@/components/objektseite/objektseiteKundenTexte";
import { EINHEIT_FINANZEN_TEXTE } from "@/components/objektseite/einheitFinanzenTexte";
import { OBJEKTDETAILS_TEXTE } from "@/lib/objektdetailsAnzeigeTexte";
import { BLICK_ZEILEN_TEXTE } from "@/lib/blickZeilenTexte";
import { gedankenstrichFrei, textdateiLuecken } from "@/lib/seitenSprache";

/**
 * Kundenlink `/immobilie/:token` in Deutsch und Englisch (Kundensprache,
 * Etappe 3, S1). Die Sprache kommt von `get-kundenansicht`, `?lang=`
 * überschreibt die Anzeige, ohne beides bleibt es Deutsch.
 */

const zustand = vi.hoisted(() => ({ antworten: [] as Array<{ status: number; body: unknown }>, pdf: [] as unknown[][] }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    rpc: async () => ({ data: null, error: null }),
  },
}));
vi.mock("@/lib/kundenansichtExpose", () => ({
  kundenExposePdf: async (...args: unknown[]) => {
    zustand.pdf.push(args);
    return { blob: new Blob(["pdf"]), dateiname: "Expose.pdf" };
  },
}));

const { default: KundenansichtPublic } = await import("./KundenansichtPublic");

const TOKEN = "c".repeat(64);

function einheit(id: string, weNr: string): Record<string, unknown> {
  return {
    id, objekt_id: "o1", we_nr: weNr, etage: "1. OG", lage: "", groesse: 55, zimmer: 2,
    miete_gesamt: 700, vk_gesamt: 210000, vermietet: true, status: "frei",
    meta: { investagonRaw: { visibility: 1, active: 1 } },
  };
}

function antwort(sprache?: "de" | "en", meta: Record<string, unknown> = {}) {
  const a = baueAntwort({
    objekt: {
      id: "o1", titel: "Parkstraße 8", adresse: "Parkstraße 8", plz: "86150", ort: "Augsburg", global_objekt: false,
      meta: { kurzbeschreibung: "Ein gepflegtes Haus in ruhiger Lage.", ...meta },
    },
    objektBilder: [],
    wohnungen: [einheit("w3", "WE 3"), einheit("w7", "WE 7")],
    objektDokumente: [],
    kontaktId: "k1",
    einstiegId: null,
    partner: { name: "Petra Partner", email: "petra@example.org" },
    sprache,
    jetzt: new Date("2026-09-25T12:00:00Z"),
  });
  return { status: 200, body: a };
}

function zeige(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route path="/immobilie/:token" element={<KundenansichtPublic />} />
        <Route path="/immobilie/:token/wohnung/:weId" element={<KundenansichtPublic />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  zustand.antworten = [];
  vi.stubGlobal("fetch", async () => {
    const naechste = zustand.antworten.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(naechste.body), { status: naechste.status });
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

describe("Kundenansicht: Sprache", () => {
  it("nimmt die Sprache vom Server", async () => {
    zustand.antworten.push(antwort("en"));
    zeige(`/immobilie/${TOKEN}`);
    expect(await screen.findByText("Available flats")).toBeInTheDocument();
    expect(screen.getByTestId("kunden-ansprechpartner")).toHaveTextContent("Your contact");
    expect(screen.getByTestId("kunden-fuss")).toHaveTextContent("All information without guarantee");
    expect(document.documentElement.getAttribute("lang")).toBe("en");
  });

  it("zeigt deutsche Objekttexte auf Englisch mit dem Vermerk", async () => {
    zustand.antworten.push(antwort("en"));
    zeige(`/immobilie/${TOKEN}`);
    const beschreibung = await screen.findByTestId("kunden-beschreibung");
    expect(beschreibung).toHaveTextContent("Ein gepflegtes Haus in ruhiger Lage.");
    expect(beschreibung).toHaveTextContent("Description available in German only");
  });

  it("zeigt die englische Fassung aus meta.objekttexteKiEn ohne Vermerk", async () => {
    zustand.antworten.push(antwort("en", { objekttexteKiEn: { kurzbeschreibung: "A well-kept building in a quiet location." } }));
    zeige(`/immobilie/${TOKEN}`);
    const beschreibung = await screen.findByTestId("kunden-beschreibung");
    expect(beschreibung).toHaveTextContent("A well-kept building in a quiet location.");
    expect(beschreibung).not.toHaveTextContent("Description available in German only");
  });

  it("bleibt Deutsch ohne Sprache vom Server, ohne Vermerk", async () => {
    zustand.antworten.push(antwort(undefined));
    zeige(`/immobilie/${TOKEN}`);
    expect(await screen.findByText("Verfügbare Wohnungen")).toBeInTheDocument();
    expect(screen.getByTestId("kunden-ansprechpartner")).toHaveTextContent("Dein Ansprechpartner");
    expect(screen.queryByTestId("nur-deutsch-hinweis")).toBeNull();
  });

  it("überschreibt mit ?lang= nur die Anzeige", async () => {
    zustand.antworten.push(antwort("en"));
    zeige(`/immobilie/${TOKEN}?lang=de`);
    expect(await screen.findByText("Verfügbare Wohnungen")).toBeInTheDocument();

    zustand.antworten.push(antwort("de"));
    zeige(`/immobilie/${"d".repeat(64)}?lang=en`);
    expect(await screen.findByText("Available flats")).toBeInTheDocument();
  });

  it("zeigt die Wohnung englisch, samt Reitern, Kacheln und Finanzen", async () => {
    zustand.antworten.push(antwort("en"));
    zeige(`/immobilie/${TOKEN}/wohnung/w7`);
    expect(await screen.findByRole("heading", { name: "Flat 7" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Finances" })).toBeInTheDocument();
    expect(screen.getByTestId("kunden-kacheln")).toHaveTextContent("Total investment");
    expect(screen.getByTestId("kunden-kacheln")).toHaveTextContent("€210,000");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Finances" }));
    fireEvent.click(screen.getByRole("tab", { name: "Finances" }));
    expect(await screen.findByTestId("karte-finanzierung")).toHaveTextContent("Financing overview");
  });

  // Bis zum 25.09.2026 kam das PDF hier deutsch heraus, trotz englischem Knopf.
  it("lädt das Exposé-PDF in der Sprache der Seite", async () => {
    zustand.pdf = [];
    URL.createObjectURL = vi.fn(() => "blob:test");
    zustand.antworten.push(antwort("en"));
    zeige(`/immobilie/${TOKEN}/wohnung/w7`);
    fireEvent.click(await screen.findByRole("button", { name: /Download exposé/i }));
    await waitFor(() => expect(zustand.pdf).toHaveLength(1));
    expect(zustand.pdf[0][4]).toBe("en");

    zustand.pdf = [];
    zustand.antworten.push(antwort(undefined));
    zeige(`/immobilie/${"e".repeat(64)}/wohnung/w7`);
    fireEvent.click(await screen.findByRole("button", { name: /Exposé herunterladen/ }));
    await waitFor(() => expect(zustand.pdf).toHaveLength(1));
    expect(zustand.pdf[0][4]).toBe("de");
  });

  it("zeigt den abgelaufenen Link englisch", async () => {
    zustand.antworten.push({ status: 410, body: { abgelaufen: true, sprache: "en" } });
    zeige(`/immobilie/${TOKEN}`);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("This link is no longer valid");
  });

  it("zeigt die vergebene Immobilie englisch", async () => {
    zustand.antworten.push({ status: 200, body: { vergeben: true, struktur: "einzelwohnung", sprache: "en" } });
    zeige(`/immobilie/${TOKEN}`);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("This property has been taken in the meantime");
  });
});

describe("Kundenansicht: Textdateien vollständig", () => {
  it.each([
    ["Kundenansicht", KUNDENANSICHT_TEXTE],
    ["Objektseite im Kundenmodus", OBJEKTSEITE_KUNDEN_TEXTE],
    ["Finanzen", EINHEIT_FINANZEN_TEXTE],
    ["Objektdetails", OBJEKTDETAILS_TEXTE],
    ["Objektdetails-Zeilen", BLICK_ZEILEN_TEXTE],
  ])("%s: Deutsch und Englisch gleich aufgebaut, nichts leer, kein Gedankenstrich", (_name, texte) => {
    expect(textdateiLuecken(texte.de, texte.en)).toEqual([]);
  });

  it("Funktionstexte ohne Gedankenstrich und ohne „advisor“", () => {
    const beispiele = (wert: unknown): string[] => {
      if (typeof wert === "string") return [wert];
      if (typeof wert === "function") {
        const f = wert as (...a: unknown[]) => unknown;
        // Beispielwerte aller vorkommenden Arten; was mit einer Art nicht rechnen kann, fällt weg.
        const aufrufe: unknown[][] = [["X", "Y", "Z", "W"], [1, 2, true], [2, 3, false], [[2024, 2025]]];
        return aufrufe.flatMap((a) => { try { return [String(f(...a))]; } catch { return []; } });
      }
      if (Array.isArray(wert)) return wert.flatMap(beispiele);
      if (wert && typeof wert === "object") return Object.values(wert).flatMap(beispiele);
      return [];
    };
    for (const texte of [KUNDENANSICHT_TEXTE, OBJEKTSEITE_KUNDEN_TEXTE, EINHEIT_FINANZEN_TEXTE, OBJEKTDETAILS_TEXTE, BLICK_ZEILEN_TEXTE]) {
      for (const sprache of ["de", "en"] as const) {
        for (const text of beispiele(texte[sprache])) {
          expect(gedankenstrichFrei(text), text).toBe(true);
          if (sprache === "en") expect(text.toLowerCase(), text).not.toContain("advisor");
        }
      }
    }
  });
});
