import { describe, expect, it } from "vitest";
import { COOKIE_BANNER_TEXTE } from "@/components/cookie/cookieBannerTexte";
import { gleicheTexte, pruefeTexteVollstaendig } from "@/test/texteVollstaendig";

/* Cookie-Banner: Deutsch und Englisch vollständig, keine Gedankenstriche. */
describe("COOKIE_BANNER_TEXTE", () => {
  it("jeder Eintrag hat beide Sprachen, nichts ist leer, keine Gedankenstriche", () => {
    expect(pruefeTexteVollstaendig(COOKIE_BANNER_TEXTE)).toEqual([]);
  });

  it("Englisch ist wirklich übersetzt und nicht der deutsche Wortlaut", () => {
    // "Marketing" heißt in beiden Sprachen so.
    expect(gleicheTexte(COOKIE_BANNER_TEXTE)).toEqual(["kategorien.marketing.titel"]);
  });

  it("Deutsch spricht den Besucher mit du an", () => {
    const text = JSON.stringify(COOKIE_BANNER_TEXTE.de);
    expect(text).not.toMatch(/\b(Sie|Ihre?|Ihnen)\b/);
    expect(text).toMatch(/\bdu\b|\bdeine?\b/);
  });
});
