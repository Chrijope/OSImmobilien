import { describe, expect, it } from "vitest";
import { MIKROSEITE_ABSCHLUSS_TEXTE } from "@/components/landing/mikroseiteAbschlussTexte";
import { gleicheTexte, pruefeTexteVollstaendig } from "@/test/texteVollstaendig";

/* Berater-Mikroseite, Abschnitte 11 bis 16 und Rahmen: Deutsch und Englisch vollständig (Plan Kundensprache, Etappe 6). */
describe("MIKROSEITE_ABSCHLUSS_TEXTE", () => {
  it("jeder Eintrag hat beide Sprachen, nichts ist leer, keine Gedankenstriche", () => {
    expect(pruefeTexteVollstaendig(MIKROSEITE_ABSCHLUSS_TEXTE)).toEqual([]);
  });

  it("Englisch ist wirklich übersetzt und nicht der deutsche Wortlaut", () => {
    // Ortsnamen, „Portfolio“, die Platzhalter „Bank 1“ bis „Bank 3“, die Marke
    // OS Immobilien und der schon englische Fußsatz sind in beiden Sprachen gleich.
    const gewollt =
      /^kundenstimmen\.orte\[|^prozess\.schritte\[5\]\.kurzHandy$|^prozess\.grafik\.finanzierungBanken\[|^vergleich\.spalten\[2\]$|^fuss\.gemacht$/;
    expect(gleicheTexte(MIKROSEITE_ABSCHLUSS_TEXTE).filter((p) => !gewollt.test(p))).toEqual([]);
  });
});
