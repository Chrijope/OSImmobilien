/**
 * Die abgeschaltete Objektvorstellung zeigt ihren Hinweis in der Sprache des
 * Kunden (Kundensprache, Etappe 3, S11).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// `ansprechpartnerAusAntwort` hängt über `objekteStore` am Supabase-Client.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    rpc: async () => ({ data: null, error: new Error("offline") }),
  },
}));

const { default: ObjektvorstellungPublic } = await import("./ObjektvorstellungPublic");
const { LinkNichtMehrGueltig } = await import("@/components/expose/LinkNichtMehrGueltig");
const { LINK_NICHT_MEHR_GUELTIG_TEXTE } = await import("@/components/expose/linkNichtMehrGueltigTexte");
const { textdateiLuecken } = await import("@/lib/seitenSprache");

const TOKEN = "0123456789abcdef0123456789abcdef";

function antwortet(body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => body }));
}

function zeige(pfad = `/objektvorstellung/${TOKEN}`) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes><Route path="/objektvorstellung/:token" element={<ObjektvorstellungPublic />} /></Routes>
    </MemoryRouter>,
  );
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("ObjektvorstellungPublic: Sprache", () => {
  it("nimmt die Sprache vom Server", async () => {
    antwortet({ nichtMehrVerfuegbar: true, sprache: "en", ansprechpartner: { name: "Paula Partner", email: "paula@more.immo" } });
    zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("This property presentation is no longer available");
    expect(screen.getByTestId("abgelaufen-ansprechpartner")).toHaveTextContent("Your contact");
  });

  it("bleibt Deutsch, wenn der Server keine Sprache schickt (ältere Function)", async () => {
    antwortet({ nichtMehrVerfuegbar: true });
    zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Diese Objektvorstellung ist nicht mehr verfügbar");
  });

  it("bleibt Deutsch bei einem Netzfehler", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Diese Objektvorstellung ist nicht mehr verfügbar");
  });

  it("lässt sich mit ?lang= für die Anzeige überschreiben", async () => {
    antwortet({ nichtMehrVerfuegbar: true, sprache: "en" });
    zeige(`/objektvorstellung/${TOKEN}?lang=de`);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Diese Objektvorstellung ist nicht mehr verfügbar");
  });
});

describe("LinkNichtMehrGueltig: Englisch", () => {
  it("spricht bei abgelaufenem Link englisch", () => {
    render(<LinkNichtMehrGueltig art="objektuebersicht" sprache="en" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This link is no longer valid");
    expect(screen.getByTestId("link-nicht-mehr-gueltig")).toHaveTextContent("The personal link to your property overview has expired.");
  });

  it("hat vollständige Texte in beiden Sprachen", () => {
    expect(textdateiLuecken(LINK_NICHT_MEHR_GUELTIG_TEXTE.de, LINK_NICHT_MEHR_GUELTIG_TEXTE.en)).toEqual([]);
  });
});
