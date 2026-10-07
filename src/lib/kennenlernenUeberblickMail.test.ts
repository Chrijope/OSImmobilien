import { describe, it, expect } from "vitest";
import {
  ANSICHTEN,
  WEGE,
  ansichtenFuer,
  gespraechsDauerMinuten,
  istKennenlernen as istKennenlernenCrm,
  kennenlernenUeberblick,
  type KennenlernenAntworten,
} from "@/lib/bewerberKennenlernen";
import {
  UEBERBLICK_FRAGEN,
  UEBERBLICK_GRUPPEN,
  dauerMinuten,
  istKennenlernen,
  ueberblickFuerMail,
} from "../../supabase/functions/_shared/bewerber-kennenlernen-ueberblick";

/**
 * Die Beschriftungen des Kennenlernens stehen zweimal im Projekt.
 *
 * Maßgeblich ist der Katalog in `src/lib/bewerberKennenlernen.ts`. Die zweite
 * Fassung liegt unter `supabase/functions/_shared/`, weil die Mail nach dem
 * Absenden aus einer Edge Function kommt und die in Deno läuft: Sie kann `src`
 * nicht erreichen. Ohne diese zweite Fassung stünde in der Mail
 * „zeitProWoche: 10_bis_20" statt einer lesbaren Antwort.
 *
 * Zwei Fassungen derselben Liste laufen auseinander, und bemerkt wird es
 * zuerst vom Bewerber. Dieser Test vergleicht sie deshalb Wert für Wert: Wer
 * eine Option ändert, hinzufügt oder umbenennt und die zweite Fassung
 * vergisst, bekommt hier einen roten Test.
 */

/** Nur die Felder vergleichen, die in der Mail landen. */
function crmUeberblick(antworten: KennenlernenAntworten) {
  return kennenlernenUeberblick(antworten).map((g) => ({
    titel: g.titel,
    zeilen: g.zeilen.map((z) => ({ label: z.label, wert: z.wert })),
  }));
}

describe("Der Überblick in der Mail", () => {
  /**
   * Die gefährlichste Stelle des Umbaus, deshalb ein eigener Test dafür.
   *
   * Die fünf Gruppenbeschriftungen („Ich verkaufe schon Immobilien" und die
   * vier anderen) stehen zweimal im Projekt: im Katalog `WEGE` für Bogen und
   * Oberfläche, und wörtlich abgeschrieben in der Mailfunktion. Wer eine
   * ändert und die zweite vergisst, bekommt eine Zusammenfassungsmail, in der
   * bei „Der gewählte Weg" nichts oder etwas Falsches steht. Der Vergleich
   * unten prüft Schlüssel, Reihenfolge und Wortlaut zugleich und nennt beim
   * Fehlschlag genau die Gruppe, die auseinandergelaufen ist.
   */
  it("beschriftet die fünf Gruppen wörtlich so wie der Bogen", () => {
    const imBogen = Object.fromEntries(WEGE.map((w) => [w.id, w.label]));
    const inDerMail = UEBERBLICK_FRAGEN.weg?.optionen ?? {};

    expect(Object.keys(inDerMail)).toEqual(Object.keys(imBogen));
    for (const [id, label] of Object.entries(imBogen)) {
      expect(
        inDerMail[id],
        `Die Gruppe ${id} heißt im Bogen „${label}" und in der Mailfunktion anders`,
      ).toBe(label);
    }

    // Und die Beschriftung der Zeile selbst, sonst steht in der Mail ein
    // anderes Wort links als auf dem Bildschirm.
    const weiche = ANSICHTEN.flatMap((a) => a.fragen ?? []).find((f) => f.key === "weg")!;
    expect(UEBERBLICK_FRAGEN.weg?.kurz).toBe(weiche.kurz);

    // Sicherung gegen einen Test, der aus Versehen nichts prüft.
    expect(Object.keys(imBogen)).toHaveLength(5);
  });

  it("kennt dieselben Gruppen in derselben Reihenfolge", () => {
    // Ein vollständig ausgefüllter Bogen zeigt alle drei Gruppen.
    const antworten: KennenlernenAntworten = {
      weg: "weg1",
      zeitProWoche: "vollzeit",
      gewerbe: "ja",
      themen: ["verdienst"],
    };
    expect(ueberblickFuerMail(antworten).map((g) => g.titel)).toEqual(
      crmUeberblick(antworten).map((g) => g.titel),
    );
    expect(UEBERBLICK_GRUPPEN).toHaveLength(3);
  });

  /**
   * Der eigentliche Wächter: jede Frage des Überblicks, jede Option, auf jedem
   * der fünf Wege. `wegAntwort1` und `wegAntwort2` tragen je Weg eine andere
   * Frage, deshalb die äußere Schleife.
   */
  it("beschriftet jede Antwort genau wie der Bogen selbst", () => {
    const keys = UEBERBLICK_GRUPPEN.flatMap((g) => g.keys);
    let geprueft = 0;

    for (const weg of WEGE) {
      const fragen = ansichtenFuer({ weg: weg.id }).flatMap((a) => a.fragen ?? []);
      for (const frage of fragen) {
        if (!keys.includes(frage.key)) continue;
        const werte = frage.optionen?.map((o) => o.value) ?? ["Ein freier Text zur Probe"];
        for (const wert of werte) {
          const antworten: KennenlernenAntworten = {
            weg: weg.id,
            [frage.key]: frage.typ === "mehrfach" ? [wert] : wert,
          };
          expect(ueberblickFuerMail(antworten)).toEqual(crmUeberblick(antworten));
          geprueft++;
        }
      }
    }

    // Sicherung gegen eine Schleife, die aus Versehen nichts prüft.
    expect(geprueft).toBeGreaterThan(50);
  });

  it("führt jede Mehrfachauswahl als eine Zeile mit Komma", () => {
    const antworten: KennenlernenAntworten = {
      weg: "weg1",
      themen: ["verdienst", "leads"],
    };
    expect(ueberblickFuerMail(antworten)).toEqual(crmUeberblick(antworten));
  });

  it("lässt leere Angaben weg, statt eine leere Zeile zu zeigen", () => {
    const antworten: KennenlernenAntworten = { weg: "weg2", eigeneFrage: "", themen: [] };
    const mail = ueberblickFuerMail(antworten);
    expect(mail).toEqual(crmUeberblick(antworten));
    expect(mail.some((g) => g.zeilen.some((z) => z.wert.trim() === ""))).toBe(false);
  });

  /**
   * Die eine bewusste Abweichung.
   *
   * Ein Text aus lauter Leerzeichen kann die Mail gar nicht erreichen:
   * `antwortenZumSenden` schneidet ihn vorher weg. Sollte er es doch einmal
   * tun, zeigt der Bildschirm eine leere Zeile, die Mail lässt sie weg. Das
   * ist Absicht und keine Nachlässigkeit, denn eine leere Zeile in einer Mail
   * sieht nach einem Fehler aus und lässt sich nicht wegklicken.
   */
  it("lässt einen Text aus lauter Leerzeichen bewusst weg", () => {
    const mail = ueberblickFuerMail({ weg: "weg2", eigeneFrage: "   " });
    expect(mail.some((g) => g.zeilen.some((z) => z.label === "Eigene Frage"))).toBe(false);
  });

  it("deckt alle Schlüssel des Überblicks ab, auch neu hinzugekommene", () => {
    // Der Katalog im CRM ist maßgeblich. Taucht dort eine Frage mit einem der
    // Überblick-Schlüssel auf, die hier keine Beschriftung hat, faellt sie im
    // Vergleich oben auf; dieser Test benennt zusätzlich den Fall, dass die
    // Gruppen selbst auseinanderlaufen.
    const crmKeys = new Set(
      ANSICHTEN.flatMap((a) => a.fragen ?? []).map((f) => f.key),
    );
    for (const weg of WEGE) {
      for (const a of weg.ansichten) {
        if (a.frage) crmKeys.add(a.frage.key);
        // Die Freitextergänzung hinter „Etwas anderes" hängt als Folgefrage an
        // der Hauptfrage und geht genauso in die Mail.
        if (a.folgefrage) crmKeys.add(a.folgefrage.key);
      }
    }
    for (const key of UEBERBLICK_GRUPPEN.flatMap((g) => g.keys)) {
      expect(crmKeys.has(key), `Der Schlüssel ${key} steht im Überblick der Mail, aber nicht im Bogen`).toBe(true);
    }
  });
});

describe("Die abgeleiteten Werte", () => {
  it("rechnet dieselbe Gesprächsdauer wie der Bogen", () => {
    const faelle: KennenlernenAntworten[] = [
      {},
      { themen: [] },
      { themen: ["verdienst"] },
      { eigeneFrage: "Wie läuft die Einarbeitung?" },
      { eigeneFrage: "   " },
      { themen: ["kosten"], eigeneFrage: "Noch eine Frage" },
    ];
    for (const antworten of faelle) {
      expect(dauerMinuten(antworten)).toBe(gespraechsDauerMinuten(antworten));
    }
  });

  it("erkennt den neuen Bogen an demselben Merkmal wie das CRM", () => {
    for (const weg of WEGE) {
      expect(istKennenlernen({ weg: weg.id })).toBe(istKennenlernenCrm({ weg: weg.id }));
    }
    expect(istKennenlernen({})).toBe(false);
    expect(istKennenlernen({ weg: "weg99" })).toBe(false);
    expect(istKennenlernen(null)).toBe(false);
  });
});
