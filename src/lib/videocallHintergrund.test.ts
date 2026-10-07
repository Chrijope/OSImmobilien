import { describe, it, expect } from "vitest";
import {
  sollHintergrundLaufen, personenMaskenIndex, richteFlaechenAus, maskenGroesse,
  bildEinpassung, istZuLangsam, kleinesMass, halbierungsStufen,
  WEICH_TEILER,
} from "@/lib/videocallHintergrund";

/**
 * Die Zustandslogik des Video-Hintergrunds, soweit sie ohne Browser
 * auskommt. Die Regeln: Bildschirmteilen hat Vorrang, Kamera aus stoppt die
 * Verarbeitung, und ohne gewaehlten Hintergrund wird gar nicht gerechnet.
 */

describe("sollHintergrundLaufen", () => {
  it("laeuft mit gewaehltem Hintergrund und eingeschalteter Kamera", () => {
    expect(sollHintergrundLaufen({ art: "weich" }, true)).toBe(true);
    expect(sollHintergrundLaufen({ art: "bild", bildPfad: "u/x.jpg" }, true)).toBe(true);
  });

  it("rechnet nichts, wenn kein Hintergrund gewaehlt ist", () => {
    expect(sollHintergrundLaufen({ art: "aus" }, true)).toBe(false);
  });

  it("laeuft auch waehrend des Bildschirmteilens weiter", () => {
    /*
     * Bis zum 18.09.2026 ruhte die Komposition beim Teilen, weil damals statt
     * des Gesichts der Bildschirm hinausging. Seit beide zugleich hinausgehen,
     * IST die Leinwand das Gesicht in der Kachel des Gegenuebers. Ruhte sie,
     * saehe der Kunde dort wieder ein Standbild: genau der Fehler, der behoben
     * werden sollte.
     */
    expect(sollHintergrundLaufen({ art: "weich" }, true)).toBe(true);
  });

  it("ruht bei ausgeschalteter Kamera", () => {
    expect(sollHintergrundLaufen({ art: "weich" }, false)).toBe(false);
  });
});

describe("personenMaskenIndex", () => {
  it("nimmt bei einer Maske die einzige als Person", () => {
    expect(personenMaskenIndex(1)).toBe(0);
  });

  it("nimmt bei zwei Masken die zweite, die erste ist der Hintergrund", () => {
    expect(personenMaskenIndex(2)).toBe(1);
  });
});

describe("richteFlaechenAus", () => {
  /**
   * Der Fehler, der dahintersteckt: Die Personenflaeche wurde nur zusammen mit
   * der Ausgabeflaeche gesetzt. Die hatte ihre Groesse aber schon beim Start
   * bekommen, die Bedingung traf also nie zu, und die Personenflaeche blieb auf
   * der Browservorgabe von 300 auf 150 Pixel stehen. Ergebnis: Die
   * freigestellte Person passte nicht mehr ins Bild, beim Weichzeichnen sah man
   * alles weich, beim Hintergrundbild nur noch den Hintergrund. Genau das haelt
   * dieser Test fest.
   */
  it("setzt die Personenflaeche auch dann, wenn die Ausgabeflaeche schon passt", () => {
    const ausgabe = { width: 1280, height: 720 };
    const person = { width: 300, height: 150 };
    const verarbeitung = { width: 480, height: 270 };
    richteFlaechenAus({ ausgabe, person, verarbeitung }, 1280, 720, 480, 270);
    expect(person).toEqual({ width: 1280, height: 720 });
  });

  it("meldet nur dann eine neue Schablone, wenn sich die Verarbeitungsgroesse aendert", () => {
    const flaechen = {
      ausgabe: { width: 0, height: 0 },
      person: { width: 0, height: 0 },
      verarbeitung: { width: 0, height: 0 },
    };
    expect(richteFlaechenAus(flaechen, 1280, 720, 480, 270)).toBe(true);
    expect(richteFlaechenAus(flaechen, 1280, 720, 480, 270)).toBe(false);
    expect(flaechen.ausgabe).toEqual({ width: 1280, height: 720 });
  });

  it("zieht alle Flaechen mit, wenn die Kamera die Aufloesung wechselt", () => {
    const flaechen = {
      ausgabe: { width: 1280, height: 720 },
      person: { width: 1280, height: 720 },
      verarbeitung: { width: 480, height: 270 },
    };
    richteFlaechenAus(flaechen, 640, 480, 480, 360);
    expect(flaechen.ausgabe).toEqual({ width: 640, height: 480 });
    expect(flaechen.person).toEqual({ width: 640, height: 480 });
    expect(flaechen.verarbeitung).toEqual({ width: 480, height: 360 });
  });
});

describe("maskenGroesse", () => {
  it("nimmt die gemeldete Groesse, wenn sie zur Zahl der Werte passt", () => {
    expect(maskenGroesse({ width: 480, height: 270 }, 480 * 270, 480, 270)).toEqual({ b: 480, h: 270 });
  });

  it("faellt auf die Verarbeitungsgroesse zurueck, wenn nichts gemeldet wird", () => {
    expect(maskenGroesse({}, 480 * 270, 480, 270)).toEqual({ b: 480, h: 270 });
  });

  it("naehert quadratisch an, wenn beides nicht passt", () => {
    expect(maskenGroesse({ width: 9, height: 9 }, 256 * 256, 480, 270)).toEqual({ b: 256, h: 256 });
  });
});

describe("bildEinpassung", () => {
  it("fuellt die Flaeche und schneidet mittig ab", () => {
    // Hochformatiges Bild in eine querformatige Flaeche.
    const e = bildEinpassung(640, 960, 1280, 720, "fuellen");
    expect(e.b).toBe(1280);
    expect(Math.round(e.h)).toBe(1920);
    expect(e.x).toBe(0);
    // Oben und unten wird gleich viel abgeschnitten.
    expect(Math.round(e.y)).toBe(-600);
  });

  it("zeigt das ganze Bild, ohne es zu verzerren", () => {
    const e = bildEinpassung(640, 960, 1280, 720, "ganz");
    expect(Math.round(e.h)).toBe(720);
    expect(Math.round(e.b)).toBe(480);
    // Mittig, also links und rechts gleich viel Platz.
    expect(Math.round(e.x)).toBe(400);
    expect(e.y).toBe(0);
  });

  it("behaelt bei einem querformatigen Bild ebenfalls das Seitenverhaeltnis", () => {
    const e = bildEinpassung(1920, 1080, 1280, 720, "ganz");
    expect(Math.round(e.b)).toBe(1280);
    expect(Math.round(e.h)).toBe(720);
    expect(e.x).toBe(0);
    expect(e.y).toBe(0);
  });

  it("kommt mit einem Bild ohne Groesse zurecht", () => {
    expect(bildEinpassung(0, 0, 1280, 720, "fuellen")).toEqual({ x: 0, y: 0, b: 1280, h: 720 });
  });
});

/**
 * Das Hintergrundbild deckt die Kachel ganz ab.
 *
 * Bis zum 18.09.2026 lagen dort zwei Lagen uebereinander, damit nichts
 * abgeschnitten wird. Christian sah die untere als zweiten Abzug: „wirkt wie
 * wenn noch ein weiterer hintergrund da ist mit dem rand an beiden seiten
 * sieht es komisch aus". Ein Hintergrundbild ist Schmuck und darf beschnitten
 * werden, also faellt die untere Lage weg und es bleibt bei „fuellen".
 */
describe("Hintergrundbild fuellt die Kachel", () => {
  it("deckt ein hochkantes Bild die querformatige Kachel ohne Rand ab", () => {
    const e = bildEinpassung(1080, 1920, 1280, 720, "fuellen");
    expect(e.b).toBeGreaterThanOrEqual(1280);
    expect(e.h).toBeGreaterThanOrEqual(720);
    // Beschnitten wird oben und unten gleich viel, das Bild bleibt mittig.
    expect(e.x).toBe(0);
    expect(Math.round(e.y)).toBe(-778);
  });

  it("zeigt bei gleichem Format genau das ganze Bild", () => {
    const e = bildEinpassung(1920, 1080, 1280, 720, "fuellen");
    expect({ x: e.x, y: e.y, b: Math.round(e.b), h: Math.round(e.h) })
      .toEqual({ x: 0, y: 0, b: 1280, h: 720 });
  });
});

describe("kleinesMass", () => {
  it("zeichnet so weich, dass vom Zimmer nichts mehr zu erkennen ist", () => {
    // 91 mal 51 (der alte Teiler 14) war ein lesbares Vorschaubild des
    // Zimmers, 20 mal 11 ist keins mehr.
    expect(kleinesMass(1280, 720, 14)).toEqual({ b: 91, h: 51 });
    expect(kleinesMass(1280, 720, WEICH_TEILER)).toEqual({ b: 20, h: 11 });
  });

  it("behaelt eine Kante von mindestens zwei Pixeln", () => {
    expect(kleinesMass(16, 9, WEICH_TEILER)).toEqual({ b: 2, h: 2 });
  });
});

/**
 * Der Weg zur weichen Flaeche.
 *
 * In einem Schritt auf ein Vierundsechzigstel zu verkleinern war keine
 * Weichzeichnung, sondern eine Stichprobe: Fensterkreuz und Buchruecken
 * blieben als harte Linien stehen. Jede Stufe darf deshalb hoechstens die
 * Haelfte wegnehmen.
 */
describe("halbierungsStufen", () => {
  it("halbiert von der Kameragroesse bis zum Ziel", () => {
    const ziel = kleinesMass(1280, 720, WEICH_TEILER);
    const stufen = halbierungsStufen(1280, 720, ziel.b, ziel.h);
    expect(stufen.map((s) => s.b)).toEqual([640, 320, 160, 80, 40, 20]);
    expect(stufen[stufen.length - 1]).toEqual(ziel);
  });

  it("nimmt nie mehr als die Haelfte auf einmal", () => {
    const stufen = halbierungsStufen(1280, 720, 20, 11);
    let vorher = 1280;
    for (const stufe of stufen) {
      expect(stufe.b).toBeGreaterThanOrEqual(vorher / 2 - 1);
      vorher = stufe.b;
    }
  });

  it("geht bei einer kleinen Kamera direkt aufs Ziel", () => {
    expect(halbierungsStufen(320, 180, 200, 120)).toEqual([{ b: 200, h: 120 }]);
  });

  it("endet auch bei unsinnigen Zielwerten", () => {
    expect(halbierungsStufen(1280, 720, 0, 0).length).toBeLessThanOrEqual(21);
  });
});

describe("istZuLangsam", () => {
  it("laesst den vollen Takt durchgehen", () => {
    expect(istZuLangsam(15)).toBe(false);
    expect(istZuLangsam(9)).toBe(false);
  });

  it("schlaegt an, wenn es sichtbar ruckelt", () => {
    expect(istZuLangsam(6)).toBe(true);
    expect(istZuLangsam(2)).toBe(true);
  });

  it("urteilt nicht ueber ein leeres Messfenster", () => {
    expect(istZuLangsam(0)).toBe(false);
  });
});
