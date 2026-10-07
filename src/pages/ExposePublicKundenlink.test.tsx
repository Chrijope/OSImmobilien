import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

/**
 * Der persönliche Kundenlink auf der öffentlichen Seite (seit 23.09.2026):
 *
 *   - Abgelaufen oder zurückgezogen: nur ein gestalteter Hinweis mit den
 *     Kontaktdaten des Partners, sonst nichts.
 *   - Gezählt wird nur das erste Laden (`aufruf=1`), nicht das Nachladen beim
 *     Zurückwechseln in den Tab und nie die Vorschau des Partners.
 *   - Der Rechner läuft immer mit neutralen Standardannahmen, auch wenn in der
 *     Antwort etwas anderes stünde.
 *
 * `ExposeAnsicht` ist hier ersetzt, damit sich ablesen lässt, womit die Seite
 * rechnet. Das echte Exposé prüft `ExposePublic.test.tsx`.
 */

const t = vi.hoisted(() => ({
  aufrufe: [] as string[],
  antwort: { status: 200, body: {} as unknown },
  ansicht: [] as Array<{ rechner: { annahmen: Record<string, unknown> } }>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const kette: Record<string, unknown> = {};
  for (const m of ["select", "eq", "maybeSingle"]) kette[m] = () => kette;
  kette.then = (res: (v: unknown) => unknown) => Promise.resolve(res({ data: null, error: null }));
  return { supabase: { from: () => kette } };
});
vi.mock("@/lib/storage", () => ({ objektUnterlagenBefristen: async <T,>(o: T) => o }));
vi.mock("@/components/expose/ExposeAnsicht", () => ({
  ExposeAnsicht: (p: { rechner: { annahmen: Record<string, unknown> } }) => {
    t.ansicht.push(p);
    return <div data-testid="expose-ansicht" />;
  },
}));

vi.stubGlobal("fetch", (url: string) => {
  t.aufrufe.push(String(url));
  return Promise.resolve({ ok: t.antwort.status < 400, status: t.antwort.status, json: () => Promise.resolve(t.antwort.body) });
});

const { default: ExposePublic } = await import("./ExposePublic");
const { annahmenVorbelegen } = await import("@/lib/exposeInhalt");
const { exposePayloadZuObjekt } = await import("@/lib/exposePublicDaten");

const TOKEN = "cd".repeat(32);

function payload(extra: Record<string, unknown> = {}) {
  return {
    objekt: { id: "o1", titel: "Objekt am Park", adresse: "Parkstraße 8", plz: "86150", ort: "Augsburg", sichtbar: true, meta: {} },
    bilder: [],
    dokumente: [],
    wohnungen: [{ id: "w7", we_nr: "7", groesse: 65, zimmer: 3, vk_gesamt: 240000, miete_gesamt: 800, status: "frei", meta: {} }],
    ansprechpartner: { name: "Paula Partner", telefon: "+49 89 123456", email: "paula@example.com" },
    ...extra,
  };
}

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
  t.aufrufe.length = 0;
  t.ansicht.length = 0;
  t.antwort = { status: 200, body: payload() };
});

describe("abgelaufener oder zurückgezogener Link", () => {
  it("zeigt nur den Hinweis mit den Kontaktdaten des Partners", async () => {
    t.antwort = { status: 410, body: { abgelaufen: true, ansprechpartner: { name: "Paula Partner", telefon: "+49 89 123456", email: "paula@example.com" } } };
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}`);
    const hinweis = await screen.findByTestId("link-nicht-mehr-gueltig");
    expect(hinweis).toHaveTextContent("Dieser Link ist nicht mehr gültig");
    expect(screen.getByTestId("abgelaufen-ansprechpartner")).toHaveTextContent("Paula Partner");
    expect(screen.getByTestId("abgelaufen-telefon")).toHaveAttribute("href", "tel:+4989123456");
    expect(screen.getByTestId("abgelaufen-email")).toHaveAttribute("href", "mailto:paula@example.com");
    // Sonst nichts: kein Exposé, kein Objekt.
    expect(screen.queryByTestId("expose-ansicht")).not.toBeInTheDocument();
    expect(hinweis).not.toHaveTextContent("Parkstraße");
    // Kein Gedankenstrich im Nutzertext.
    expect(hinweis.textContent).not.toMatch(/ – | — /);
  });

  it("zeigt ohne Partner die allgemeine Adresse, nie eine Sackgasse", async () => {
    t.antwort = { status: 410, body: { abgelaufen: true } };
    renderMit(`/expose/o1?token=${TOKEN}`);
    expect(await screen.findByTestId("abgelaufen-email")).toHaveAttribute("href", "mailto:office@more.immo");
  });
});

describe("Zählen", () => {
  it("meldet das erste Laden als Aufruf, das Nachladen im Tab nicht", async () => {
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}`);
    await screen.findByTestId("expose-ansicht");
    expect(t.aufrufe[0]).toContain("aufruf=1");
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(t.aufrufe.length).toBe(2));
    expect(t.aufrufe[1]).not.toContain("aufruf=1");
  });

  it("zählt die Vorschau des Partners nie", async () => {
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}&vorschau=1`);
    await screen.findByTestId("expose-ansicht");
    expect(t.aufrufe[0]).not.toContain("aufruf=1");
    expect(t.aufrufe[0]).toContain("vorschau=1");
  });

  it("meldet ohne Token keinen Aufruf", async () => {
    renderMit("/expose/o1/wohnung/w7");
    await screen.findByTestId("expose-ansicht");
    expect(t.aufrufe[0]).not.toContain("aufruf=");
  });
});

describe("neutrale Annahmen im Kundenlink", () => {
  it("rechnet mit den Standardannahmen, auch wenn die Antwort Annahmen oder eine Selbstauskunft enthielte", async () => {
    t.antwort = {
      status: 200,
      body: payload({
        annahmen: { grenzsteuersatzManuellProzent: 42, zinsProzent: 9.9 },
        selbstauskunft: { einkommen: { netto: 9000 } },
      }),
    };
    renderMit(`/expose/o1/wohnung/w7?token=${TOKEN}`);
    await screen.findByTestId("expose-ansicht");
    const objekt = exposePayloadZuObjekt(payload());
    const neutral = annahmenVorbelegen(objekt, objekt.wohnungen[0], null).annahmen;
    const genutzt = t.ansicht[t.ansicht.length - 1].rechner.annahmen;
    expect(genutzt).toEqual(neutral);
    expect(genutzt.grenzsteuersatzManuellProzent).not.toBe(42);
    expect(genutzt.zinsProzent).not.toBe(9.9);
  });
});
