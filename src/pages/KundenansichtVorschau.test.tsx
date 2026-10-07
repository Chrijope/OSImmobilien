import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { baueAntwort } from "../../supabase/functions/get-kundenansicht/antwort.ts";

/**
 * „Als Kunde ansehen“: die Vorschau der Kundenansicht im CRM. Sie lädt über
 * dieselbe Function wie der Kundenlink, mit der Anmeldung im Kopf, und zählt
 * nie. Sehen dürfen sie seit dem 05.10.2026 alle, die die Einheitsseite
 * sehen, also auch die Vertriebsleitung und freigeschaltete Vertriebspartner.
 */

const zustand = vi.hoisted(() => ({
  rolle: "admin",
  antworten: [] as Array<{ status: number; body: unknown }>,
  aufrufe: [] as Array<{ body: Record<string, unknown>; kopf: Record<string, string> }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: "jwt-admin" } } }) },
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
  },
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: zustand.rolle, name: "Test" }, authUser: { id: "u1" } }),
  useOptionalUser: () => ({ user: { role: zustand.rolle, name: "Test" } }),
}));
vi.mock("@/components/objektseite/Galerie", () => ({ Galerie: () => <div data-testid="galerie" /> }));
// app_config gilt als geladen; die Testfreischaltung fehlt, also ist der Vertriebspartner nicht freigeschaltet.
vi.mock("@/lib/dataCache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dataCache")>()),
  isTableLoaded: () => true,
}));

const { default: KundenansichtVorschau } = await import("./KundenansichtVorschau");
const { istVomRoutenspeicherAusgenommen } = await import("@/components/LastRouteMemory");

const JETZT = new Date("2026-09-23T12:00:00Z");

function einheit(id: string, weNr: string, weiteres: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, objekt_id: "o1", we_nr: weNr, groesse: 55, zimmer: 2, miete_gesamt: 700, vk_gesamt: 210000, status: "frei",
    meta: { investagonRaw: { visibility: 1 } }, ...weiteres,
  };
}

const ANTWORT = baueAntwort({
  objekt: { id: "o1", titel: "Parkstraße 8", adresse: "Parkstraße 8", plz: "86150", ort: "Augsburg", meta: {} },
  objektBilder: [],
  wohnungen: [einheit("w7", "WE 7", { status: "reserviert", kunde_id: "k1" }), einheit("w9", "WE 9")],
  objektDokumente: [],
  kontaktId: "k1",
  einstiegId: "w7",
  partner: { name: "Zora Zuständig" },
  jetzt: JETZT,
});

function Ort() {
  const l = useLocation();
  return <output data-testid="ort">{l.pathname}{l.search}</output>;
}

function zeige(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route path="/objekte/:id/kundenansicht" element={<KundenansichtVorschau />} />
        <Route path="/objekte/:id/einheiten/:weId/kundenansicht" element={<KundenansichtVorschau />} />
        <Route path="/objekte/:id/wohnung/:weId" element={<p>Verwaltungsansicht</p>} />
      </Routes>
      <Ort />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  zustand.rolle = "admin";
  zustand.antworten = [];
  zustand.aufrufe = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    zustand.aufrufe.push({ body: JSON.parse(String(init.body)), kopf: init.headers as Record<string, string> });
    const naechste = zustand.antworten.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(naechste.body), { status: naechste.status });
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

describe("Als Kunde ansehen", () => {
  it("lädt mit Anmeldung, Einstieg und Investment, zählt nie und zeigt den Partner des Kunden", async () => {
    zustand.antworten.push({ status: 200, body: ANTWORT });
    zeige("/objekte/o1/einheiten/w7/kundenansicht?investmentId=inv1");
    expect(await screen.findByRole("heading", { name: "Wohnung 7" })).toBeInTheDocument();
    expect(zustand.aufrufe).toHaveLength(1);
    expect(zustand.aufrufe[0].body).toEqual({ aktion: "laden", objektId: "o1", wohnungId: "w7", investmentId: "inv1" });
    expect(zustand.aufrufe[0].kopf.Authorization).toBe("Bearer jwt-admin");
    expect(screen.getByTestId("chip-fuer-dich")).toBeInTheDocument();
    expect(screen.getByTestId("kunden-ansprechpartner")).toHaveTextContent("Zora Zuständig");
  });

  it("nimmt das Investment auch aus der Objektauswahl (?empfehlung=)", async () => {
    zustand.antworten.push({ status: 200, body: ANTWORT });
    zeige("/objekte/o1/einheiten/w7/kundenansicht?empfehlung=inv2");
    await screen.findByRole("heading", { name: "Wohnung 7" });
    expect(zustand.aufrufe[0].body.investmentId).toBe("inv2");
  });

  it("wechselt die Wohnung ohne Neuladen und behält das Investment in der Adresse", async () => {
    zustand.antworten.push({ status: 200, body: ANTWORT });
    zeige("/objekte/o1/einheiten/w7/kundenansicht?investmentId=inv1");
    await screen.findByRole("heading", { name: "Wohnung 7" });
    fireEvent.click(within(screen.getByTestId("wohnungswechsel")).getByRole("button", { name: /Wohnung 9/ }));
    expect(await screen.findByRole("heading", { name: "Wohnung 9" })).toBeInTheDocument();
    expect(screen.getByTestId("ort").textContent).toBe("/objekte/o1/einheiten/w9/kundenansicht?investmentId=inv1");
    fireEvent.click(screen.getByRole("button", { name: /Zur Hausübersicht/ }));
    expect(await screen.findByTestId("kunden-hausebene")).toBeInTheDocument();
    expect(screen.getByTestId("ort").textContent).toBe("/objekte/o1/kundenansicht?investmentId=inv1");
    expect(zustand.aufrufe).toHaveLength(1);
  });

  it("zeigt die Marktargumente wie der Kundenlink, aus derselben Antwort der Function", async () => {
    const markt = "Gefragter Arbeitsmarkt. Arbeitslosenquote 3,1 Prozent, Destatis, Stand 07/2026.";
    const mitMarkt = baueAntwort({
      objekt: {
        id: "o1", titel: "Parkstraße 8", adresse: "Parkstraße 8", plz: "86150", ort: "Augsburg",
        meta: { marktargumente: [markt], objekttexteKi: { marktargumente: [{ argument: markt, beleg: "Interne Belegzeile" }] } },
      },
      objektBilder: [],
      wohnungen: [einheit("w7", "WE 7", { status: "reserviert", kunde_id: "k1" }), einheit("w9", "WE 9")],
      objektDokumente: [],
      kontaktId: "k1",
      einstiegId: "w7",
      partner: { name: "Zora Zuständig" },
      jetzt: JETZT,
    });
    zustand.antworten.push({ status: 200, body: mitMarkt });
    zeige("/objekte/o1/einheiten/w7/kundenansicht");
    await screen.findByRole("heading", { name: "Wohnung 7" });
    const block = screen.getByTestId("kunden-marktargumente");
    expect(block).toHaveTextContent("Markt und Standort");
    expect(block).toHaveTextContent("Gefragter Arbeitsmarkt Arbeitslosenquote 3,1 Prozent, Destatis, Stand 07/2026.");
    expect(block).toHaveTextContent("Aus der Marktanalyse, Quelle und Stand je Aussage.");
    // Seit dem 24.09.2026 ohne Vermerk „Automatisch erstellt“.
    expect(block).not.toHaveTextContent("Automatisch erstellt");
    expect(screen.queryByText(/Interne Belegzeile/)).not.toBeInTheDocument();
  });

  it("lädt die Vorschau auch für die Vertriebsleitung", async () => {
    zustand.rolle = "vertriebsleiter";
    zustand.antworten.push({ status: 200, body: ANTWORT });
    zeige("/objekte/o1/einheiten/w7/kundenansicht");
    await screen.findByRole("heading", { name: "Wohnung 7" });
    expect(zustand.aufrufe).toHaveLength(1);
  });

  it("schickt einen nicht freigeschalteten Vertriebspartner in die Verwaltungsansicht, ohne zu laden", async () => {
    zustand.rolle = "vertriebspartner";
    zeige("/objekte/o1/einheiten/w7/kundenansicht");
    expect(await screen.findByText("Verwaltungsansicht")).toBeInTheDocument();
    expect(zustand.aufrufe).toHaveLength(0);
  });

  it("zeigt die Absage des Servers, wenn er die Rolle nicht gelten lässt", async () => {
    zustand.antworten.push({ status: 403, body: { error: "Die Kundenansicht ist Admin und Inhaber vorbehalten." } });
    zeige("/objekte/o1/kundenansicht");
    expect(await screen.findByTestId("kundenansicht-hinweis")).toHaveTextContent("Die Kundenansicht ist Admin und Inhaber vorbehalten.");
  });
});

describe("Routenspeicher", () => {
  it("merkt sich Vorschau und Kundenlink nie als letzte Seite, die Objektseiten schon", () => {
    expect(istVomRoutenspeicherAusgenommen("/objekte/o1/kundenansicht")).toBe(true);
    expect(istVomRoutenspeicherAusgenommen("/objekte/o1/einheiten/w7/kundenansicht?investmentId=inv1")).toBe(true);
    expect(istVomRoutenspeicherAusgenommen(`/immobilie/${"a".repeat(64)}/wohnung/w7`)).toBe(true);
    expect(istVomRoutenspeicherAusgenommen("/objekte/o1")).toBe(false);
    expect(istVomRoutenspeicherAusgenommen("/objekte/o1/einheiten/w7")).toBe(false);
  });
});
