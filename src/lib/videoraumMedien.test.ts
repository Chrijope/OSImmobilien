import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { holeMedien } from "@/lib/videoraumVerbindung";

/**
 * Kamera und Mikrofon anfordern.
 *
 * Der Kunde sitzt am anderen Ende und hat oft nicht beides. Ein Rechner ohne
 * Kamera bekam vorher gar keinen Stream, damit blieb der Warteraum eine
 * Sackgasse: Der Gastgeber liess ihn ein, und beim Gast passierte nichts.
 * Deshalb der zweite Anlauf mit nur einem Geraet.
 */

class TestStream {
  constructor(private art: "video" | "audio" | "beides") {}
  getTracks() { return this.art === "beides" ? ["v", "a"] : [this.art]; }
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

describe("holeMedien", () => {
  it("liefert Bild und Ton, wenn beides da ist", async () => {
    getUserMedia.mockResolvedValueOnce(new TestStream("beides"));
    const ergebnis = await holeMedien();
    expect(ergebnis.stream).not.toBeNull();
    expect(ergebnis.grund).toBeNull();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("nimmt nur den Ton, wenn keine Kamera vorhanden ist", async () => {
    getUserMedia
      .mockRejectedValueOnce(fehler("NotFoundError"))
      .mockResolvedValueOnce(new TestStream("audio"));

    const ergebnis = await holeMedien();
    expect(ergebnis.grund).toBeNull();
    expect((ergebnis.stream as unknown as TestStream).getTracks()).toEqual(["audio"]);
    expect(getUserMedia).toHaveBeenNthCalledWith(2, expect.objectContaining({ video: false }));
  });

  it("nimmt nur das Bild, wenn kein Mikrofon vorhanden ist", async () => {
    getUserMedia
      .mockRejectedValueOnce(fehler("NotFoundError"))
      .mockRejectedValueOnce(fehler("NotFoundError"))
      .mockResolvedValueOnce(new TestStream("video"));

    const ergebnis = await holeMedien();
    expect(ergebnis.grund).toBeNull();
    expect((ergebnis.stream as unknown as TestStream).getTracks()).toEqual(["video"]);
  });

  it("meldet verständlich, wenn gar kein Gerät gefunden wird", async () => {
    getUserMedia.mockRejectedValue(fehler("NotFoundError"));
    const ergebnis = await holeMedien();
    expect(ergebnis.stream).toBeNull();
    expect(ergebnis.grund).toMatch(/keine Kamera/i);
  });

  it("versucht bei verweigerter Erlaubnis keinen zweiten Anlauf", async () => {
    // Wer ablehnt, lehnt beides ab. Ein zweiter Versuch brächte nur einen
    // zweiten Browserdialog.
    getUserMedia.mockRejectedValue(fehler("NotAllowedError"));
    const ergebnis = await holeMedien();
    expect(ergebnis.stream).toBeNull();
    expect(ergebnis.grund).toMatch(/abgelehnt/i);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("sagt Bescheid, wenn ein anderes Programm die Kamera hält", async () => {
    getUserMedia.mockRejectedValue(fehler("NotReadableError"));
    const ergebnis = await holeMedien();
    expect(ergebnis.grund).toMatch(/anderen Programm/i);
  });
});
