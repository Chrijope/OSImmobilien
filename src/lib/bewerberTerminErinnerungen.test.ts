import { describe, it, expect } from "vitest";
import {
  STUFEN_TELEFON,
  STUFEN_VIDEOCALL,
  faelligeStufe,
  istNeuerProzess,
  stufenFuer,
  terminStoppGrund,
  vorlageFuer,
} from "../../supabase/functions/_shared/bewerber-termin-erinnerungen";
import { PROZESS_NEU } from "@/lib/bewerberprozessZuordnung";

/**
 * Die Erinnerungen vor einem Bewerbertermin.
 *
 * Zwei Dinge werden hier bewacht:
 *
 * 1. **Abgelehnte Bewerber bekommen nichts.** Das war ein gemeldeter Fehler:
 *    Der Lauf las Datum und Uhrzeit aus dem Meta-Feld und fragte nie nach dem
 *    Status. Wer abgelehnt wurde oder abgesagt hat, behielt seinen alten Termin
 *    im Meta-Feld und wurde weiter erinnert.
 * 2. **Die Abstände stimmen mit dem Dokument überein.** Der neue Ablauf hat ein
 *    Persönliches Gespräch und erinnert 24, 6 und 1 Stunde vorher (Punkt P9 vom
 *    07.09.2026), das bestehende Bewerbungsmanagement ein Telefonat mit 48, 6
 *    und 1 Stunde.
 */

const stand = (felder: Partial<Parameters<typeof terminStoppGrund>[0]> = {}) => ({
  bewerberStatus: "Eingang",
  hatTermin: true,
  stundenBis: 24,
  ...felder,
});

describe("Wer keine Terminerinnerung bekommt", () => {
  it("hält abgelehnte Bewerber heraus", () => {
    expect(terminStoppGrund(stand({ bewerberStatus: "Abgelehnt" }))).toBe("abgelehnt");
    expect(faelligeStufe(stand({ bewerberStatus: "Abgelehnt" }), STUFEN_VIDEOCALL, [])).toBeNull();
  });

  it("hält „Kein Interesse“ heraus", () => {
    expect(terminStoppGrund(stand({ bewerberStatus: "KeinInteresse" }))).toBe("kein_interesse");
    expect(faelligeStufe(stand({ bewerberStatus: "KeinInteresse" }), STUFEN_TELEFON, [])).toBeNull();
  });

  it("erinnert nicht an einen Termin, der vorbei ist", () => {
    expect(terminStoppGrund(stand({ stundenBis: -2 }))).toBe("vergangen");
  });

  it("erinnert nicht ohne Termin", () => {
    expect(terminStoppGrund(stand({ hatTermin: false }))).toBe("kein_termin");
  });

  it("lässt einen laufenden Bewerber durch", () => {
    expect(terminStoppGrund(stand())).toBeNull();
    for (const status of ["Eingang", "Erstgespraech", "Closing", "Vertrag"]) {
      expect(terminStoppGrund(stand({ bewerberStatus: status }))).toBeNull();
    }
  });
});

describe("Die Abstände", () => {
  it("nennt im neuen Ablauf 24, 6 und 1 Stunde", () => {
    expect(STUFEN_VIDEOCALL.map((s) => s.stunden)).toEqual([24, 6, 1]);
  });

  it("gibt jeder Stufe einen eigenen Merker, damit keine doppelt hinausgeht", () => {
    const label = STUFEN_VIDEOCALL.map((s) => s.label);
    expect(new Set(label).size).toBe(label.length);
    expect(label).toEqual(["24h", "6h", "1h"]);
  });

  it("lässt das bestehende Bewerbungsmanagement unverändert bei 48, 6 und 1", () => {
    expect(STUFEN_TELEFON.map((s) => s.stunden)).toEqual([48, 6, 1]);
  });

  it("wählt die Staffel am selben Kennzeichen wie die beiden Listen", () => {
    expect(istNeuerProzess({ prozess: PROZESS_NEU })).toBe(true);
    expect(istNeuerProzess({})).toBe(false);
    expect(stufenFuer({ prozess: PROZESS_NEU })).toBe(STUFEN_VIDEOCALL);
    expect(stufenFuer({})).toBe(STUFEN_TELEFON);
  });

  it("nimmt für den Videocall eine eigene Vorlage, die vom Anrufen schweigt", () => {
    expect(vorlageFuer({ prozess: PROZESS_NEU })).toBe("bewerber-videocall-erinnerung");
    expect(vorlageFuer({})).toBe("bewerber-erstgespraech-erinnerung");
  });
});

describe("Wann eine Stufe fällig ist", () => {
  it("trifft das Fenster von einer Stunde um jeden Wert", () => {
    expect(faelligeStufe(stand({ stundenBis: 24 }), STUFEN_VIDEOCALL, [])?.label).toBe("24h");
    expect(faelligeStufe(stand({ stundenBis: 23.6 }), STUFEN_VIDEOCALL, [])?.label).toBe("24h");
    expect(faelligeStufe(stand({ stundenBis: 24.4 }), STUFEN_VIDEOCALL, [])?.label).toBe("24h");
    // Dazwischen ist nichts fällig, sonst käme bei jedem Lauf eine Mail.
    expect(faelligeStufe(stand({ stundenBis: 12 }), STUFEN_VIDEOCALL, [])).toBeNull();
  });

  it("schickt dieselbe Stufe kein zweites Mal", () => {
    expect(faelligeStufe(stand({ stundenBis: 24 }), STUFEN_VIDEOCALL, ["24h"])).toBeNull();
    expect(faelligeStufe(stand({ stundenBis: 1 }), STUFEN_VIDEOCALL, ["24h"])?.label).toBe("1h");
  });

  it("trifft auch die neue mittlere Stufe", () => {
    // Sie fehlte bis zum 07.09.2026. Zwischen 24 und 1 Stunde lag der ganze
    // Arbeitstag, an dem der Termin wieder aus dem Kopf faellt.
    expect(faelligeStufe(stand({ stundenBis: 6 }), STUFEN_VIDEOCALL, ["24h"])?.label).toBe("6h");
    expect(faelligeStufe(stand({ stundenBis: 6 }), STUFEN_VIDEOCALL, ["24h", "6h"])).toBeNull();
  });

  it("nennt nur in der letzten Stufe die Uhrzeit in Ziffern", () => {
    expect(STUFEN_VIDEOCALL.find((s) => s.label === "1h")?.mitUhrzeit).toBe(true);
    expect(STUFEN_VIDEOCALL.find((s) => s.label === "24h")?.mitUhrzeit).toBeUndefined();
    expect(STUFEN_VIDEOCALL.find((s) => s.label === "6h")?.mitUhrzeit).toBeUndefined();
  });

  it("bekommt im neuen Ablauf 48 Stunden vorher nichts", () => {
    // Der alte Lauf schickte hier eine Mail. Für ein persönliches Gespräch ist
    // das zu früh, und die Abstimmungsfassung nennt 48 Stunden nicht.
    expect(faelligeStufe(stand({ stundenBis: 48 }), STUFEN_VIDEOCALL, [])).toBeNull();
    expect(faelligeStufe(stand({ stundenBis: 48 }), STUFEN_TELEFON, [])?.label).toBe("48h");
  });

  it("nennt in jeder Mail, wie weit der Termin weg ist", () => {
    for (const stufe of [...STUFEN_VIDEOCALL, ...STUFEN_TELEFON]) {
      expect(stufe.vorText).toContain("in ");
      expect(stufe.vorText).toContain(String(stufe.stunden));
    }
  });
});
