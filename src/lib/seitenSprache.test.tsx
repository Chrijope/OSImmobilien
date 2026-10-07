/**
 * Die Sprache der öffentlichen Kundenseiten (Kundensprache, Etappe 3).
 *
 * Geprüft wird die Reihenfolge Adresse vor Server vor Deutsch, der Rückfall,
 * wenn `kundensprache_zum_link` fehlt, und die Prüfung der Textdateien.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const t = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => t.rpc(...a) } }));

const {
  bestimmeSeitenSprache,
  gedankenstrichFrei,
  ladeLinkSprache,
  objekttextFuer,
  objekttexteFuer,
  oeffentlicheObjekttexteEn,
  spracheAusAdresse,
  textdateiLuecken,
  useLinkSprache,
  useSeitenSprache,
} = await import("./seitenSprache");

beforeEach(() => {
  t.rpc.mockReset();
  document.documentElement.setAttribute("lang", "de");
});

describe("Sprache bestimmen", () => {
  it("liest ?lang= nachsichtig und ignoriert Unbekanntes", () => {
    expect(spracheAusAdresse("?lang=en")).toBe("en");
    expect(spracheAusAdresse("?x=1&lang=EN-gb")).toBe("en");
    expect(spracheAusAdresse("?lang=de")).toBe("de");
    expect(spracheAusAdresse("?lang=fr")).toBeNull();
    expect(spracheAusAdresse("")).toBeNull();
    expect(spracheAusAdresse(undefined)).toBeNull();
  });

  it("nimmt die Adresse vor dem Server und den Server vor Deutsch", () => {
    expect(bestimmeSeitenSprache({ adresse: "?lang=de", server: "en" })).toBe("de");
    expect(bestimmeSeitenSprache({ adresse: "", server: "en" })).toBe("en");
    expect(bestimmeSeitenSprache({ adresse: "?lang=xx", server: "en" })).toBe("en");
    expect(bestimmeSeitenSprache({})).toBe("de");
    expect(bestimmeSeitenSprache({ server: "klingonisch" })).toBe("de");
    expect(bestimmeSeitenSprache({ server: null })).toBe("de");
  });
});

function SeitenSprache({ server }: { server: unknown }) {
  return <span data-testid="sprache">{useSeitenSprache(server)}</span>;
}

describe("useSeitenSprache", () => {
  it("folgt dem Server und setzt <html lang>", () => {
    render(<MemoryRouter><SeitenSprache server="en" /></MemoryRouter>);
    expect(screen.getByTestId("sprache")).toHaveTextContent("en");
    expect(document.documentElement.getAttribute("lang")).toBe("en");
  });

  it("überschreibt mit ?lang= nur die Anzeige", () => {
    render(<MemoryRouter initialEntries={["/x?lang=de"]}><SeitenSprache server="en" /></MemoryRouter>);
    expect(screen.getByTestId("sprache")).toHaveTextContent("de");
  });

  it("stellt <html lang> beim Verlassen wieder her", () => {
    const { unmount } = render(<MemoryRouter><SeitenSprache server="en" /></MemoryRouter>);
    unmount();
    expect(document.documentElement.getAttribute("lang")).toBe("de");
  });
});

function LinkSprache({ token }: { token: string }) {
  const { sprache, bereit } = useLinkSprache("buchung", token);
  return <span data-testid="sprache">{`${sprache}|${bereit ? "bereit" : "wartet"}`}</span>;
}

describe("useLinkSprache", () => {
  it("fragt kundensprache_zum_link mit Art und Schlüssel", async () => {
    t.rpc.mockResolvedValue({ data: "en", error: null });
    render(<MemoryRouter><LinkSprache token="abc" /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId("sprache")).toHaveTextContent("en|bereit"));
    expect(t.rpc).toHaveBeenCalledWith("kundensprache_zum_link", { _art: "buchung", _token: "abc" });
  });

  it("bleibt Deutsch, wenn die Funktion fehlt (Migration offen), und wird trotzdem bereit", async () => {
    t.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    render(<MemoryRouter><LinkSprache token="abc" /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId("sprache")).toHaveTextContent("de|bereit"));
  });

  it("bleibt Deutsch bei einem Netzfehler", async () => {
    t.rpc.mockRejectedValue(new Error("offline"));
    expect(await ladeLinkSprache("videoraum", "abc")).toBeNull();
  });

  it("ist mit ?lang= sofort bereit", () => {
    t.rpc.mockReturnValue(new Promise(() => undefined));
    render(<MemoryRouter initialEntries={["/termin/abc?lang=en"]}><LinkSprache token="abc" /></MemoryRouter>);
    expect(screen.getByTestId("sprache")).toHaveTextContent("en|bereit");
  });

  it("fragt ohne Schlüssel gar nicht erst", async () => {
    expect(await ladeLinkSprache("mobile_scan", "")).toBeNull();
    expect(t.rpc).not.toHaveBeenCalled();
  });
});

describe("textdateiLuecken", () => {
  it("meldet nichts bei vollständigen, typgleichen Texten", () => {
    expect(textdateiLuecken(
      { a: "Hallo", b: { c: "Welt" }, l: ["x", "y"], f: (n: number) => `${n}` },
      { a: "Hello", b: { c: "World" }, l: ["x", "y"], f: (n: number) => `${n}` },
    )).toEqual([]);
  });

  it("findet fehlende, leere und ungleiche Einträge sowie Gedankenstriche", () => {
    const luecken = textdateiLuecken(
      { a: "Hallo", b: "", c: "x", l: ["1"], g: "gut – schlecht" },
      { a: "Hello", c: () => "x", l: ["1", "2"], g: "fine", z: "zu viel" },
    );
    expect(luecken).toEqual(expect.arrayContaining([
      "b: fehlt in en",
      "c: de ist string, en ist function",
      "l: de hat 1 Einträge, en 2",
      "g: Gedankenstrich in de",
      "z: fehlt in de",
    ]));
  });

  it("erkennt Gedankenstriche in fertigen Texten", () => {
    expect(gedankenstrichFrei("gut, schlecht")).toBe(true);
    expect(gedankenstrichFrei("gut — schlecht")).toBe(false);
    expect(gedankenstrichFrei("10–12 Uhr")).toBe(false);
  });
});

describe("Objekttexte aus der Datenbank (Entscheidung 12)", () => {
  it("zeigt auf Deutsch immer den deutschen Text", () => {
    expect(objekttextFuer("Schönes Haus", "Nice house", "de")).toEqual({ wert: "Schönes Haus", nurDeutsch: false });
  });

  it("zeigt auf Englisch die englische Fassung, sonst den deutschen Text mit Vermerk", () => {
    expect(objekttextFuer("Schönes Haus", "Nice house", "en")).toEqual({ wert: "Nice house", nurDeutsch: false });
    expect(objekttextFuer("Schönes Haus", undefined, "en")).toEqual({ wert: "Schönes Haus", nurDeutsch: true });
    expect(objekttextFuer("", undefined, "en")).toEqual({ wert: "", nurDeutsch: false });
    expect(objekttexteFuer(["A"], [], "en")).toEqual({ wert: ["A"], nurDeutsch: true });
    expect(objekttexteFuer(["A"], ["B"], "en")).toEqual({ wert: ["B"], nurDeutsch: false });
  });

  it("lässt aus meta.objekttexteKiEn nur den Wortlaut hinaus", () => {
    expect(oeffentlicheObjekttexteEn({
      kurzbeschreibung: " Bright flat ",
      standortargumente: [{ argument: "Close to the station", beleg: "GIFT" }, "Quiet street", 3],
      marktargumente: [],
      quellen: ["GIFT"],
    })).toEqual({ kurzbeschreibung: "Bright flat", standortargumente: ["Close to the station", "Quiet street"] });
    expect(oeffentlicheObjekttexteEn(undefined)).toBeUndefined();
    expect(oeffentlicheObjekttexteEn({ kurzbeschreibung: "  " })).toBeUndefined();
  });
});
