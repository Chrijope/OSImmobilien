import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

/**
 * Der öffentliche Kundenlink: Der Kasten „Dein Ansprechpartner“ über den
 * Bildern erscheint nur, wenn `get-expose` zu einem gültigen Token eines
 * Kunden-Exposés einen Partner nennt. Ohne Token bleibt er weg, und der
 * Kontakt unten zeigt den Weg zu OS Immobilien statt „Nicht hinterlegt“.
 */

beforeAll(() => {
  class RO { observe() { /* leer */ } unobserve() { /* leer */ } disconnect() { /* leer */ } }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

vi.mock("@/integrations/supabase/client", () => {
  const kette: Record<string, unknown> = {};
  for (const m of ["select", "eq", "maybeSingle"]) kette[m] = () => kette;
  // `profiles_public` ist für einen nicht angemeldeten Besucher leer.
  kette.then = (res: (v: unknown) => unknown) => Promise.resolve(res({ data: null, error: null }));
  return { supabase: { from: () => kette } };
});
vi.mock("@/lib/storage", () => ({ objektUnterlagenBefristen: async <T,>(o: T) => o }));

const TOKEN = "ab".repeat(32);
const aufrufe: string[] = [];

function payload(mitPartner: boolean) {
  return {
    objekt: {
      id: "o1", titel: "Objekt am Park", adresse: "Parkstraße 8", plz: "86150", ort: "Augsburg", sichtbar: true, global_baujahr: 1984,
      meta: {
        objekttexteKi: { sanierungen: [{ jahr: "2024", massnahme: "Dach erneuert" }] },
        standortanalyse: { schema: 2, objekt_koordinaten: { lat: 48.3, lng: 10.9 }, mikrolage: { einkaufen: [{ name: "REWE", typ: "Supermarkt", entfernung_m: 300, lat: 48.301, lng: 10.901 }] } },
      },
    },
    bilder: [],
    dokumente: [],
    wohnungen: [{ id: "w7", we_nr: "7", groesse: 65, zimmer: 3, vk_gesamt: 240000, miete_gesamt: 800, status: "frei", meta: {} }],
    ...(mitPartner ? { ansprechpartner: { name: "Paula Partner", telefon: "+49 89 123456", email: "paula@example.com", bild: "https://example.org/paula.jpg" } } : {}),
  };
}

/** Eine befristete Adresse aus dem eigenen Speicher, wie `get-expose` sie für „datei“ liefert. */
const SIGNIERT = "https://abc.supabase.co/storage/v1/object/sign/investagon-dokumente/o1/cccc1111-WE07.png?token=kurz";

/**
 * Die Antwort mit Grundrissen, dazu vergiftet: Rohdaten mit Originaladressen
 * bei Investagon, so als gäbe der Server sie noch heraus. Die Seite darf
 * daraus nie einen Plan bauen.
 */
function mitGrundriss(mitPartner: boolean) {
  const p = payload(mitPartner);
  const investagonRaw = { files: [{ id: 1, category: "layout", title: "Grundriss alt", original_filename: "alt.jpg", filename: "https://tool.investagon.com/files/alt.jpg" }] };
  return {
    ...p,
    objekt: { ...p.objekt, meta: { ...p.objekt.meta, investagonRaw } },
    wohnungen: p.wohnungen.map((w) => ({ ...w, meta: { investagonRaw } })),
    grundrisse: [{ id: "wd-g7", bereich: "wohnung", wohnungId: "w7", name: "Grundriss WE 7", istBild: true, url: "https://tool.investagon.com/files/eingeschmuggelt.png" }],
  };
}

let antwort: Record<string, unknown> = payload(true);
vi.stubGlobal("fetch", (url: string) => {
  aufrufe.push(String(url));
  if (String(url).includes("aktion=datei")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ url: SIGNIERT, name: "Grundriss WE 7" }) });
  return Promise.resolve({ ok: true, json: () => Promise.resolve(antwort) });
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

beforeEach(() => { aufrufe.length = 0; antwort = payload(true); });

describe("Öffentliches Exposé", () => {
  it("zeigt mit Token den Partner des Kunden-Exposés oben über den Bildern und unten im Kontakt", async () => {
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}`);
    const kasten = await screen.findByTestId("kunden-ansprechpartner");
    expect(kasten).toHaveTextContent("Paula Partner");
    expect(screen.getByTestId("kp-telefon")).toHaveAttribute("href", "tel:+4989123456");
    expect(screen.getByTestId("kp-email")).toHaveAttribute("href", "mailto:paula@example.com");
    expect(screen.getByTestId("abschnitt-kontakt")).toHaveTextContent("Paula Partner");
    // Token und Einheit gehen an get-expose, damit die Function prüfen kann, ob beides zusammenpasst.
    expect(aufrufe[0]).toContain(`token=${TOKEN}`);
    expect(aufrufe[0]).toContain("wohnung=w7");
  });

  it("zeigt ohne Token keinen Kasten und schickt auch keinen Token", async () => {
    antwort = payload(false);
    renderMit("/expose/o1/wohnung/w7");
    await screen.findByTestId("abschnitt-start");
    expect(screen.queryByTestId("kunden-ansprechpartner")).not.toBeInTheDocument();
    expect(aufrufe[0]).not.toContain("token=");
    await waitFor(() => expect(screen.getByTestId("kontakt-firma")).toHaveTextContent("os@os-immobilien.com"));
    expect(screen.getByTestId("abschnitt-kontakt")).not.toHaveTextContent("Nicht hinterlegt");
  });

  it("schickt einen Token in falscher Form gar nicht erst hinaus", async () => {
    antwort = payload(false);
    renderMit("/expose/o1/wohnung/w7?token=abc'%20or%201=1");
    await screen.findByTestId("abschnitt-start");
    expect(aufrufe[0]).not.toContain("token=");
  });

  it("holt den Grundriss mit Token einzeln als befristete Adresse und zeigt nie eine Investagon-Adresse", async () => {
    antwort = mitGrundriss(true);
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}`);
    const bild = await screen.findByAltText("Grundriss WE 7");
    expect(bild).toHaveAttribute("src", SIGNIERT);
    const datei = aufrufe.find((u) => u.includes("aktion=datei"));
    expect(datei).toBeDefined();
    const abfrage = new URL(datei!, "https://x.example").searchParams;
    expect(abfrage.get("token")).toBe(TOKEN);
    expect(abfrage.get("id")).toBe("o1");
    expect(abfrage.get("wohnung")).toBe("w7");
    expect(abfrage.get("bereich")).toBe("wohnung");
    expect(abfrage.get("datei")).toBe("wd-g7");
    // Weder die Rohdaten noch eine eingeschmuggelte Adresse in der Liste werden zum Plan.
    expect(document.body.innerHTML).not.toContain("investagon.com");
    expect(screen.queryByAltText("Grundriss alt")).not.toBeInTheDocument();
  });

  it("holt ohne Token keine Datei und zeigt keinen Plan aus Investagon", async () => {
    antwort = mitGrundriss(false);
    renderMit("/expose/o1/wohnung/w7");
    await screen.findByTestId("abschnitt-start");
    expect(aufrufe.some((u) => u.includes("aktion=datei"))).toBe(false);
    expect(screen.queryByAltText("Grundriss WE 7")).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("investagon.com");
  });

  it("zeigt die gekürzten Sanierungen und die gemessene Mikrolage auch im Kundenlink", async () => {
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}`);
    await screen.findByTestId("abschnitt-start");
    expect(screen.getByTestId("abschnitt-objektdaten")).toHaveTextContent("Dach erneuert (Angabe des Bauträgers)");
    expect(screen.getByTestId("mikrolage-einkaufen")).toHaveTextContent("REWE");
    // Der Zeitstrahl kurz wie die Vorlage, die Zahlungen hervorgehoben (seit 23.09.2026).
    expect(screen.getAllByTestId("zeitplan-zahlung").map((k) => k.textContent)).toEqual(["Mit Anzahlung wirksam", "nach Regelung im Kaufvertrag"]);
    expect(screen.getByTestId("abschnitt-zeitplan")).not.toHaveTextContent("Reservierungsgebühr");
  });

  it("zeigt die Karte im Kundenlink ohne gemessene Analyse aus der gespeicherten Lage, ohne Adresssuche", async () => {
    const p = payload(true);
    antwort = { ...p, objekt: { ...p.objekt, meta: { objekttexteKi: p.objekt.meta.objekttexteKi, koordinaten: { lat: 48.3, lng: 10.9, quelle: "investagon" } } } };
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}`);
    await screen.findByTestId("abschnitt-start");
    expect(screen.getByTestId("start-karte")).toHaveTextContent("Karte öffnen");
    expect(screen.getByTestId("mikrolage-ersatz")).toHaveTextContent("Parkstraße 8, 86150 Augsburg");
    expect(screen.getByTestId("mikrolage-karte-feld")).toBeInTheDocument();
    expect(screen.queryByTestId("mikrolage-liste")).not.toBeInTheDocument();
    // Nur get-expose, kein Geodienst.
    expect(aufrufe.every((u) => u.includes("get-expose"))).toBe(true);
    expect(aufrufe.some((u) => /photon|komoot|nominatim/i.test(u))).toBe(false);
  });

  it("zeigt im Kundenlink ohne Analyse und ohne Lage ruhig den Hinweis statt einer Karte", async () => {
    const p = payload(true);
    antwort = { ...p, objekt: { ...p.objekt, meta: { objekttexteKi: p.objekt.meta.objekttexteKi } } };
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}`);
    await screen.findByTestId("abschnitt-start");
    expect(screen.getByTestId("mikrolage-karte-ersatz")).toHaveTextContent("Die Karte zur Lage folgt.");
    expect(screen.queryByTestId("mikrolage-karte-feld")).not.toBeInTheDocument();
    expect(aufrufe.some((u) => /photon|komoot|nominatim/i.test(u))).toBe(false);
  });
});
