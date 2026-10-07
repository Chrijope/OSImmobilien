import { describe, it, expect } from "vitest";
// Die Logik liegt bei der Edge Function, weil sie dort gebraucht wird. Getestet
// wird sie hier, weil Vitest nur unterhalb von src sucht.
import { findeBeraterNachName } from "../../supabase/functions/_shared/berater-namensabgleich.ts";

const profile = [
  { id: "id-anna", name: "Anna Beispiel" },
  { id: "id-bernd", name: "Bernd Muster" },
];

describe("findeBeraterNachName", () => {
  it("findet ein eindeutig passendes Profil", () => {
    expect(findeBeraterNachName("Anna Beispiel", profile)).toEqual({
      art: "eindeutig",
      id: "id-anna",
      name: "Anna Beispiel",
    });
  });

  it("ignoriert Gross- und Kleinschreibung sowie Leerzeichen am Rand", () => {
    expect(findeBeraterNachName("  anna BEISPIEL ", profile)).toEqual({
      art: "eindeutig",
      id: "id-anna",
      name: "Anna Beispiel",
    });
  });

  it("meldet keinen Treffer bei unbekanntem Namen", () => {
    expect(findeBeraterNachName("Carla Unbekannt", profile)).toEqual({ art: "unbekannt" });
  });

  it("meldet keinen Treffer bei leerem Namen", () => {
    expect(findeBeraterNachName("   ", profile)).toEqual({ art: "unbekannt" });
  });

  it("weist bei zwei gleichnamigen Profilen nichts zu", () => {
    const doppelt = [...profile, { id: "id-anna-2", name: "anna beispiel" }];
    expect(findeBeraterNachName("Anna Beispiel", doppelt)).toEqual({
      art: "mehrdeutig",
      anzahl: 2,
    });
  });

  it("ignoriert Profile ohne Namen", () => {
    const mitLeerem = [...profile, { id: "id-leer", name: null }];
    expect(findeBeraterNachName("Anna Beispiel", mitLeerem)).toEqual({
      art: "eindeutig",
      id: "id-anna",
      name: "Anna Beispiel",
    });
  });

  it("trifft nicht bei aehnlichen Namen, ein falscher Treffer waere schlimmer", () => {
    expect(findeBeraterNachName("Anna Beispil", profile)).toEqual({ art: "unbekannt" });
    expect(findeBeraterNachName("Anna", profile)).toEqual({ art: "unbekannt" });
  });
});

describe("Weiterreichung nach src", () => {
  it("liefert dieselbe Funktion wie die Fassung der Edge Function", async () => {
    // Die Anwendung importiert ueber "@/lib/beraterNamensabgleich", weil sie
    // nicht quer in den supabase-Ordner greifen soll. Bricht dieser Pfad, faellt
    // es sonst erst im Build auf.
    const ausSrc = await import("@/lib/beraterNamensabgleich");
    expect(ausSrc.findeBeraterNachName).toBe(findeBeraterNachName);
    expect(ausSrc.findeBeraterNachName("Anna Beispiel", profile)).toEqual({
      art: "eindeutig",
      id: "id-anna",
      name: "Anna Beispiel",
    });
  });
});
