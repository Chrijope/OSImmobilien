import { describe, it, expect } from "vitest";
import { mailArtLabel, istClosingMail } from "./bewerberMailTracking";

/**
 * Christian las am 17.09.2026 bei Michael Resch-Amsl in der Versandhistorie
 * des Closings: „Mustervertrag „?" · versendet". Er musste daraus schliessen,
 * das System verschicke ungefragt Vertraege.
 *
 * Versendet wurde nie ein Mustervertrag. Die Anzeige hatte zwei Faelle fuer
 * sieben Mailarten und beschriftete jede Nicht-Startfahrplan-Mail als
 * Mustervertrag. Das Fragezeichen war der fehlende Paketname einer
 * Kennenlern-Mail.
 */
describe("mailArtLabel", () => {
  it("nennt die Kennenlern-Mails beim Namen, nicht Mustervertrag", () => {
    expect(mailArtLabel("kennenlernen_einladung")).toBe("Einladung zum Kennenlernbogen");
    // Nach Tagen benannt: Tag 8 ist am 26.09.2026 entfallen, steht aber in
    // älteren Akten noch im Verlauf.
    expect(mailArtLabel("kennenlernen_erinnerung_1")).toBe("Erinnerung an den Kennenlernbogen (Tag 3)");
    expect(mailArtLabel("kennenlernen_erinnerung_2")).toBe("Erinnerung an den Kennenlernbogen (Tag 8)");
    expect(mailArtLabel("kennenlernen_erinnerung_3")).toBe("Letzte Erinnerung an den Kennenlernbogen (Tag 11)");
    expect(mailArtLabel("kooperation_einladung")).toBe("Einladung zum Kooperationsbogen");
  });

  it("nennt keine dieser Mails Mustervertrag", () => {
    const fremde = [
      "kennenlernen_einladung", "kennenlernen_erinnerung_1", "kennenlernen_erinnerung_2",
      "kennenlernen_erinnerung_3", "kooperation_einladung",
    ];
    expect(fremde.every((k) => !mailArtLabel(k).includes("Mustervertrag"))).toBe(true);
  });

  it("behält Startfahrplan und Mustervertrag", () => {
    expect(mailArtLabel("paket_uebersicht")).toBe("Startfahrplan");
    expect(mailArtLabel("muster_vertrag", "Lead Partner")).toBe('Mustervertrag „Lead Partner"');
  });

  /*
   * Ein Fragezeichen sieht nach einem Fehler in den Daten aus, obwohl die
   * Mail schlicht kein Paket hat.
   */
  it("schreibt kein Fragezeichen, wenn das Paket fehlt", () => {
    expect(mailArtLabel("muster_vertrag")).toBe("Mustervertrag");
    expect(mailArtLabel("muster_vertrag", "")).toBe("Mustervertrag");
    expect(mailArtLabel("muster_vertrag", "   ")).toBe("Mustervertrag");
    expect(mailArtLabel("muster_vertrag", null)).not.toContain("?");
  });

  /*
   * Eine neue Art soll auffallen, statt unter einem falschen Namen zu laufen.
   * Genau das war der Fehler.
   */
  it("zeigt eine unbekannte Art im Rohwert", () => {
    expect(mailArtLabel("voellig_neue_mailart")).toBe("voellig_neue_mailart");
  });

  it("hängt das Paket nur an den Mustervertrag", () => {
    expect(mailArtLabel("paket_uebersicht", "Lead Partner")).toBe("Startfahrplan");
    expect(mailArtLabel("kennenlernen_einladung", "Lead Partner")).not.toContain("Lead Partner");
  });
});

describe("istClosingMail", () => {
  it("trennt die Closing-Mails von den Bewerbermails", () => {
    expect(istClosingMail("paket_uebersicht")).toBe(true);
    expect(istClosingMail("muster_vertrag")).toBe(true);
    expect(istClosingMail("kennenlernen_einladung")).toBe(false);
    expect(istClosingMail("kooperation_einladung")).toBe(false);
  });
});
