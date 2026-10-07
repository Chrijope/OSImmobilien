import { describe, it, expect, afterEach } from "vitest";
import { waehleGeraeteId, kannLautsprecherWaehlen } from "@/lib/videocallGeraete";

/**
 * Die Geraetewahl mit sauberem Rueckfall.
 *
 * Eine gespeicherte Kennung darf nur gelten, wenn das Geraet wirklich noch da
 * ist. Sonst hinge das ganze Gespraech an einer abgezogenen USB-Kamera: Der
 * Browser wirft OverconstrainedError, und der Nutzer steht ohne Bild da.
 */

describe("waehleGeraeteId", () => {
  const geraete = [{ deviceId: "kamera-1" }, { deviceId: "kamera-2" }];

  it("nimmt die gespeicherte Kennung, wenn das Geraet vorhanden ist", () => {
    expect(waehleGeraeteId("kamera-2", geraete)).toBe("kamera-2");
  });

  it("faellt auf den Standard zurueck, wenn das Geraet fehlt", () => {
    expect(waehleGeraeteId("abgezogene-usb-kamera", geraete)).toBeUndefined();
  });

  it("faellt ohne gespeicherte Kennung auf den Standard zurueck", () => {
    expect(waehleGeraeteId(undefined, geraete)).toBeUndefined();
    expect(waehleGeraeteId(null, geraete)).toBeUndefined();
    expect(waehleGeraeteId("", geraete)).toBeUndefined();
  });

  it("faellt bei leerer Geraeteliste auf den Standard zurueck", () => {
    expect(waehleGeraeteId("kamera-1", [])).toBeUndefined();
  });
});

describe("kannLautsprecherWaehlen", () => {
  const prototyp = HTMLMediaElement.prototype as unknown as Record<string, unknown>;
  const hatteSetSinkId = "setSinkId" in prototyp;

  afterEach(() => {
    if (!hatteSetSinkId) delete prototyp.setSinkId;
  });

  it("erkennt einen Browser mit setSinkId", () => {
    if (!hatteSetSinkId) prototyp.setSinkId = () => Promise.resolve();
    expect(kannLautsprecherWaehlen()).toBe(true);
  });

  it("blendet die Auswahl ohne setSinkId aus, wie in Safari", () => {
    if (hatteSetSinkId) return; // echte Unterstuetzung laesst sich nicht entfernen
    expect(kannLautsprecherWaehlen()).toBe(false);
  });
});
