/**
 * Waechter ueber dem Dunkelmodus der Mailvorlagen.
 *
 * Anlass war ein Fehler, den keine Pruefung gefunden hat, weil die Mail im
 * hellen Modus tadellos aussah: In der Sammelmail zum Kennenlernen stand der
 * fettgedruckte Satz "Und wenn es sich erledigt hat:" mit einer fest
 * gesetzten dunklen Textfarbe. Im Dunkelmodus wurde daraus Schwarz auf
 * Schwarz, also die Einladung zur ehrlichen Absage, die niemand lesen kann.
 *
 * Der Grund liegt in der Bauweise des Layouts: Eine Medienabfrage laesst sich
 * inline nicht ausdruecken, deshalb steht der Dunkelmodus in Klassen mit
 * `!important` (siehe `DUNKELMODUS_CSS` in `_layout.tsx`). Ein Inline-Stil
 * ohne die passende Klasse bleibt im Dunkelmodus einfach stehen. Das faellt
 * beim Bauen nicht auf, beim Testen nicht auf und beim Ansehen nur dann, wenn
 * man zufaellig im Dunkelmodus hinsieht.
 *
 * Dieser Test prueft deshalb die Regel selbst: Wer eine Farbe aus `T` inline
 * setzt, muss die zugehoerige Klasse mitgeben.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ORDNER = resolve(__dirname, "../../supabase/functions/_shared/transactional-email-templates");

/** Welche Klasse eine inline gesetzte Farbe aus `T` braucht. */
const FARBE_BRAUCHT_KLASSE: Record<string, string> = {
  text: "mi-text",
  textLeise: "mi-leise",
  textStumm: "mi-stumm",
  textZart: "mi-zart",
  blau: "mi-link",
  blauLink: "mi-link",
};

/**
 * Klassen, die im Dunkelmodus ihre eigene Textfarbe mitbringen. Wer eine davon
 * traegt, braucht keine zweite: `mi-kreis` etwa setzt Flaeche und Schrift des
 * Namenskuerzels in der Signatur gemeinsam.
 */
const EIGENE_FARBE = ["mi-kreis"];

/**
 * Ein Element samt seiner Eigenschaften, grob geschnitten: vom oeffnenden
 * spitzen Klammerpaar bis zum Ende des Start-Tags. Das genuegt, weil Klasse
 * und Stil immer im selben Start-Tag stehen.
 */
function startTags(quelle: string): string[] {
  return [...quelle.matchAll(/<[a-zA-Z][^>]*?(?:\/?>)/gs)].map((m) => m[0]);
}

const dateien = readdirSync(ORDNER).filter((n) => n.endsWith(".tsx"));

describe("Dunkelmodus der Mailvorlagen", () => {
  it("findet ueberhaupt Vorlagen", () => {
    expect(dateien.length).toBeGreaterThan(5);
  });

  for (const name of dateien) {
    it(`${name}: jede inline gesetzte Textfarbe traegt ihre Dunkelmodus-Klasse`, () => {
      const quelle = readFileSync(resolve(ORDNER, name), "utf8");
      const fehlend: string[] = [];

      for (const tag of startTags(quelle)) {
        for (const [farbe, klasse] of Object.entries(FARBE_BRAUCHT_KLASSE)) {
          // `color: T.blau` ja, `backgroundColor: T.blau` nein: Der Grund ist
          // die Schriftfarbe, eine Flaeche hat ihre eigenen Klassen.
          const setztFarbe = new RegExp(`(?<![a-zA-Z])color:\\s*T\\.${farbe}\\b`).test(tag);
          if (!setztFarbe) continue;
          if (tag.includes(`"${klasse}"`)) continue;
          if (EIGENE_FARBE.some((k) => tag.includes(`"${k}"`))) continue;
          fehlend.push(`color: T.${farbe} ohne className="${klasse}" in: ${tag.slice(0, 120)}`);
        }
      }

      expect(fehlend, fehlend.join("\n")).toEqual([]);
    });
  }
});

describe("Die Sammelmail zum Kennenlernen im Dunkelmodus", () => {
  const vorlage = readFileSync(resolve(ORDNER, "bewerber-nachfass-kennenlernen.tsx"), "utf8");

  it("laesst den Absage-Titel im Dunkelmodus lesbar", () => {
    /*
     * Der Satz, der zur Absage einlaedt, ist der einzige Fettdruck der Mail
     * und der einzige von Hand gesetzte Stil. Genau er war unsichtbar.
     */
    const i = vorlage.indexOf("KL_NACHFASS_ABSAGE_TITEL}");
    expect(i).toBeGreaterThan(-1);
    const umgebung = vorlage.slice(Math.max(0, i - 300), i);
    expect(umgebung).toContain('className="mi-text"');
  });
});

describe("Der Kreis in der Signatur", () => {
  const layout = readFileSync(resolve(ORDNER, "_layout.tsx"), "utf8");

  it("traegt Hintergrund und Zentrierung an der ZELLE, nicht am Bild", () => {
    /*
     * Gemeldet am 14.09.2026: In der Eingangsmail sass das Kuerzel "SK" oben
     * links und ragte aus dem Kreis heraus.
     *
     * Ursache war, dass Hintergrund und Zentrierung am `<img>` hingen. Ein
     * Bild richtet seinen Ersatztext aber anders aus als ein Textfeld, und
     * `textAlign` auf einem `<img>` erreicht ihn in den meisten
     * Mailprogrammen gar nicht. Sichtbar wurde das nur, wenn das Bild nicht
     * geladen wurde, und genau das ist in Mails der Normalfall.
     */
    const block = layout.slice(layout.indexOf('className="mi-kreis"'));
    const zelle = block.slice(0, block.indexOf(">"));
    expect(zelle, "Der Kreis muss an einer <td> haengen").toContain("align=");
    expect(zelle, "ohne valign sitzt der Ersatztext oben").toContain('valign="middle"');
  });

  it("gibt dem Bild selbst keinen Hintergrund mehr", () => {
    // Sonst gaebe es zwei Kreise uebereinander, und der innere haette wieder
    // seine eigene, unzuverlaessige Ausrichtung.
    const i = layout.indexOf("src={person.bildUrl}");
    const bild = layout.slice(i, layout.indexOf("/>", i));
    expect(bild).not.toContain("backgroundColor");
    expect(bild).not.toContain("textAlign");
  });
});
