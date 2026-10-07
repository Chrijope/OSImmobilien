import { describe, it, expect } from "vitest";
import {
  ABSATZ_SCHWELLE,
  ABSATZ_SICHTBAR,
  findeSchnitt,
  kuerzeAbsatz,
  segmentLaenge,
} from "@/lib/akademieAbsatzKuerzung";
import { AKADEMIE_BEGRIFFE } from "@/lib/akademieBegriffe";
import { findeBegriffe, neuerMarkierer, type BegriffsSegment } from "@/lib/akademieBegriffeErkennung";
import { VERTRIEBSAKADEMIE_KAPITEL } from "@/lib/vertriebsakademieContent";

const text = (segmente: BegriffsSegment[]) => segmente.map((s) => s.text).join("");

/** Ein Absatz aus Sätzen bekannter Länge. */
function langerAbsatz(saetze: number): string {
  return Array.from(
    { length: saetze },
    (_v, i) => `Das ist der ${i + 1}. Satz und er hat eine gut messbare Länge für den Test.`,
  ).join(" ");
}

describe("Kürzung greift nur bei wirklich langen Absätzen", () => {
  it("lässt einen kurzen Absatz unangetastet", () => {
    const segmente = findeBegriffe("Ein kurzer Satz ohne alles.", AKADEMIE_BEGRIFFE);
    const k = kuerzeAbsatz(segmente);
    expect(k.gekuerzt).toBe(false);
    expect(text(k.sichtbar)).toBe("Ein kurzer Satz ohne alles.");
  });

  it("lässt einen Absatz genau auf der Schwelle unangetastet", () => {
    const roh = "a".repeat(ABSATZ_SCHWELLE);
    const k = kuerzeAbsatz([{ typ: "text", text: roh }]);
    expect(k.laenge).toBe(ABSATZ_SCHWELLE);
    expect(k.gekuerzt).toBe(false);
  });

  it("kürzt einen Absatz über der Schwelle", () => {
    const roh = langerAbsatz(12);
    expect(roh.length).toBeGreaterThan(ABSATZ_SCHWELLE);
    const k = kuerzeAbsatz([{ typ: "text", text: roh }]);
    expect(k.gekuerzt).toBe(true);
    expect(segmentLaenge(k.sichtbar)).toBeLessThan(roh.length);
    expect(text(k.sichtbar).endsWith("…")).toBe(true);
  });

  it("schneidet am Satzende, nicht mitten im Wort", () => {
    const roh = langerAbsatz(12);
    const k = kuerzeAbsatz([{ typ: "text", text: roh }]);
    const sichtbar = text(k.sichtbar).replace(/ …$/, "");
    expect(sichtbar.endsWith(".")).toBe(true);
    expect(roh.startsWith(sichtbar)).toBe(true);
  });

  it("hält den sichtbaren Anfang in der Nähe des Zielwerts", () => {
    const k = kuerzeAbsatz([{ typ: "text", text: langerAbsatz(12) }]);
    const sichtbar = segmentLaenge(k.sichtbar);
    expect(sichtbar).toBeGreaterThan(ABSATZ_SICHTBAR - 200);
    expect(sichtbar).toBeLessThan(ABSATZ_SICHTBAR + 200);
  });

  it("zerreißt keine Abkürzung und keine Zahl mit Punkt", () => {
    // Der Schnitt darf nicht hinter „z." oder „1.500" fallen.
    const roh = `${"Vorlauf ".repeat(35)}z. B. 1.500 Euro und dann geht es weiter.`;
    const schnitt = findeSchnitt(roh, ABSATZ_SICHTBAR);
    expect(roh.slice(schnitt - 3, schnitt)).not.toBe(" z.");
    expect(roh.slice(schnitt - 2, schnitt)).not.toBe("1.");
  });
});

describe("Kürzung und Begriffserkennung kommen sich nicht ins Gehege", () => {
  // Genau diese Kollision ist die Gefahr: Beide arbeiten am selben Absatz.
  // Die Erkennung markiert die erste Nennung eines Begriffs, die Kürzung
  // blendet das Ende aus. Würde die Kürzung am Rohtext arbeiten und die
  // Erkennung danach noch einmal laufen, sprängen die Markierungen beim
  // Aufklappen um.

  const absatzMitBegriffen =
    "Die AfA ist die Abschreibung für Abnutzung und mindert deine Steuerlast Jahr für Jahr. " +
    "Der Cashflow ist das, was am Monatsende übrig bleibt, nachdem Zinsen und Tilgung bezahlt sind. " +
    "Die Tilgung ist der Teil der Rate, mit dem du den Kredit zurückzahlst, und sie wächst mit jedem Jahr. " +
    "Der Grenzsteuersatz entscheidet, wie viel dir das Finanzamt am Ende tatsächlich zurückgibt. " +
    "Die Zinsbindung legt fest, wie lange dein Sollzins garantiert ist, und danach steht die Anschlussfinanzierung an. " +
    "Wer das einmal verstanden hat, kann jede Wirtschaftlichkeitsberechnung lesen und dem Kunden " +
    "am Küchentisch erklären, ohne einmal nachschlagen zu müssen.";

  it("der Testabsatz trägt überhaupt Begriffe, sonst prüft dieser Block nichts", () => {
    const segmente = findeBegriffe(absatzMitBegriffen, AKADEMIE_BEGRIFFE);
    expect(segmente.filter((s) => s.typ === "begriff").length).toBeGreaterThan(2);
    expect(absatzMitBegriffen.length).toBeGreaterThan(ABSATZ_SCHWELLE);
  });

  it("ändert kein Zeichen am Text, sondern blendet nur das Ende aus", () => {
    const segmente = findeBegriffe(absatzMitBegriffen, AKADEMIE_BEGRIFFE);
    const k = kuerzeAbsatz(segmente);
    const sichtbar = text(k.sichtbar).replace(/ …$/, "");
    expect(absatzMitBegriffen.startsWith(sichtbar)).toBe(true);
  });

  it("der aufgeklappte Absatz ist Zeichen für Zeichen der ursprüngliche", () => {
    const segmente = findeBegriffe(absatzMitBegriffen, AKADEMIE_BEGRIFFE);
    expect(text(segmente)).toBe(absatzMitBegriffen);
    // Die Kürzung fasst die Ausgangsliste nicht an, sie leitet nur ab.
    kuerzeAbsatz(segmente);
    expect(text(segmente)).toBe(absatzMitBegriffen);
  });

  it("zerschneidet niemals einen markierten Begriff", () => {
    const segmente = findeBegriffe(absatzMitBegriffen, AKADEMIE_BEGRIFFE);
    for (let ziel = 20; ziel < absatzMitBegriffen.length; ziel += 7) {
      const k = kuerzeAbsatz(segmente, 100, ziel);
      for (const s of k.sichtbar) {
        if (s.typ !== "begriff") continue;
        // Der angezeigte Text muss eine vollständige Schreibweise des
        // Begriffs sein, kein abgeschnittener Rest.
        const formen = [s.begriff.begriff, ...(s.begriff.schreibweisen ?? [])].map((f) =>
          f.toLowerCase(),
        );
        expect(formen, `Ziel ${ziel}: „${s.text}"`).toContain(s.text.toLowerCase());
      }
    }
  });

  it("die sichtbaren Begriffe sind genau die des vollen Absatzes bis zum Schnitt", () => {
    const segmente = findeBegriffe(absatzMitBegriffen, AKADEMIE_BEGRIFFE);
    const k = kuerzeAbsatz(segmente);
    const sichtbareBegriffe = k.sichtbar
      .filter((s) => s.typ === "begriff")
      .map((s) => (s as Extract<BegriffsSegment, { typ: "begriff" }>).begriff.begriff);
    const volleBegriffe = segmente
      .filter((s) => s.typ === "begriff")
      .map((s) => (s as Extract<BegriffsSegment, { typ: "begriff" }>).begriff.begriff);
    expect(volleBegriffe.slice(0, sichtbareBegriffe.length)).toEqual(sichtbareBegriffe);
  });

  it("die Erstnennung über mehrere Absätze hinweg bleibt unberührt", () => {
    // Der Markierer merkt sich über den ganzen Abschnitt, welcher Begriff
    // schon markiert wurde. Die Kürzung darf daran nichts ändern.
    const markierer = neuerMarkierer(AKADEMIE_BEGRIFFE);
    const ersterAbsatz = markierer.markiere(absatzMitBegriffen);
    const zweiterAbsatz = markierer.markiere(absatzMitBegriffen);
    const vorher = new Set(markierer.gesehen);

    kuerzeAbsatz(ersterAbsatz);
    kuerzeAbsatz(zweiterAbsatz);

    expect(markierer.gesehen).toEqual(vorher);
    // Der zweite Absatz trägt keine Markierung mehr, weil alles schon im
    // ersten stand. Auch nach der Kürzung bleibt das so.
    expect(zweiterAbsatz.filter((s) => s.typ === "begriff")).toHaveLength(0);
  });
});

describe("Am echten Inhalt gemessen", () => {
  const alleAbsaetze = VERTRIEBSAKADEMIE_KAPITEL.flatMap((k) =>
    k.sections.flatMap((sec) => sec.absaetze ?? []),
  );

  it("trifft nur eine kleine Minderheit der Absätze", () => {
    const lang = alleAbsaetze.filter((a) => a.length > ABSATZ_SCHWELLE);
    expect(alleAbsaetze.length).toBeGreaterThan(100);
    // Die Schwelle soll die Ausreißer treffen, nicht den Normalfall. Beim
    // Einbau lagen 20 Prozent darüber. Reißt dieser Test, sind die Absätze im
    // Inhalt insgesamt länger geworden, dann gehört ABSATZ_SCHWELLE noch
    // einmal auf den Tisch. Es ist eine Warnlampe, kein Verbot.
    expect(lang.length / alleAbsaetze.length).toBeLessThan(0.35);
  });

  it("liefert für jeden echten Absatz einen sinnvollen Anfang", () => {
    for (const roh of alleAbsaetze) {
      const k = kuerzeAbsatz(findeBegriffe(roh, AKADEMIE_BEGRIFFE));
      const sichtbar = text(k.sichtbar).replace(/ …$/, "");
      expect(roh.startsWith(sichtbar), roh.slice(0, 60)).toBe(true);
      if (k.gekuerzt) {
        expect(sichtbar.length, roh.slice(0, 60)).toBeGreaterThan(80);
        expect(sichtbar.length, roh.slice(0, 60)).toBeLessThan(roh.length);
      }
    }
  });
});
