import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { holeMedien } from "@/lib/videoraumVerbindung";

/**
 * Die gespeicherte Geraetewahl beim Medienholen.
 *
 * Der Kern: Fehlt das Wunschgeraet (abgezogene USB-Kamera), darf das
 * Gespraech nicht daran scheitern. Es wird einmal ohne Wunsch neu angefragt,
 * dann laeuft alles mit den Standardgeraeten weiter.
 */

class TestStream {
  getTracks() { return ["v", "a"]; }
}

function fehler(name: string): DOMException {
  const f = new Error(name) as unknown as DOMException;
  (f as { name: string }).name = name;
  return f;
}

const getUserMedia = vi.fn();

beforeEach(() => {
  getUserMedia.mockReset();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
});

describe("holeMedien mit Geraetewahl", () => {
  it("fragt die gewuenschten Geraete exakt an", async () => {
    getUserMedia.mockResolvedValueOnce(new TestStream());
    await holeMedien({ kameraId: "kamera-1", mikrofonId: "mikro-1" });
    expect(getUserMedia).toHaveBeenCalledWith({
      video: expect.objectContaining({ deviceId: { exact: "kamera-1" } }),
      audio: expect.objectContaining({ deviceId: { exact: "mikro-1" } }),
    });
  });

  it("faellt auf die Standardgeraete zurueck, wenn das Wunschgeraet fehlt", async () => {
    getUserMedia
      .mockRejectedValueOnce(fehler("OverconstrainedError"))
      .mockResolvedValueOnce(new TestStream());

    const ergebnis = await holeMedien({ kameraId: "abgezogene-kamera" });
    expect(ergebnis.stream).not.toBeNull();
    expect(ergebnis.grund).toBeNull();
    // Der zweite Anlauf traegt keine Geraetewuensche mehr.
    const zweiter = getUserMedia.mock.calls[1][0];
    expect(JSON.stringify(zweiter)).not.toContain("deviceId");
  });

  it("meldet ohne Geraetewunsch weiterhin den echten Fehler", async () => {
    getUserMedia.mockRejectedValue(fehler("NotAllowedError"));
    const ergebnis = await holeMedien({ kameraId: "kamera-1" });
    expect(ergebnis.stream).toBeNull();
    expect(ergebnis.grund).toContain("abgelehnt");
  });
});
