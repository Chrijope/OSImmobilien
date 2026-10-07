/**
 * Die internen Highlights so, wie `objekt-texte-ki` sie unter Deno prüft und
 * die Positivlisten sie behandeln. Ohne Netz.
 * Ausführen: deno test supabase/functions/_shared/interne-highlights_test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { OBJEKT_TEXTE_WERKZEUG, objektTexteAusMeta, OBJEKT_TEXTE_SCHEMA, pruefeObjektTexte } from "./objekt-texte.ts";
import { oeffentlichesMeta } from "./expose-oeffentlich.ts";
import { kundenMeta } from "./kunden-meta.ts";

Deno.test("das Werkzeug verlangt die internen Highlights", () => {
  assertEquals(OBJEKT_TEXTE_WERKZEUG.function.parameters.required.includes("interne_highlights"), true);
});

Deno.test("Prüfung und Lesen behalten nur belegte Punkte ohne Zusage", () => {
  const geprueft = pruefeObjektTexte({
    kurzbeschreibung: "Haus.",
    standortargumente: [],
    marktargumente: [],
    sanierungen: [],
    interne_highlights: [
      { punkt: "Erhaltungsaufwand 80.000 €", beleg: "Kaufvertrag.pdf", art: "erhaltungsaufwand" },
      { punkt: "Wertsteigerung sicher", beleg: "x", art: "sonstiges" },
      { punkt: "Ohne Beleg", beleg: "", art: "sonstiges" },
    ],
  });
  assertEquals(geprueft.interneHighlights, [{ punkt: "Erhaltungsaufwand 80.000 €", beleg: "Kaufvertrag.pdf", art: "erhaltungsaufwand" }]);
  const gelesen = objektTexteAusMeta({ objekttexteKi: { schema: OBJEKT_TEXTE_SCHEMA, interneHighlights: "kaputt" } });
  assertEquals(gelesen?.interneHighlights, []);
});

Deno.test("Exposé und Kundenansicht lassen die Highlights nicht hinaus", () => {
  const meta = { objekttexteKi: { schema: OBJEKT_TEXTE_SCHEMA, interneHighlights: [{ punkt: "GEHEIM", beleg: "b", art: "sonstiges" }] } };
  assertEquals(JSON.stringify(oeffentlichesMeta(meta)).includes("GEHEIM"), false);
  assertEquals(JSON.stringify(kundenMeta(meta, "objekt")).includes("GEHEIM"), false);
  assertEquals(JSON.stringify(kundenMeta(meta, "wohnung")).includes("GEHEIM"), false);
});
