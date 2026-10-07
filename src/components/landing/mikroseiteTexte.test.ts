import { describe, expect, it } from "vitest";
import { MIKROSEITE_TEXTE } from "@/components/landing/mikroseiteTexte";
import { gleicheTexte, pruefeTexteVollstaendig } from "@/test/texteVollstaendig";

/* Berater-Mikroseite, Abschnitte 1 bis 10: Deutsch und Englisch vollständig (Plan Kundensprache, Etappe 6). */
describe("MIKROSEITE_TEXTE", () => {
  it("jeder Eintrag hat beide Sprachen, nichts ist leer, keine Gedankenstriche", () => {
    expect(pruefeTexteVollstaendig(MIKROSEITE_TEXTE)).toEqual([]);
  });

  it("Englisch ist wirklich übersetzt und nicht der deutsche Wortlaut", () => {
    expect(gleicheTexte(MIKROSEITE_TEXTE)).toEqual([]);
  });
});
