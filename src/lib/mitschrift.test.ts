import { describe, it, expect } from "vitest";
import {
  fuegeSpurenZusammen,
  kuerzeUeberlappendenAnfang,
  formatiereZeit,
  mitschriftAlsText,
  verstaendlicherFehler,
  type MitschriftZeile,
} from "@/lib/mitschrift";

/** Kurzschreibweise, damit die Testfälle lesbar bleiben. */
const z = (zeitpunkt: number, sprecher: string, text: string): MitschriftZeile =>
  ({ zeitpunkt, sprecher, text });

describe("fuegeSpurenZusammen", () => {
  it("führt zwei Spuren über die Zeitstempel zusammen", () => {
    const kunde = [
      z(0, "Kunde", "Also ehrlich gesagt zahlen wir im Jahr viel Steuern."),
      z(11, "Kunde", "Immobilien sind für uns völlig Neuland."),
    ];
    const berater = [
      z(6, "Berater", "Verstehe, das höre ich oft."),
      z(14, "Berater", "Dann schauen wir zuerst, was rechnerisch möglich ist."),
    ];

    const ergebnis = fuegeSpurenZusammen([kunde, berater]);

    expect(ergebnis.map((r) => [r.zeitpunkt, r.sprecher])).toEqual([
      [0, "Kunde"],
      [6, "Berater"],
      [11, "Kunde"],
      [14, "Berater"],
    ]);
  });

  it("entdoppelt wörtliche Wiederholungen aus der Überlappung", () => {
    // Dasselbe Stück Ton wurde von zwei überlappenden Fenstern erkannt.
    const fensterEins = [z(22, "Kunde", "Wie hoch wären denn die monatlichen Kosten?")];
    const fensterZwei = [z(23.4, "Kunde", "Wie hoch wären denn die monatlichen Kosten?")];

    const ergebnis = fuegeSpurenZusammen([fensterEins, fensterZwei]);

    expect(ergebnis).toHaveLength(1);
    expect(ergebnis[0].zeitpunkt).toBe(22);
  });

  it("behält bei einer Teilwiederholung die vollständigere Fassung", () => {
    const kurz = [z(24, "Berater", "wir das gemeinsam durchrechnen.")];
    const lang = [z(22, "Berater", "Im nächsten Schritt können wir das gemeinsam durchrechnen.")];

    const ergebnis = fuegeSpurenZusammen([kurz, lang]);

    expect(ergebnis).toHaveLength(1);
    expect(ergebnis[0].text).toBe("Im nächsten Schritt können wir das gemeinsam durchrechnen.");
    // Der frühere der beiden Zeitpunkte bleibt stehen.
    expect(ergebnis[0].zeitpunkt).toBe(22);
  });

  it("entdoppelt nur innerhalb des Zeitfensters", () => {
    // Derselbe Satz zweimal, aber Minuten auseinander: das ist keine
    // Überlappung, sondern eine echte Wiederholung im Gespräch.
    const spur = [
      z(10, "Kunde", "Das müsste ich mit meiner Frau besprechen."),
      z(600, "Kunde", "Das müsste ich mit meiner Frau besprechen."),
    ];

    expect(fuegeSpurenZusammen([spur])).toHaveLength(2);
  });

  it("verwechselt kurze Füllwörter nicht mit Dopplungen", () => {
    // "Ja." steckt in fast jedem Satz. Ohne Mindestlänge für Teiltexte würde
    // die zweite Zeile die erste verschlucken.
    const spur = [
      z(5, "Kunde", "Ja."),
      z(6, "Kunde", "Ja, genau so hatte ich mir das vorgestellt."),
    ];

    const ergebnis = fuegeSpurenZusammen([spur]);
    expect(ergebnis).toHaveLength(2);
  });

  it("hält verschiedene Sprecher auseinander, auch bei gleichem Wortlaut", () => {
    const kunde = [z(30, "Kunde", "Ja, das klingt nach einem guten Plan.")];
    const berater = [z(31, "Berater", "Ja, das klingt nach einem guten Plan.")];

    expect(fuegeSpurenZusammen([kunde, berater])).toHaveLength(2);
  });

  it("kommt mit einer leeren Spur zurecht", () => {
    const berater = [z(2, "Berater", "Guten Tag, schön dass es klappt.")];

    expect(fuegeSpurenZusammen([[], berater])).toEqual([
      { zeitpunkt: 2, sprecher: "Berater", text: "Guten Tag, schön dass es klappt." },
    ]);
    expect(fuegeSpurenZusammen([[], []])).toEqual([]);
    expect(fuegeSpurenZusammen([])).toEqual([]);
  });

  it("kommt mit nur einer Spur zurecht", () => {
    const spur = [
      z(9, "Berater", "Zweiter Satz."),
      z(1, "Berater", "Erster Satz."),
    ];

    expect(fuegeSpurenZusammen([spur]).map((r) => r.text)).toEqual([
      "Erster Satz.",
      "Zweiter Satz.",
    ]);
  });

  it("übersteht Unsinn in den Eingabedaten", () => {
    const spur = [
      z(Number.NaN, "Kunde", "Zeitstempel fehlt."),
      z(-5, "Kunde", "Negativ."),
      z(3, "Kunde", "   "),
      z(4, "Kunde", "Mit\nZeilenumbruch   und   Leerraum."),
    ];

    const ergebnis = fuegeSpurenZusammen([spur, null, undefined]);

    expect(ergebnis.map((r) => r.zeitpunkt)).toEqual([0, 0, 4]);
    expect(ergebnis[2].text).toBe("Mit Zeilenumbruch und Leerraum.");
  });

  it("lässt sehr lange Beiträge unangetastet", () => {
    const lang = `Also wenn ich das richtig verstehe ${"und wir rechnen jetzt einmal alles durch ".repeat(40)}dann passt das.`;
    const spur = [z(120, "Kunde", lang)];

    const ergebnis = fuegeSpurenZusammen([spur]);

    expect(ergebnis).toHaveLength(1);
    expect(ergebnis[0].text).toBe(lang);
    expect(ergebnis[0].text.length).toBeGreaterThan(1500);
  });

  it("entdoppelt auch sehr lange Beiträge, wenn sie sich wiederholen", () => {
    const lang = `Der Kaufpreis liegt bei 320.000 Euro ${"und die Nebenkosten kommen noch dazu ".repeat(30)}soweit klar?`;
    const ergebnis = fuegeSpurenZusammen([
      [z(200, "Berater", lang)],
      [z(202, "Berater", lang)],
    ]);

    expect(ergebnis).toHaveLength(1);
  });

  it("sortiert bei gleichem Zeitpunkt stabil nach Sprecher", () => {
    const einmal = fuegeSpurenZusammen([
      [z(10, "Kunde", "Frage.")],
      [z(10, "Berater", "Antwort.")],
    ]);
    const andersherum = fuegeSpurenZusammen([
      [z(10, "Berater", "Antwort.")],
      [z(10, "Kunde", "Frage.")],
    ]);

    expect(einmal).toEqual(andersherum);
    expect(einmal[0].sprecher).toBe("Berater");
  });
});

describe("kuerzeUeberlappendenAnfang", () => {
  it("schneidet den doppelt erkannten Satzteil weg", () => {
    const vorher = "Also ehrlich gesagt zahlen wir viel Steuern, mein Mann verdient gut, ich arbeite.";
    const neu = "Mein Mann verdient gut, ich arbeite Teilzeit und wir haben nie investiert.";

    expect(kuerzeUeberlappendenAnfang(vorher, neu))
      .toBe("Teilzeit und wir haben nie investiert.");
  });

  it("lässt unabhängige Wortmeldungen unangetastet", () => {
    expect(kuerzeUeberlappendenAnfang("Guten Tag.", "Wie geht es Ihnen?"))
      .toBe("Wie geht es Ihnen?");
  });

  it("greift erst ab drei gemeinsamen Wörtern", () => {
    // Zwei gemeinsame Wörter sind Zufall, nicht Überlappung.
    expect(kuerzeUeberlappendenAnfang("Das war und dann", "und dann kam der Termin."))
      .toBe("und dann kam der Termin.");
    expect(kuerzeUeberlappendenAnfang("Wir haben es so gemacht", "So gemacht wie besprochen."))
      .toBe("So gemacht wie besprochen.");
    // Drei reichen.
    expect(kuerzeUeberlappendenAnfang("Das war so und dann", "und dann kam der Termin."))
      .toBe("und dann kam der Termin.");
    expect(kuerzeUeberlappendenAnfang("Das war dann und dann kam", "und dann kam der Termin."))
      .toBe("der Termin.");
  });

  it("gibt eine leere Zeichenkette zurück, wenn alles Nachhall war", () => {
    expect(kuerzeUeberlappendenAnfang("Das klingt gut für uns.", "Klingt gut für uns."))
      .toBe("");
  });
});

describe("fuegeSpurenZusammen mit Fenstergrenzen", () => {
  it("räumt geteilte Satzteile an den Fenstergrenzen auf", () => {
    // So sieht echte Whisper-Ausgabe bei überlappenden Fenstern aus.
    const kunde = [
      z(0, "Kunde", "Also ehrlich gesagt zahlen wir viel Steuern, mein Mann verdient gut, ich arbeite."),
      z(4, "Kunde", "Mein Mann verdient gut, ich arbeite Teilzeit und wir haben nie investiert."),
      z(8, "Kunde", "Wir haben nie investiert, das ist völliges Neuland für uns."),
    ];

    const ergebnis = fuegeSpurenZusammen([kunde]);

    expect(ergebnis.map((r) => r.text)).toEqual([
      "Also ehrlich gesagt zahlen wir viel Steuern, mein Mann verdient gut, ich arbeite.",
      "Teilzeit und wir haben nie investiert.",
      "das ist völliges Neuland für uns.",
    ]);
  });

  it("kürzt nur innerhalb des Zeitfensters", () => {
    const spur = [
      z(0, "Kunde", "Wir müssen das noch einmal in Ruhe besprechen."),
      z(900, "Kunde", "In Ruhe besprechen wollten wir das ja sowieso."),
    ];

    expect(fuegeSpurenZusammen([spur]).map((r) => r.text)).toEqual([
      "Wir müssen das noch einmal in Ruhe besprechen.",
      "In Ruhe besprechen wollten wir das ja sowieso.",
    ]);
  });

  it("kürzt nicht über Sprechergrenzen hinweg", () => {
    const ergebnis = fuegeSpurenZusammen([
      [z(0, "Berater", "Dann rechnen wir das gemeinsam durch.")],
      [z(2, "Kunde", "Das gemeinsam durchrechnen klingt gut.")],
    ]);

    expect(ergebnis[1].text).toBe("Das gemeinsam durchrechnen klingt gut.");
  });
});

describe("formatiereZeit", () => {
  it("zeigt Minuten und Sekunden", () => {
    expect(formatiereZeit(0)).toBe("00:00");
    expect(formatiereZeit(9.7)).toBe("00:09");
    expect(formatiereZeit(75)).toBe("01:15");
    expect(formatiereZeit(600)).toBe("10:00");
  });

  it("ergänzt bei langen Gesprächen die Stunde", () => {
    expect(formatiereZeit(3661)).toBe("1:01:01");
  });

  it("gibt bei Unsinn nicht auf", () => {
    expect(formatiereZeit(-5)).toBe("00:00");
    expect(formatiereZeit(Number.NaN)).toBe("00:00");
  });
});

describe("mitschriftAlsText", () => {
  it("schreibt Zeitstempel, Sprecher und Text", () => {
    const text = mitschriftAlsText([
      z(0, "Kunde", "Hallo."),
      z(65, "Berater", "Guten Tag."),
    ]);

    expect(text).toBe("[00:00] Kunde: Hallo.\n[01:05] Berater: Guten Tag.");
  });

  it("liefert bei leerer Mitschrift eine leere Zeichenkette", () => {
    expect(mitschriftAlsText([])).toBe("");
  });
});

describe("verstaendlicherFehler", () => {
  it("erklaert das fehlende Modell, ohne die Speicheradresse zu zeigen", () => {
    const meldung = verstaendlicherFehler(
      new Error(
        'Bad request error occurred while trying to load file: '
        + '"https://beispiel.supabase.co/storage/v1/object/public/modelle/'
        + 'onnx-community/whisper-base/config.json".',
      ),
    );
    expect(meldung).toContain("noch nicht hinterlegt");
    // Die interne Adresse gehoert ins Log, nicht auf den Bildschirm.
    expect(meldung).not.toContain("supabase.co");
    expect(meldung).not.toContain("config.json");
  });

  it("sagt es, wenn gar kein Ton anliegt", () => {
    expect(verstaendlicherFehler(new Error("Keine Tonspur uebergeben"))).toContain("kein Ton");
  });

  it("bleibt bei Unbekanntem allgemein und beruhigt", () => {
    const meldung = verstaendlicherFehler(new Error("irgendetwas voellig anderes"));
    expect(meldung).toContain("Gespräch läuft normal weiter");
    expect(meldung).not.toContain("irgendetwas");
  });
});
