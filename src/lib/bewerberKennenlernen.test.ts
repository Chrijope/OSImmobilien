import { describe, it, expect } from "vitest";
import {
  ABSCHLUSS_TEXTE,
  ALTFRAGEN,
  ANSICHTEN,
  AUSSTIEG_TEXTE,
  BAUSTEINE_TAG_EINS,
  DAUER_KURZ_MINUTEN,
  DAUER_LANG_MINUTEN,
  ERLAUBNIS_BEGRUENDUNG_MAX,
  GEWERBE_WORTLAUT,
  GESPRAECH_NAME,
  GESPRAECH_NAME_DATIV,
  GESPRAECH_NAME_KLEIN,
  KENNENLERNEN_KEYS,
  SCHRITT_TEXTE,
  KENNENLERNEN_KAPITEL,
  KONDITIONEN_ANSICHT,
  KONDITIONEN_ID,
  WEGE,
  absaetzeFuer,
  anschlussFuer,
  anschlussUnten,
  ansichtNummer,
  ansichtenFuer,
  antwortHinweisFuer,
  antwortenZumSenden,
  frageSichtbar,
  fragenDerAnsicht,
  gespraechsDauerMinuten,
  gewerbe34cAbgeleitet,
  istKennenlernen,
  kapitelZeile,
  kennenlernenUeberblick,
  monatName,
  monatPlus,
  monatVon,
  monatsRaster,
  naechsterSchritt,
  rueckmeldungFaellig,
  tagesZahl,
  wegFragen,
  type KennenlernenAntworten,
} from "@/lib/bewerberKennenlernen";
import { FORMULAR_FRAGEN } from "@/lib/bewerberFormular";
import { PROVISION_PROZENT } from "@/lib/assessmentSkript";
import { berechneVorabScore } from "@/lib/bewerberVorabScore";
import {
  LEAD_ABSCHLUESSE_JE_10_TEXT,
  LEAD_EINZELPREIS,
  LEAD_PAKET_ANZAHL,
  LEAD_PAKET_PREIS,
} from "@/lib/lizenzPakete";
import { MOTIV_IDS } from "@/components/bewerberformular/KennenlernenMotive";

/** Die Ansichten eines Wegs, so wie der Bewerber sie durchklickt. */
const fuer = (weg: string) => ansichtenFuer({ weg });

describe("Der Aufbau des Bogens", () => {
  /*
   * Bis zum 06.09.2026 waren es einundzwanzig Ansichten. Drei sind entfallen
   * (Kosten, Servicevereinbarung, und die Doppelung zur Weiche), dafür bekommt
   * jeder Weg drei eigene statt zwei. Damit waren es neunzehn. Am 08.09.2026
   * kam die Leadansicht in Kapitel 6 dazu. Macht zwanzig, auf Weg 2
   * einundzwanzig. Am 10.09.2026 kam „Was wir erwarten" in Kapitel 5 dazu,
   * die Ansicht zum Tätigkeitsmaßstab. Macht einundzwanzig, auf Weg 2
   * zweiundzwanzig.
   */
  it("zeigt einundzwanzig Ansichten, auf dem Finanzberater-Weg zweiundzwanzig", () => {
    for (const w of WEGE) {
      const erwartet = w.id === "weg2" ? 22 : 21;
      expect(fuer(w.id), `Weg ${w.id}`).toHaveLength(erwartet);
      expect(fuer(w.id).map((a) => a.nummer)).toEqual(
        Array.from({ length: erwartet }, (_, i) => i + 1),
      );
    }
  });

  it("hat sieben Kapitel und nennt sie mit Namen", () => {
    expect(KENNENLERNEN_KAPITEL).toHaveLength(7);
    // Kapitel 2 und 3 sind am 09.09.2026 getauscht: Erst sagt der Bewerber,
    // wo er herkommt, danach erst erzählen wir von uns.
    expect(kapitelZeile(2)).toBe("Kapitel 2 von 7 · Wer du bist");
    expect(kapitelZeile(3)).toBe("Kapitel 3 von 7 · Wer wir sind");
  });

  it("verteilt die Ansichten so auf die Kapitel, wie die Fassung es festlegt", () => {
    const je = (weg: string, k: number) => fuer(weg).filter((a) => a.kapitel === k).map((a) => a.nummer);
    expect(je("weg1", 1)).toEqual([1]);
    // Kapitel 2 „Wer du bist": die Weiche und die drei Ansichten des Wegs.
    expect(je("weg1", 2)).toEqual([2, 3, 4, 5]);
    // Kapitel 3 „Wer wir sind": die drei Ansichten über das Haus.
    expect(je("weg1", 3)).toEqual([6, 7, 8]);
    expect(je("weg1", 4)).toEqual([9, 10]);
    // Kapitel 5 „Die Konditionen": erst der Verdienst, dann die Erwartung.
    expect(je("weg1", 5)).toEqual([11, 12]);
    expect(je("weg1", 6)).toEqual([13, 14, 15, 16, 17, 18, 19]);
    expect(je("weg1", 7)).toEqual([20, 21]);
    // Weg 2 hat eine Ansicht mehr. Der Sprung liegt jetzt in Kapitel 2, und
    // alles dahinter rückt um eins nach.
    expect(je("weg2", 2)).toEqual([2, 3, 4, 5, 6]);
    expect(je("weg2", 3)).toEqual([7, 8, 9]);
    expect(je("weg2", 7)).toEqual([21, 22]);
  });

  it("hält die Verdienstansicht an ihrer Stelle, auch wenn ein Weg mehr Ansichten hat", () => {
    expect(ANSICHTEN[KONDITIONEN_ANSICHT - 1].id).toBe(KONDITIONEN_ID);
    expect(ansichtNummer(fuer("weg1"), KONDITIONEN_ID)).toBe(11);
    expect(ansichtNummer(fuer("weg2"), KONDITIONEN_ID)).toBe(12);
  });

  /*
   * Der Tätigkeitsmaßstab, seit dem 10.09.2026. Er steht unmittelbar hinter
   * dem Verdienst und im selben Kapitel: Wer gerade gelesen hat, was er
   * bekommt, liest sofort danach, was dafür vorausgesetzt wird. Als Nachtrag
   * im Abschlusskapitel wäre es ein Kleingedrucktes.
   */
  it("stellt die Erwartung unmittelbar hinter den Verdienst, im selben Kapitel", () => {
    const nach = ANSICHTEN[ANSICHTEN.findIndex((a) => a.id === KONDITIONEN_ID) + 1];
    expect(nach.id).toBe("erwartung");
    expect(nach.kapitel).toBe(5);
    expect(nach.titel).toBe("Was wir erwarten");
    for (const w of WEGE) {
      const liste = fuer(w.id);
      expect(ansichtNummer(liste, "erwartung"), `Weg ${w.id}`)
        .toBe(ansichtNummer(liste, KONDITIONEN_ID) + 1);
    }
  });

  it("nennt den Maßstab von zwei Quartalen, die Ausnahmen und die Rückfrage vorher", () => {
    const a = ANSICHTEN.find((x) => x.id === "erwartung")!;
    const alles = [...(a.absaetze ?? []), ...(a.punkte ?? []).flatMap((p) => [p.titel, p.text]), a.fuss ?? ""].join("\n");
    expect(alles).toContain("zwei aufeinanderfolgenden");
    expect(alles).toContain("beim Notar beurkundet");
    // Das angebrochene erste Quartal, Krankheit und Elternzeit zählen nicht.
    expect(alles).toContain("Das Quartal, in dem du anfängst, bleibt außen vor");
    expect(alles).toContain("Elternzeit");
    // Vorher wird geredet, und zwar schriftlich mit zwei Wochen Zeit.
    expect(alles).toContain("zwei Wochen");
    // Der Verweis auf die Stelle im Vertrag, damit die Zahl nachlesbar ist.
    expect(a.fuss).toContain("Paragraf 12 Absatz 1a");
    // Kein Drohton: Das Wort Kündigung fällt hier nicht, und der Maßstab
    // wird ausdrücklich von Umsatzzielen und Wochenquoten abgegrenzt.
    expect(alles).not.toMatch(/kündig/i);
    expect(alles).not.toMatch(/Umsatzziel(?!e)|Zielvorgabe/i);
    expect(alles).toContain("Wir setzen keine Umsatzziele und geben dir keine Wochenquote vor");
  });

  it("gibt jeder Ansicht ein Motiv, das es auch wirklich gibt", () => {
    for (const w of WEGE) {
      for (const a of fuer(w.id)) {
        expect(MOTIV_IDS, `Ansicht ${a.id}`).toContain(a.motiv);
      }
    }
  });

  it("hält den Spannungsbogen ein: keine Zahl zum eigenen Verdienst vor den Konditionen", () => {
    const vorher = ANSICHTEN.filter((a) => a.nummer < KONDITIONEN_ANSICHT);
    const text = JSON.stringify(vorher);
    expect(text).not.toMatch(/4 Prozent/);
    expect(text).not.toMatch(/12\.000/);
    expect(text).not.toMatch(/150 Euro/);
    expect(text).not.toMatch(/verdienst du|Provisionssatz|vom Kaufpreis/i);
  });

  it("sagt auf Ansicht 1, worum es geht, und nennt die Firma vor der ersten Frage", () => {
    const eins = ANSICHTEN[0];
    const text = (eins.absaetze ?? []).join(" ");
    expect(text).toContain("selbstständige Tätigkeit auf Provision");
    expect(text).toContain("keine Anstellung");
    /*
     * Seit dem Kapiteltausch vom 09.09.2026 stehen hier zwei Sätze mehr: die
     * Firma, bevor nach dem Beruf gefragt wird, und die Begründung für die
     * Frage, die unmittelbar folgt.
     */
    expect(eins.absaetze?.[0]).toBe("OS Immobilien ist ein Kapitalanlage-Vertrieb aus Rosenheim.");
    expect(text).toContain("Als Erstes fragen wir dich, wo du herkommst.");
  });

  it("zeigt dem Bewerber nirgends eine Punktzahl oder eine Note", () => {
    const text = JSON.stringify(ANSICHTEN) + JSON.stringify(WEGE);
    expect(text).not.toMatch(/Punktzahl|Eignung in Prozent|Empfehlung A|Score/i);
  });

  it("nennt keine Zeitzusage fuer das Ausfuellen", () => {
    expect(JSON.stringify(ANSICHTEN)).not.toMatch(/8 Minuten|acht Minuten/i);
  });

  /*
   * Seit dem 07.09.2026 gibt es die Servicevereinbarung nicht mehr. Ihre
   * Leistungen stehen als gestellt auf der Tag-1-Ansicht, die Konditionen
   * nennen den Einzelpreis der Leads, und das Wort darf im ganzen Bogen nicht
   * mehr vorkommen. Die Titel sind bewusst die des Sollzustands und nicht die
   * des Vertragstextes: „Die Vertriebsakademie" ist eine Antwort auf die
   * Frage, was der Bewerber bekommt.
   */
  it("zählt zehn Bausteine ab Tag 1 auf, kostenlos, ohne Servicevereinbarung", () => {
    const tageins = ANSICHTEN.find((a) => a.id === "tageins")!;
    expect(BAUSTEINE_TAG_EINS).toHaveLength(10);
    expect(tageins.punkte).toEqual(BAUSTEINE_TAG_EINS);
    const titel = BAUSTEINE_TAG_EINS.map((p) => p.titel);
    for (const t of ["Die Vertriebsakademie", "Deine eigene Landingpage", "Community und Coaching", "Support"]) {
      expect(titel).toContain(t);
    }
    expect(tageins.absaetze?.[0]).toContain("ohne Monatsgebühr");
    expect(tageins.fuss).toContain("86a");

    /*
     * Seit dem 08.09.2026 stehen die Leadpreise nur noch auf der Leadansicht.
     * Die Konditionen verweisen darauf und nennen selbst keine Zahl mehr, denn
     * ein Preis an zwei Stellen läuft irgendwann auseinander.
     */
    const verdienst = ANSICHTEN.find((a) => a.id === "verdienst")!;
    expect(JSON.stringify(verdienst)).not.toMatch(/\d+ Euro je Lead/);
    const leadangebot = ANSICHTEN.find((a) => a.id === "leadangebot")!;
    expect(JSON.stringify(leadangebot)).toContain(`${LEAD_EINZELPREIS} Euro je Lead`);

    const alles = JSON.stringify(ANSICHTEN) + JSON.stringify(WEGE);
    expect(alles).not.toMatch(/150 Euro brutto|Monate Mindestlaufzeit/);
    // Das Wort fällt nur noch dort, wo es ausdrücklich verneint wird.
    expect(alles.match(/Servicevereinbarung/g) ?? []).toHaveLength(1);
    expect(tageins.absaetze?.[0]).toContain("Ohne Servicevereinbarung");
  });

  it("nennt den Termin überall Persönliches Gespräch und nirgends Bewerbergespräch", () => {
    const alles = JSON.stringify(ANSICHTEN) + JSON.stringify(WEGE);
    expect(GESPRAECH_NAME).toBe("Persönliches Gespräch");
    expect(GESPRAECH_NAME_KLEIN).toBe("persönliches Gespräch");
    expect(GESPRAECH_NAME_DATIV).toBe("persönlichen Gespräch");
    expect(alles).toContain(GESPRAECH_NAME_DATIV);
    expect(alles).not.toMatch(/Bewerbergespräch/);
  });

  it("endet mit einer Abschlussansicht und nicht mit der Terminwahl", () => {
    /*
     * Bis zum 08.09.2026 hieß die letzte Ansicht „Dein persönliches Gespräch"
     * und führte in den Kalender. Damit stand der Termin, bevor irgendjemand
     * die Antworten gelesen hatte, und die Auswahl nach dem Bewerberscore lief
     * leer. Der Bogen endet jetzt mit dem Absenden.
     */
    const letzte = ANSICHTEN[ANSICHTEN.length - 1];
    expect(letzte.id).toBe("abschluss");
    expect(letzte.art).toBe("abschluss");
    expect(ANSICHTEN.some((a) => (a.art as string) === "termin")).toBe(false);
  });

  it("fordert nirgends im Bogen dazu auf, sich selbst einen Termin zu buchen", () => {
    const alles = JSON.stringify(ANSICHTEN) + JSON.stringify(WEGE) + JSON.stringify(SCHRITT_TEXTE);
    expect(alles).not.toMatch(/such dir .{0,20}termin/i);
    expect(alles).not.toMatch(/buch(e|st) (es )?dir/i);
    expect(alles).not.toMatch(/Termin aussuchen/);
  });

  it("verspricht im Abschluss eine Rückmeldung, ohne eine Frist zuzusagen", () => {
    const text = [
      ABSCHLUSS_TEXTE.vorAbsenden,
      ABSCHLUSS_TEXTE.nachNotizen,
      ABSCHLUSS_TEXTE.text,
      ABSCHLUSS_TEXTE.weiter,
      ABSCHLUSS_TEXTE.fuss,
    ].join(" ");
    // Er darf nicht im Ungewissen bleiben: ungefähr wann, und worüber.
    expect(text).toMatch(/melden wir uns/);
    expect(text).toMatch(/ein paar Tage/);
    expect(text).toMatch(/persönliche[nms]? Gespräch/);
    // Und beide Ausgänge, damit Schweigen nicht zur Absage wird.
    expect(text).toMatch(/wenn es nicht passt/i);
    // Keine Frist, die niemand einhalten kann.
    expect(text).not.toMatch(/innerhalb von \d|binnen \d|\d+ Werktagen|garantiert/i);
    // Der Knopf sagt nur noch, was er tut.
    expect(ABSCHLUSS_TEXTE.knopf).toBe("Angaben absenden");
  });

  it("wiederholt auf der Abschlussansicht nicht die eigene Überschrift", () => {
    // Der Kasten hieß früher genauso wie die H1 darüber und sagte damit nichts.
    const letzte = ANSICHTEN[ANSICHTEN.length - 1];
    expect(SCHRITT_TITEL_BUCHEN).not.toBe(letzte.titel);
  });
});

const SCHRITT_TITEL_BUCHEN = "Was jetzt kommt";

/*
 * Die Leitregel des Umbaus, als Test.
 *
 * Tatsachen bleiben für jede Gruppe wörtlich gleich, nur der Anschluss
 * wechselt. Geprüft wird deshalb dreierlei: dass jede der fünf Gruppen einen
 * eigenen Satz bekommt, dass keine leer ausgeht, und dass alles andere auf
 * derselben Ansicht für alle identisch dasteht. Die dritte Zusage ist die
 * wichtigste: Eine Tatsache in fünf Fassungen läuft mit der Zeit auseinander,
 * und gemerkt wird es, wenn zwei Bewerber sich unterhalten.
 */
describe("Der Anschlusssatz je Gruppe", () => {
  /** Die vier Ansichten aus E3 und der Vorsatz aus E4. */
  const MIT_ANSCHLUSS = ["wersind", "zielgruppe", "abwicklung", "verdienst", "erlaubnis"];

  const ansichtAuf = (weg: string, id: string) => fuer(weg).find((a) => a.id === id)!;

  it("hängt genau an den Ansichten, die der Sollzustand nennt", () => {
    expect(ANSICHTEN.filter((a) => a.anschluss).map((a) => a.id)).toEqual(MIT_ANSCHLUSS);
  });

  it("gibt jeder der fünf Gruppen einen Satz, keine geht leer aus", () => {
    for (const id of MIT_ANSCHLUSS) {
      for (const w of WEGE) {
        const text = anschlussFuer(ansichtAuf(w.id, id), { weg: w.id });
        expect(text, `${id} auf ${w.id}`).toBeTruthy();
        expect((text ?? "").trim().length, `${id} auf ${w.id}`).toBeGreaterThan(20);
      }
    }
  });

  it("gibt den vier Ansichten aus E3 fünf verschiedene Sätze", () => {
    for (const id of ["wersind", "zielgruppe", "abwicklung", "verdienst"]) {
      const saetze = WEGE.map((w) => anschlussFuer(ansichtAuf(w.id, id), { weg: w.id }));
      expect(new Set(saetze).size, `${id} wiederholt einen Satz`).toBe(5);
    }
  });

  /*
   * Der eigentliche Punkt des ganzen Umbaus. Verglichen wird die Ansicht ohne
   * ihren Anschluss: Überschrift, feste Absätze, Spalten, Aufzählung, Fragen
   * und Fußkasten müssen für alle fünf Gruppen Zeichen für Zeichen dasselbe
   * sein.
   */
  it("lässt alles außer dem Anschluss für alle fünf Gruppen wörtlich gleich", () => {
    for (const id of MIT_ANSCHLUSS) {
      const ohneAnschluss = WEGE.map((w) => {
        const { anschluss: _weg, nummer: _nr, ...rest } = ansichtAuf(w.id, id);
        return JSON.stringify(rest);
      });
      expect(new Set(ohneAnschluss).size, `${id} unterscheidet sich in den Tatsachen`).toBe(1);
      // Und die fünf Fassungen selbst stehen auf jeder Gruppe identisch im
      // Katalog, es gibt sie also wirklich nur einmal.
      const kataloge = WEGE.map((w) => JSON.stringify(ansichtAuf(w.id, id).anschluss));
      expect(new Set(kataloge).size, id).toBe(1);
    }
  });

  it("setzt den Vorsatz vor die festen Absätze und den Anschluss dahinter", () => {
    const erlaubnis = ansichtAuf("weg1", "erlaubnis");
    const mitVorsatz = absaetzeFuer(erlaubnis, { weg: "weg1" });
    expect(mitVorsatz[0]).toBe(anschlussFuer(erlaubnis, { weg: "weg1" }));
    expect(mitVorsatz[mitVorsatz.length - 1]).toBe(GEWERBE_WORTLAUT);

    const zielgruppe = ansichtAuf("weg1", "zielgruppe");
    const mitAnschluss = absaetzeFuer(zielgruppe, { weg: "weg1" });
    expect(mitAnschluss[mitAnschluss.length - 1]).toBe(anschlussFuer(zielgruppe, { weg: "weg1" }));
    expect(mitAnschluss).toHaveLength((zielgruppe.absaetze ?? []).length + 1);
  });

  it("setzt den festen Auftakt vor jede der fünf Fassungen, und zwar nur einmal", () => {
    const auftakt = "Weil wir unser Vertriebsteam erweitern, suchen wir Partner,";
    for (const w of WEGE) {
      const satz = anschlussFuer(ansichtAuf(w.id, "wersind"), { weg: w.id })!;
      expect(satz.startsWith(auftakt), w.id).toBe(true);
      expect(satz.split(auftakt), w.id).toHaveLength(2);
    }
    // Der Auftakt ist eine Tatsache und steht deshalb genau einmal im Katalog.
    const fassungen = Object.values(ANSICHTEN.find((a) => a.id === "wersind")!.anschluss!.fassungen);
    for (const f of fassungen) expect(f).not.toContain(auftakt);
  });

  it("hält den Kasten auf der Abwicklungsansicht unter dem Inhalt, mit Überschrift", () => {
    for (const w of WEGE) {
      const kasten = anschlussUnten(ansichtAuf(w.id, "abwicklung"), { weg: w.id });
      expect(kasten?.titel, w.id).toBe("Und was das für dich heißt");
      expect(kasten?.text, w.id).toContain("fünf");
      // Und er steht nicht zusätzlich zwischen den Absätzen.
      expect(absaetzeFuer(ansichtAuf(w.id, "abwicklung"), { weg: w.id }))
        .toEqual(ansichtAuf(w.id, "abwicklung").absaetze);
    }
  });

  it("stellt den Einordnungssatz zum Verdienst ohne Überschrift unter die drei Uhren", () => {
    for (const w of WEGE) {
      const unten = anschlussUnten(ansichtAuf(w.id, "verdienst"), { weg: w.id });
      expect(unten?.titel, w.id).toBeUndefined();
      expect((unten?.text ?? "").length, w.id).toBeGreaterThan(20);
    }
  });

  /*
   * Zweite Regel des Umbaus: Kein Satz behauptet etwas über sein heutiges
   * Geschäft. Wir kennen aus dem Bogen nur, was er angekreuzt hat.
   */
  it("behauptet in keiner Fassung etwas über sein heutiges Einkommen", () => {
    const alle = ANSICHTEN.filter((a) => a.anschluss)
      .flatMap((a) => Object.values(a.anschluss!.fassungen))
      .join(" ");
    expect(alle).not.toMatch(/mehr, als du heute verdienst|mehr als du heute/i);
    expect(alle).not.toMatch(/verdienst du heute/i);
    // Und das Wort, das vor der Gruppe „Beides ist neu für mich" nicht fallen darf.
    expect(alle).not.toMatch(/Quereinsteiger/i);
  });

  /*
   * Der Satz für die erste Gruppe nennt den Provisionssatz ausgeschrieben,
   * weil er so freigegeben ist. Damit er nicht stehen bleibt, wenn der Satz
   * sich ändert, hängt er hier an der Konstante.
   */
  it("nennt vier Prozent nur, solange vier Prozent gelten", () => {
    expect(PROVISION_PROZENT).toBe(4);
    const satz = ANSICHTEN.find((a) => a.id === "verdienst")!.anschluss!.fassungen.weg1;
    expect(satz).toContain("Vier Prozent vom Kaufpreis");
  });

  it("gibt ohne gewählte Gruppe keinen Anschluss aus, statt einen zu erfinden", () => {
    for (const id of MIT_ANSCHLUSS) {
      const ansicht = ANSICHTEN.find((a) => a.id === id)!;
      expect(anschlussFuer(ansicht, {}), id).toBeNull();
      expect(anschlussUnten(ansicht, {}), id).toBeNull();
      expect(absaetzeFuer(ansicht, {}), id).toEqual(ansicht.absaetze ?? []);
      expect(anschlussFuer(ansicht, { weg: "erfunden" }), id).toBeNull();
    }
  });

  it("verschiebt durch die Anschlusssätze keine einzige Ansichtsnummer", () => {
    for (const w of WEGE) {
      expect(fuer(w.id)).toHaveLength(w.id === "weg2" ? 22 : 21);
    }
  });
});

describe("Der Vorsatz zu Gewerbe und Erlaubnis", () => {
  const fassungen = ANSICHTEN.find((a) => a.id === "erlaubnis")!.anschluss!.fassungen;

  it("hat drei Fassungen für fünf Gruppen", () => {
    expect(new Set(Object.values(fassungen)).size).toBe(3);
  });

  it("sagt der ersten Gruppe, dass sie wahrscheinlich schon fertig ist", () => {
    expect(fassungen.weg1).toContain("Wahrscheinlich hast du beides längst");
  });

  /*
   * Der eigentliche Grund für diese Etappe: Ein Berater mit einer 34d kreuzt
   * heute guten Gewissens „Ja, habe ich" an. Die Abgrenzung steht zwar unter
   * der Frage, aber ohne Handlungsanweisung.
   */
  it("weist die zweite Gruppe an, nur für die 34c zu antworten", () => {
    expect(fassungen.weg2).toContain("34d oder 34f");
    expect(fassungen.weg2).toContain("Antworte hier bitte nur für die 34c.");
  });

  it("gibt den drei übrigen Gruppen denselben Satz, und zwar keinen Ausschluss", () => {
    expect(fassungen.weg3).toBe(fassungen.weg4);
    expect(fassungen.weg4).toBe(fassungen.weg5);
    expect(fassungen.weg5).toContain("kein Ausschluss");
  });

  it("lässt den geprüften Wortlaut darunter unangetastet", () => {
    for (const w of WEGE) {
      const ansicht = fuer(w.id).find((a) => a.id === "erlaubnis")!;
      expect(ansicht.absaetze, w.id).toEqual([GEWERBE_WORTLAUT]);
      expect(ansicht.fragen?.map((f) => f.key), w.id).toEqual([
        "gewerbe", "erlaubnis34c", "erlaubnis34cBegruendung",
      ]);
    }
  });
});

describe("Die fünf Wege", () => {
  it("gibt jedem Weg drei eigene Ansichten, dem Finanzberater vier", () => {
    expect(WEGE).toHaveLength(5);
    for (const w of WEGE) {
      expect(w.ansichten, `Weg ${w.id}`).toHaveLength(w.id === "weg2" ? 4 : 3);
    }
  });

  it("gibt jeder Weg-Ansicht eine eigene Überschrift, keine zwei gleichen", () => {
    // Der gemeldete Fehler: „Deine Erfahrung, genauer" stand fest über allen
    // fünf Wegen und passte bei „Beides ist neu für mich" überhaupt nicht.
    const alle: string[] = [];
    for (const w of WEGE) {
      for (const a of w.ansichten) {
        expect(a.titel.trim().length).toBeGreaterThan(0);
        alle.push(`${w.id}:${a.titel}`);
      }
    }
    expect(new Set(alle).size).toBe(alle.length);

    const weg5 = WEGE.find((w) => w.id === "weg5")!;
    expect(weg5.ansichten[0].titel).toBe("Was dich hierher bringt");
    expect(weg5.ansichten.map((a) => a.titel)).not.toContain("Deine Erfahrung, genauer");
  });

  it("schreibt die drei Wegfragen unter dieselben Schlüssel, auf jedem Weg", () => {
    for (const w of WEGE) {
      expect(wegFragen(w).map((f) => f.key)).toEqual(["wegAntwort1", "wegAntwort2", "wegAntwort3"]);
    }
  });

  it("setzt die Ansichten der gewählten Strecke hinter die Weiche", () => {
    for (const w of WEGE) {
      const ansichten = fuer(w.id);
      const eigene = ansichten.slice(2, 2 + w.ansichten.length);
      expect(eigene.map((a) => a.id)).toEqual(w.ansichten.map((a) => a.id));
      expect(eigene.map((a) => a.titel)).toEqual(w.ansichten.map((a) => a.titel));
      for (const a of eigene) expect(a.kapitel).toBe(2);
    }
  });

  it("hält die Nummerierung schon vor der Weiche stabil", () => {
    /*
     * Vor der Antwort stehen drei Platzhalter im Bogen. Ohne sie läse der
     * Bewerber erst „Ansicht 1 von 19" und nach seiner Antwort „von 21", und
     * der Nebenweg zu den Konditionen führte auf zwei verschiedene Nummern.
     */
    const ohne = ansichtenFuer({});
    expect(ohne).toHaveLength(21);
    expect(ohne.slice(2, 5).every((a) => (a.fragen ?? []).length === 0)).toBe(true);
    expect(new Set(ohne.map((a) => a.id)).size).toBe(21);
    expect(ansichtNummer(ohne, KONDITIONEN_ID)).toBe(KONDITIONEN_ANSICHT);
  });

  it("gibt dem Quereinstieg die Erklärung, was ein Kapitalanlage-Vertrieb macht", () => {
    const erste = fuer("weg5")[2];
    expect(erste.punkte?.[0].titel).toBe("Was ein Kapitalanlage-Vertrieb macht");
  });

  it("gibt dem Finanzberater die vierte Ansicht zum zweiten Produkt, ohne Produktnamen", () => {
    const vierte = WEGE.find((w) => w.id === "weg2")!.ansichten[3];
    expect(vierte.titel).toBe("Ein zweites Produkt, das zu dir passt");
    expect(vierte.frage).toBeUndefined();
    expect(vierte.punkte?.map((p) => p.titel)).toEqual([
      "Stornofrei", "Bestandsprovision", "Ehrlich für den Kunden",
    ]);
    expect(vierte.fuss).toContain(GESPRAECH_NAME_DATIV);
  });
});

describe("Die Rückmeldung kommt nach der Antwort", () => {
  it("bleibt aus, solange die Frage offen ist", () => {
    for (const w of WEGE) {
      const ansicht = fuer(w.id)[2];
      expect(ansicht.rueckmeldung, `Weg ${w.id}`).toBeTruthy();
      expect(rueckmeldungFaellig(ansicht, { weg: w.id })).toBe(false);
    }
  });

  it("erscheint, sobald geantwortet ist", () => {
    for (const w of WEGE) {
      const ansicht = fuer(w.id)[2];
      const frage = ansicht.fragen![0];
      const wert = frage.typ === "mehrfach"
        ? [frage.optionen![0].value]
        : frage.optionen?.[0].value ?? "Irgendetwas";
      expect(rueckmeldungFaellig(ansicht, { weg: w.id, [frage.key]: wert })).toBe(true);
    }
  });

  it("steht sofort, wo es gar keine Frage gibt", () => {
    // Die vierte Ansicht auf Weg 2 trägt einen festen blauen Kasten statt
    // einer Rückmeldung; sie hat keine Frage und wartet deshalb auf nichts.
    const vierte = fuer("weg2")[5];
    expect(vierte.fragen).toBeUndefined();
    expect(vierte.fuss).toBeTruthy();
  });
});

describe("Die Verständnisfragen erklären, statt zu bewerten", () => {
  const passung = ANSICHTEN.find((a) => a.id === "passung")!;

  it("macht die Frage nach der Passung freiwillig", () => {
    // Sie war Pflicht, und der Hinweis darunter behauptete das Gegenteil.
    const frage = passung.fragen!.find((f) => f.key === "passung")!;
    expect(frage.freiwillig).toBe(true);
    expect(frage.hinweis).toContain("kein Ausschluss");
  });

  it("fährt bei Ja einen Hinweis ein, bei Nein nicht", () => {
    for (const key of ["verstaendnisFixum", "verstaendnisProvision"]) {
      const frage = passung.fragen!.find((f) => f.key === key)!;
      expect(antwortHinweisFuer(frage, { [key]: "nein" })).toBeNull();
      const hinweis = antwortHinweisFuer(frage, { [key]: "ja" });
      expect(hinweis, key).toBeTruthy();
      expect(hinweis!.ton).toBe("hinweis");
    }
    const fixum = passung.fragen!.find((f) => f.key === "verstaendnisFixum")!;
    expect(antwortHinweisFuer(fixum, { verstaendnisFixum: "ja" })!.text)
      .toContain("selbstständiger Handelsvertreter");
  });

  it("sperrt die Frage nach dem Hinweis nicht, die Antwort bleibt gespeichert", () => {
    const raus = antwortenZumSenden({ weg: "weg1", verstaendnisFixum: "ja" });
    expect(raus.verstaendnisFixum).toBe("ja");
  });

  it("weist bei Leads auf die Kosten hin, in blau und nicht als Warnung", () => {
    const frage = ANSICHTEN.find((a) => a.id === "interessenten")!.fragen!
      .find((f) => f.key === "leadPraeferenz")!;
    expect(antwortHinweisFuer(frage, { leadPraeferenz: "eigen" })).toBeNull();
    for (const wert of ["leads", "beides"]) {
      const h = antwortHinweisFuer(frage, { leadPraeferenz: wert });
      expect(h, wert).toBeTruthy();
      expect(h!.ton).toBe("info");
    }
  });
});

describe("Die Begründung zur Erlaubnis", () => {
  const erlaubnis = ANSICHTEN.find((a) => a.id === "erlaubnis")!;
  const feld = erlaubnis.fragen!.find((f) => f.key === "erlaubnis34cBegruendung")!;

  it("erscheint nur bei „Möchte ich grundsätzlich nicht“", () => {
    expect(frageSichtbar(feld, {})).toBe(false);
    expect(frageSichtbar(feld, { erlaubnis34c: "nein" })).toBe(false);
    expect(frageSichtbar(feld, { erlaubnis34c: "will_nicht" })).toBe(true);
  });

  it("ist dann Pflicht und höchstens 300 Zeichen lang", () => {
    expect(feld.freiwillig).toBeFalsy();
    expect(feld.maxLaenge).toBe(ERLAUBNIS_BEGRUENDUNG_MAX);
    expect(ERLAUBNIS_BEGRUENDUNG_MAX).toBe(300);
  });

  it("hält den Weiter-Knopf nicht auf, solange sie gar nicht dasteht", () => {
    expect(fragenDerAnsicht(erlaubnis, { erlaubnis34c: "ja" }).map((f) => f.key))
      .toEqual(["gewerbe", "erlaubnis34c"]);
    expect(fragenDerAnsicht(erlaubnis, { erlaubnis34c: "will_nicht" }).map((f) => f.key))
      .toEqual(["gewerbe", "erlaubnis34c", "erlaubnis34cBegruendung"]);
  });

  it("wirft die Begründung weg, wenn die Antwort nachträglich geändert wurde", () => {
    const mit = antwortenZumSenden({ erlaubnis34c: "will_nicht", erlaubnis34cBegruendung: "Kein Bedarf." });
    expect(mit.erlaubnis34cBegruendung).toBe("Kein Bedarf.");
    const ohne = antwortenZumSenden({ erlaubnis34c: "ja", erlaubnis34cBegruendung: "Kein Bedarf." });
    expect(ohne.erlaubnis34cBegruendung).toBeUndefined();
  });
});

/**
 * Die Freitextergänzung hinter „Etwas anderes" (08.09.2026).
 *
 * Sie benutzt dasselbe `zeigtWenn` wie die Begründung zur Erlaubnis. Neu ist
 * nur, dass die Bedingung auch an einer Mehrfachauswahl hängen darf.
 */
describe("Die Freitextergänzung hinter „Etwas anderes“", () => {
  const wegAnsicht = (weg: string, id: string) => fuer(weg).find((a) => a.id === id)!;

  it("erscheint auf Weg 2 erst, wenn „Etwas anderes“ angehakt ist", () => {
    const ansicht = wegAnsicht("weg2", "weg2-beratung");
    const ohne = { weg: "weg2", wegAntwort1: ["baufi", "vorsorge"] };
    const mit = { weg: "weg2", wegAntwort1: ["baufi", "sonstiges"] };
    expect(fragenDerAnsicht(ansicht, ohne).map((f) => f.key)).toEqual(["wegAntwort1"]);
    expect(fragenDerAnsicht(ansicht, mit).map((f) => f.key)).toEqual(["wegAntwort1", "wegAntwort1Frei"]);
  });

  it("erscheint auf Weg 5 erst bei „Bei mir liegt es anders“", () => {
    const ansicht = wegAnsicht("weg5", "weg5-reserve");
    expect(fragenDerAnsicht(ansicht, { weg: "weg5", wegAntwort2: "3_bis_6" }).map((f) => f.key))
      .toEqual(["wegAntwort2"]);
    expect(fragenDerAnsicht(ansicht, { weg: "weg5", wegAntwort2: "sonstiges" }).map((f) => f.key))
      .toEqual(["wegAntwort2", "wegAntwort2Frei"]);
  });

  it("ist ausgefüllt Pflicht, hält den Bogen aber nicht auf, solange sie nicht dasteht", () => {
    const feld = WEGE.find((w) => w.id === "weg5")!.ansichten
      .find((a) => a.id === "weg5-reserve")!.folgefrage!;
    expect(feld.freiwillig).toBeFalsy();
    expect(frageSichtbar(feld, { wegAntwort2: "egal" })).toBe(false);
  });

  it("wirft den Freitext weg, wenn die Wahl nachträglich geändert wurde", () => {
    const mit = antwortenZumSenden({
      weg: "weg5", wegAntwort2: "sonstiges", wegAntwort2Frei: "Ich bin angestellt.",
    });
    expect(mit.wegAntwort2Frei).toBe("Ich bin angestellt.");
    const ohne = antwortenZumSenden({
      weg: "weg5", wegAntwort2: "3_bis_6", wegAntwort2Frei: "Ich bin angestellt.",
    });
    expect(ohne.wegAntwort2Frei).toBeUndefined();
  });
});

/**
 * Die Frage nach der Erreichbarkeit ist am 08.09.2026 ersatzlos entfallen. Der
 * Termin wird selbst aus dem Kalender gewählt, ein Rückruffenster braucht
 * niemand mehr.
 */
describe("Die entfallene Frage nach der Erreichbarkeit", () => {
  it("steht nicht mehr im Bogen, die Ansicht fragt nur noch nach dem Start", () => {
    const start = ANSICHTEN.find((a) => a.id === "start")!;
    expect(start.fragen?.map((f) => f.key)).toEqual(["startzeitpunkt"]);
    const alleKeys = ANSICHTEN.flatMap((a) => a.fragen ?? []).map((f) => f.key);
    expect(alleKeys).not.toContain("erreichbarkeit");
  });

  it("verschiebt keine einzige Ansichtsnummer", () => {
    expect(fuer("weg1")).toHaveLength(21);
    // 17 statt 16, seit „Was wir erwarten" in Kapitel 5 davor steht.
    expect(ansichtNummer(fuer("weg1"), "start")).toBe(17);
  });

  it("bewahrt die Frage als Altfrage, damit ältere Bögen ihre Angabe behalten", () => {
    const alt = ALTFRAGEN.find((f) => f.key === "erreichbarkeit")!;
    expect(alt.kurz).toBe("Erreichbar");
    expect(alt.optionen?.map((o) => o.value)).toEqual(["vormittags", "mittags", "nachmittags", "abends"]);
  });
});

describe("Der Ausstieg", () => {
  it("hat den Wortlaut aus der Freigabe", () => {
    expect(AUSSTIEG_TEXTE.link).toBe("Passt nicht für dich? Kein Interesse");
    expect(AUSSTIEG_TEXTE.titel).toBe("Schade, aber danke für die Offenheit");
    expect(AUSSTIEG_TEXTE.beenden).toBe("Bewerbung beenden");
    expect(AUSSTIEG_TEXTE.weiter).toBe("Doch weitermachen");
    expect(AUSSTIEG_TEXTE.fuss).toContain("Wir melden uns dann nicht mehr");
  });
});

describe("Die Dauer folgt dem Klärungsbedarf", () => {
  it("gibt 30 Minuten ohne markierte Themen und ohne eigene Frage", () => {
    expect(gespraechsDauerMinuten({})).toBe(DAUER_KURZ_MINUTEN);
    expect(gespraechsDauerMinuten({ themen: [], eigeneFrage: "  " })).toBe(DAUER_KURZ_MINUTEN);
  });

  it("gibt 45 Minuten, sobald ein Thema markiert oder eine Frage gestellt ist", () => {
    expect(gespraechsDauerMinuten({ themen: ["kosten"] })).toBe(DAUER_LANG_MINUTEN);
    expect(gespraechsDauerMinuten({ eigeneFrage: "Wie lange dauert die 34c?" })).toBe(DAUER_LANG_MINUTEN);
  });
});

describe("Der passende nächste Schritt", () => {
  it("führt im Regelfall zur Buchung", () => {
    expect(naechsterSchritt({ verstaendnisFixum: "nein", verstaendnisProvision: "nein" })).toBe("buchen");
  });

  it("erklärt statt zu bewerten, wenn eine Verständnisfrage falsch beantwortet ist", () => {
    expect(naechsterSchritt({ verstaendnisFixum: "ja" })).toBe("grundsatz_unklar");
    expect(naechsterSchritt({ verstaendnisProvision: "ja" })).toBe("grundsatz_unklar");
  });

  it("schließt niemanden aus, wenn die Erlaubnis offen ist", () => {
    expect(naechsterSchritt({ erlaubnis34c: "will_nicht" })).toBe("voraussetzung_offen");
    expect(naechsterSchritt({ erlaubnis34c: "unklar" })).toBe("voraussetzung_offen");
    expect(naechsterSchritt({ gewerbe: "unklar" })).toBe("voraussetzung_offen");
  });

  it("behandelt Umschauen als Zeitpunktfrage und nicht als Absage", () => {
    expect(naechsterSchritt({ startzeitpunkt: "umschauen" })).toBe("nicht_jetzt");
  });
});

describe("Was beim Absenden herausgeht", () => {
  const voll: KennenlernenAntworten = {
    weg: "weg2",
    hintergrund: ["vertrieb"],
    wegAntwort1: ["baufi", "vorsorge"],
    wegAntwort2: "empfehlung",
    wegAntwort3: "gelegentlich",
    zeitProWoche: "10_bis_20",
    perspektive: "spaeter_haupt",
    leadPraeferenz: "eigen",
    einkommensziel: "5000_10000",
    startzeitpunkt: "vier_wochen",
    erreichbarkeit: ["abends"],
    gewerbe: "ja",
    erlaubnis34c: "nein",
    themen: ["kosten"],
    eigeneFrage: "  Wie lange dauert die 34c?  ",
    passung: ["selbststaendig", "variabel"],
    arbeitsform: "angestellt",
  };

  it("wirft leere Antworten weg und schneidet Leerzeichen ab", () => {
    const raus = antwortenZumSenden({ ...voll, verstaendnisFixum: "", themen: [] });
    expect(raus.verstaendnisFixum).toBeUndefined();
    expect(raus.themen).toBeUndefined();
    expect(raus.eigeneFrage).toBe("Wie lange dauert die 34c?");
  });

  it("trägt den gewählten Weg in hintergrund nach, damit der Vorab-Score weiterrechnet", () => {
    const raus = antwortenZumSenden(voll);
    expect(raus.hintergrund).toContain("vertrieb");
    expect(raus.hintergrund).toContain("findi"); // aus weg2
    expect(raus.hintergrund).toContain("netzwerk"); // aus leadPraeferenz "eigen"
  });

  it("setzt gewerbe34c aus den beiden getrennten Fragen zusammen", () => {
    expect(gewerbe34cAbgeleitet({ gewerbe: "ja", erlaubnis34c: "ja" })).toBe("beides");
    expect(gewerbe34cAbgeleitet({ gewerbe: "ja", erlaubnis34c: "nein" })).toBe("nur_gewerbe");
    expect(gewerbe34cAbgeleitet({ gewerbe: "nein", erlaubnis34c: "nein" })).toBe("keines");
    expect(gewerbe34cAbgeleitet({})).toBeNull();
  });

  it("erzeugt aus einer schriftlichen Antwort niemals eine Ablehnung", () => {
    // "lehnt ab" ist im Assessment ein hartes Kriterium. Aus dem Bogen darf es
    // nicht entstehen, sonst steht jemand vor dem ersten Gespräch auf Absage.
    expect(gewerbe34cAbgeleitet({ erlaubnis34c: "will_nicht" })).toBe("im_gespraech");
    expect(gewerbe34cAbgeleitet({ gewerbe: "unklar" })).toBe("im_gespraech");
  });

  it("schreibt nur Schlüssel, die die bestehenden Auswertungen kennen oder neu sind", () => {
    const raus = antwortenZumSenden(voll);
    const alteKeys = new Set(FORMULAR_FRAGEN.map((f) => f.key));
    const neueKeys = new Set([
      "weg", "wegAntwort1", "wegAntwort2", "wegAntwort3", "passung",
      "verstaendnisFixum", "verstaendnisProvision", "arbeitsform",
      "gewerbe", "erlaubnis34c", "erlaubnis34cBegruendung", "themen", "eigeneFrage",
    ]);
    for (const key of Object.keys(raus)) {
      expect(alteKeys.has(key) || neueKeys.has(key), key).toBe(true);
    }
  });

  it("liefert einen Vorab-Score, ohne dass der Score angefasst werden musste", () => {
    const score = berechneVorabScore(antwortenZumSenden(voll));
    expect(score).not.toBeNull();
    expect(score!.punkte).toBeGreaterThan(0);
    expect(["A", "B", "C"]).toContain(score!.einstufung);
  });
});

describe("Der Überblick vor dem Absenden", () => {
  it("gibt die eigenen Angaben geordnet zurück, ohne Wertung", () => {
    const gruppen = kennenlernenUeberblick({
      weg: "weg1",
      zeitProWoche: "vollzeit",
      startzeitpunkt: "sofort",
      themen: ["kosten"],
    });
    const titel = gruppen.map((g) => g.titel);
    expect(titel).toContain("So möchtest du starten");
    expect(titel).toContain("Das bringst du mit");
    expect(titel).toContain("Das klären wir im Gespräch");
    const alle = gruppen.flatMap((g) => g.zeilen);
    expect(alle.find((z) => z.label === "Der gewählte Weg")?.wert).toBe("Ich verkaufe schon Immobilien");
    expect(JSON.stringify(gruppen)).not.toMatch(/Punkte|Empfehlung/);
  });

  /*
   * Der gemeldete Befund: die beiden Verständnisfragen, die dritte Wegfrage
   * und die Begründung zur Erlaubnis fehlten im Überblick. Der Bewerber konnte
   * damit ausgerechnet die Angaben nicht mehr korrigieren, über die im
   * Gespräch als Erstes geredet wird. Die Erreichbarkeit stand ebenfalls in
   * dieser Liste, bis die Frage am 08.09.2026 entfiel.
   */
  it("zeigt auch Verständnisfragen, dritte Wegfrage und Begründung", () => {
    const gruppen = kennenlernenUeberblick({
      weg: "weg5",
      verstaendnisFixum: "ja",
      verstaendnisProvision: "nein",
      wegAntwort3: "lesen",
      erlaubnis34c: "will_nicht",
      erlaubnis34cBegruendung: "Ich will das nicht beantragen.",
    });
    const labels = gruppen.flatMap((g) => g.zeilen).map((z) => z.label);
    for (const l of ["Verständnis Fixum", "Verständnis Provision", "Lernweise", "Warum keine Erlaubnis"]) {
      expect(labels, l).toContain(l);
    }
  });

  it("zeigt den Freitext hinter „Etwas anderes“, sonst stünde er nirgends", () => {
    const gruppen = kennenlernenUeberblick({
      weg: "weg5",
      wegAntwort2: "sonstiges",
      wegAntwort2Frei: "Ich bin angestellt und habe erst einmal keine Eile.",
    });
    const zeilen = gruppen.flatMap((g) => g.zeilen);
    expect(zeilen.find((z) => z.label === "Zeitliche Reserve, und zwar")?.wert)
      .toBe("Ich bin angestellt und habe erst einmal keine Eile.");
  });

  it("verweist mit jeder Zeile auf die Ansicht, auf der sie steht", () => {
    const gruppen = kennenlernenUeberblick({ weg: "weg2", wegAntwort3: "nie" });
    const zeile = gruppen.flatMap((g) => g.zeilen).find((z) => z.label === "Immobilie in der Beratung")!;
    expect(fuer("weg2")[zeile.ansicht - 1].id).toBe("weg2-baustein");
  });

  it("lässt leere Gruppen weg statt leere Zeilen zu zeigen", () => {
    expect(kennenlernenUeberblick({})).toHaveLength(0);
  });
});


/**
 * Das Thema Leads im Bogen (08.09.2026).
 *
 * Drei Dinge werden hier bewacht: dass die Frage nach dem Start auf allen fünf
 * Wegen steht und auf Weg 5 in eigenen Worten, dass die dritte Tür allein den
 * beiden Immobilienwegen offensteht, und dass die Abschlussquote nirgends als
 * Prozentsatz erscheint. Der letzte Punkt ist kein Schönheitsfehler: „2,33
 * Prozent" wäre der zehnte Teil der Wahrheit.
 */
describe("Das Thema Leads", () => {
  const interessenten = (weg: string) =>
    ansichtenFuer({ weg }).find((a) => a.id === "interessenten")!;
  const leadangebot = (weg: string) =>
    ansichtenFuer({ weg }).find((a) => a.id === "leadangebot")!;

  /** Die Frage nach dem Start, so wie dieser Weg sie sieht. */
  const startFrage = (weg: string) =>
    fragenDerAnsicht(interessenten(weg), { weg }).find((f) => f.key === "leadPraeferenz")!;

  it("fragt auf allen fünf Wegen, womit er startet, und je Weg genau einmal", () => {
    for (const weg of ["weg1", "weg2", "weg3", "weg4", "weg5"]) {
      const keys = fragenDerAnsicht(interessenten(weg), { weg }).map((f) => f.key);
      expect(keys, `Weg ${weg}`).toEqual(["leadPraeferenz", "einkommensziel"]);
    }
  });

  it("bietet dem Start beide Möglichkeiten an, eigenes Netzwerk und Leads", () => {
    const frage = startFrage("weg1");
    expect(frage.optionen?.map((o) => o.value)).toEqual(["eigen", "leads", "beides", "unklar"]);
    expect(frage.optionen?.[0].label).toContain("eigenes Netzwerk");
    expect(frage.optionen?.[1].label).toContain("offen für Leads");
    // Die Rückmeldung nennt keine Zahl mehr, die steht nur noch eine Ansicht weiter.
    expect(JSON.stringify(frage.antwortHinweis)).not.toMatch(/\d/);
  });

  /**
   * Der Quereinsteiger bekommt dieselbe Frage in seinen Worten.
   *
   * Er hat naturgemäß keine Bestandskunden, wohl aber einen Bekanntenkreis.
   * Die Werte müssen trotzdem dieselben bleiben: Vorab-Score, Kurzmarken und
   * die Ableitung des Hintergrunds rechnen mit `eigen`, `leads`, `beides` und
   * `unklar`.
   */
  it("fragt den Quereinsteiger nach dem Bekanntenkreis, mit denselben Werten", () => {
    const quer = startFrage("weg5");
    const andere = startFrage("weg1");
    expect(quer.optionen?.map((o) => o.value)).toEqual(andere.optionen?.map((o) => o.value));
    expect(quer.kurz).toBe(andere.kurz);
    expect(quer.frage).not.toBe(andere.frage);
    expect(quer.optionen?.[0].label).toContain("Bekanntenkreis");
    // Und kein Wort, das ihm ein Netzwerk oder Bestandskunden unterstellt.
    expect(JSON.stringify(quer.optionen)).not.toMatch(/Bestandskunden|eigenes Netzwerk/);
  });

  it("behält die Antwort auf allen fünf Wegen, auch nach einem Wechsel des Wegs", () => {
    for (const weg of ["weg1", "weg2", "weg3", "weg4", "weg5"]) {
      expect(antwortenZumSenden({ weg, leadPraeferenz: "eigen" }).leadPraeferenz, weg).toBe("eigen");
    }
    // Und der abgeleitete Hintergrund kommt beim Quereinsteiger genauso an.
    const raus = antwortenZumSenden({ weg: "weg5", leadPraeferenz: "beides" });
    expect(raus.hintergrund).toContain("netzwerk");
    expect(raus.hintergrund).toContain("quereinsteiger");
  });

  it("nennt Paketpreis, Einzelpreis und Quote genau einmal, auf der Leadansicht", () => {
    const angebot = JSON.stringify(leadangebot("weg1"));
    expect(angebot).toContain(`${LEAD_PAKET_PREIS.toLocaleString("de-DE")} Euro netto`);
    expect(angebot).toContain(`${LEAD_PAKET_ANZAHL} Leads`);
    expect(angebot).toContain(`${LEAD_EINZELPREIS} Euro je Lead`);
    expect(angebot).toContain(`${LEAD_ABSCHLUESSE_JE_10_TEXT} Abschlüsse`);

    // Nirgends sonst im Bogen steht eine dieser Zahlen.
    const uebrige = ANSICHTEN.filter((a) => a.id !== "leadangebot");
    const text = JSON.stringify(uebrige) + JSON.stringify(WEGE);
    expect(text).not.toContain(LEAD_PAKET_PREIS.toLocaleString("de-DE"));
    expect(text).not.toContain(`${LEAD_EINZELPREIS} Euro`);
    expect(text).not.toContain(LEAD_ABSCHLUESSE_JE_10_TEXT);
  });

  it("schreibt die Quote als Zahl je zehn Leads und nie in Prozent", () => {
    const alles = JSON.stringify(ANSICHTEN) + JSON.stringify(WEGE);
    expect(alles).toMatch(/10 Leads werden bei uns im Schnitt 2,33 Abschlüsse/);
    expect(alles).not.toMatch(/2,33\s*(%|Prozent)/);
    expect(alles).not.toMatch(/2\.33/);
  });

  it("sagt auf der Leadansicht, dass nichts davon Pflicht ist", () => {
    const angebot = leadangebot("weg3");
    expect(angebot.absaetze?.[0]).toContain("freiwillig");
    expect(angebot.fuss).toContain("nie Voraussetzung");
    // Und der alte Ort verweist nur noch, statt einen zweiten Preis zu nennen.
    const verdienst = ANSICHTEN.find((a) => a.id === "verdienst")!;
    const leadPunkt = verdienst.punkte!.find((p) => p.titel === "Und wenn du Leads willst")!;
    expect(leadPunkt.text).toContain("Kapitel 6");
    // Der Verweis darf keinen Betrag tragen, sonst gäbe es den Preis zweimal.
    expect(leadPunkt.text).not.toMatch(/Euro|€/);
  });
});

/**
 * Die dritte Tür: Leads gegen nachgewiesene Erfahrung, ohne Paket.
 *
 * Sie steht bewusst nicht als dritte Kachel neben den beiden anderen, sondern
 * als freiwilliger Zusatz unter dem Angebot, und sie verlangt zwei eigene
 * Angaben statt eines Klicks.
 */
describe("Die dritte Tür zu den Leads", () => {
  const fragen = (weg: string) => {
    const a = ansichtenFuer({ weg }).find((x) => x.id === "leadangebot")!;
    return fragenDerAnsicht(a, { weg }).map((f) => f.key);
  };

  /*
   * E9, seit dem 09.09.2026. Vorher sahen die beiden Fragen nur Weg 1 und
   * Weg 4. Weg 5 bleibt ausdrücklich außen vor: Wer noch nie mit Leads
   * gearbeitet hat, kann dazu nichts sagen.
   */
  it("steht den Wegen 1 bis 4 offen, dem Quereinstieg nicht", () => {
    for (const weg of ["weg1", "weg2", "weg3", "weg4"]) {
      expect(fragen(weg), `Weg ${weg}`).toEqual(["leadErfahrung", "leadQuote"]);
    }
    expect(fragen("weg5")).toEqual([]);
  });

  /** Je Weg steht genau eine Fassung der ersten Frage da, nie zwei. */
  it("wechselt den Einleitungshalbsatz je Weg, ohne die Frage zu verdoppeln", () => {
    const wortlaut = (weg: string) => {
      const a = ansichtenFuer({ weg }).find((x) => x.id === "leadangebot")!;
      return fragenDerAnsicht(a, { weg })
        .filter((f) => f.key === "leadErfahrung")
        .map((f) => f.frage);
    };
    for (const weg of ["weg1", "weg4"]) {
      expect(wortlaut(weg), `Weg ${weg}`).toEqual([
        "Du kommst aus der Immobilienbranche: Wie hast du bisher mit Leads gearbeitet?",
      ]);
    }
    for (const weg of ["weg2", "weg3"]) {
      expect(wortlaut(weg), `Weg ${weg}`).toEqual([
        "Du arbeitest im Vertrieb: Wie hast du bisher mit Leads gearbeitet?",
      ]);
    }
    expect(wortlaut("weg5")).toEqual([]);
  });

  /*
   * Nur der Halbsatz vorn darf wechseln. Hinweis, Platzhalter, Länge und
   * Kurzform sind in beiden Fassungen wörtlich gleich, sonst steht in der Akte
   * je nach Weg eine andere Beschriftung über derselben Antwort.
   */
  it("lässt alles außer dem Halbsatz in beiden Fassungen wörtlich gleich", () => {
    const beide = ANSICHTEN.find((a) => a.id === "leadangebot")!
      .fragen!.filter((f) => f.key === "leadErfahrung");
    expect(beide).toHaveLength(2);
    const [erste, zweite] = beide;
    expect(zweite.hinweis).toBe(erste.hinweis);
    expect(zweite.placeholder).toBe(erste.placeholder);
    expect(zweite.maxLaenge).toBe(erste.maxLaenge);
    expect(zweite.kurz).toBe(erste.kurz);
    expect(zweite.freiwillig).toBe(erste.freiwillig);
    expect(zweite.frage).not.toBe(erste.frage);
    // Und beide enden auf derselben eigentlichen Frage.
    for (const f of beide) expect(f.frage).toContain("Wie hast du bisher mit Leads gearbeitet?");
  });

  it("ist freiwillig und hält den Bogen nicht auf", () => {
    const angebot = ANSICHTEN.find((a) => a.id === "leadangebot")!;
    for (const f of angebot.fragen!) expect(f.freiwillig).toBe(true);
  });

  it("verlangt eine eigene Beschreibung und eine eigene Zahl, keine Auswahl", () => {
    const angebot = ANSICHTEN.find((a) => a.id === "leadangebot")!;
    const erfahrung = angebot.fragen!.find((f) => f.key === "leadErfahrung")!;
    const quote = angebot.fragen!.find((f) => f.key === "leadQuote")!;
    expect(erfahrung.typ).toBe("textarea");
    expect(quote.typ).toBe("text");
    expect(erfahrung.optionen).toBeUndefined();
    expect(quote.optionen).toBeUndefined();
  });

  it("sagt ausdrücklich, dass es keine Garantie und keinen Anspruch gibt", () => {
    const erfahrung = ANSICHTEN.find((a) => a.id === "leadangebot")!
      .fragen!.find((f) => f.key === "leadErfahrung")!;
    expect(erfahrung.hinweis).toContain("ohne Garantie");
    expect(erfahrung.hinweis).toContain("ohne Anspruch");
    expect(erfahrung.hinweis).toContain("Einzelfall");
    // Und benennt das Paket als den üblichen Weg.
    expect(erfahrung.hinweis).toContain("Der übliche Weg bleibt das Paket");
  });

  it("wirft die Angaben weg, wenn der Weg nachträglich gewechselt wird", () => {
    for (const weg of ["weg1", "weg2", "weg3", "weg4"]) {
      const mit = antwortenZumSenden({
        weg, leadErfahrung: "Zwei Jahre mit gekauften Leads.", leadQuote: "3 von 10",
      });
      expect(mit.leadErfahrung, `Weg ${weg}`).toBe("Zwei Jahre mit gekauften Leads.");
      expect(mit.leadQuote, `Weg ${weg}`).toBe("3 von 10");
    }
    // Nur der Quereinstieg sieht die beiden Fragen nicht.
    const ohne = antwortenZumSenden({
      weg: "weg5", leadErfahrung: "Zwei Jahre mit gekauften Leads.", leadQuote: "3 von 10",
    });
    expect(ohne.leadErfahrung).toBeUndefined();
    expect(ohne.leadQuote).toBeUndefined();
  });

  /*
   * Zwei Fassungen mit einem Schlüssel. Die unsichtbare darf die Antwort der
   * sichtbaren nicht wegwerfen, genau dieser Fehler wäre bei `leadPraeferenz`
   * schon einmal möglich gewesen.
   */
  it("behält die Antwort auf jedem der vier Wege, obwohl es zwei Fassungen gibt", () => {
    for (const weg of ["weg1", "weg2", "weg3", "weg4"]) {
      const raus = antwortenZumSenden({ weg, leadErfahrung: "Über einen Anbieter." });
      expect(raus.leadErfahrung, `Weg ${weg}`).toBe("Über einen Anbieter.");
    }
  });

  it("steht mit ihren Angaben in der Übersicht am Ende", () => {
    const gruppen = kennenlernenUeberblick({
      weg: "weg4", leadErfahrung: "Über einen Anbieter, täglich nachgefasst.", leadQuote: "4 von 10",
    });
    const zeilen = gruppen.flatMap((g) => g.zeilen).map((z) => `${z.label}: ${z.wert}`);
    expect(zeilen).toContain("Bisherige Arbeit mit Leads: Über einen Anbieter, täglich nachgefasst.");
    expect(zeilen).toContain("Abschlüsse aus zehn Leads: 4 von 10");
  });

  /*
   * Bereits abgeschickte Bögen kennen die neuen Fragen nicht. Sie dürfen
   * weder einen Fehler auslösen noch eine leere Zeile in der Akte erzeugen.
   */
  it("lässt ältere Bögen ohne die neuen Fragen unangetastet", () => {
    const alt: KennenlernenAntworten = {
      weg: "weg1", zeitProWoche: "vollzeit", leadPraeferenz: "eigen", gewerbe: "ja",
    };
    const gruppen = kennenlernenUeberblick(alt);
    const labels = gruppen.flatMap((g) => g.zeilen).map((z) => z.label);
    expect(labels).not.toContain("Bisherige Arbeit mit Leads");
    expect(labels).not.toContain("Abschlüsse aus zehn Leads");
    expect(gruppen.flatMap((g) => g.zeilen).every((z) => z.wert.trim() !== "")).toBe(true);
    expect(() => ansichtenFuer(alt)).not.toThrow();
  });
});

/*
 * E8, die Zusatzfrage „Wie arbeitest du heute?", seit dem 09.09.2026.
 *
 * Sie ersetzt eine sechste Gruppe „angestellt bei Bank oder Sparkasse": Ein
 * Bankmitarbeiter oder ein angestellter Makler kann an Nebentätigkeit und
 * Wettbewerbsverbot scheitern, und danach fragte ihn vorher niemand. Eine
 * Frage statt fünf zusätzlicher Textfassungen.
 */
describe("Die Frage nach der heutigen Arbeitsform", () => {
  const frageAuf = (weg: string) =>
    ansichtenFuer({ weg })
      .find((a) => a.id === "zeit")!
      .fragen!.find((f) => f.key === "arbeitsform")!;

  it("steht auf der Zeitansicht, hinter den beiden bestehenden Fragen", () => {
    const zeit = ANSICHTEN.find((a) => a.id === "zeit")!;
    expect(zeit.fragen!.map((f) => f.key)).toEqual(["zeitProWoche", "perspektive", "arbeitsform"]);
  });

  it("gilt für alle fünf Gruppen wörtlich gleich", () => {
    for (const weg of WEGE) {
      const f = frageAuf(weg.id);
      expect(f.frage, weg.id).toBe("Wie arbeitest du heute?");
      expect(f.hinweis, weg.id).toBe(
        "Das entscheidet, was wir vor einem Start miteinander klären müssen.",
      );
      expect(frageSichtbar(f, { weg: weg.id }), weg.id).toBe(true);
    }
  });

  it("bietet genau die vier Antworten aus der Vorgabe an", () => {
    const f = frageAuf("weg1");
    expect(f.optionen!.map((o) => o.label)).toEqual([
      "Ich bin angestellt",
      "Ich bin selbstständig",
      "Beides nebeneinander",
      "Zurzeit keins von beidem",
    ]);
  });

  it("fährt den Hinweiskasten nur bei „Ich bin angestellt“ ein", () => {
    const f = frageAuf("weg1");
    for (const wert of ["selbststaendig", "beides", "keins"]) {
      expect(antwortHinweisFuer(f, { arbeitsform: wert }), wert).toBeNull();
    }
    const kasten = antwortHinweisFuer(f, { arbeitsform: "angestellt" })!;
    expect(kasten.text).toContain("Nebentätigkeitsgenehmigung");
    expect(kasten.text).toContain("Wettbewerbsverbot");
    // Kein Ausschluss, sondern eine Klärung. Der Ton sagt das mit.
    expect(kasten.ton).toBe("hinweis");
    expect(kasten.text).toContain("sehr oft unproblematisch");
  });

  /*
   * Sie klärt eine Voraussetzung und misst keine Eignung. Angestellt zu sein
   * ist kein Minus, deshalb bekommt keine der vier Antworten Punkte.
   */
  it("verschiebt den Vorab-Score um keinen einzigen Punkt", () => {
    const basis: KennenlernenAntworten = {
      weg: "weg1", zeitProWoche: "vollzeit", perspektive: "sofort_haupt",
      leadPraeferenz: "beides", einkommensziel: "ueber_10000", startzeitpunkt: "sofort",
      gewerbe: "ja", erlaubnis34c: "ja", verstaendnisFixum: "nein", verstaendnisProvision: "nein",
      wegAntwort1: "ueber_10", wegAntwort3: "anleger",
    };
    const ohne = berechneVorabScore(antwortenZumSenden(basis))!;
    for (const wert of ["angestellt", "selbststaendig", "beides", "keins"]) {
      const mit = berechneVorabScore(antwortenZumSenden({ ...basis, arbeitsform: wert }))!;
      expect(mit.punkte, wert).toBe(ohne.punkte);
      expect(mit.rohPunkte, wert).toBe(ohne.rohPunkte);
      expect(mit.maxPunkte, wert).toBe(ohne.maxPunkte);
      expect(mit.posten.some((p) => p.key === "arbeitsform"), wert).toBe(false);
    }
  });

  /*
   * Der ganze Weg der Antwort: Sie muss im Katalog stehen, das Absenden
   * überleben und danach im Überblick wieder auftauchen. Fehlt eine der drei
   * Stellen, verschwindet sie stillschweigend.
   */
  it("steht im Katalog, übersteht das Absenden und steht im Überblick", () => {
    expect(KENNENLERNEN_KEYS).toContain("arbeitsform");
    const raus = antwortenZumSenden({ weg: "weg2", arbeitsform: "angestellt" });
    expect(raus.arbeitsform).toBe("angestellt");
    const zeilen = kennenlernenUeberblick(raus).flatMap((g) => g.zeilen);
    expect(zeilen.map((z) => `${z.label}: ${z.wert}`)).toContain(
      "Wie er heute arbeitet: Ich bin angestellt",
    );
  });

  it("lässt ältere Bögen ohne die Frage unangetastet", () => {
    const alt: KennenlernenAntworten = { weg: "weg1", zeitProWoche: "vollzeit", gewerbe: "ja" };
    const labels = kennenlernenUeberblick(alt).flatMap((g) => g.zeilen).map((z) => z.label);
    expect(labels).not.toContain("Wie er heute arbeitet");
  });
});

describe("Alt und neu im selben Feld", () => {
  it("erkennt den neuen Bogen am gewählten Weg", () => {
    expect(istKennenlernen({ weg: "weg3" })).toBe(true);
    expect(istKennenlernen({ hintergrund: ["immo"], zeitProWoche: "vollzeit" })).toBe(false);
    expect(istKennenlernen(null)).toBe(false);
    expect(istKennenlernen({ weg: "erfunden" })).toBe(false);
  });
});

describe("Der Monatskalender der Terminwahl", () => {
  it("beginnt jede Woche am Montag und füllt sie ganz", () => {
    // Der 1. September 2026 ist ein Dienstag, davor steht also genau ein Tag.
    const raster = monatsRaster("2026-09");
    expect(raster).toHaveLength(35);
    expect(raster[0].tag).toBe("2026-08-31");
    expect(raster[0].imMonat).toBe(false);
    expect(raster[1].tag).toBe("2026-09-01");
    expect(raster[1].imMonat).toBe(true);
    expect(raster.filter((k) => k.imMonat)).toHaveLength(30);
    expect(raster.length % 7).toBe(0);
  });

  it("kommt auch mit einem Monat zurecht, der am Montag beginnt", () => {
    // Der 1. Juni 2026 ist ein Montag.
    const raster = monatsRaster("2026-06");
    expect(raster[0].tag).toBe("2026-06-01");
    expect(raster[0].imMonat).toBe(true);
  });

  it("blättert über den Jahreswechsel", () => {
    expect(monatPlus("2026-12", 1)).toBe("2027-01");
    expect(monatPlus("2027-01", -1)).toBe("2026-12");
    expect(monatVon("2026-09-07")).toBe("2026-09");
    expect(monatName("2026-09")).toBe("September 2026");
    expect(tagesZahl("2026-09-07")).toBe(7);
  });
});
