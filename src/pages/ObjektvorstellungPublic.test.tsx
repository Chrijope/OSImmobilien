import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

/**
 * Die abgeschaltete Objektvorstellung (`/objektvorstellung/:token`) seit dem
 * 23.09.2026: Verschickte Links zeigen nur noch einen Hinweis mit dem
 * Partner. Auch wenn der Server noch eine ältere, gesprächige Antwort
 * schickt, erscheint davon nichts außer Name, Telefon, E-Mail und Bild.
 */

// `ansprechpartnerAusAntwort` hängt über `objekteStore` am Supabase-Client.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
  },
}));

const { default: ObjektvorstellungPublic } = await import("./ObjektvorstellungPublic");

const TOKEN = "0123456789abcdef0123456789abcdef";
const PARTNER = { name: "Paula Partner", telefon: "0171 234567", email: "paula@more.immo", bild: "https://cdn.example/paula.jpg" };

let antwort: { status: number; body: unknown } | "netzfehler" = { status: 410, body: {} };
const aufrufe: string[] = [];

beforeEach(() => {
  aufrufe.length = 0;
  vi.stubGlobal("fetch", async (url: string) => {
    aufrufe.push(url);
    if (antwort === "netzfehler") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(antwort.body), { status: antwort.status });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function oeffne(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/objektvorstellung/${token}`]}>
      <Routes>
        <Route path="/objektvorstellung/:token" element={<ObjektvorstellungPublic />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ObjektvorstellungPublic", () => {
  it("zeigt nur den Hinweis mit Name, Telefon, E-Mail und Bild des Partners", async () => {
    antwort = { status: 410, body: { nichtMehrVerfuegbar: true, ansprechpartner: PARTNER } };
    oeffne(TOKEN);

    const seite = await screen.findByTestId("link-nicht-mehr-gueltig");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Diese Objektvorstellung ist nicht mehr verfügbar");
    expect(seite).toHaveTextContent("Dein Ansprechpartner schickt dir gern die aktuelle Objektübersicht.");
    expect(screen.getByTestId("abgelaufen-ansprechpartner")).toHaveTextContent("Paula Partner");
    expect(screen.getByTestId("abgelaufen-telefon")).toHaveAttribute("href", "tel:0171234567");
    expect(screen.getByTestId("abgelaufen-email")).toHaveAttribute("href", "mailto:paula@more.immo");
    expect(screen.getByRole("img", { name: "Paula Partner" })).toHaveAttribute("src", "https://cdn.example/paula.jpg");

    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0]).toContain(`get-objektvorstellung?token=${TOKEN}`);
  });

  it("zeigt aus einer älteren, gesprächigen Antwort nichts außer dem Partner", async () => {
    // So antwortete die Function vor der Abschaltung. Solange sie nicht neu
    // ausgerollt ist, kann das noch ankommen.
    antwort = {
      status: 200,
      body: {
        vorstellung: { titel: "GIFT Titel", begruessung: "GIFT Begrüßung", konfig: { freitext: "GIFT Freitext" } },
        kontakt: { vorname: "GIFT Kundin", meta: { analyseErgebnis: { empfohleneAssetklasse: "GIFT" } } },
        investment: { meta: { saData: { einkommen: { netto: "GIFT" } } } },
        objekt: { titel: "GIFT Objekt", preis_von: 999999, meta: { investagonRaw: { commission: 8.403 } } },
        wohnungen: [{ we_nr: "GIFT WE", kunde_name: "GIFT Käufer" }],
        dokumente: [{ name: "GIFT.pdf", url: "https://GIFT.example/signiert.pdf" }],
        finanz: { sumEinkuenfte: 4000 },
        ansprechpartner: { id: "u-GIFT", name: "Paula Partner", email: "paula@more.immo", telefon: "0171 234567", buchungslink: "https://GIFT.example" },
      },
    };
    const { container } = oeffne(TOKEN);

    await screen.findByTestId("abgelaufen-ansprechpartner");
    expect(container).not.toHaveTextContent(/GIFT|999|Kaufpreis|Standort|Musterberechnung/);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.innerHTML).not.toContain("GIFT");
  });

  it("zeigt bei einem unbekannten Link den Hinweis mit der allgemeinen Adresse", async () => {
    antwort = { status: 404, body: { error: "Nicht gefunden" } };
    oeffne(TOKEN);

    await screen.findByTestId("link-nicht-mehr-gueltig");
    expect(screen.queryByTestId("abgelaufen-ansprechpartner")).toBeNull();
    expect(screen.getByTestId("abgelaufen-email")).toHaveAttribute("href", "mailto:office@more.immo");
  });

  it("zeigt den Hinweis auch bei einem Netzfehler", async () => {
    antwort = "netzfehler";
    oeffne(TOKEN);

    await screen.findByTestId("link-nicht-mehr-gueltig");
    expect(screen.getByTestId("abgelaufen-email")).toHaveAttribute("href", "mailto:office@more.immo");
  });

  it("fragt bei einem kaputten Token gar nicht erst den Server", async () => {
    oeffne("kaputt");

    await screen.findByTestId("link-nicht-mehr-gueltig");
    expect(aufrufe).toHaveLength(0);
  });
});
