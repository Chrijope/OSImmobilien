import { describe, expect, it } from "vitest";
import { LINKS_TEXTE } from "@/pages/linksTexte";
import { gleicheTexte, pruefeTexteVollstaendig } from "@/test/texteVollstaendig";

/* Linkseite: Deutsch und Englisch vollständig (Plan Kundensprache, Etappe 6). */
describe("LINKS_TEXTE", () => {
  it("jeder Eintrag hat beide Sprachen, nichts ist leer, keine Gedankenstriche", () => {
    expect(pruefeTexteVollstaendig(LINKS_TEXTE)).toEqual([]);
  });

  it("Englisch ist wirklich übersetzt und nicht der deutsche Wortlaut", () => {
    // Das Kennzeichen „in English“ ist in beiden Sprachen gleich.
    const gewollt = /^ziele\.expatsKennzeichen$/;
    expect(gleicheTexte(LINKS_TEXTE).filter((p) => !gewollt.test(p))).toEqual([]);
  });
});
