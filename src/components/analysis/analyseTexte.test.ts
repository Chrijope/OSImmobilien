import { describe, expect, it } from "vitest";
import { ANALYSE_TEXTE } from "@/components/analysis/analyseTexte";
import { gleicheTexte, pruefeTexteVollstaendig } from "@/test/texteVollstaendig";

/* Öffentliches Analysetool: Deutsch und Englisch vollständig (Plan Kundensprache, Etappe 6). */
describe("ANALYSE_TEXTE", () => {
  it("jeder Eintrag hat beide Sprachen, nichts ist leer, keine Gedankenstriche", () => {
    expect(pruefeTexteVollstaendig(ANALYSE_TEXTE)).toEqual([]);
  });

  it("Englisch ist wirklich übersetzt und nicht der deutsche Wortlaut", () => {
    expect(gleicheTexte(ANALYSE_TEXTE)).toEqual([]);
  });
});
