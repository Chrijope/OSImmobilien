import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, from, auth: { getUser } },
}));

import {
  frageGastStatus, gastFehlerText, warteHinweisText, listMeineRaeume, erstelleRaum,
  beendeTeilnehmerImRaum, merkeGastSitzung, ladeGastSitzung, vergissGastSitzung,
} from "@/lib/videoraumStore";
import { signalKanalName } from "@/lib/videoraumVerbindung";

/**
 * Der Warteraum war ein Versprechen ohne Deckung: Der Signalkanal hing allein
 * am Raumtoken, und der steht im Link, den der Kunde bekommt. Diese Tests
 * sichern die Gegenmassnahmen ab, dazu die Sitzung des Gastes und die Saetze,
 * die er zu lesen bekommt.
 */

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  getUser.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => { /* still */ });
  window.sessionStorage.clear();
});

describe("Signalkanal", () => {
  it("heißt nach dem Geheimnis, nicht nach dem Raumtoken", () => {
    expect(signalKanalName("raum-token", "geheim")).toBe("videoraum-signal-geheim");
  });

  it("fällt ohne Geheimnis auf den Raumtoken zurück", () => {
    // Solange die Migration nicht gelaufen ist, muss die Verbindung stehen.
    expect(signalKanalName("raum-token", null)).toBe("videoraum-signal-raum-token");
    expect(signalKanalName("raum-token", "  ")).toBe("videoraum-signal-raum-token");
  });
});

describe("frageGastStatus", () => {
  it("reicht Geheimnis, Warteplatz und laufendes Gespräch durch", async () => {
    rpc.mockResolvedValue({
      data: {
        status: "eingelassen", raum_status: "laufend", teilnehmer_id: "t-1",
        signal_geheimnis: "abc", warteposition: 2, gespraech_laeuft: true,
      },
      error: null,
    });
    expect(await frageGastStatus("g")).toEqual({
      status: "eingelassen",
      raumStatus: "laufend",
      teilnehmerId: "t-1",
      signalGeheimnis: "abc",
      warteposition: 2,
      gespraechLaeuft: true,
    });
  });

  it("kommt ohne die neuen Felder aus", async () => {
    // Vor der Migration liefert die Datenbank die drei Felder nicht.
    rpc.mockResolvedValue({
      data: { status: "wartet", raum_status: "offen", teilnehmer_id: "t-1" },
      error: null,
    });
    const stand = await frageGastStatus("g");
    expect(stand).toMatchObject({ signalGeheimnis: null, warteposition: 0, gespraechLaeuft: false });
  });
});

describe("warteHinweisText", () => {
  it("sagt dem Nächsten, dass noch ein Gespräch läuft", () => {
    expect(warteHinweisText(1, true)).toContain("als Nächster dran");
  });

  it("nennt die Position, wenn jemand davor wartet", () => {
    expect(warteHinweisText(3, true)).toContain("Position 3");
  });

  it("bleibt beim ruhigen Satz, wenn niemand sonst da ist", () => {
    expect(warteHinweisText(1, false)).toContain("gleich eingelassen");
  });
});

describe("gastFehlerText", () => {
  it.each([
    ["Raum nicht gefunden oder abgelaufen", "nicht mehr gültig"],
    ["Das Gespraech ist bereits beendet", "bereits beendet"],
    ["Bitte einen Namen angeben", "deinen Namen"],
    ["Zu viele Beitritte, bitte spaeter erneut versuchen", "in ein paar Minuten"],
  ])("übersetzt %s", (meldung, erwartet) => {
    expect(gastFehlerText(new Error(meldung))).toContain(erwartet);
  });

  it("hat auch für Unbekanntes einen verständlichen Satz", () => {
    const text = gastFehlerText(new Error("PGRST301 JWT expired"));
    expect(text).toContain("Lade die Seite bitte neu");
    // Der Technikton darf nicht durchschlagen.
    expect(text).not.toContain("PGRST301");
  });
});

describe("Sitzung des Gastes", () => {
  it("merkt sich die Sitzung am Raumtoken und gibt sie zurück", () => {
    merkeGastSitzung("raum-1", { gastToken: "g-1", teilnehmerId: "t-1", name: "Martina Brandl" });
    expect(ladeGastSitzung("raum-1")).toEqual({
      gastToken: "g-1", teilnehmerId: "t-1", name: "Martina Brandl",
    });
    // Ein anderer Raum darf davon nichts wissen.
    expect(ladeGastSitzung("raum-2")).toBeNull();
  });

  it("vergisst sie wieder", () => {
    merkeGastSitzung("raum-1", { gastToken: "g-1", teilnehmerId: "t-1", name: "M" });
    vergissGastSitzung("raum-1");
    expect(ladeGastSitzung("raum-1")).toBeNull();
  });

  it("stolpert nicht über kaputte Einträge", () => {
    window.sessionStorage.setItem("videoraum-gast:raum-1", "{kein json");
    expect(ladeGastSitzung("raum-1")).toBeNull();
  });
});

describe("beendeTeilnehmerImRaum", () => {
  function teilnehmerKette() {
    const glied: Record<string, unknown> = {};
    glied.update = vi.fn(() => glied);
    glied.eq = vi.fn(() => glied);
    glied.in = vi.fn(async () => ({ error: null }));
    return glied;
  }

  it("wirft beim Auflegen die Wartenden nicht mit hinaus", async () => {
    // Es kann immer nur eine Person im Gespräch sein. Nach dem Auflegen ist
    // der Nächste dran, er darf nicht im selben Zug beendet werden.
    const glied = teilnehmerKette();
    from.mockReturnValue(glied);
    await beendeTeilnehmerImRaum("r-1");
    expect(glied.in).toHaveBeenCalledWith("status", ["eingelassen", "im_gespraech"]);
  });

  it("nimmt beim Schließen des Raumes auch die Wartenden mit", async () => {
    const glied = teilnehmerKette();
    from.mockReturnValue(glied);
    await beendeTeilnehmerImRaum("r-1", true);
    expect(glied.in).toHaveBeenCalledWith("status", ["wartet", "eingelassen", "im_gespraech"]);
  });
});

describe("erstelleRaum", () => {
  it("bietet die Mitschrift nicht mehr an", async () => {
    // Es gibt keine Mitschrift. Ein neuer Raum darf deshalb keine Zustimmung
    // dafür einholen, vorher stand das Feld standardmäßig auf true.
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    const einfuegen = vi.fn((_zeile: Record<string, unknown>) => ({
      select: () => ({ single: async () => ({ data: { id: "r-1" }, error: null }) }),
    }));
    from.mockReturnValue({ insert: einfuegen });

    await erstelleRaum({ art: "beratung", gastgeber: { name: "Christian Peetz" } });

    expect(einfuegen.mock.calls[0][0]).toMatchObject({ transkript_angeboten: false });
  });
});

describe("listMeineRaeume", () => {
  function kette(daten: unknown[]) {
    const glied: Record<string, unknown> = {};
    glied.select = vi.fn(() => glied);
    glied.eq = vi.fn(() => glied);
    glied.order = vi.fn(() => glied);
    glied.in = vi.fn(() => glied);
    glied.range = vi.fn(async () => ({ data: daten, error: null }));
    return glied;
  }

  it("fragt nur die Räume des angemeldeten Nutzers ab", async () => {
    // Die Lesepolicy lässt einen Inhaber alles sehen. Die Übersicht heißt
    // aber "meine Räume", vorher standen dort die Räume aller Administratoren.
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    const glied = kette([{ id: "r-1" }]);
    from.mockReturnValue(glied);

    expect(await listMeineRaeume()).toEqual([{ id: "r-1" }]);
    expect(glied.eq).toHaveBeenCalledWith("gastgeber_id", "u-1");
    expect(glied.in).toHaveBeenCalledWith("status", ["offen", "laufend"]);
    expect(glied.range).toHaveBeenCalledWith(0, 39);
  });

  it("gibt ohne Anmeldung nichts zurück", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await listMeineRaeume()).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
});
