import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setzeSpeicherAttrappe } from "@/test/speicherAttrappe";
import { ALLE, NUR_NOTWENDIGE, _einwilligungVergessen, speichereCookieEinwilligung } from "@/lib/cookieEinwilligung";
import { _tippgeberKlicksVergessen, tippgeberKlickErstmals, tippgeberKlickMelden } from "./tippgeberKlick";

let sitzung: Map<string, string>;

beforeEach(() => {
  setzeSpeicherAttrappe();
  sitzung = setzeSpeicherAttrappe("sessionStorage");
  _einwilligungVergessen();
  _tippgeberKlicksVergessen();
});
afterEach(() => {
  _einwilligungVergessen();
  _tippgeberKlicksVergessen();
});

describe("Tippgeber-Klick auf der Partnerseite", () => {
  it("zählt ohne Wahl einmal und legt nichts im Browser ab", () => {
    expect(tippgeberKlickErstmals("anna")).toBe(true);
    expect(tippgeberKlickErstmals("anna")).toBe(false);
    expect(sitzung.size).toBe(0);
  });

  it("legt auch mit 'Nur notwendige' nichts ab und liest nichts", () => {
    speichereCookieEinwilligung(NUR_NOTWENDIGE);
    sitzung.set("tg_klick_anna", "1");
    // Ein alter Eintrag darf ohne Einwilligung nicht gelesen werden.
    expect(tippgeberKlickErstmals("anna")).toBe(true);
    expect([...sitzung.keys()]).toEqual(["tg_klick_anna"]);
  });

  it("merkt sich den Klick mit Statistik-Einwilligung für die Sitzung", () => {
    speichereCookieEinwilligung(ALLE);
    expect(tippgeberKlickErstmals("anna")).toBe(true);
    expect(sitzung.get("tg_klick_anna")).toBe("1");
    _tippgeberKlicksVergessen(); // wie ein Neuladen der Seite
    expect(tippgeberKlickErstmals("anna")).toBe(false);
  });

  it("zählt verschiedene Tippgeber getrennt", () => {
    expect(tippgeberKlickErstmals("anna")).toBe(true);
    expect(tippgeberKlickErstmals("ben")).toBe(true);
  });
});

describe("Tippgeber-Klick an den Server melden", () => {
  it("schickt Partner- und Tippgeberkürzel an die neue Funktion", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await tippgeberKlickMelden(rpc, "partner-a", "anna");
    expect(rpc.mock.calls).toEqual([["tippgeber_klick_zaehlen", { _vp_slug: "partner-a", _tg: "anna" }]]);
  });

  it("nimmt den alten Weg nur, wenn die Migration noch fehlt", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ error: { code: "PGRST202", message: "Could not find the function" } })
      .mockResolvedValueOnce({ error: null });
    await tippgeberKlickMelden(rpc, "partner-a", "anna");
    expect(rpc.mock.calls[1]).toEqual(["increment_tippgeber_klick", { _tippgeber: "anna" }]);
  });

  it("zählt bei anderen Fehlern nicht doppelt über den alten Weg", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { code: "500", message: "Zeitüberschreitung" } });
    await tippgeberKlickMelden(rpc, "partner-a", "anna");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
