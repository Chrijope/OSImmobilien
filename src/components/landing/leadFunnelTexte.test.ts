import { describe, expect, it } from "vitest";
import { LEAD_FUNNEL_TEXTE } from "@/components/landing/leadFunnelTexte";
import { gleicheTexte, pruefeTexteVollstaendig } from "@/test/texteVollstaendig";

/* Lead-Funnel der Mikroseite: Deutsch und Englisch vollständig (Plan Kundensprache, Etappe 6). */
describe("LEAD_FUNNEL_TEXTE", () => {
  it("jeder Eintrag hat beide Sprachen, nichts ist leer, keine Gedankenstriche", () => {
    expect(pruefeTexteVollstaendig(LEAD_FUNNEL_TEXTE)).toEqual([]);
  });

  it("Englisch ist wirklich übersetzt und nicht der deutsche Wortlaut", () => {
    // Die Beispielnummer ist in beiden Sprachen dieselbe.
    const gewollt = /^kontakt\.beispielTelefon$/;
    expect(gleicheTexte(LEAD_FUNNEL_TEXTE).filter((p) => !gewollt.test(p))).toEqual([]);
  });
});
