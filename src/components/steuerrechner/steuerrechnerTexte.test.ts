import { describe, expect, it } from "vitest";
import { STEUERRECHNER_TEXTE } from "@/components/steuerrechner/steuerrechnerTexte";
import { gleicheTexte, pruefeTexteVollstaendig } from "@/test/texteVollstaendig";

/* Öffentlicher Steuerrechner: Deutsch und Englisch vollständig (Plan Kundensprache, Etappe 6). */
describe("STEUERRECHNER_TEXTE", () => {
  it("jeder Eintrag hat beide Sprachen, nichts ist leer, keine Gedankenstriche", () => {
    expect(pruefeTexteVollstaendig(STEUERRECHNER_TEXTE)).toEqual([]);
  });

  it("Englisch ist wirklich übersetzt und nicht der deutsche Wortlaut", () => {
    expect(gleicheTexte(STEUERRECHNER_TEXTE)).toEqual([]);
  });
});
