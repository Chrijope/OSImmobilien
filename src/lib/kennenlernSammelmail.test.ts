/**
 * Wer die Sammelmail zum Kennenlernen bekommt, und wer nicht.
 *
 * Das ist eine Mail an eine Liste von Menschen, und jeder Fehler darin trifft
 * jemanden persönlich: Wer seine Antworten längst geschickt hat und trotzdem
 * aufgefordert wird, hält uns für unaufmerksam. Deshalb steht jede der drei
 * Bedingungen hier einzeln.
 *
 * Die Regel liegt in `supabase/functions/_shared/bewerber-nachfass.ts`. Weil
 * Vitest keine Deno-Datei einbinden kann, prüft dieser Test sie als Quelltext
 * und baut ihre Logik daneben nach. Dasselbe Verfahren wie in
 * `kennenlernenVersand.test.ts`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const QUELLE = resolve(__dirname, "../../supabase/functions/_shared/bewerber-nachfass.ts");
const text = readFileSync(QUELLE, "utf8");

/** Der Teil der Datei, der die neue Auswahl beschreibt. */
function auswahlBlock(): string {
  const i = text.indexOf("export function waehleKennenlernNachfassEmpfaenger");
  expect(i, "Die Auswahlregel fehlt").toBeGreaterThan(-1);
  return text.slice(i);
}

describe("Sammelmail zum Kennenlernen: wer sie bekommt", () => {
  const block = auswahlBlock();

  it("nimmt nur Bewerber im Status Eingang", () => {
    expect(block).toContain("!== 'Eingang'");
  });

  it("ueberspringt, wer den Kennenlernbogen schon abgeschickt hat", () => {
    expect(block).toContain("bogenEingereicht.has(k.id)");
    expect(block).toContain("Kennenlernen schon abgeschickt");
  });

  it("schliesst den frueheren Vorab-Bogen NICHT mehr aus", () => {
    /*
     * Geaendert am 12.09.2026 auf Christians ausdrueckliche Entscheidung.
     *
     * Bis dahin galt der Vorab-Bogen als erledigt, und die erste Welle ging
     * deshalb nur an 36 von 166 Bewerbern im Eingang. Der Vorab-Bogen ist
     * aber ein anderer Bogen mit anderen Fragen: Wer ihn ausgefuellt hat,
     * hat das Kennenlernen trotzdem noch nicht gesehen.
     *
     * Dieser Test steht bewusst in der Umkehrung da, wo vorher der Ausschluss
     * geprueft wurde. Wer ihn wieder einbaut, soll hier darueber stolpern und
     * die Entscheidung sehen, statt sie stillschweigend zurueckzudrehen.
     */
    expect(block).not.toContain("vorabEingereicht");
    expect(block).not.toContain("Vorab-Bogen schon ausgefuellt");
  });

  it("laesst den Kennenlernbogen als einzigen Bogen ausschliessen", () => {
    // Wer beide ausgefuellt hat, faellt weiterhin heraus, aber wegen diesem.
    expect(block).toContain("bogenEingereicht");
  });

  it("verschickt keine zweite Mail an denselben Bewerber", () => {
    expect(block).toContain("klNachfassMailAm");
  });

  it("ueberspringt Bewerber ohne Mailadresse", () => {
    expect(block).toContain("hatMailadresse(k)");
  });

  it("weist eine gesperrte Adresse eigens aus, statt sie still zu ueberspringen", () => {
    /*
     * Steht die Adresse in `suppressed_emails`, geht an sie keine Mail mehr
     * hinaus. Bis zum 14.09.2026 standen diese Bewerber trotzdem in der
     * Empfaengerliste, ihr Versand scheiterte jedes Mal, und danach lagen sie
     * wieder im Eingang wie jeder andere. Sie sind keine Versandaufgabe,
     * sondern ein Fall fuer einen Menschen.
     */
    expect(block).toContain("gesperrteAdressen.has(normalisiereMail(k.email))");
    expect(block).toContain("Adresse gesperrt");
  });

  it("liest die Sperrliste nicht selbst, sondern bekommt sie uebergeben", () => {
    // Dieselbe Bauweise wie beim Bogenstand: Die Regel rechnet, der Aufrufer
    // liest. Sonst braeuchte sie einen Datenbankzugang und waere nicht pruefbar.
    expect(block).toContain("gesperrteAdressen: Set<string> = new Set()");
  });

  it("benutzt einen eigenen Merker und nicht den der ersten Sammelmail", () => {
    /*
     * Die erste Sammelmail merkt sich `nachfassMailAm`. Wuerde die zweite
     * denselben Merker lesen, bekaeme niemand sie, der die erste schon hatte,
     * und das waeren fast alle. Der Merker muss also ein anderer sein.
     */
    expect(block).not.toContain("meta?.nachfassMailAm");
  });
});

describe("Der Wortlaut der Sammelmail", () => {
  it("nennt den Grund fuer den Bogen, ohne von einer Aenderung zu sprechen", () => {
    // Christians Vorgabe: nur auf den Bogen eingehen, nichts erklaeren.
    const i = text.indexOf("export const KL_NACHFASS_DANKE");
    const absatz = text.slice(i, i + 400);
    expect(absatz).toContain("vertrieblichen");
    expect(absatz).toContain("Kennenlernen zum Durchklicken");
    for (const wort of ["geändert", "ersetzt", "neuer Ablauf", "Vorab-Bogen"]) {
      expect(absatz, `"${wort}" gehoert nicht in den ersten Absatz`).not.toContain(wort);
    }
  });

  it("zaehlt die fuenf Punkte auf, die der Bogen abdeckt", () => {
    const i = text.indexOf("export const KL_NACHFASS_PUNKTE");
    const liste = text.slice(i, text.indexOf("] as const", i));
    expect(liste).toContain("wer wir sind");
    expect(liste).toContain("Rahmenbedingungen");
    // Seit 26.09.2026 "Vergütung" statt "was du verdienst" (Spamfilter).
    expect(liste).toContain("wie die Vergütung aufgebaut ist");
  });

  it("nennt keine Provisionshoehe", () => {
    /*
     * Eine Zahl in einer Sammelmail ist eine Zusage, fuer die der
     * Vertriebspartnervertrag geradestehen muss. Im Bogen selbst steht sie,
     * dort ist der richtige Ort.
     */
    const i = text.indexOf("export const KL_NACHFASS_BETREFF");
    const teil = text.slice(i);
    expect(teil).not.toMatch(/\d+\s?(Prozent|%)/);
  });

  it("laedt ausdruecklich zur Absage ein und verspricht Ruhe danach", () => {
    expect(text).toContain("KL_NACHFASS_ABSAGE");
    const i = text.indexOf("export const KL_NACHFASS_ABSAGE ");
    const absatz = text.slice(i, i + 300);
    expect(absatz).toContain("hören wir auf zu schreiben");
  });
});
