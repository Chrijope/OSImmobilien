import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Wohin der Bewerber geschickt wird, und wohin HR.
 *
 * Zum Videoraum führen zwei Adressen, und sie sehen einander ähnlich:
 *
 *   `/raum/<token>`            Gastansicht. Namensfenster, Technikprüfung,
 *                              Warteraum. Dorthin gehört der Bewerber.
 *   `/videocall/raum/<id>`     Gastgeberansicht. Raum öffnen, Wartende
 *                              einlassen, Mitschrift. Dorthin gehört HR.
 *
 * Die beiden unterscheiden sich nicht nur im Weg, sondern auch im Schlüssel:
 * Der Gast weist sich mit dem **Token** des Raums aus, der Gastgeber wird über
 * die **Kennung** des Raums angesprochen und muss dafür angemeldet sein. Die
 * Zeilensicherheit auf `videoraeume` lässt nur den Gastgeber und
 * Administratoren an eine Zeile, und zwar nur als `authenticated`. Ein
 * Bewerber ohne Konto bekommt dort nichts, selbst wenn ihm jemand die
 * Gastgeberadresse schickt.
 *
 * Trotzdem gehört dieser Wächter hierher. Im Versand stehen beide Adressen als
 * zwei Variablen nebeneinander, `raumUrl` und `gastgeberUrl`, und wer sie
 * vertauscht, bricht nichts, was ein Test bisher bemerkt hätte: Die Mail geht
 * hinaus, sieht richtig aus, und der Bewerber landet vor einer Anmeldemaske
 * statt in seinem Warteraum. Genau diese Verwechslung ist am 12.09.2026 schon
 * einmal vorgekommen, damals in der anderen Richtung: Beide Mails trugen den
 * Gastlink, und HR wartete darauf, von sich selbst eingelassen zu werden.
 *
 * Geprüft wird der Quelltext, nicht das Verhalten. Die Functions laufen unter
 * Deno und laden ihre Abhängigkeiten über npm- und https-Angaben; für Vitest
 * sind sie nicht ausführbar. Lesen lässt sich ihr Text aber, und die Zeilen,
 * um die es geht, sind eindeutig.
 */

const wurzel = join(__dirname, "..", "..");
const lies = (...teile: string[]) => readFileSync(join(wurzel, ...teile), "utf8");

const VORLAGEN = ["supabase", "functions", "_shared", "transactional-email-templates"];

const terminVersand = lies("supabase", "functions", "send-bewerber-termin", "index.ts");
const erinnerungen = lies("supabase", "functions", "send-bewerber-erstgespraech-reminders", "index.ts");

/**
 * Der Teil des Versands, der zu einer Vorlage gehört.
 *
 * Die beiden Mails werden nacheinander gebaut. Der Abschnitt einer Vorlage
 * beginnt bei ihrem Namen und endet dort, wo der nächste anfängt. Ohne diese
 * Trennung würde ein Test, der nur die ganze Datei durchsucht, jede
 * Vertauschung durchwinken: Beide Zeichenketten stehen dann ja darin.
 */
function abschnitt(quelle: string, vorlage: string, naechste?: string): string {
  const start = quelle.indexOf(`templateName: "${vorlage}"`);
  expect(start, `Vorlage ${vorlage} kommt im Versand nicht vor`).toBeGreaterThan(-1);
  const ende = naechste ? quelle.indexOf(`templateName: "${naechste}"`) : -1;
  return ende > start ? quelle.slice(start, ende) : quelle.slice(start);
}

describe("Die Terminmails treffen die richtige Ansicht", () => {
  it("baut beide Adressen aus den richtigen Teilen", () => {
    // Der Gastlink aus dem Token des Raums.
    expect(terminVersand).toContain("raumUrl = `${basisAdresse}/raum/${raum.token}`");
    // Die Gastgeberansicht aus der Kennung der Buchung.
    expect(terminVersand).toContain(
      "gastgeberUrl = `${basisAdresse}/videocall/raum/${buchung.videoraum_id}`",
    );
  });

  it("schickt den Bewerber in seinen Warteraum, nicht in die Gastgeberansicht", () => {
    const bewerber = abschnitt(terminVersand, "bewerber-termin-bestaetigung");
    expect(bewerber).toContain("zugangUrl: raumUrl");
    expect(bewerber).not.toContain("gastgeberUrl");
    expect(bewerber).not.toContain("/videocall/raum/");
  });

  it("schickt HR in die Gastgeberansicht, nicht in den Warteraum", () => {
    const hr = abschnitt(terminVersand, "bewerber-termin-hr", "bewerber-termin-bestaetigung");
    expect(hr).toContain("zugangUrl: gastgeberUrl");
    expect(hr).not.toContain("zugangUrl: raumUrl");
  });

  it("trägt auch in der Kalenderdatei des Bewerbers den Gastlink", () => {
    // Ort und Beschreibung des Termins. Wer den Eintrag im Kalender anklickt,
    // muss dort landen, wo der Knopf in der Mail hinführt.
    expect(terminVersand).toContain("ort: raumUrl");
    expect(terminVersand).toContain("`Videoraum: ${raumUrl}`");
  });
});

describe("Die Erinnerungen an den Termin", () => {
  it("führen den Bewerber ebenfalls in den Warteraum", () => {
    expect(erinnerungen).toContain("zugangUrl = `${APP_BASE_URL}/raum/${raum.token}`");
    // Diese Function schreibt ausschließlich an den Bewerber. Die
    // Gastgeberansicht hat in ihr nichts verloren.
    expect(erinnerungen).not.toContain("/videocall/raum/");
  });
});

/**
 * Die Vorlagen selbst.
 *
 * Eine Adresse kann auch in der Vorlage entstehen, etwa in den
 * Vorschaudaten, die im Vorlagenkatalog angezeigt werden. Stünde dort die
 * Gastgeberansicht, würde jeder, der sich an der Vorschau orientiert, den
 * Fehler wieder einbauen.
 */
describe("Die Mailvorlagen des Bewerbers kennen die Gastgeberansicht nicht", () => {
  const bewerberVorlagen = [
    "bewerber-termin-bestaetigung.tsx",
    "bewerber-videocall-erinnerung.tsx",
    "bewerber-erstgespraech-erinnerung.tsx",
    "bewerber-closing-erinnerung.tsx",
  ];

  for (const datei of bewerberVorlagen) {
    it(`${datei} enthält keine Gastgeberadresse`, () => {
      expect(lies(...VORLAGEN, datei)).not.toContain("/videocall/raum/");
    });
  }

  it("die Meldung an HR dagegen schon", () => {
    // Gegenprobe. Ohne sie ließe sich der Wächter erfüllen, indem man die
    // Gastgeberansicht überall entfernt und HR wieder im Warteraum sitzt.
    const hrVorlage = lies(...VORLAGEN, "bewerber-termin-hr.tsx");
    expect(hrVorlage).toContain("/videocall/raum/");
  });
});

/**
 * Die Seiten, die der Bewerber ohne Konto zu sehen bekommt.
 *
 * Sie liegen außerhalb der Anmeldung. Ein Link von dort in die
 * Gastgeberansicht wäre eine Sackgasse: Die Seite verlangt eine Anmeldung, und
 * selbst mit Konto gibt die Zeilensicherheit dem Bewerber keine Raumzeile.
 */
describe("Die öffentlichen Bewerberseiten verlinken keine Gastgeberansicht", () => {
  const seiten = [
    "BewerberKooperationsgespraech.tsx",
    "BewerberKennenlernen.tsx",
    "BewerberSeite.tsx",
    "BewerberFormularPublic.tsx",
  ];

  for (const datei of seiten) {
    it(`${datei} führt nirgends auf /videocall/raum/`, () => {
      expect(lies("src", "pages", datei)).not.toContain("/videocall/raum/");
    });
  }
});
