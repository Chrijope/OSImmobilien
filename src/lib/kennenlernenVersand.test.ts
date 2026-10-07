import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  darfFallSchliessen,
  faelligeErinnerung,
  hatAngefangen,
  kennenlernenBlock,
  kettenStand,
  stoppGrund,
  vermerkNachVersand,
  type BewerberDaten,
  type FormularDaten,
} from "@/lib/kennenlernenErinnerungen";
import { KENNENLERNEN_KEYS } from "@/lib/bewerberKennenlernen";

/**
 * Der automatische Versand der Erinnerungskette.
 *
 * Die 19 Tests in `kennenlernenErinnerungen.test.ts` prüfen die Entscheidung.
 * Hier wird die Stelle geprüft, an der aus Datenbankzeilen ein Kettenstand
 * wird, und die ist der eigentliche Ort für den Fehler, den niemand bemerkt:
 * Wer den Bewerberstatus nicht einliest, schickt einem abgelehnten Bewerber
 * weiter Erinnerungen. Genau das passiert im alten Bewerberprozess.
 */

const JETZT = new Date("2026-09-20T08:00:00.000Z");

/** Wie eine Zeile aus `bewerbungen` aussieht, wenn die Kette laufen soll. */
function bewerberZeile(tageHer: number, rest: Partial<BewerberDaten> = {}): BewerberDaten {
  return {
    status: "Eingang",
    meta: {
      kennenlernen: {
        formularId: "f1",
        gesendetAm: new Date(JETZT.getTime() - tageHer * 86_400_000).toISOString(),
        versandOk: true,
      },
    },
    ...rest,
  };
}

/** Dieselbe Zeile mit einer Stufe im Versandvermerk. */
function bewerberZeileMitStufe(tageHer: number, stufe: number): BewerberDaten {
  const zeile = bewerberZeile(tageHer);
  (zeile.meta!.kennenlernen as Record<string, unknown>).erinnerungStufe = stufe;
  return zeile;
}

/** Die zugehörige, noch offene Zeile aus `bewerber_formular`. */
function bogenZeile(rest: Partial<FormularDaten> = {}): FormularDaten {
  return {
    status: "offen",
    created_at: new Date(JETZT.getTime() - 9 * 86_400_000).toISOString(),
    expires_at: new Date(JETZT.getTime() + 5 * 86_400_000).toISOString(),
    antworten: {},
    ...rest,
  };
}

describe("Aus der Datenbankzeile wird ein Kettenstand", () => {
  it("liest Versanddatum, Stufe und Bogen zusammen", () => {
    const stand = kettenStand(bewerberZeile(4), bogenZeile());
    expect(stand.gesendetAm).toBeTruthy();
    expect(stand.formularStatus).toBe("offen");
    expect(stand.stufe).toBe(0);
    expect(faelligeErinnerung(stand, JETZT)).toBe("tag3");
  });

  it("liest die Stufe aus meta.kennenlernen.erinnerungStufe", () => {
    const zeile = bewerberZeile(9);
    (zeile.meta!.kennenlernen as Record<string, unknown>).erinnerungStufe = 1;
    expect(kettenStand(zeile, bogenZeile()).stufe).toBe(1);
    // Tag 9 nach Tag 3: Seit Tag 8 entfallen ist, kommt erst an Tag 11 etwas.
    expect(faelligeErinnerung(kettenStand(zeile, bogenZeile()), JETZT)).toBe("keine");
    expect(faelligeErinnerung(kettenStand(bewerberZeileMitStufe(11, 1), bogenZeile()), JETZT)).toBe("tag11");
  });

  it("läuft nicht für Bewerber des alten Ablaufs, die nur einen Bogen haben", () => {
    /*
     * Beide Abläufe schreiben in dieselbe Tabelle `bewerber_formular`. Wer das
     * Alter des Bogens als Ersatz für das Versanddatum nähme, schickte jedem
     * Bewerber des alten Vorabbogens Erinnerungen zu einem Kennenlernen, das
     * er nie gesehen hat.
     */
    const alt: BewerberDaten = { status: "Eingang", meta: { nachfassMailAm: null } };
    const stand = kettenStand(alt, bogenZeile());
    expect(stand.gesendetAm).toBeNull();
    expect(stoppGrund(stand, JETZT)).toBe("keine_mail");
    expect(faelligeErinnerung(stand, JETZT)).toBe("keine");
  });

  it("erkennt ein laufendes Gespräch am Termin und am Skript", () => {
    const mitTermin = bewerberZeile(9, {
      meta: { ...bewerberZeile(9).meta, erstgespraechDatum: "2026-09-18" },
    });
    expect(kettenStand(mitTermin, bogenZeile()).erstgespraechLaeuft).toBe(true);

    const mitSkript = bewerberZeile(9, {
      meta: {
        ...bewerberZeile(9).meta,
        erstgespraechSkript: { assessment: { motivation: "hoch" } },
      },
    });
    expect(kettenStand(mitSkript, bogenZeile()).erstgespraechLaeuft).toBe(true);
    expect(faelligeErinnerung(kettenStand(mitSkript, bogenZeile()), JETZT)).toBe("keine");
  });

  it("liest die Sperre der Nachfass-Welle mit", () => {
    const zeile = bewerberZeile(5, {
      meta: { ...bewerberZeile(5).meta, nachfassMailAm: JETZT.toISOString() },
    });
    expect(faelligeErinnerung(kettenStand(zeile, bogenZeile()), JETZT)).toBe("keine");
  });

  it("hält den Zwischenstand für leer, solange der Bogen keine Antworten trägt", () => {
    // Der Entwurf liegt im localStorage des Bewerbers, der Server sieht ihn
    // nicht. Deshalb ist die Antwort heute fast immer "nicht begonnen".
    expect(hatAngefangen(bogenZeile())).toBe(false);
    expect(hatAngefangen(bogenZeile({ antworten: { weg: "weg1" } }))).toBe(true);
    expect(hatAngefangen(undefined)).toBe(false);
  });
});

describe("Abgelehnte und abgesagte Bewerber bekommen nichts mehr", () => {
  /*
   * Der bekannte Fehler des alten Prozesses: Terminerinnerungen gingen weiter
   * an Bewerber, die längst eine Absage hatten. Diese Kette darf das nicht
   * wiederholen, und zwar an jedem einzelnen Tag der Kette.
   */
  const tage = [3, 4, 8, 9, 11, 14, 30];

  it("schickt einem abgelehnten Bewerber an keinem Tag der Kette etwas", () => {
    for (const tag of tage) {
      for (const stufe of [0, 1, 2]) {
        const zeile = bewerberZeile(tag, { status: "Abgelehnt" });
        (zeile.meta!.kennenlernen as Record<string, unknown>).erinnerungStufe = stufe;
        const stand = kettenStand(zeile, bogenZeile());
        expect(stoppGrund(stand, JETZT), `Tag ${tag}, Stufe ${stufe}`).toBe("abgelehnt");
        expect(faelligeErinnerung(stand, JETZT), `Tag ${tag}, Stufe ${stufe}`).toBe("keine");
      }
    }
  });

  it("schickt bei Kein Interesse ebenfalls nichts, auch nicht die Meldung an HR", () => {
    for (const tag of tage) {
      const zeile = bewerberZeile(tag, { status: "KeinInteresse" });
      (zeile.meta!.kennenlernen as Record<string, unknown>).erinnerungStufe = 2;
      const stand = kettenStand(zeile, bogenZeile());
      expect(stoppGrund(stand, JETZT), `Tag ${tag}`).toBe("kein_interesse");
      // Auch die Glocke an HR bleibt aus: Wer abgesagt hat, wird nicht
      // angerufen.
      expect(faelligeErinnerung(stand, JETZT), `Tag ${tag}`).toBe("keine");
    }
  });

  it("schweigt auch, sobald der Bogen abgeschickt oder der Link abgelaufen ist", () => {
    const abgeschickt = kettenStand(bewerberZeile(9), bogenZeile({ status: "eingereicht" }));
    expect(faelligeErinnerung(abgeschickt, JETZT)).toBe("keine");

    const abgelaufen = kettenStand(
      bewerberZeile(9),
      bogenZeile({ expires_at: new Date(JETZT.getTime() - 86_400_000).toISOString() }),
    );
    expect(faelligeErinnerung(abgelaufen, JETZT)).toBe("keine");
  });

  it("schickt die dritte Mail auch bei Widerspruch, schliesst den Fall aber nicht", () => {
    /*
     * Geaendert am 14.09.2026. Bis dahin hielt der Widerspruch gegen den
     * Anruf die dritte Stufe ganz auf, und der Bewerber lag danach fuer
     * immer ohne Abschluss im Eingang.
     *
     * "Bitte nicht anrufen" heisst: interessiert, aber kein Anruf. Eine Mail
     * ist kein Anruf, und diese Mail sagt genau das, was er hoeren will,
     * naemlich dass wir uns nicht mehr von allein melden. Nur der
     * Statuswechsel auf "Kein Interesse" bleibt aus, denn der schriebe das
     * Gegenteil seiner Aussage in die Akte.
     */
    const zeile = bewerberZeile(11);
    Object.assign(zeile.meta!.kennenlernen as Record<string, unknown>, {
      erinnerungStufe: 2,
      anrufWidersprochen: true,
    });
    const stand = kettenStand(zeile, bogenZeile());
    expect(stand.anrufWidersprochen).toBe(true);
    expect(faelligeErinnerung(stand, JETZT)).toBe("tag11");
    expect(darfFallSchliessen(stand)).toBe(false);
  });
});

describe("Der Versandvermerk verhindert die zweite Mail", () => {
  it("hebt die Stufe und hält den Zeitpunkt fest, ohne den Rest zu verlieren", () => {
    const zeile = bewerberZeile(4);
    const block = kennenlernenBlock(zeile.meta);
    const neu = vermerkNachVersand(block, "tag3", JETZT.toISOString(), true);

    expect(neu.erinnerungStufe).toBe(1);
    expect(neu.erinnerung1Am).toBe(JETZT.toISOString());
    expect(neu.erinnerung1Ok).toBe(true);
    // Der Vermerk der Einladung bleibt stehen, er ist der Beleg des Versands.
    expect(neu.gesendetAm).toBe(block.gesendetAm);
    expect(neu.formularId).toBe("f1");
  });

  it("macht dieselbe Erinnerung am nächsten Tag unfällig", () => {
    const zeile = bewerberZeile(4);
    const nachher: BewerberDaten = {
      status: "Eingang",
      meta: { kennenlernen: vermerkNachVersand(kennenlernenBlock(zeile.meta), "tag3", JETZT.toISOString(), true) },
    };
    const morgen = new Date(JETZT.getTime() + 86_400_000);
    expect(faelligeErinnerung(kettenStand(nachher, bogenZeile()), morgen)).toBe("keine");
  });

  it("beendet die Kette nach der dritten Erinnerung", () => {
    const zeile = bewerberZeile(11);
    const nachher: BewerberDaten = {
      status: "Eingang",
      meta: { kennenlernen: vermerkNachVersand(kennenlernenBlock(zeile.meta), "tag11", JETZT.toISOString(), true) },
    };
    const stand = kettenStand(nachher, bogenZeile());
    expect(stand.stufe).toBe(3);
    expect(stoppGrund(stand, JETZT)).toBe("fertig");
  });

  it("merkt sich auch einen Fehlschlag, damit es morgen keinen zweiten Versuch gibt", () => {
    const neu = vermerkNachVersand({}, "tag3", JETZT.toISOString(), false);
    expect(neu.erinnerungStufe).toBe(1);
    expect(neu.erinnerung1Ok).toBe(false);
  });

  it("vergibt Stufe 2 nicht mehr, Tag 11 folgt direkt auf Tag 3", () => {
    const nachTag3 = vermerkNachVersand({}, "tag3", JETZT.toISOString(), true);
    const nachTag11 = vermerkNachVersand(nachTag3, "tag11", JETZT.toISOString(), true);
    expect(nachTag11.erinnerungStufe).toBe(3);
    expect(nachTag11).not.toHaveProperty("erinnerung2Am");
  });
});

describe("Zeitplan und Vorlagen passen zusammen", () => {
  const wurzel = join(__dirname, "..", "..");
  const funktion = readFileSync(
    join(wurzel, "supabase", "functions", "send-bewerber-kennenlernen-erinnerungen", "index.ts"),
    "utf8",
  );
  const registry = readFileSync(
    join(wurzel, "supabase", "functions", "_shared", "transactional-email-templates", "registry.ts"),
    "utf8",
  );

  it("die zwei Vorlagen der Kette sind angemeldet", () => {
    for (const name of [
      "bewerber-kennenlernen-erinnerung-1",
      "bewerber-kennenlernen-erinnerung-3",
    ]) {
      expect(funktion, `${name} fehlt im Zeitplan`).toContain(name);
      expect(registry, `${name} ist nicht in der registry angemeldet`).toContain(`'${name}':`);
    }
  });

  it("die Tag-8-Vorlage ist weder im Zeitplan noch in der registry", () => {
    expect(funktion).not.toContain("bewerber-kennenlernen-erinnerung-2");
    expect(funktion).not.toMatch(/\btag8\b/);
    expect(registry).not.toContain("bewerber-kennenlernen-erinnerung-2");
  });

  it("der Zeitplan entscheidet nicht selbst, sondern fragt die gemeinsame Logik", () => {
    // Sobald hier eine eigene Tage- oder Statusrechnung entstünde, liefen
    // Anzeige und Versand auseinander.
    expect(funktion).toContain("_shared/kennenlernen-erinnerungen.ts");
    expect(funktion).toContain("faelligeErinnerung");
  });

  it("zählt den Stundendeckel im Versandprotokoll und bricht ab, wenn das nicht geht", () => {
    expect(funktion).toContain("email_send_log");
    expect(funktion).toContain("MAX_JE_STUNDE");
    // Kein stilles Null bei Lesefehler, sonst ist der Deckel eine Attrappe.
    expect(funktion).toContain("Zählstand des Mailversands nicht lesbar");
  });

  /*
   * Die dritte Stufe, seit dem 14.09.2026.
   *
   * Sie ist die einzige Stelle der Kette, die etwas am Bewerber selbst ändert,
   * und deshalb die einzige, bei der ein Fehler teuer ist. Drei Dinge werden
   * bewacht: dass der Status über dieselbe Regel wie der Abmeldeknopf gesetzt
   * wird, dass die Änderung einen Verlaufseintrag bekommt, und dass an dieser
   * Stelle keine Meldung mehr an HR hängt.
   */
  it("schließt an Tag 11 den Fall, mit derselben Statusregel wie der Abmeldeknopf", () => {
    expect(funktion).toContain("zielStatusNachAbmeldung");
    expect(funktion).toContain("erinnerung3Notiz");
    expect(funktion).toContain("notizenLog");
  });

  it("meldet an Tag 11 nichts mehr an HR", () => {
    expect(funktion).not.toContain("hrMitteilungText");
    expect(funktion).not.toContain('anlass: "bogen"');
    // Die zweite Kette ruft weiterhin an, die darf nicht mit verschwinden.
    expect(funktion).toContain('anlass: "termin"');
  });
});

/**
 * Die Stellen, die nur im Versand stehen und deshalb sonst niemand prüft.
 *
 * Vorlagen und Edge Functions laufen in Deno und laden React über eine
 * npm-Angabe; Vitest erreicht sie nicht. Ihr Quelltext lässt sich aber lesen,
 * und genau die Zeilen, die schon einmal still ausgefallen sind, stehen hier
 * auf dem Prüfstand: eine Antwort, die ins Leere geht, ein Raumlink, der im
 * Kalender fehlt, eine Vorlage, die niemand angemeldet hat.
 */
describe("Was der Versand tatsächlich mitschickt", () => {
  const wurzel = join(__dirname, "..", "..");
  const lies = (...teile: string[]) => readFileSync(join(wurzel, ...teile), "utf8");

  // Der eigentliche Versand liegt seit dem 15.09.2026 im gemeinsamen Modul,
  // die Function davor prueft nur noch die Rechte.
  const einladung = lies("supabase", "functions", "_shared", "kennenlernen-versand.ts");
  const einladungsVorlage = lies(
    "supabase", "functions", "_shared", "transactional-email-templates",
    "bewerber-kennenlernen-einladung.tsx",
  );
  const terminVersand = lies("supabase", "functions", "send-bewerber-termin", "index.ts");
  const erinnerungen = lies(
    "supabase", "functions", "send-bewerber-erstgespraech-reminders", "index.ts",
  );
  const kette = lies("supabase", "functions", "send-bewerber-kennenlernen-erinnerungen", "index.ts");
  const absenden = lies("supabase", "functions", "submit-bewerber-formular", "index.ts");
  const zusammenfassung = lies(
    "supabase", "functions", "_shared", "transactional-email-templates",
    "bewerber-kennenlernen-zusammenfassung.tsx",
  );
  const registry2 = lies(
    "supabase", "functions", "_shared", "transactional-email-templates", "registry.ts",
  );

  it("setzt Reply-To der Eingangsmail auf die Ansprechpartnerin", () => {
    /*
     * Christians Punkt P10. Die Mail geht von noreply@ hinaus; ohne Reply-To
     * landete jede Antwort in einem Postfach, das niemand liest, obwohl unten
     * eine Person mit Namen und Bild steht.
     */
    // Seit dem 26.09.2026 setzt send-transactional-email Absender und
    // Reply-To fuer alle Bewerbermails zentral (bewerber-absender.ts). Der
    // Versandweg selbst setzt keine eigene Antwortadresse mehr.
    expect(einladung).not.toContain("replyTo:");
    const zentral = lies("supabase", "functions", "send-transactional-email", "index.ts");
    expect(zentral).toContain("if (!replyTo) replyTo = bewerberKopf.antwortAn");
    /*
     * Im Text steht die Adresse seit dem 08.09.2026 nicht mehr. Sie steht
     * ohnehin gleich darunter im Block der Ansprechpartnerin, mit Telefon und
     * Bild; zweimal dieselbe Adresse liest sich wie ein Formular. Dass eine
     * Antwort trotzdem bei ihr landet, sichert allein das Reply-To oben.
     */
    expect(einladungsVorlage).toContain("KENNENLERNEN_HINWEIS}");
    expect(einladungsVorlage).not.toContain("mailto:");
    // Der Weg zur Absage steht unter der Unterschrift, nicht davor.
    expect(einladungsVorlage).toContain("fussHinweis={KENNENLERNEN_ABSAGE_HINWEIS}");
  });

  it("trägt in der Kalenderdatei den Raumlink als Ort und in der Beschreibung", () => {
    expect(terminVersand).toContain("ort: raumUrl");
    expect(terminVersand).toContain("`Videoraum: ${raumUrl}`");
    // Und der Titel kommt aus dem gemeinsamen Wortlaut, nicht aus der
    // Terminart. Dort steht bis heute „Bewerbergespräch".
    expect(terminVersand).toContain("titel: KALENDER_TITEL");
    expect(terminVersand).not.toContain('"Videocall mit OS Immobilien"');
  });

  it("schickt den Knopf in den eigenen Kalender mit", () => {
    expect(terminVersand).toContain("kalenderLink({");
    expect(terminVersand).toContain("kalenderUrl");
  });

  it("nennt in der letzten Erinnerung die Uhrzeit in Ziffern", () => {
    expect(erinnerungen).toContain("stufe.mitUhrzeit ? { uhrzeitImText: uhrzeit }");
  });

  it("meldet an HR nicht nur mit der Glocke, sondern auch per Mail", () => {
    /*
     * Die zweite Kette endete mit einer Glocke. Die sieht nur, wer gerade im
     * CRM arbeitet; wer drei Tage unterwegs ist, findet sie nie wieder, und
     * genau dort brach der Ablauf lautlos ab.
     *
     * Der Anlass "bogen" ist am 14.09.2026 entfallen: Wer das Kennenlernen nie
     * geoeffnet hat, bekommt an Tag 11 selbst eine Mail. Geprueft wird das im
     * Waechter weiter oben.
     */
    expect(kette).toContain("bewerber-hr-anruf");
    expect(registry2).toContain("'bewerber-hr-anruf':");
    expect(kette).toContain('anlass: "termin"');
    // Die Bitte um einen Anruf braucht die Nummer, sonst ist sie eine Zumutung.
    expect(kette).toContain("telefon");
  });

  it("führt die zweite Kette über drei Stufen und nicht mehr über eine", () => {
    expect(kette).toContain("faelligeBuchungErinnerung");
    expect(kette).toContain("vermerkNachBuchungStufe");
    // Die Stufe gehoert in den Idempotenzschluessel, sonst haelt die
    // Warteschlange die zweite Mail fuer eine Dublette der ersten.
    expect(kette).toContain("`${BUCHUNG_VORLAGE}-${art}-${b.id}`");
  });

  it("mahnt vor der Einladung uns und nicht den Bewerber", () => {
    /*
     * Der Bogen endet seit dem 08.09.2026 ohne Terminwahl. Wer noch nicht
     * eingeladen ist, kann nicht buchen; die alte Mahnung an ihn waere der
     * Vorwurf fuer etwas, das er nicht tun darf. Sie geht deshalb an HR.
     */
    expect(kette).toContain('anlass: "sichtung"');
    expect(kette).toContain("sichtungHrText");
    // Getrennt nach Empfaenger, damit die Meldungen an uns nicht gegen den
    // Mengendeckel fuer Bewerbermails zaehlen.
    expect(kette).toContain("gehtAnHr");
    // Eigener Schluessel je Stufe, sonst faellt die zweite Meldung als
    // Dublette der ersten aus der Warteschlange.
    expect(kette).toContain("schluessel: art");
  });

  it("schickt in der Zusammenfassungsmail keinen Buchungsknopf mehr mit", () => {
    /*
     * Der Knopf „Termin aussuchen" liess den Bewerber buchen, bevor jemand
     * seine Antworten gelesen hatte. Ohne Link kann die Vorlage ihn gar nicht
     * erst zeichnen; an seiner Stelle steht der Satz, dass wir uns melden.
     */
    expect(absenden).not.toContain("terminLink");
    expect(zusammenfassung).not.toContain("ZUSAMMENFASSUNG_KNOPF");
    expect(zusammenfassung).not.toContain("<Handlung");
    expect(zusammenfassung).toContain("ZUSAMMENFASSUNG_MELDEN");
  });

  /*
   * Der stille Fehler, den es hier schon zweimal gab.
   *
   * Zod entfernt unbekannte Schlüssel ohne Fehlermeldung. Bis zum 02.09.2026
   * gingen so sechs Antworten des alten Bogens verloren, bis zum 08.09.2026
   * vier des Kennenlernens, und gemerkt hat es niemand: Der Bewerber sieht
   * seine Angabe auf dem Bildschirm, in der Akte fehlt sie. Dieser Vergleich
   * schließt die Lücke dauerhaft. Er wurde am 09.09.2026 mit der Zusatzfrage
   * „Wie arbeitest du heute?" (`arbeitsform`) angelegt.
   */
  it("lässt keinen Schlüssel des Bogens am Zod-Schema hängen", () => {
    const schema = absenden.slice(
      absenden.indexOf("const AntwortSchema"),
      absenden.indexOf("const SubmitSchema"),
    );
    expect(schema.length).toBeGreaterThan(200);
    for (const key of KENNENLERNEN_KEYS) {
      expect(
        new RegExp(`(^|\\s)${key}:`, "m").test(schema),
        `Der Schlüssel ${key} steht im Bogen, aber nicht im Zod-Schema von ` +
          "submit-bewerber-formular. Zod würde die Antwort still wegwerfen.",
      ).toBe(true);
    }
  });

  it("schickt die Terminerinnerung in die Buchungsstrecke und nicht in den Bogen", () => {
    // Der Bogen endet in einer Danksagung. Ein Knopf dorthin waere eine
    // Sackgasse; gebucht wird unter /kooperationsgespraech/<token>.
    expect(kette).toContain("kooperationsBuchungsLink(bogenToken)");
    expect(kette).not.toContain("terminLink: `${KENNENLERNEN_BASIS_URL}");
  });
});

describe("Der Kennenlernlink führt nie in den alten Bogen", () => {
  const wurzel = join(__dirname, "..", "..");
  const linkFunktion = readFileSync(
    join(wurzel, "supabase", "functions", "_shared", "kennenlernen-versand.ts"),
    "utf8",
  );

  it("verwendet nur eine Zeile des neuen Bogens wieder", () => {
    /*
     * Beide Bögen liegen in `bewerber_formular`. Die Suche nach einem noch
     * gültigen Link nahm bis zum 12.09.2026 jede offene Zeile, auch eine des
     * früheren Vorab-Bogens. Der Bewerber bekam dann einen Link in den alten
     * Bogen mit achtundzwanzig Schritten; füllt er den aus, gilt sein
     * Kennenlernen als erledigt, ohne dass er es je gesehen hat.
     *
     * Scharf wurde das am selben Tag, als die Sammelmail auch an die
     * Vorab-Bogen-Gruppe ging, also genau an die Leute mit solchen Zeilen.
     */
    const suche = linkFunktion.slice(
      linkFunktion.indexOf("const { data: nochGueltig }"),
      linkFunktion.indexOf("maybeSingle()", linkFunktion.indexOf("const { data: nochGueltig }")),
    );
    expect(suche, "Die Suche nach einem gueltigen Link fehlt").not.toBe("");
    expect(suche).toContain('.eq("status", "offen")');
    expect(
      suche,
      "Ohne Filter auf antworten->>bogen wird eine Vorab-Bogen-Zeile wiederverwendet",
    ).toContain('"antworten->>bogen"');
  });

  it("kennzeichnet jede neu angelegte Zeile als Kennenlernbogen", () => {
    // Das Gegenstueck: Ohne Kennzeichen beim Anlegen findet der Filter oben
    // nichts wieder, und der alte Erinnerungslauf greift die Zeile ab.
    // Seit 15.09.2026 kann neben `bogen` ein Kennzeichen `ohneMail` stehen,
    // deshalb ein Muster statt des festen Einzeilers.
    expect(linkFunktion).toMatch(/antworten:\s*\{\s*bogen:\s*"kennenlernen"/);
  });
});

/*
 * Der automatische Eingang darf nicht mehr ueber das Netz gehen.
 *
 * Bis zum 15.09.2026 stiess der Zapier-Eingang die Eingangsmail mit einem
 * zweiten Aufruf an die Function an und wies sich mit einem gemeinsamen
 * Geheimnis aus. Dieser Umweg ist wiederholt still gescheitert: Im Profil
 * stand „non-2xx", der Bewerber bekam nichts, HR schickte von Hand nach.
 * Dieser Test haelt fest, dass beide Eingangswege das gemeinsame Modul direkt
 * aufrufen.
 */
describe("Die Eingangsmail geht ohne Umweg hinaus", () => {
  const wurzel2 = join(__dirname, "..", "..");
  const liesDatei = (...teile: string[]) => readFileSync(join(wurzel2, ...teile), "utf8");

  for (const eingang of ["zapier-bewerber-webhook", "submit-bewerbung"]) {
    it(`${eingang} ruft den Versand direkt auf`, () => {
      const quelle = liesDatei("supabase", "functions", eingang, "index.ts");
      expect(quelle).toContain("versendeKennenlernen(admin, { bewerbungId })");
      expect(quelle).not.toContain('functions.invoke("send-bewerber-kennenlernen"');
      expect(quelle).not.toContain("x-internal-secret");
    });
  }
});
