import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { baueAntwort, type KundenansichtAntwort } from "../../supabase/functions/get-kundenansicht/antwort.ts";

/**
 * Die Datenschicht der Kundenansicht und die Unterlagen im Kundenmodus: Die
 * Liste kennt nur Namen, die Datei holt die Seite erst beim Anklicken über
 * `get-kundenansicht` (Aktion „datei“).
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
  },
}));
vi.mock("@/contexts/UserContext", () => ({ useOptionalUser: () => null, useUser: () => ({ user: { role: "kunde" } }) }));

const { alsUnterlage, antwortZuDaten, ladeDateiAdresse, ladeKundenansicht, rotZurueckgehalten } = await import("@/lib/kundenansichtDaten");
const { KundenDokumente } = await import("@/components/kundenansicht/KundenDokumente");

const ANTWORT = baueAntwort({
  objekt: { id: "o1", titel: "Parkstraße 8", adresse: "Parkstraße 8", plz: "86150", ort: "Augsburg", meta: {} },
  objektBilder: [],
  wohnungen: [{
    id: "w7", objekt_id: "o1", we_nr: "WE 7", groesse: 55, zimmer: 2, miete_gesamt: 700, vk_gesamt: 210000, status: "reserviert", kunde_id: "k1",
    meta: { investagonRaw: { visibility: 1 } },
    wohnungs_dokumente: [
      { id: "d1", name: "Grundriss WE 7", url: "/objekt-dokument/objekte/o1/wohnungen/w7/grundriss.pdf" },
      { id: "d2", name: "Mietvertrag WE 7", url: "/objekt-dokument/objekte/o1/wohnungen/w7/miete.pdf" },
      { id: "d3", name: "Wirtschaftsplan", url: "/objekt-dokument/objekte/o1/wohnungen/w7/wp.pdf", kunden_freigabe: "frei" },
    ],
  }],
  objektDokumente: [{ id: "od1", name: "Energieausweis", url: "/objekt-dokument/objekte/o1/dokumente/ea.pdf" }],
  kontaktId: "k1",
  einstiegId: "w7",
  partner: { name: "Petra Partner" },
  jetzt: new Date("2026-09-23T12:00:00Z"),
}) as KundenansichtAntwort;

describe("Umbau der Antwort", () => {
  it("baut ein Objekt mit genau den gelieferten Wohnungen und merkt „für dich“", () => {
    const d = antwortZuDaten(ANTWORT);
    expect(d.objekt.wohnungen.map((w) => w.id)).toEqual(["w7"]);
    expect(d.fuerDichId).toBe("w7");
    expect(d.einstieg).toEqual({ wohnungId: "w7", zustand: "fuer_dich_reserviert" });
    expect(d.partner?.name).toBe("Petra Partner");
    expect(d.stand.toISOString()).toBe("2026-09-23T12:00:00.000Z");
  });

  it("macht aus einer Unterlage eine Zeile ohne Adresse, mit der Freigabe für die zweite Prüfung", () => {
    const wp = ANTWORT.dokumente.find((d) => d.id === "d3")!;
    const zeile = alsUnterlage(wp);
    expect(zeile.url).toBe("kundenansicht:w~w7~d3.pdf");
    expect(zeile.url).not.toMatch(/objekt-dokument|https?:/);
    expect(zeile).toMatchObject({ kundeSieht: true, tabelle: "wohnungs_dokumente", kundenFreigabe: "frei", geschwaerzt: false });
  });

  it("kennt zurückgehaltene rote Unterlagen je Bereich", () => {
    expect(rotZurueckgehalten(ANTWORT.zurueckgehalten, "wohnung", "w7")).toBe(true);
    expect(rotZurueckgehalten(ANTWORT.zurueckgehalten, "wohnung", "w9")).toBe(false);
    expect(rotZurueckgehalten(ANTWORT.zurueckgehalten, "objekt")).toBe(false);
  });
});

describe("Datei holen", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("nimmt nur eine https-Adresse aus der Antwort an", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ url: "https://p.supabase.co/storage/v1/object/sign/x.pdf?token=t" }), { status: 200 }));
    expect(await ladeDateiAdresse({ art: "link", token: "c".repeat(64) }, { bereich: "objekt", wohnungId: null, id: "od1" })).toMatch(/^https:/);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ url: "javascript:alert(1)" }), { status: 200 }));
    expect(await ladeDateiAdresse({ art: "link", token: "c".repeat(64) }, { bereich: "objekt", wohnungId: null, id: "od1" })).toBeNull();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "x" }), { status: 404 }));
    expect(await ladeDateiAdresse({ art: "link", token: "c".repeat(64) }, { bereich: "objekt", wohnungId: null, id: "od1" })).toBeNull();
  });
});

/*
 * 23.09.2026, „404“ rund um den Kundenlink: Eine 404 von Supabase (Function
 * nicht ausgerollt) ist kein ungültiger Link. Nur die eigene 404 von
 * `get-kundenansicht`, erkennbar an `error`, heißt „nicht gefunden“.
 */
describe("Laden bei einer 404", () => {
  const LINK = { art: "link" as const, token: "c".repeat(64) };
  const VORSCHAU = { art: "vorschau" as const, objektId: "o1", wohnungId: null, investmentId: null };
  const NICHT_GEFUNDEN = JSON.stringify({ code: "NOT_FOUND", message: "Requested function was not found" });
  beforeEach(() => vi.unstubAllGlobals());

  it("nennt beim Kunden eine nicht ausgerollte Function einen Ladefehler, nicht einen ungültigen Link", async () => {
    vi.stubGlobal("fetch", async () => new Response(NICHT_GEFUNDEN, { status: 404 }));
    expect(await ladeKundenansicht(LINK)).toEqual({ art: "fehler" });
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    expect(await ladeKundenansicht(LINK)).toEqual({ art: "fehler" });
  });

  it("sagt in der Vorschau, dass get-kundenansicht nicht ausgerollt ist", async () => {
    vi.stubGlobal("fetch", async () => new Response(NICHT_GEFUNDEN, { status: 404 }));
    expect(await ladeKundenansicht(VORSCHAU)).toEqual({
      art: "hinweis",
      meldung: "Die Function get-kundenansicht ist noch nicht ausgerollt. Roll sie in Lovable aus, dann klappt es.",
    });
  });

  it("bleibt bei der eigenen 404 der Function bei „nicht gefunden“, auch ohne Migration 20260923171000", async () => {
    // So antwortet `get-kundenansicht` auf einen unbekannten Schlüssel und auf
    // eine noch fehlende Spalte `art`.
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "Diese Seite ist nicht verfügbar." }), { status: 404 }));
    expect(await ladeKundenansicht(LINK)).toEqual({ art: "nicht_gefunden" });
  });
});

describe("Unterlagen im Kundenmodus", () => {
  it("zeigt nur freigegebene Unterlagen, holt die Datei über den Verweis und nennt zurückgehaltene Mietverträge", async () => {
    const dateiLaden = vi.fn(async () => "https://p.supabase.co/storage/v1/object/sign/g.pdf?token=t");
    render(<KundenDokumente dokumente={ANTWORT.dokumente} zurueckgehalten={ANTWORT.zurueckgehalten} wohnungId="w7" dateiLaden={dateiLaden} />);
    // Zuerst die Unterlagen des Hauses, das erste Dokument ist gewählt und wird geholt.
    await waitFor(() => expect(dateiLaden).toHaveBeenCalledWith({ bereich: "objekt", wohnungId: null, id: "od1" }));
    fireEvent.click(screen.getByRole("button", { name: /Dokumente zu dieser Wohnung/ }));
    // Der freigegebene Wirtschaftsplan besteht auch die zweite Prüfung im Browser,
    // er steht zugeklappt unter seinem Oberbegriff.
    fireEvent.click(await screen.findByRole("button", { name: /WEG und Hausgeld/ }));
    expect(await screen.findAllByText("Wirtschaftsplan")).not.toHaveLength(0);
    expect(screen.getAllByText("Grundriss WE 7").length).toBeGreaterThan(0);
    expect(screen.queryByText("Mietvertrag WE 7")).not.toBeInTheDocument();
    expect(screen.getByText("Mietvertrag und Grundbuchauszug stellt dir dein Ansprechpartner persönlich zur Verfügung.")).toBeInTheDocument();
    for (const intern of [/Kunde sieht/, /nur CRM/, /Sammelordner/, /Intern/]) expect(screen.queryAllByText(intern)).toHaveLength(0);
  });
});
