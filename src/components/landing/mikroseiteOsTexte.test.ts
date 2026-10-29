import { describe, expect, it } from "vitest";
import { MIKROSEITE_OS_TEXTE } from "@/components/landing/mikroseiteOsTexte";
import { gleicheTexte, pruefeTexteVollstaendig } from "@/test/texteVollstaendig";

/* Partner-Landingpage (Umbau 16.10.2026, Neuaufbau 29.10.2026): Deutsch und Englisch vollständig. */
describe("MIKROSEITE_OS_TEXTE", () => {
  it("jeder Eintrag hat beide Sprachen, nichts ist leer, keine Gedankenstriche", () => {
    expect(pruefeTexteVollstaendig(MIKROSEITE_OS_TEXTE)).toEqual([]);
  });

  it("Englisch ist wirklich übersetzt, außer Firmennamen und Schlüsseln", () => {
    const gewollt = /\.teil$|^kopf\.logoAlt$|^werWir\.(dach|marken\[\d\]\.name)$|^fuss\.rechte$|^vergleich\.(zeilen\[\d\]\.werte\[\d\]|spalten\[2\])$|\.art$|^muster\.(objekt|daten\[0\])$/;
    expect(gleicheTexte(MIKROSEITE_OS_TEXTE).filter((p) => !gewollt.test(p))).toEqual([]);
  });

  it("enthält keine unbelegten Firmenkennzahlen und keinen Steuer-Check mehr", () => {
    const alles = JSON.stringify(MIKROSEITE_OS_TEXTE);
    expect(alles).not.toMatch(/350\+|450\+|700\+|20\+|Bayern|Eignungs/);
  });

  // Neuaufbau 29.10.2026: allgemein, kein Hinweis auf Vermittlungsverdienst. Ein Objekt nennt
  // nur die Musterrechnung, die Christian ausdrücklich mit einer echten Wohnung wollte.
  it("nennt Objekte nur in der Musterrechnung und keine Maklerprovision für Käufer", () => {
    for (const { muster, ...rest } of [MIKROSEITE_OS_TEXTE.de, MIKROSEITE_OS_TEXTE.en]) {
      expect(JSON.stringify(rest)).not.toMatch(/Barfus|Hauff|Zossen|Wedding|Schwielowsee/);
      expect(muster.objekt).toMatch(/Barfusstraße 9/);
    }
    const alles = JSON.stringify(MIKROSEITE_OS_TEXTE);
    expect(alles).not.toMatch(/verdienen an der Vermittlung|earn from the brokerage/);
  });

  it("die Anteile von Mieter, Steuer und dir ergeben zusammen 100 Prozent", () => {
    for (const sprache of [MIKROSEITE_OS_TEXTE.de, MIKROSEITE_OS_TEXTE.en]) {
      expect(sprache.prinzip.anteile.reduce((s, a) => s + a.prozent, 0)).toBe(100);
    }
  });

  it("die Musterrechnung geht auf: Miete minus Rate und Hausgeld, plus Steuer", () => {
    // Werte aus dem Exposé Barfusstraße 9 WE25: 540 − 1.000 − 62 = −522, −522 + 520 = −2.
    const zahl = (wert: string) => Number(wert.replace(/[^\d]/g, "")) * (/[−-]/.test(wert) ? -1 : 1);
    for (const sprache of [MIKROSEITE_OS_TEXTE.de, MIKROSEITE_OS_TEXTE.en]) {
      const [miete, rate, hausgeld, vorSteuer, steuer, nachSteuer] = sprache.muster.zeilen.map((z) => zahl(z.wert));
      expect(miete + rate + hausgeld).toBe(vorSteuer);
      expect(vorSteuer + steuer).toBe(nachSteuer);
    }
  });

  it("der Vergleich bewertet jede Anlage in jeder Zeile", () => {
    for (const sprache of [MIKROSEITE_OS_TEXTE.de, MIKROSEITE_OS_TEXTE.en]) {
      for (const zeile of sprache.vergleich.zeilen) expect(zeile.werte).toHaveLength(sprache.vergleich.spalten.length);
    }
  });
});
