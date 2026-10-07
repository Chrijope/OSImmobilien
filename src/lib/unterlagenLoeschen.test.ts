import { describe, expect, it } from "vitest";

import { deuteUnterlagenFehler, loeschFehlerText, unterlagenSpeicherPfad } from "./unterlagenLoeschen";

const HOST = "https://abc.supabase.co/storage/v1/object";

describe("Speicherpfad einer Kundenunterlage", () => {
  it("reiner Pfad (CRM- und Portal-Upload) bleibt unveraendert", () => {
    // Genau dieser Fall warf vorher in `new URL()` einen TypeError.
    expect(unterlagenSpeicherPfad("k1/inv1/Letzter_Gehaltsnachweis_1.pdf")).toBe("k1/inv1/Letzter_Gehaltsnachweis_1.pdf");
  });

  it("oeffentliche Adresse aus dem Altbestand wird zum Pfad", () => {
    expect(unterlagenSpeicherPfad(`${HOST}/public/unterlagen/k1/inv1/Ausweis.pdf`)).toBe("k1/inv1/Ausweis.pdf");
  });

  it("signierte Adresse verliert Token und Praefix", () => {
    expect(unterlagenSpeicherPfad(`${HOST}/sign/unterlagen/k1/inv1/Ausweis%20neu.pdf?token=xyz`)).toBe("k1/inv1/Ausweis neu.pdf");
  });

  it("Adresse in einen fremden Bucket wird nicht angefasst", () => {
    expect(unterlagenSpeicherPfad(`${HOST}/public/objekt-medien/foo.jpg`)).toBeNull();
  });

  it("leer, undefined und nur Leerzeichen ergeben nichts", () => {
    expect(unterlagenSpeicherPfad(undefined)).toBeNull();
    expect(unterlagenSpeicherPfad("")).toBeNull();
    expect(unterlagenSpeicherPfad("   ")).toBeNull();
  });
});

describe("Fehlerdeutung beim Loeschen", () => {
  it("RLS-Verstoss und 403 sind Berechtigungsfehler", () => {
    expect(deuteUnterlagenFehler({ message: "new row violates row-level security policy", code: "42501" }).art).toBe("berechtigung");
    expect(deuteUnterlagenFehler({ message: "Unauthorized", statusCode: "403" }).art).toBe("berechtigung");
    expect(deuteUnterlagenFehler({ message: "Not allowed", code: "P0001" }).art).toBe("berechtigung");
  });

  it("Netzfehler von fetch bleiben Verbindungsfehler", () => {
    expect(deuteUnterlagenFehler(new TypeError("Failed to fetch")).art).toBe("verbindung");
    expect(deuteUnterlagenFehler({ message: "NetworkError when attempting to fetch resource." }).art).toBe("verbindung");
  });

  it("fehlende RPC wird als fehlende Migration erkannt", () => {
    expect(deuteUnterlagenFehler({ code: "PGRST202", message: "Could not find the function public.unregister_unterlage_upload" }).art).toBe("funktion_fehlt");
  });

  it("ein TypeError aus new URL() ist kein Verbindungsfehler", () => {
    expect(deuteUnterlagenFehler(new TypeError("Invalid URL")).art).toBe("sonstig");
  });

  it("der Hinweistext nennt bei Rechtefehlern die Berechtigung statt des Internets", () => {
    const text = loeschFehlerText("Vorletzter Gehaltsnachweis", { message: "Not allowed" });
    expect(text).toContain("„Vorletzter Gehaltsnachweis\" liegt weiterhin gespeichert.");
    expect(text).toContain("Keine Berechtigung");
    expect(text).not.toContain("Internetverbindung");
  });
});
