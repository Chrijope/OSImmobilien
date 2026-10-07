import { describe, expect, it } from "vitest";
import { STEUER_KENNUNG_TEXTE } from "@/lib/steuerrechnerKennungTexte";
import { gleicheTexte, pruefeTexteVollstaendig } from "@/test/texteVollstaendig";

/* Steuerrechner, Anzeige der Kennungen aus dem Rechenkern: Deutsch und Englisch vollständig (Plan Kundensprache, Etappe 6). */
describe("STEUER_KENNUNG_TEXTE", () => {
  it("jeder Eintrag hat beide Sprachen, nichts ist leer, keine Gedankenstriche", () => {
    expect(pruefeTexteVollstaendig(STEUER_KENNUNG_TEXTE)).toEqual([]);
  });

  it("Englisch ist wirklich übersetzt und nicht der deutsche Wortlaut", () => {
    expect(gleicheTexte(STEUER_KENNUNG_TEXTE)).toEqual([]);
  });
});
