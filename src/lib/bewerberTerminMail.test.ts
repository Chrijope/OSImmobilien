import { describe, it, expect } from "vitest";
import {
  GESPRAECH_NAME,
  GESPRAECH_NAME_KLEIN,
  KALENDER_TITEL,
  TERMIN_KALENDER_TEXT,
  TERMIN_KNOPF,
  TERMIN_WORTLAUT,
  VIDEOCALL_ERINNERUNG_STUNDEN,
  alsBase64,
  baueIcs,
  falte,
  icsZeit,
  kalenderAnhang,
  kalenderLink,
  videocallErinnerungBetreff,
  videocallErinnerungText,
  videocallErinnerungTitel,
} from "../../supabase/functions/_shared/bewerber-termin-mail";
import { STUFEN_VIDEOCALL } from "../../supabase/functions/_shared/bewerber-termin-erinnerungen";

/**
 * Die Bestätigung an den Bewerber und ihre Kalenderdatei.
 *
 * Die Kalenderdatei ist der Teil, den niemand von Hand nachprüft: Sie liegt als
 * Anhang in einer Mail, und ob ein Kalender sie annimmt, sieht man erst, wenn
 * jemand darauf klickt. Deshalb steht sie hier auf dem Prüfstand.
 */

const ANGABEN = {
  titel: KALENDER_TITEL,
  startIso: "2026-09-15T08:00:00.000Z",
  endeIso: "2026-09-15T08:45:00.000Z",
  uid: "bewerber-termin-abc@more.immo",
  organisator: "Christian Kurz",
  organisatorEmail: "office@more.immo",
  teilnehmerEmail: "max@example.com",
};

describe("Die Kalenderdatei", () => {
  it("ist eine vollständige VCALENDAR mit genau einem Termin", () => {
    const ics = baueIcs(ANGABEN);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(1);
    // Zeilenenden nach iCalendar, nicht die des Betriebssystems.
    expect(ics.includes("\r\n")).toBe(true);
  });

  it("trägt Anfang, Ende und Kennung des Termins", () => {
    const ics = baueIcs(ANGABEN);
    expect(ics).toContain("DTSTART:20260915T080000Z");
    expect(ics).toContain("DTEND:20260915T084500Z");
    expect(ics).toContain(`UID:${ANGABEN.uid}`);
    expect(ics).toContain(`SUMMARY:${KALENDER_TITEL}`);
    expect(ics).toContain("ORGANIZER;CN=Christian Kurz:mailto:office@more.immo");
    expect(ics).toContain("mailto:max@example.com");
  });

  it("hebt beim Verschieben den Zähler, sonst bleibt der alte Eintrag stehen", () => {
    expect(baueIcs(ANGABEN)).toContain("SEQUENCE:0");
    expect(baueIcs({ ...ANGABEN, sequenz: 2 })).toContain("SEQUENCE:2");
  });

  it("maskiert Komma, Semikolon und Zeilenumbruch im Text", () => {
    const ics = baueIcs({
      ...ANGABEN,
      beschreibung: "Verdienst, Kosten; und mehr\nZweite Zeile",
    });
    const zeile = ics.split("\r\n").find((z) => z.startsWith("DESCRIPTION:")) || "";
    // Der Umbruch darf nicht als echter Umbruch dastehen, sonst zerfällt die
    // Datei in zwei unverständliche Zeilen.
    expect(zeile).toContain("\\n");
    expect(zeile).toContain("\\,");
    expect(zeile).toContain("\\;");
  });

  it("bricht lange Zeilen so um, wie iCalendar es verlangt", () => {
    const lang = "Das besprechen wir zuerst: " + "Verdienst und Rechenwege, ".repeat(6);
    const ics = baueIcs({ ...ANGABEN, beschreibung: lang });
    for (const zeile of ics.split("\r\n")) {
      expect(new TextEncoder().encode(zeile).length).toBeLessThanOrEqual(75);
    }
    // Fortsetzungszeilen beginnen mit einem Leerzeichen.
    expect(ics).toMatch(/\r\n /);
  });

  it("schneidet beim Umbrechen keinen Umlaut entzwei", () => {
    const gefaltet = falte(`DESCRIPTION:${"ü".repeat(60)}`);
    for (const teil of gefaltet.split("\r\n")) {
      expect(new TextEncoder().encode(teil).length).toBeLessThanOrEqual(75);
    }
    expect(gefaltet.replace(/\r\n /g, "")).toBe(`DESCRIPTION:${"ü".repeat(60)}`);
  });

  it("gibt bei einem unbrauchbaren Zeitpunkt lieber nichts zurück als Unsinn", () => {
    expect(icsZeit("kein Datum")).toBe("");
    expect(baueIcs({ ...ANGABEN, startIso: "kein Datum" })).toBe("");
    expect(kalenderAnhang("")).toEqual([]);
  });
});

describe("Der Anhang", () => {
  it("überlebt Umlaute", () => {
    // `btoa` allein wirft beim ersten Umlaut. „Videocall mit Jürgen" hätte den
    // ganzen Versand zum Absturz gebracht.
    const kodiert = alsBase64("Grüße aus Rosenheim");
    expect(() => atob(kodiert)).not.toThrow();
    expect(new TextDecoder().decode(Uint8Array.from(atob(kodiert), (c) => c.charCodeAt(0))))
      .toBe("Grüße aus Rosenheim");
  });

  it("heißt so, dass jeder sieht, was es ist", () => {
    const anhang = kalenderAnhang(baueIcs(ANGABEN));
    expect(anhang).toHaveLength(1);
    expect(anhang[0].filename).toBe("videocall.ics");
    expect(anhang[0].type).toBe("text/calendar");
    expect(atob(anhang[0].content)).toContain("BEGIN:VCALENDAR");
  });
});

describe("Der Wortlaut der Bestätigung", () => {
  it("kennt alle drei Vorgänge", () => {
    for (const vorgang of ["gebucht", "verschoben", "abgesagt"] as const) {
      const w = TERMIN_WORTLAUT[vorgang];
      expect(w.titel.trim()).not.toBe("");
      expect(w.betreff.trim()).not.toBe("");
      expect(w.einleitung.trim()).not.toBe("");
      expect(TERMIN_KNOPF[vorgang].trim()).not.toBe("");
    }
  });

  it("spricht den Bewerber mit Du an und kündigt keinen Anruf an", () => {
    const alles = Object.values(TERMIN_WORTLAUT)
      .map((w) => `${w.titel} ${w.einleitung} ${w.schluss}`)
      .join(" ");
    expect(alles).toContain("dein");
    expect(alles).not.toContain("rufe Sie");
    expect(alles).not.toContain("Sehr geehrte");
  });

  it("führt nach einer Absage zurück zur Terminwahl und nicht in den Videoraum", () => {
    expect(TERMIN_KNOPF.abgesagt).not.toContain("Videoraum");
    expect(TERMIN_KNOPF.gebucht).toContain("Videoraum");
  });
});

/**
 * Der Weg vom Kalendereintrag in den Videoraum.
 *
 * Christians Punkt P5: Wer den Termin im Kalender stehen hat und drei Minuten
 * vorher darauf tippt, muss von dort in den Raum kommen. Sonst sucht er die
 * Mail, und die ist nach zwei Wochen Posteingang nicht mehr zu finden.
 */
describe("Der Videoraum im Kalendereintrag", () => {
  const RAUM = "https://portal.more.immo/raum/abc123";

  it("steht sowohl im Ort als auch in der Beschreibung", () => {
    const ics = baueIcs({ ...ANGABEN, ort: RAUM, beschreibung: `Videoraum: ${RAUM}` });
    // LOCATION, weil Apple Kalender und Google daraus einen Knopf machen.
    expect(ics).toContain(`LOCATION:${RAUM}`);
    // DESCRIPTION, weil Outlook das Ortsfeld nur als Text zeigt.
    expect(ics).toContain(`DESCRIPTION:Videoraum: ${RAUM}`);
  });

  it("heißt im Kalender nicht mehr Videocall oder Bewerbergespräch", () => {
    expect(KALENDER_TITEL).toContain(GESPRAECH_NAME);
    expect(KALENDER_TITEL).not.toMatch(/Videocall|Bewerbergespräch/);
  });

  it("bleibt bei Online stehen, wenn es keinen Raum gibt", () => {
    expect(baueIcs(ANGABEN)).toContain("LOCATION:Online");
  });
});

describe("Der Knopf in den eigenen Kalender", () => {
  const BASIS = "https://beispiel.supabase.co";

  it("führt auf die vorhandene Function get-ics", () => {
    const url = kalenderLink({ ...ANGABEN, supabaseUrl: BASIS, ort: "https://portal.more.immo/raum/abc" });
    expect(url.startsWith(`${BASIS}/functions/v1/get-ics?`)).toBe(true);
    const abfrage = new URL(url).searchParams;
    expect(abfrage.get("title")).toBe(KALENDER_TITEL);
    expect(abfrage.get("start")).toBe("2026-09-15T08:00:00.000Z");
    expect(abfrage.get("end")).toBe("2026-09-15T08:45:00.000Z");
    expect(abfrage.get("loc")).toBe("https://portal.more.immo/raum/abc");
    expect(abfrage.get("uid")).toBe(ANGABEN.uid);
  });

  it("trägt die Adresse des Bewerbers nicht in den Link", () => {
    // Eine Mailadresse in einer Adresszeile wandert durch jedes Protokoll, das
    // der Klick unterwegs passiert. Im Anhang steht sie ohnehin.
    const url = kalenderLink({ ...ANGABEN, supabaseUrl: BASIS });
    expect(url).not.toContain("max@example.com");
    expect(url).not.toContain("att=");
  });

  it("bleibt leer, wenn die Zeit oder die Adresse fehlt", () => {
    expect(kalenderLink({ ...ANGABEN, supabaseUrl: BASIS, startIso: "Unsinn" })).toBe("");
    expect(kalenderLink({ ...ANGABEN, supabaseUrl: "" })).toBe("");
  });

  it("heißt so, dass jeder weiß, was passiert", () => {
    expect(TERMIN_KALENDER_TEXT).toBe("In meinen Kalender eintragen");
  });
});

/**
 * Entscheidung E1 vom 07.09.2026: Bewerberseitig heißt der Termin überall
 * „Persönliches Gespräch". Intern bleibt der Reiter „Videocall".
 */
describe("Das Wording gegenüber dem Bewerber", () => {
  it("nennt den Termin in allen drei Betreffzeilen Persönliches Gespräch", () => {
    for (const vorgang of ["gebucht", "verschoben", "abgesagt"] as const) {
      expect(TERMIN_WORTLAUT[vorgang].betreff).toContain(GESPRAECH_NAME_KLEIN);
      expect(TERMIN_WORTLAUT[vorgang].betreff).not.toContain("Videocall");
      expect(TERMIN_WORTLAUT[vorgang].betreff).not.toContain("Bewerbergespräch");
    }
  });

  it("trägt Christians Betreff und seine Überschrift für die Buchung", () => {
    expect(TERMIN_WORTLAUT.gebucht.betreff).toBe("Dein persönliches Gespräch ist gebucht");
    expect(TERMIN_WORTLAUT.gebucht.titel).toBe("Dein Termin ist gebucht");
  });

  it("sagt nach dem Terminblock, worum es in dem Gespräch geht", () => {
    // Zwischen Terminblock und Knopf stand vorher nichts darueber, wofuer die
    // 45 Minuten gut sind.
    expect(TERMIN_WORTLAUT.gebucht.worumEsGeht).toMatch(/letzten offenen Fragen/);
    expect(TERMIN_WORTLAUT.gebucht.worumEsGeht).toMatch(/vertrieblich durchstarten/);
    // Bei einer Absage waere er Werbung fuer etwas, das nicht stattfindet.
    expect(TERMIN_WORTLAUT.abgesagt.worumEsGeht).toBeUndefined();
  });
});

/**
 * Die drei Erinnerungen vor dem Termin, Christians Punkt P9.
 *
 * Vorher zwei Stufen. Zwischen „morgen um diese Zeit" und „in einer Stunde"
 * liegt der ganze Arbeitstag, an dem der Termin wieder aus dem Kopf faellt.
 */
describe("Die drei Erinnerungsstufen", () => {
  it("erinnert 24, 6 und 1 Stunde vorher", () => {
    expect([...VIDEOCALL_ERINNERUNG_STUNDEN]).toEqual([24, 6, 1]);
    expect(STUFEN_VIDEOCALL.map((s) => s.stunden)).toEqual([...VIDEOCALL_ERINNERUNG_STUNDEN]);
  });

  it("nennt in Betreff und Titel jeder Stufe das persönliche Gespräch", () => {
    for (const stufe of STUFEN_VIDEOCALL) {
      expect(videocallErinnerungBetreff(stufe.vorText)).toBe(
        `Erinnerung: Dein ${GESPRAECH_NAME_KLEIN} ${stufe.vorText}`,
      );
      expect(videocallErinnerungTitel(stufe.vorText)).toContain(GESPRAECH_NAME_KLEIN);
      expect(videocallErinnerungBetreff(stufe.vorText)).not.toContain("Videocall");
    }
  });

  it("nennt nur in der letzten Stufe die Uhrzeit in Ziffern", () => {
    const letzte = STUFEN_VIDEOCALL[STUFEN_VIDEOCALL.length - 1];
    expect(letzte.stunden).toBe(1);
    expect(letzte.mitUhrzeit).toBe(true);
    expect(STUFEN_VIDEOCALL.filter((s) => s.mitUhrzeit)).toHaveLength(1);

    const mitZeit = videocallErinnerungText(letzte.vorText, "10:00");
    expect(mitZeit).toContain("heute um 10:00 Uhr");
    expect(mitZeit).toContain(letzte.vorText);

    // Bei 24 Stunden waere eine Uhrzeit ohne Datum irrefuehrend, sie meint morgen.
    expect(videocallErinnerungText("in 24 Stunden")).not.toContain("heute um");
  });

  it("trägt in jeder Stufe den Weg in den Videoraum", () => {
    for (const stufe of STUFEN_VIDEOCALL) {
      expect(videocallErinnerungText(stufe.vorText)).toContain("Link zum Videoraum");
    }
  });
});
