import { describe, it, expect } from "vitest";
import { pruefeDatei, onboardingStand, darfInsCrm, type PartnerUnterlage } from "@/lib/partnerUnterlagenStore";

const datei = (name: string, typ: string, groesse = 1000) =>
  ({ name, type: typ, size: groesse }) as File;

const unterlage = (art: string): PartnerUnterlage => ({
  id: art, userId: "u1", art: art as never, pfad: `u1/${art}.pdf`,
  dateiname: `${art}.pdf`, hochgeladenAm: new Date().toISOString(),
});

describe("Nur PDF und JPEG", () => {
  it("nimmt PDF und JPEG an", () => {
    expect(pruefeDatei(datei("ausweis.pdf", "application/pdf"))).toBeNull();
    expect(pruefeDatei(datei("ausweis.jpg", "image/jpeg"))).toBeNull();
    expect(pruefeDatei(datei("ausweis.jpeg", "image/jpeg"))).toBeNull();
  });

  it("nimmt auch den falschen, aber verbreiteten Typ image/jpg an", () => {
    // Manche Handykameras senden das. Ohne die Ausnahme scheitert ein Upload,
    // der fuer den Nutzer aussieht wie ein gewoehnliches Foto.
    expect(pruefeDatei(datei("foto.jpg", "image/jpg"))).toBeNull();
  });

  it("weist PNG, HEIC und Word ab", () => {
    for (const [n, t] of [["a.png", "image/png"], ["a.heic", "image/heic"], ["a.docx", "application/msword"]]) {
      expect(pruefeDatei(datei(n, t)), `${n} muss abgewiesen werden`).toContain("PDF und JPEG");
    }
  });

  it("entscheidet nach der Endung, wenn der Browser keinen Typ liefert", () => {
    expect(pruefeDatei(datei("ausweis.pdf", ""))).toBeNull();
    expect(pruefeDatei(datei("ausweis.png", ""))).toContain("PDF und JPEG");
  });

  it("weist eine leere Datei ab", () => {
    // Die Groessengrenze ist bewusst entfallen: Zu grosse Dateien werden beim
    // Hochladen verkleinert, statt den Partner mit einer Fehlermeldung
    // stehenzulassen. Siehe die Gruppe weiter unten.
    expect(pruefeDatei(datei("a.pdf", "application/pdf", 0))).toContain("leer");
  });
});

describe("Wann das Onboarding vollstaendig ist", () => {
  const morgen = new Date(Date.now() + 86400000).toISOString();
  const gestern = new Date(Date.now() - 86400000).toISOString();

  it("verlangt den Ausweis", () => {
    expect(onboardingStand([], false, null).vollstaendig).toBe(false);
    expect(onboardingStand([unterlage("personalausweis")], false, null).vollstaendig).toBe(true);
  });

  it("verlangt eine Angabe zur Gewerbeerlaubnis", () => {
    // Noch nichts angekreuzt: nicht vollstaendig, auch mit Ausweis.
    expect(onboardingStand([unterlage("personalausweis")], null, null).vollstaendig).toBe(false);
  });

  it("laesst ein Nein ohne Datei gelten", () => {
    // "Liegt nicht vor" blockiert nichts, es ist nur eine Information.
    expect(onboardingStand([unterlage("personalausweis")], false, null).vollstaendig).toBe(true);
  });

  it("verlangt bei einem Ja auch die Datei", () => {
    expect(onboardingStand([unterlage("personalausweis")], true, null).vollstaendig).toBe(false);
    expect(onboardingStand(
      [unterlage("personalausweis"), unterlage("gewerbeerlaubnis_34c")], true, null,
    ).vollstaendig).toBe(true);
  });
});

describe("Schonfrist fuer Bestandspartner", () => {
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString();
  const gestern = new Date(Date.now() - 86400000).toISOString();

  it("laesst unvollstaendige Bestandspartner waehrend der Frist arbeiten", () => {
    const stand = onboardingStand([], null, in30);
    expect(stand.vollstaendig).toBe(false);
    expect(darfInsCrm(stand)).toBe(true);
    expect(stand.tageRest).toBeGreaterThan(28);
  });

  it("sperrt nach Ablauf der Frist", () => {
    expect(darfInsCrm(onboardingStand([], null, gestern))).toBe(false);
  });

  it("sperrt neue Partner ohne Frist sofort", () => {
    expect(darfInsCrm(onboardingStand([], null, null))).toBe(false);
  });

  it("laesst Vollstaendige immer durch, auch nach Ablauf", () => {
    const stand = onboardingStand([unterlage("personalausweis")], false, gestern);
    expect(darfInsCrm(stand)).toBe(true);
  });
});

describe("Grosse Dateien werden nicht mehr abgewiesen", () => {
  it("laesst eine 40-MB-Datei durch die Pruefung", async () => {
    /*
     * Vorher scheiterte hier alles ueber 20 MB, und der Partner stand mit
     * einer Fehlermeldung da. Ein Ausweisfoto einer modernen Handykamera hat
     * schnell 12 MB, ein Scan auch mal 40. Verkleinert wird jetzt beim
     * Hochladen, siehe unterlagenVerkleinern.ts.
     */
    expect(pruefeDatei(datei("scan.pdf", "application/pdf", 40 * 1024 * 1024))).toBeNull();
    expect(pruefeDatei(datei("foto.jpg", "image/jpeg", 35 * 1024 * 1024))).toBeNull();
  });

  it("weist den falschen Typ weiterhin ab, egal wie klein", () => {
    expect(pruefeDatei(datei("a.png", "image/png", 100))).toContain("PDF und JPEG");
  });

  it("weist eine leere Datei weiterhin ab", () => {
    expect(pruefeDatei(datei("a.pdf", "application/pdf", 0))).toContain("leer");
  });
});
