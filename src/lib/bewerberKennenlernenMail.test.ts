import { describe, it, expect } from "vitest";
import {
  ABMELDE_TEXT,
  ERINNERUNG_1_NICHT_BEGONNEN,
  ERINNERUNG_1_VORSCHAU_NICHT_BEGONNEN,
  ERINNERUNG_1_UNTERBROCHEN,
  ERINNERUNG_TAG_1,
  ERINNERUNG_3_OFFEN,
  ERINNERUNG_3_TEXT,
  ERINNERUNG_3_TITEL,
  ERINNERUNG_TAG_3,
  KENNENLERNEN_ABSAGE_HINWEIS,
  KENNENLERNEN_BASIS_URL,
  KENNENLERNEN_DANKE,
  KENNENLERNEN_EINLADUNG,
  KENNENLERNEN_GESPRAECH,
  KENNENLERNEN_GUELTIG_TAGE,
  KENNENLERNEN_KNOPF_HINWEIS,
  KENNENLERNEN_PUNKTE,
  HR_SAMMEL_EMAIL,
  HR_SICHTUNG_TITEL,
  SICHTUNG_TAG,
  SICHTUNG_TAG_2,
  buchungHrText,
  erinnerung3Notiz,
  kennenlernenAntwortAdresse,
  kennenlernenHinweis,
  kennenlernenLinkHinweis,
  sichtungHrBetreff,
  sichtungHrText,
  BUCHUNG_ERINNERUNG_2_TEXT,
  BUCHUNG_ERINNERUNG_KNOPF,
  BUCHUNG_ERINNERUNG_TAG,
  BUCHUNG_ERINNERUNG_TAG_2,
  BUCHUNG_HR_TAG,
  BUCHUNG_ERINNERUNG_TEXT,
  ZUSAMMENFASSUNG_EINLEITUNG,
  ZUSAMMENFASSUNG_KORREKTUR,
  ZUSAMMENFASSUNG_MELDEN,
  ZUSAMMENFASSUNG_TITEL,
  ZUSAMMENFASSUNG_VORSCHAU,
  ZUSAMMENFASSUNG_VORSCHAU_TERMIN,
  terminDatumLang,
  zusammenfassungKnopfHinweis,
  zusammenfassungMailFelder,
  zusammenfassungTerminSatz,
} from "../../supabase/functions/_shared/bewerber-kennenlernen-mail";
import * as MAILTEXTE from "../../supabase/functions/_shared/bewerber-kennenlernen-mail";
import { BEWERBER_BUCHUNGSLINK } from "../../supabase/functions/_shared/bewerber-eingangsmail";
import {
  ERINNERUNG_TAG_1 as CRM_TAG_1,
  ERINNERUNG_TAG_3 as CRM_TAG_11,
} from "@/lib/kennenlernenErinnerungen";
import { KENNENLERNEN_GUELTIG_TAGE as CRM_GUELTIG } from "@/lib/bewerberKennenlernen";

/**
 * Der Wortlaut der Mails des neuen Bewerberprozesses.
 *
 * Zwei Dinge werden hier bewacht: dass die Eingangsmail genau eine Aufgabe hat,
 * und dass die Zahlen in der Mail dieselben sind wie im CRM. Beides ist schon
 * einmal auseinandergelaufen: Bis zum 02.09.2026 versprach die alte
 * Eingangsmail zehn Fragen, während der Katalog längst dreizehn hatte.
 */

describe("Die Eingangsmail des Kennenlernens", () => {
  it("führt auf die eigene Seite und nicht auf einen fremden Kalender", () => {
    expect(KENNENLERNEN_BASIS_URL).toBe("https://osimmobilien.netlify.app/kennenlernen");
    const ganzeMail = [
      KENNENLERNEN_DANKE,
      KENNENLERNEN_EINLADUNG,
      ...KENNENLERNEN_PUNKTE,
      KENNENLERNEN_GESPRAECH,
      kennenlernenHinweis(),
    ].join(" ");
    expect(ganzeMail).not.toContain("calendly");
    expect(ganzeMail).not.toContain(BEWERBER_BUCHUNGSLINK);
  });

  /*
   * Bis zum 19.09.2026 verbot dieser Test JEDE Minutenangabe. Die Begründung
   * war richtig: Man soll keine Zeit erfinden, die niemand gemessen hat.
   *
   * Die Folge war aber schlimmer als das Problem. Die Mail versprach „sieben
   * kurze Kapitel" und „ein paar Fragen", dahinter stehen 21 Ansichten und 19
   * Fragen. Wer klickte und „Ansicht 1 von 21" las, erlebte den Bruch in der
   * ersten Sekunde und stieg genau dort aus.
   *
   * Christian hat entschieden, die Erwartung vor dem Klick zu setzen. Die 15
   * Minuten sind eine begründete Schätzung aus dem Abzählen der Ansichten und
   * Pflichtfragen, keine Messung, und sie stehen deshalb mit „Etwa" davor.
   *
   * Was der Test weiterhin verhindert: eine Zeitangabe im Fließtext, wo sie
   * wie eine Zusage klingt, und eine in den Erinnerungen, die eine andere Zahl
   * nennen könnte als die Einladung.
   */
  it("nennt die Dauer nur unter dem Knopf, und ausdrücklich als Schätzung", () => {
    const fliesstext = [
      KENNENLERNEN_DANKE,
      KENNENLERNEN_EINLADUNG,
      ...KENNENLERNEN_PUNKTE,
      KENNENLERNEN_GESPRAECH,
      kennenlernenHinweis(),
    ].join(" ");
    expect(fliesstext).not.toMatch(/Minuten|Minute\b/);

    expect(KENNENLERNEN_KNOPF_HINWEIS).toMatch(/^Etwa \d+ Minuten/);
    // Keine Gültigkeitsangabe unter dem Knopf der Einladung: Sie sagt dem
    // Leser, dass es Zeit hat, und arbeitet damit gegen den Knopf.
    expect(KENNENLERNEN_KNOPF_HINWEIS).not.toMatch(/Monat|Tage/);

    // Die Erinnerungen machen weiterhin keine Zeitzusage.
    expect(kennenlernenLinkHinweis(14)).not.toMatch(/Minuten/);
    expect(ERINNERUNG_1_VORSCHAU_NICHT_BEGONNEN).not.toMatch(/Minuten/);
  });

  it("sagt den Anruf nicht zu, denn den Begrüßungsanruf gibt es nicht mehr", () => {
    const ganzeMail = [
      KENNENLERNEN_DANKE,
      KENNENLERNEN_EINLADUNG,
      ...KENNENLERNEN_PUNKTE,
      KENNENLERNEN_GESPRAECH,
      kennenlernenHinweis(),
    ].join(" ");
    expect(ganzeMail).not.toMatch(/melden uns .*telefonisch|rufen dich an/i);
  });

  it("sagt zuerst, was der Bewerber bekommt, und erst dann, was wir wollen", () => {
    // Christians Punkte A1 und A3. Der alte Anfang „Statt eines Fragebogens"
    // erklaerte, was es NICHT ist, und das am staerksten Platz der Mail.
    expect(KENNENLERNEN_EINLADUNG).toMatch(/^Bevor wir miteinander sprechen/);
    // „kurze" ist am 19.09.2026 gefallen: 21 Ansichten widerlegen das Wort,
    // und der Leser merkt es eine Sekunde nach dem Klick.
    expect(KENNENLERNEN_EINLADUNG).toMatch(/sieben Kapitel/);
    expect(KENNENLERNEN_EINLADUNG).not.toMatch(/kurze Kapitel/);
    // Eine Einladung, keine Anweisung: „möchten wir, dass du uns kennst" war
    // eine Aufforderung im Gewand einer Einladung.
    expect(KENNENLERNEN_EINLADUNG).not.toMatch(/möchten wir, dass/);
    expect(KENNENLERNEN_EINLADUNG).not.toMatch(/Statt eines Fragebogens/);
    expect(KENNENLERNEN_PUNKTE).toHaveLength(4);
    expect(KENNENLERNEN_PUNKTE.join(" ")).toMatch(/kein(em)? Portal/);
    expect(KENNENLERNEN_GESPRAECH).toMatch(/persönliche[nms]? Gespräch/);
  });

  it("kündigt die Kontaktdaten an, statt die Adresse zu wiederholen", () => {
    /*
     * Christians Punkt P10, in zwei Schritten. Zuerst hieß es „antworte
     * einfach auf diese Mail", das ging an niemanden. Dann stand die Adresse
     * als Link im Satz, doch sie steht ohnehin gleich darunter im Block der
     * Ansprechpartnerin, mit Telefon und Bild. Jetzt kündigt der Satz sie nur
     * noch an. Dass eine Antwort trotzdem bei ihr landet, sichert das
     * Reply-To der Mail, nicht dieser Text.
     */
    const text = kennenlernenHinweis("os@os-immobilien.com");
    expect(text).toMatch(/melde dich gerne/);
    expect(text).toMatch(/Kontaktdaten/);
    expect(text).not.toMatch(/antworte einfach auf diese Mail/);
    expect(text).not.toContain("os@os-immobilien.com");
  });

  it("weist unter der Unterschrift auf den Weg zur Absage hin", () => {
    // Nach den Kontaktdaten, nicht davor: Wer absagen will, soll es leicht
    // finden, aber die Einladung soll nicht damit enden.
    expect(KENNENLERNEN_ABSAGE_HINWEIS).toMatch(/nicht mehr aktuell/);
    expect(KENNENLERNEN_ABSAGE_HINWEIS).toMatch(/Kennenlernbogen/);
  });

  it("fällt ohne Ansprechpartnerin auf die Sammeladresse zurück", () => {
    expect(HR_SAMMEL_EMAIL).toBe("os@os-immobilien.com");
    expect(kennenlernenAntwortAdresse(undefined)).toBe(HR_SAMMEL_EMAIL);
    expect(kennenlernenAntwortAdresse("")).toBe(HR_SAMMEL_EMAIL);
    expect(kennenlernenAntwortAdresse("   ")).toBe(HR_SAMMEL_EMAIL);
    // Was keine Adresse ist, wird auch nicht als eine ausgegeben.
    expect(kennenlernenAntwortAdresse("Sarah")).toBe(HR_SAMMEL_EMAIL);
    expect(kennenlernenAntwortAdresse(" os@os-immobilien.com ")).toBe("os@os-immobilien.com");
    // Die Adresse steht nicht mehr im Satz, sondern nur noch im Reply-To und
    // im Block der Ansprechpartnerin. Geprüft wird deshalb der Rückfall
    // selbst, nicht mehr der Text.
  });

  it("nennt dieselbe Gültigkeit wie der Bogen im CRM", () => {
    expect(KENNENLERNEN_GUELTIG_TAGE).toBe(CRM_GUELTIG);
    /*
     * Der Hinweis nennt seit dem 14.09.2026 Monate statt Tage: "der Link gilt
     * 180 Tage" ist richtig, aber niemand rechnet das im Kopf um. Geprueft
     * wird deshalb nicht mehr die feste Zahl, sondern dass Mail und CRM
     * denselben Zeitraum gleich benennen.
     */
    expect(kennenlernenLinkHinweis(KENNENLERNEN_GUELTIG_TAGE)).toContain("sechs Monate");
  });
});

describe("Die Erinnerungskette", () => {
  it("nennt in Mail und CRM dieselben Tage", () => {
    expect(ERINNERUNG_TAG_1).toBe(CRM_TAG_1);
    expect(ERINNERUNG_TAG_3).toBe(CRM_TAG_11);
  });

  /*
   * Tag 8 ist am 26.09.2026 entfallen, mit ihm die Texte der Mail „Unsere
   * letzte Erinnerung". Der Wortlaut von Tag 11 darf sich deshalb auf keine
   * vorherige Ankündigung stützen und nicht mehr Mails behaupten, als es gab.
   */
  it("hat keine Texte für Tag 8 mehr", () => {
    const exporte = Object.keys(MAILTEXTE);
    expect(exporte.filter((name) => /^ERINNERUNG_2_|^ERINNERUNG_TAG_2$/.test(name))).toEqual([]);
  });

  it("verweist an Tag 11 auf keine vorherige Ankündigung", () => {
    expect(ERINNERUNG_3_TEXT).not.toMatch(/wie angekündigt|letzte Erinnerung|ein paar Mal|mehrfach|dreimal/);
  });

  it("hat zwei Wortfassungen für denselben Tag, nicht zwei Ketten", () => {
    expect(ERINNERUNG_1_NICHT_BEGONNEN).not.toBe(ERINNERUNG_1_UNTERBROCHEN);
    expect(ERINNERUNG_1_UNTERBROCHEN).toMatch(/unterbrochen/);
    expect(ERINNERUNG_1_NICHT_BEGONNEN).toMatch(/unangetastet/);
  });

  it("trägt den Abmeldeknopf, der bisher nur in der Nachfass-Mail stand", () => {
    expect(ABMELDE_TEXT).toBe("Kein Interesse mehr");
  });

  /*
   * Tag 11 geht seit dem 14.09.2026 an den Bewerber, nicht mehr an HR. Die
   * Mail sagt, dass wir ihn nicht erreicht haben, dass wir zunächst schließen,
   * und dass eine Rückmeldung weiterhin willkommen ist. Genau diese drei
   * Aussagen werden hier bewacht.
   */
  it("schreibt an Tag 11 an den Bewerber und lässt die Tür offen", () => {
    expect(ERINNERUNG_TAG_3).toBe(11);
    expect(ERINNERUNG_3_TITEL).toMatch(/nicht erreicht/);
    expect(ERINNERUNG_3_TEXT).toMatch(/nichts gehört/);
    expect(ERINNERUNG_3_TEXT).toMatch(/schließen deine Bewerbung/);
    expect(ERINNERUNG_3_OFFEN).toMatch(/Interesse/);
    expect(ERINNERUNG_3_OFFEN).toMatch(/Keine Frist|Eine Frist gibt es dafür nicht/);
  });

  it("erklärt die Statusänderung im Verlauf der Akte", () => {
    const geschlossen = erinnerung3Notiz(true);
    expect(geschlossen).toMatch(/Kein Interesse/);
    expect(geschlossen).toContain("11 Tagen");

    // Wer inzwischen weiter ist, behält seinen Stand, und der Eintrag sagt es.
    const stehen = erinnerung3Notiz(false, "Closing");
    expect(stehen).toMatch(/blieb auf Closing/);
    expect(stehen).toMatch(/bitte prüfen/);
  });
});

/**
 * Nachricht 3 und die eine Erinnerung danach.
 *
 * Die letzte Ansicht des Kennenlernens verspricht dem Bewerber woertlich eine
 * Mail mit seinen Angaben. Bis zum 06.09.2026 gab es sie nicht.
 */
describe("Die Zusammenfassung nach dem Absenden", () => {
  it("bewertet nicht, sondern gibt seine Angaben zurück", () => {
    const ganzeMail = [
      ZUSAMMENFASSUNG_TITEL,
      ZUSAMMENFASSUNG_VORSCHAU,
      ZUSAMMENFASSUNG_EINLEITUNG,
      ZUSAMMENFASSUNG_KORREKTUR,
    ].join(" ");
    for (const wort of ["Punkte", "Punktzahl", "Prozent", "Eignung", "Bewertung"]) {
      expect(ganzeMail).not.toContain(wort);
    }
  });

  it("traegt keinen Buchungsknopf mehr, sondern den Satz, dass wir uns melden", () => {
    /*
     * Der Knopf „Termin aussuchen" ist am 08.09.2026 entfallen. Er liess den
     * Bewerber buchen, bevor irgendjemand seine Antworten gelesen hatte, und
     * damit lief die Auswahl nach dem Bewerberscore leer. Gebucht wird jetzt
     * erst nach unserer Einladung, und die ist eine eigene Mail.
     */
    expect(ZUSAMMENFASSUNG_MELDEN).toMatch(/melden uns/);
    // Beide Ausgaenge stehen darin. Nur die Einladung zu nennen hiesse, das
    // Schweigen zur Absage zu machen.
    expect(ZUSAMMENFASSUNG_MELDEN).toMatch(/persönliche[nms]? Gespräch/);
    expect(ZUSAMMENFASSUNG_MELDEN).toMatch(/wenn es nicht passt/i);
    // Keine Frist, die niemand einhalten kann.
    expect(ZUSAMMENFASSUNG_MELDEN).not.toMatch(/innerhalb von \d|binnen \d|\d+ Werktagen/);
    // Und keine Aufforderung, sich selbst etwas auszusuchen.
    expect(ZUSAMMENFASSUNG_VORSCHAU).not.toMatch(/Termin aussuchen/);
  });

  it("nennt für die Korrektur den Weg, den es sicher gibt", () => {
    // „Angaben ändern" als Knopf gibt es bewusst nicht: Ein abgeschickter Bogen
    // laesst sich heute nicht mehr oeffnen, und ein Knopf ins Leere ist
    // schlimmer als keiner.
    expect(ZUSAMMENFASSUNG_KORREKTUR).toMatch(/antworte/);
  });

  it("erinnert an Tag 3 und Tag 7 an den Termin und meldet an Tag 10 an HR", () => {
    /*
     * Die groesste Luecke des alten Ablaufs: Wer den Bogen ausgefuellt und
     * keinen Termin gebucht hatte, bekam eine einzige Mail und verschwand
     * danach still. Ausgerechnet er ist erkennbar interessiert.
     */
    expect(BUCHUNG_ERINNERUNG_TAG).toBe(3);
    expect(BUCHUNG_ERINNERUNG_TAG_2).toBe(7);
    expect(BUCHUNG_HR_TAG).toBe(10);
    expect(BUCHUNG_ERINNERUNG_TAG).toBeLessThan(BUCHUNG_ERINNERUNG_TAG_2);
    expect(BUCHUNG_ERINNERUNG_TAG_2).toBeLessThan(BUCHUNG_HR_TAG);
    expect(BUCHUNG_ERINNERUNG_KNOPF).toBe("Termin aussuchen");
    // Die erste darf sich nicht mehr die einzige nennen, sie ist es nicht.
    expect(BUCHUNG_ERINNERUNG_TEXT).not.toMatch(/einzige Erinnerung/);
    // Die zweite kuendigt den Anruf an, ein unangekuendigter waere eine Zumutung.
    expect(BUCHUNG_ERINNERUNG_2_TEXT).toMatch(/ruft dich .*an/);
    expect(BUCHUNG_ERINNERUNG_2_TEXT).toMatch(/persönliche[nms]? Gespräch/);
  });

  /*
   * Die Felder entscheiden, welcher der beiden Saetze in der Mail steht. Einen
   * Buchungslink gibt es hier gar nicht mehr, damit die Vorlage keinen Knopf
   * zeigen kann, den es nicht mehr geben soll.
   */
  it("schickt ohne Termin kein Datum mit, damit der allgemeine Satz greift", () => {
    const felder = zusammenfassungMailFelder({});
    expect(felder.terminDatum).toBeUndefined();
    expect(felder.terminUhrzeit).toBeUndefined();
    expect("terminLink" in felder).toBe(false);
  });

  it("nennt den konkreten Termin, sobald einer steht", () => {
    const felder = zusammenfassungMailFelder({
      termin: { datum: "2026-09-15", uhrzeit: "10:00" },
    });
    expect(felder.terminDatum).toBe("2026-09-15");
    expect(felder.terminUhrzeit).toBe("10:00");
    expect("terminLink" in felder).toBe(false);
  });

  it("nennt im Terminsatz Datum und Uhrzeit lesbar", () => {
    const satz = zusammenfassungTerminSatz("2026-09-15", "10:00");
    expect(satz).toContain("15. September 2026");
    expect(satz).toContain("10:00 Uhr");
    expect(satz).toMatch(/steht schon/);
    // Keine Aufforderung zum Buchen, das ist der ganze Sinn dieses Falles.
    expect(satz).not.toContain("Termin aussuchen");
  });

  it("kommt ohne Uhrzeit aus, ohne eine leere Zeitangabe zu schreiben", () => {
    const satz = zusammenfassungTerminSatz("2026-09-15", "");
    expect(satz).toContain("15. September 2026");
    expect(satz).not.toContain("Uhr.");
    expect(satz).not.toMatch(/um\s+\./);
  });

  it("rechnet das Datum aus der Zeichenkette, nicht ueber die Zeitzone", () => {
    // `new Date("2026-01-01")` ist UTC-Mitternacht. Westlich davon stuende in
    // der Mail der Vortag, und der Bewerber erschiene einen Tag zu frueh.
    expect(terminDatumLang("2026-01-01")).toBe("1. Januar 2026");
    expect(terminDatumLang("2026-12-31")).toBe("31. Dezember 2026");
    // Was nicht diesem Muster folgt, bleibt stehen. Ein halb uebersetztes
    // Datum waere schlimmer als das rohe.
    expect(terminDatumLang("irgendwann")).toBe("irgendwann");
  });

  it("kuendigt in der Vorschauzeile den stehenden Termin an", () => {
    expect(ZUSAMMENFASSUNG_VORSCHAU_TERMIN).not.toBe(ZUSAMMENFASSUNG_VORSCHAU);
    expect(ZUSAMMENFASSUNG_VORSCHAU_TERMIN).toMatch(/Termin steht/);
  });

  it("sagt HR an Tag 10 genau, was zu tun ist", () => {
    const text = buchungHrText("Max Mustermann");
    expect(text).toContain("Max Mustermann");
    expect(text).toContain("10 Tagen");
    expect(text).toMatch(/Bitte anrufen/);
    // Nach der Einladung, nicht nach dem Bogen: Vorher konnte er gar nicht buchen.
    expect(text).toMatch(/eingeladen/);
  });

  it("erinnert nach der Einladung an den Termin, nicht nach dem Bogen", () => {
    /*
     * Der Bogen endet seit dem 08.09.2026 ohne Terminwahl. Wer noch nicht
     * eingeladen ist, kann nicht buchen; ihn daran zu erinnern, waere der
     * Vorwurf fuer etwas, das er nicht tun darf.
     */
    expect(BUCHUNG_ERINNERUNG_TEXT).toMatch(/eingeladen/);
    expect(BUCHUNG_ERINNERUNG_2_TEXT).toMatch(/Einladung/);
  });
});

describe("Die Sichtung, die Erinnerung an uns", () => {
  it("mahnt uns statt des Bewerbers, sobald ein Bogen liegen bleibt", () => {
    /*
     * Die umgedrehte Kette. Vorher mahnte sie den Bewerber, sich einen Termin
     * auszusuchen. Ersatzlos entfallen waere sie nicht duerfen: Wer wochenlang
     * wartet, weil niemand seinen Bogen ansieht, erlebt genau das Schweigen,
     * das der Abschlusstext ihm zu vermeiden verspricht.
     */
    const text = sichtungHrText("Max Mustermann", SICHTUNG_TAG);
    expect(text).toContain("Max Mustermann");
    expect(text).toContain(`${SICHTUNG_TAG} Tagen`);
    expect(text).toMatch(/Einladung/);
    expect(text).toMatch(/entscheiden/);
    // Kein Anruf beim Bewerber, sondern eine Entscheidung von uns.
    expect(text).not.toMatch(/Bitte anrufen/);
  });

  it("nennt den Bewerber schon im Betreff, damit die Mail sortierbar bleibt", () => {
    expect(sichtungHrBetreff("Max Mustermann")).toContain("Max Mustermann");
    expect(HR_SICHTUNG_TITEL).toMatch(/Entscheidung/);
  });

  it("mahnt zweimal und dann nicht mehr, in derselben Reihenfolge wie die andere Kette", () => {
    expect(SICHTUNG_TAG).toBe(3);
    expect(SICHTUNG_TAG_2).toBe(7);
    expect(SICHTUNG_TAG).toBeLessThan(SICHTUNG_TAG_2);
  });
});
