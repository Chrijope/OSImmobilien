import { describe, it, expect } from "vitest";
import {
  baueMitschriftKurzfassung,
  kuerzeAnSatzgrenze,
} from "@/lib/mitschriftZusammenfassung";
import type { MitschriftZeile } from "@/lib/mitschrift";

const z = (zeitpunkt: number, sprecher: string, text: string): MitschriftZeile =>
  ({ zeitpunkt, sprecher, text });

const GESPRAECH: MitschriftZeile[] = [
  z(0, "Berater", "Guten Tag, schön dass es geklappt hat."),
  z(4, "Kunde", "Wir zahlen im Jahr viel Steuern und suchen eine Alternative."),
  z(12, "Berater", "Dann schauen wir zuerst, was rechnerisch möglich ist."),
  z(20, "Kunde", "Immobilien sind für uns völlig Neuland."),
  z(700, "Berater", "Ich schicke Ihnen die Unterlagen zu."),
];

describe("baueMitschriftKurzfassung", () => {
  it("nimmt die ersten Wortmeldungen samt Sprecher", () => {
    const kurz = baueMitschriftKurzfassung(GESPRAECH);

    expect(kurz.istLeer).toBe(false);
    expect(kurz.text.startsWith("Berater: Guten Tag")).toBe(true);
    expect(kurz.text).toContain("Kunde:");
  });

  it("zählt Wortmeldungen und nennt die Dauer", () => {
    const kurz = baueMitschriftKurzfassung(GESPRAECH);

    expect(kurz.wortmeldungen).toBe(5);
    expect(kurz.dauerSekunden).toBe(700);
    expect(kurz.kennzahlen).toBe("12 Min · 5 Wortmeldungen");
  });

  it("nimmt die übergebene Dauer, wenn es sie gibt", () => {
    const kurz = baueMitschriftKurzfassung(GESPRAECH, { dauerSekunden: 1800 });

    expect(kurz.dauerSekunden).toBe(1800);
    expect(kurz.kennzahlen).toBe("30 Min · 5 Wortmeldungen");
  });

  it("nennt Sekunden bei sehr kurzen Gesprächen", () => {
    const kurz = baueMitschriftKurzfassung([z(0, "Kunde", "Nur ein Satz.")]);

    expect(kurz.kennzahlen).toBe("1 Wortmeldung");
    expect(kurz.dauerSekunden).toBe(0);
  });

  it("listet die Sprecher in der Reihenfolge ihres Auftretens", () => {
    expect(baueMitschriftKurzfassung(GESPRAECH).sprecher).toEqual(["Berater", "Kunde"]);
  });

  it("meldet eine leere Mitschrift als leer", () => {
    for (const eingabe of [[], null, undefined, [z(0, "Kunde", "   ")]]) {
      const kurz = baueMitschriftKurzfassung(eingabe as MitschriftZeile[]);
      expect(kurz.istLeer).toBe(true);
      expect(kurz.text).toBe("");
      expect(kurz.wortmeldungen).toBe(0);
    }
  });

  it("kürzt lange Gespräche an einer Satzgrenze", () => {
    const lang = Array.from({ length: 40 }, (_, i) =>
      z(i * 10, i % 2 ? "Kunde" : "Berater", `Das ist die ${i}. ausführliche Wortmeldung im Gespräch.`),
    );

    const kurz = baueMitschriftKurzfassung(lang, { maxZeichen: 200 });

    expect(kurz.text.length).toBeLessThanOrEqual(200);
    // An einer Satzgrenze getrennt, also kein abgeschnittenes Wort.
    expect(/[.!?…]$/u.test(kurz.text)).toBe(true);
    expect(kurz.wortmeldungen).toBe(40);
  });

  it("verkraftet eine einzelne sehr lange Wortmeldung", () => {
    const monolog = `Also ${"ich erzähle jetzt einmal die ganze Geschichte von vorne ".repeat(60)}soweit klar.`;
    const kurz = baueMitschriftKurzfassung([z(0, "Kunde", monolog)], { maxZeichen: 120 });

    expect(kurz.text.length).toBeLessThanOrEqual(121);
    expect(kurz.text.endsWith("…")).toBe(true);
    expect(kurz.wortmeldungen).toBe(1);
  });
});

describe("kuerzeAnSatzgrenze", () => {
  it("lässt kurzen Text unangetastet", () => {
    expect(kuerzeAnSatzgrenze("Kurz und gut.", 100)).toBe("Kurz und gut.");
  });

  it("trennt an der letzten Satzgrenze", () => {
    const text = "Erster Satz. Zweiter Satz. Dritter Satz der deutlich länger ist als der Rest.";
    expect(kuerzeAnSatzgrenze(text, 30)).toBe("Erster Satz. Zweiter Satz.");
  });

  it("trennt an der Wortgrenze, wenn die Satzgrenze zu früh liegt", () => {
    const text = "Ja. Und dann haben wir noch sehr lange über die Finanzierung gesprochen.";
    const ergebnis = kuerzeAnSatzgrenze(text, 40);

    expect(ergebnis.endsWith("…")).toBe(true);
    expect(ergebnis).not.toContain("Finanzier…");
  });

  it("zieht Leerraum zusammen", () => {
    expect(kuerzeAnSatzgrenze("Mit\n\n viel   Leerraum.", 100)).toBe("Mit viel Leerraum.");
  });

  it("gibt bei Höchstlänge null nichts zurück", () => {
    expect(kuerzeAnSatzgrenze("Egal was.", 0)).toBe("");
  });
});
