import { describe, expect, it } from "vitest";
import { MIKROSEITE_OS_TEXTE } from "@/components/landing/mikroseiteOsTexte";
import { gleicheTexte, pruefeTexteVollstaendig } from "@/test/texteVollstaendig";

/* Partner-Landingpage nach dem Umbau auf OS Real Estate (16.10.2026): Deutsch und Englisch vollständig. */
describe("MIKROSEITE_OS_TEXTE", () => {
  it("jeder Eintrag hat beide Sprachen, nichts ist leer, keine Gedankenstriche", () => {
    expect(pruefeTexteVollstaendig(MIKROSEITE_OS_TEXTE)).toEqual([]);
  });

  it("Englisch ist wirklich übersetzt, außer Namen, Orten und der Marke", () => {
    const gewollt = /\.ton$|^kopf\.logoAlt$|^objekte\.liste\[\d\]\.(ort|titel)$|^referenzen\.bilder\[\d\]\.ort$|^fuss\.rechte$/;
    expect(gleicheTexte(MIKROSEITE_OS_TEXTE).filter((p) => !gewollt.test(p))).toEqual([]);
  });

  it("enthält keine unbelegten Firmenkennzahlen und keinen Steuer-Check mehr", () => {
    const alles = JSON.stringify(MIKROSEITE_OS_TEXTE);
    expect(alles).not.toMatch(/350\+|450\+|700\+|20\+|Bayern|Eignungs/);
  });
});
