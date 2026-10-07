/**
 * Die Terminverwaltung `/termin/verwalten/:absageToken` in der Sprache des
 * Kunden (Kundensprache, Etappe 3, S4).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const netz = vi.hoisted(() => ({
  sprache: null as unknown,
  spracheFehlt: false,
  ansicht: null as unknown,
  aufrufe: [] as Array<{ name: string; args: unknown }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string, args: unknown) => {
      netz.aufrufe.push({ name, args });
      if (name === "kundensprache_zum_link") {
        return netz.spracheFehlt
          ? { data: null, error: { code: "42883", message: "function public.kundensprache_zum_link does not exist" } }
          : { data: netz.sprache, error: null };
      }
      if (name === "buchung_ansicht") return { data: netz.ansicht, error: null };
      return { data: null, error: { message: "unbekannt" } };
    },
    functions: { invoke: async () => ({ error: null }) },
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}));

const { default: BuchungVerwalten } = await import("./BuchungVerwalten");
const { BUCHUNG_VERWALTEN_TEXTE } = await import("./buchungVerwaltenTexte");
const { gedankenstrichFrei, textdateiLuecken } = await import("@/lib/seitenSprache");

const ANSICHT = {
  id: "b1",
  status: "offen",
  start_at: "2030-08-06T07:30:00Z",
  ende_at: "2030-08-06T08:30:00Z",
  dauer_minuten: 60,
  bezeichnung: "Beratungsgespräch",
  anlass: "beratung",
  name: "Max Muster",
  email: "max@example.com",
  berater: { name: "Hermann Vogl", email: "hermann@more.immo", telefon: "+49 170 1234567" },
  zeitzone: "Europe/Berlin",
};

function zeige(pfad = "/termin/verwalten/abs1") {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes><Route path="/termin/verwalten/:absageToken" element={<BuchungVerwalten />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  netz.sprache = null;
  netz.spracheFehlt = false;
  netz.ansicht = ANSICHT;
  netz.aufrufe = [];
});

describe("BuchungVerwalten: Sprache", () => {
  it("nimmt die Sprache vom Server, gefragt über den Absagetoken", async () => {
    netz.sprache = "en";
    zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Hello Max.");
    expect(screen.getByText("Tuesday, 6 August 2030, 09:30 to 10:30")).toBeInTheDocument();
    expect(screen.getByText("1 hour")).toBeInTheDocument();
    // Die Bezeichnung der Terminart ist gepflegt und bleibt.
    expect(screen.getByText("Beratungsgespräch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel appointment/ })).toBeInTheDocument();
    expect(screen.getByText(/This link isn’t connected to the booking calendar/)).toBeInTheDocument();
    expect(netz.aufrufe).toContainEqual({
      name: "kundensprache_zum_link",
      args: { _art: "buchung_verwalten", _token: "abs1" },
    });
  });

  it("führt auch das Absagen auf Englisch", async () => {
    netz.sprache = "en";
    zeige();
    fireEvent.click(await screen.findByRole("button", { name: /Cancel appointment/ }));
    expect(screen.getByLabelText(/Reason/)).toHaveAttribute("placeholder", "For example: something has come up");
    expect(screen.getByRole("button", { name: /Keep appointment/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirm cancellation/ })).toBeInTheDocument();
  });

  it("bleibt Deutsch, wenn die Funktion fehlt", async () => {
    netz.spracheFehlt = true;
    zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Guten Tag, Max.");
    expect(screen.getByText("Dienstag, 6. August 2030, 09:30 bis 10:30 Uhr")).toBeInTheDocument();
  });

  it("zeigt den unbekannten Link in der Sprache des Kunden", async () => {
    netz.sprache = "en";
    netz.ansicht = null;
    zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("This link doesn’t belong to an appointment.");
  });

  it("lässt sich mit ?lang= überschreiben, in beide Richtungen", async () => {
    netz.sprache = "en";
    const { unmount } = zeige("/termin/verwalten/abs1?lang=de");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Guten Tag, Max.");
    unmount();

    netz.sprache = null;
    zeige("/termin/verwalten/abs1?lang=en");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Hello Max.");
  });
});

describe("Textdatei S4", () => {
  it("ist in beiden Sprachen vollständig", () => {
    expect(textdateiLuecken(BUCHUNG_VERWALTEN_TEXTE.de, BUCHUNG_VERWALTEN_TEXTE.en)).toEqual([]);
  });

  it("erzeugt mit Beispielwerten keine Gedankenstriche und kein „advisor“", () => {
    for (const spr of ["de", "en"] as const) {
      expect(gedankenstrichFrei(BUCHUNG_VERWALTEN_TEXTE[spr].gruss("Max"))).toBe(true);
    }
    expect(JSON.stringify(BUCHUNG_VERWALTEN_TEXTE.en).toLowerCase()).not.toContain("advisor");
  });
});
