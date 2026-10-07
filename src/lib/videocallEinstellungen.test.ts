import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserSetting = vi.hoisted(() => vi.fn());
const setUserSettingSicher = vi.hoisted(() => vi.fn());
vi.mock("./userSettingsCache", () => ({ getUserSetting, setUserSettingSicher }));

const isTableLoaded = vi.hoisted(() => vi.fn());
const cacheReload = vi.hoisted(() => vi.fn());
vi.mock("./dataCache", () => ({ isTableLoaded, cacheReload }));

import {
  normalisiereHintergrund, normalisiereVideocallProfil,
  ladeVideocallProfil, ladeVideocallProfilSicher, speichereVideocallProfil,
  VIDEOCALL_SCHLUESSEL,
} from "@/lib/videocallEinstellungen";

/**
 * Die Videocall-Einstellungen mit sicheren Vorgaben.
 *
 * Aus der Datenbank kann alles kommen, auch ein Bild-Verweis, dessen Bild
 * laengst geloescht ist. Nichts davon darf einen kaputten Zustand in den
 * Videoraum tragen: Unbrauchbares faellt auf "aus" beziehungsweise die
 * Vorgabe zurueck.
 */

beforeEach(() => {
  getUserSetting.mockReset();
  setUserSettingSicher.mockReset();
  isTableLoaded.mockReset();
  cacheReload.mockReset();
});

describe("normalisiereHintergrund", () => {
  it("laesst gueltige Wahlen durch", () => {
    expect(normalisiereHintergrund({ art: "weich" })).toEqual({ art: "weich" });
    expect(normalisiereHintergrund({ art: "bild", bildPfad: "u1/foto.jpg" }))
      .toEqual({ art: "bild", bildPfad: "u1/foto.jpg" });
  });

  it("faellt bei Unbrauchbarem auf aus zurueck", () => {
    expect(normalisiereHintergrund(undefined)).toEqual({ art: "aus" });
    expect(normalisiereHintergrund(null)).toEqual({ art: "aus" });
    expect(normalisiereHintergrund("weich")).toEqual({ art: "aus" });
    expect(normalisiereHintergrund({ art: "unsinn" })).toEqual({ art: "aus" });
    // Ein Bild ohne Pfad gibt es nicht, etwa nach dem Loeschen des Bildes.
    expect(normalisiereHintergrund({ art: "bild" })).toEqual({ art: "aus" });
    expect(normalisiereHintergrund({ art: "bild", bildPfad: "   " })).toEqual({ art: "aus" });
  });
});

describe("normalisiereVideocallProfil", () => {
  it("liefert die Vorgaben, wenn nichts gespeichert ist", () => {
    const profil = normalisiereVideocallProfil(null);
    expect(profil.spiegeln).toBe(true);
    expect(profil.beitrittStumm).toBe(false);
    expect(profil.beitrittOhneKamera).toBe(false);
    expect(profil.hintergrund).toEqual({ art: "aus" });
  });

  it("respektiert ein ausdrueckliches Abschalten des Spiegelns", () => {
    expect(normalisiereVideocallProfil({ spiegeln: false }).spiegeln).toBe(false);
    expect(normalisiereVideocallProfil({ spiegeln: true }).spiegeln).toBe(true);
  });

  it("laesst die uebrigen Felder unangetastet", () => {
    const profil = normalisiereVideocallProfil({ zitat: "Hallo", kameraId: "k1", beitrittStumm: true });
    expect(profil.zitat).toBe("Hallo");
    expect(profil.kameraId).toBe("k1");
    expect(profil.beitrittStumm).toBe(true);
  });
});

describe("speichereVideocallProfil", () => {
  it("mischt den Patch in den bestehenden Stand, statt ihn zu ersetzen", async () => {
    getUserSetting.mockReturnValue({ zitat: "Bleibt stehen", kameraId: "k1" });
    await speichereVideocallProfil({ spiegeln: false });
    expect(setUserSettingSicher).toHaveBeenCalledWith(VIDEOCALL_SCHLUESSEL, {
      zitat: "Bleibt stehen",
      kameraId: "k1",
      spiegeln: false,
    });
  });

  it("kommt auch ohne bestehenden Stand aus", async () => {
    getUserSetting.mockReturnValue(null);
    await speichereVideocallProfil({ beitrittStumm: true });
    expect(setUserSettingSicher).toHaveBeenCalledWith(VIDEOCALL_SCHLUESSEL, { beitrittStumm: true });
  });
});

describe("ladeVideocallProfil", () => {
  it("normalisiert den gespeicherten Stand", () => {
    getUserSetting.mockReturnValue({ hintergrund: { art: "bild" } });
    const profil = ladeVideocallProfil();
    expect(profil.hintergrund).toEqual({ art: "aus" });
    expect(profil.spiegeln).toBe(true);
  });
});

it("meldet fehlgeschlagene Speicherung und bleibt danach benutzbar", async () => {
  setUserSettingSicher.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  expect(await speichereVideocallProfil({ spiegeln: false })).toBe(false);
  expect(await speichereVideocallProfil({ spiegeln: true })).toBe(true);
});

/**
 * Der Videoraum wird aus dem Bewerberprofil heraus in einem **neuen Tab**
 * geoeffnet. Dort faengt der Zwischenspeicher leer an, und wer zuegig auf
 * "Raum betreten" klickt, liest die Einstellungen, bevor sie da sind. Der
 * gewaehlte Hintergrund fiel dann still auf "aus" zurueck.
 */
describe("ladeVideocallProfilSicher", () => {
  it("holt die Einstellungen nach, wenn sie noch nicht geladen sind", async () => {
    isTableLoaded.mockReturnValue(false);
    // Erst nach dem Nachladen steht der Hintergrund im Zwischenspeicher.
    cacheReload.mockImplementation(async () => {
      getUserSetting.mockReturnValue({ hintergrund: { art: "bild", bildPfad: "u1/buero.jpg" } });
    });
    getUserSetting.mockReturnValue(null);

    const profil = await ladeVideocallProfilSicher();

    expect(cacheReload).toHaveBeenCalledWith("user_settings");
    expect(profil.hintergrund).toEqual({ art: "bild", bildPfad: "u1/buero.jpg" });
  });

  it("laedt nicht nach, wenn die Einstellungen schon da sind", async () => {
    isTableLoaded.mockReturnValue(true);
    getUserSetting.mockReturnValue({ hintergrund: { art: "weich" } });

    const profil = await ladeVideocallProfilSicher();

    expect(cacheReload).not.toHaveBeenCalled();
    expect(profil.hintergrund).toEqual({ art: "weich" });
  });

  /*
   * Ein Ladefehler darf das Gespraech nicht verhindern. Dann gelten eben die
   * Vorgaben, so wie vorher auch.
   */
  it("faellt bei einem Ladefehler auf die Vorgaben zurueck", async () => {
    isTableLoaded.mockReturnValue(false);
    cacheReload.mockRejectedValue(new Error("Netz weg"));
    getUserSetting.mockReturnValue(null);

    const profil = await ladeVideocallProfilSicher();

    expect(profil.hintergrund).toEqual({ art: "aus" });
    expect(profil.spiegeln).toBe(true);
  });
});
