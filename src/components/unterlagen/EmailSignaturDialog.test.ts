import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * Die Signatur wird in fremde Mailprogramme kopiert. Deshalb zaehlen hier
 * Datei und Adresse des Logos, nicht nur die Darstellung im CRM.
 */
const quelle = readFileSync(resolve(__dirname, "EmailSignaturDialog.tsx"), "utf8");

describe("E-Mail-Signatur", () => {
  it("zeigt das OS-Real-Estate-Logo per absoluter Adresse, nicht eingebettet", () => {
    expect(quelle).toContain('const LOGO_PFAD = "/images/os-real-estate-logo-signatur.png"');
    expect(quelle).toContain("new URL(LOGO_PFAD, OEFFENTLICHE_BASIS)");
    expect(quelle).not.toContain("toDataURL");
  });

  it("die Logodatei ist ein PNG in genau der Anzeigebreite von 120 Pixeln", () => {
    const datei = readFileSync(resolve(__dirname, "../../../public/images/os-real-estate-logo-signatur.png"));
    expect(datei.subarray(0, 4).toString("hex")).toBe("89504e47");
    // Breite steht im IHDR-Block ab Byte 16, vier Byte gross.
    expect(datei.readUInt32BE(16)).toBe(120);
    expect(quelle).toContain("const LOGO_BREITE = 120;");
  });

  it("nennt unten die OS Real Estate GmbH mit unveraenderter Anschrift", () => {
    expect(quelle).toContain("OS Real Estate GmbH, Am Ostbahnhof 1, 15749 Mittenwalde");
    expect(quelle).not.toContain("OS Immobilien Holding GmbH");
  });
});
