import { describe, it, expect } from "vitest";
import {
  BUCHUNG_ERINNERUNG_TAG,
  BUCHUNG_ERINNERUNG_TAG_2,
  BUCHUNG_HR_TAG,
  SICHTUNG_TAG,
  SICHTUNG_TAG_2,
  buchungErinnerungFaellig,
  buchungStand,
  buchungStartAm,
  buchungStoppGrund,
  faelligeBuchungErinnerung,
  gehtAnHr,
  sichtungStartAm,
  terminAusMeta,
  vermerkNachBuchungErinnerung,
  vermerkNachBuchungStufe,
} from "../../supabase/functions/_shared/bewerber-buchung-erinnerung";

/**
 * Die Kette nach dem abgeschickten Kennenlernen, seit dem 08.09.2026 in zwei
 * Hälften.
 *
 * Vorher mahnte sie den Bewerber, sich endlich einen Termin auszusuchen. Seit
 * der Bogen ohne Terminwahl endet, kann er das gar nicht, solange wir ihn nicht
 * eingeladen haben. Also mahnt sie zuerst uns (Sichtung) und erst nach der
 * verschickten Einladung wieder ihn (Buchung).
 *
 * Ersatzlos entfallen durfte sie nicht: Wer wochenlang wartet, weil niemand
 * seinen Bogen ansieht, erlebt genau das Schweigen, das der Abschlusstext ihm
 * zu vermeiden verspricht.
 */

const JETZT = new Date("2026-09-10T09:00:00Z");
const vorTagen = (tage: number) =>
  new Date(JETZT.getTime() - tage * 86_400_000).toISOString();
const inTagen = (tage: number) =>
  new Date(JETZT.getTime() + tage * 86_400_000).toISOString();

/**
 * Ein Bewerber, der vor `tage` Tagen eingeladen wurde.
 *
 * Der Bogen liegt bewusst deutlich länger zurück: Genau daran zeigt sich, dass
 * die zweite Hälfte ab der Einladung zählt und nicht ab dem Absenden.
 */
const nachEinladung = (tage: number) => ({
  zusammenfassungAm: vorTagen(tage + 20),
  einladungAm: vorTagen(tage),
});

describe("Wann welche Stufe fällig ist", () => {
  it("nennt die drei Tage der Kette", () => {
    expect(BUCHUNG_ERINNERUNG_TAG).toBe(3);
    expect(BUCHUNG_ERINNERUNG_TAG_2).toBe(7);
    expect(BUCHUNG_HR_TAG).toBe(10);
  });

  it("schickt die erste Erinnerung drei Tage nach der Einladung", () => {
    expect(faelligeBuchungErinnerung(nachEinladung(3), JETZT)).toBe("tag3");
    expect(buchungErinnerungFaellig(nachEinladung(3), JETZT)).toBe(true);
  });

  it("schickt vorher nichts", () => {
    expect(faelligeBuchungErinnerung(nachEinladung(2), JETZT)).toBe("keine");
    expect(faelligeBuchungErinnerung(nachEinladung(0), JETZT)).toBe("keine");
  });

  it("schickt an Tag 7 den zweiten Versuch, nicht noch einmal den ersten", () => {
    const stand = { ...nachEinladung(7), stufe: 1 as const };
    expect(faelligeBuchungErinnerung(stand, JETZT)).toBe("tag7");
    // Und wer die erste noch nicht hat, bekommt erst die erste.
    expect(faelligeBuchungErinnerung(nachEinladung(7), JETZT)).toBe("tag3");
  });

  it("meldet an Tag 10 an HR, statt eine dritte Mail zu schicken", () => {
    const stand = { ...nachEinladung(10), stufe: 2 as const };
    expect(faelligeBuchungErinnerung(stand, JETZT)).toBe("hr10");
    expect(gehtAnHr("hr10")).toBe(true);
  });

  it("hört nach der Meldung an HR auf", () => {
    const stand = { ...nachEinladung(30), stufe: 3 as const };
    expect(buchungStoppGrund(stand, JETZT)).toBe("fertig");
    expect(faelligeBuchungErinnerung(stand, JETZT)).toBe("keine");
  });

  it("kommt gar nicht, solange nichts abgeschickt ist", () => {
    expect(buchungStoppGrund({}, JETZT)).toBe("keine_zusammenfassung");
  });

  it("schickt an einem Tag nur eine Stufe, nicht die ganze Kette", () => {
    // Wer 30 Tage liegt und noch auf Stufe 0 steht, bekommt heute die erste
    // Mail und nicht alle drei Nachrichten auf einmal.
    expect(faelligeBuchungErinnerung(nachEinladung(30), JETZT)).toBe("tag3");
  });
});

/**
 * Die umgedrehte Hälfte. Ohne sie wäre die Umstellung ein Rückschritt: Vorher
 * geschah wenigstens etwas, wenn niemand etwas tat.
 */
describe("Vor der Einladung sind wir am Zug", () => {
  it("schreibt keine einzige Zeile an den Bewerber, solange er nicht eingeladen ist", () => {
    for (const tage of [3, 7, 10, 30]) {
      const art = faelligeBuchungErinnerung({ zusammenfassungAm: vorTagen(tage) }, JETZT);
      if (art !== "keine") expect(gehtAnHr(art)).toBe(true);
      expect(art).not.toBe("tag3");
      expect(art).not.toBe("tag7");
    }
  });

  it("erinnert HR an Tag 3 und noch einmal an Tag 7", () => {
    expect(faelligeBuchungErinnerung({ zusammenfassungAm: vorTagen(SICHTUNG_TAG) }, JETZT))
      .toBe("sichtung3");
    expect(
      faelligeBuchungErinnerung(
        { zusammenfassungAm: vorTagen(SICHTUNG_TAG_2), sichtungStufe: 1 },
        JETZT,
      ),
    ).toBe("sichtung7");
  });

  it("schweigt vorher und hört nach der zweiten Meldung auf", () => {
    expect(faelligeBuchungErinnerung({ zusammenfassungAm: vorTagen(2) }, JETZT)).toBe("keine");
    const durch = { zusammenfassungAm: vorTagen(30), sichtungStufe: 2 as const };
    expect(buchungStoppGrund(durch, JETZT)).toBe("fertig");
    expect(faelligeBuchungErinnerung(durch, JETZT)).toBe("keine");
  });

  it("zählt ab dem abgeschickten Bogen, die andere Hälfte ab der Einladung", () => {
    const stand = { zusammenfassungAm: vorTagen(20), einladungAm: vorTagen(4) };
    expect(sichtungStartAm(stand)).toBe(vorTagen(20));
    expect(buchungStartAm(stand)).toBe(vorTagen(4));
    // Eingeladen heißt: die Sichtung ist erledigt, egal wie lange sie lief.
    expect(faelligeBuchungErinnerung(stand, JETZT)).toBe("tag3");
  });

  it("hört auf, sobald die Einladung hinaus ist, auch mitten in der Kette", () => {
    const offen = { zusammenfassungAm: vorTagen(4), sichtungStufe: 1 as const };
    expect(faelligeBuchungErinnerung(offen, JETZT)).toBe("keine");
    // Und nach der Einladung beginnt die zweite Hälfte bei null.
    const eingeladen = { ...offen, einladungAm: vorTagen(0) };
    expect(faelligeBuchungErinnerung(eingeladen, JETZT)).toBe("keine");
  });

  it("meldet nichts, wenn schon abgesagt oder ein Termin von Hand eingetragen wurde", () => {
    expect(
      faelligeBuchungErinnerung({ zusammenfassungAm: vorTagen(9), bewerberStatus: "Abgelehnt" }, JETZT),
    ).toBe("keine");
    expect(
      faelligeBuchungErinnerung({ zusammenfassungAm: vorTagen(9), terminGebucht: true }, JETZT),
    ).toBe("keine");
  });
});

describe("Wann sie ausbleibt", () => {
  it("stoppt sofort, sobald ein Termin steht", () => {
    const stand = { zusammenfassungAm: vorTagen(5), terminGebucht: true };
    expect(buchungStoppGrund(stand, JETZT)).toBe("termin_steht");
    expect(faelligeBuchungErinnerung(stand, JETZT)).toBe("keine");
  });

  it("erreicht keinen abgelehnten Bewerber", () => {
    for (const [status, grund] of [
      ["Abgelehnt", "abgelehnt"],
      ["KeinInteresse", "kein_interesse"],
    ] as const) {
      const stand = { zusammenfassungAm: vorTagen(5), bewerberStatus: status };
      expect(buchungStoppGrund(stand, JETZT)).toBe(grund);
      expect(faelligeBuchungErinnerung(stand, JETZT)).toBe("keine");
    }
  });

  it("erreicht niemanden, der längst weiter ist", () => {
    for (const status of ["Closing", "Vertrag", "Aktiv"]) {
      const stand = { zusammenfassungAm: vorTagen(5), bewerberStatus: status };
      expect(buchungStoppGrund(stand, JETZT)).toBe("weiter_im_prozess");
    }
    // Im Eingang und im Gespräch darf sie dagegen hinausgehen.
    expect(buchungStoppGrund({ zusammenfassungAm: vorTagen(5), bewerberStatus: "Eingang" }, JETZT)).toBeNull();
    expect(buchungStoppGrund({ zusammenfassungAm: vorTagen(5), bewerberStatus: "Erstgespraech" }, JETZT)).toBeNull();
  });
});

/**
 * Die Pause. Christians Vorgabe vom 07.09.2026: Sie verschiebt die Kette um
 * ihre Dauer, sie hebt sie nicht mehr für immer auf. Eine Pause heißt
 * „später", eine Abmeldung heißt „nie", und die beiden dürfen nicht dasselbe
 * bewirken.
 */
describe("Die selbst gewählte Pause", () => {
  it("schweigt, solange sie läuft", () => {
    const stand = {
      zusammenfassungAm: vorTagen(5),
      pauseGesetzt: true,
      pausiertBis: inTagen(10),
    };
    expect(buchungStoppGrund(stand, JETZT)).toBe("pausiert");
    expect(faelligeBuchungErinnerung(stand, JETZT)).toBe("keine");
  });

  it("läuft danach weiter und zählt ab dem selbst gewählten Tag", () => {
    // Er hat sich am zwanzigsten Tag auf heute vor vier Tagen vertagt. Ohne
    // die Verschiebung waeren jetzt alle drei Stufen an einem Morgen faellig.
    const stand = {
      zusammenfassungAm: vorTagen(40),
      einladungAm: vorTagen(20),
      pauseGesetzt: true,
      pausiertBis: vorTagen(4),
    };
    expect(buchungStoppGrund(stand, JETZT)).toBeNull();
    expect(buchungStartAm(stand)).toBe(vorTagen(4));
    expect(faelligeBuchungErinnerung(stand, JETZT)).toBe("tag3");
    // Tag 7 der Kette ist von dort aus noch nicht erreicht.
    expect(faelligeBuchungErinnerung({ ...stand, stufe: 1 }, JETZT)).toBe("keine");
  });

  it("bleibt still bei „ich melde mich selbst", () => {
    // Eine Pause ohne Wunschdatum ist eine ausdrückliche Wahl. Wer gar nichts
    // mehr will, hat den Weg „Kein Interesse".
    const stand = { zusammenfassungAm: vorTagen(20), pauseGesetzt: true };
    expect(buchungStoppGrund(stand, JETZT)).toBe("pausiert");
  });
});

describe("Der Stand aus der Datenbankzeile", () => {
  it("liest Zusammenfassung, Stufe und Termin aus dem Meta-Feld", () => {
    const stand = buchungStand({
      status: "Eingang",
      meta: {
        erstgespraechDatum: "",
        kennenlernen: { zusammenfassungAm: vorTagen(4) },
      },
    });
    expect(stand.zusammenfassungAm).toBe(vorTagen(4));
    expect(stand.terminGebucht).toBe(false);
    expect(stand.stufe).toBe(0);
    expect(stand.sichtungStufe).toBe(0);
    expect(stand.einladungAm).toBeNull();
    // Ohne Einladung ist die Meldung an uns dran, keine Mail an den Bewerber.
    expect(faelligeBuchungErinnerung(stand, JETZT)).toBe("sichtung3");
  });

  it("liest den Vermerk der verschickten Einladung mit", () => {
    /*
     * `einladungAm` schreibt `vermerkeKooperationsEinladung` aus dem
     * Bewerberprofil. Er ist der Schalter zwischen den beiden Hälften, und
     * ohne ihn liefe die alte, umgekehrte Kette weiter.
     */
    const stand = buchungStand({
      status: "Eingang",
      meta: {
        kennenlernen: { zusammenfassungAm: vorTagen(20), einladungAm: vorTagen(3) },
      },
    });
    expect(stand.einladungAm).toBe(vorTagen(3));
    expect(faelligeBuchungErinnerung(stand, JETZT)).toBe("tag3");
  });

  it("erkennt einen gebuchten Termin an demselben Feld wie das CRM", () => {
    const stand = buchungStand({
      status: "Eingang",
      meta: {
        erstgespraechDatum: "2026-09-15",
        kennenlernen: { zusammenfassungAm: vorTagen(4) },
      },
    });
    expect(stand.terminGebucht).toBe(true);
    expect(faelligeBuchungErinnerung(stand, JETZT)).toBe("keine");
  });

  it("zählt einen Bestand mit dem alten Merker als Stufe 1", () => {
    /*
     * Ohne diese Rückfallebene bekämen alle, die die eine alte Mail schon
     * hatten, sie ein zweites Mal. Deshalb keine Migration nötig.
     */
    const stand = buchungStand({
      status: "Eingang",
      meta: {
        kennenlernen: {
          zusammenfassungAm: vorTagen(28),
          einladungAm: vorTagen(8),
          buchungErinnerungAm: vorTagen(5),
        },
      },
    });
    expect(stand.stufe).toBe(1);
    expect(faelligeBuchungErinnerung(stand, JETZT)).toBe("tag7");
  });

  it("kommt mit einer Zeile ohne Meta-Feld zurecht", () => {
    expect(buchungStand({}).zusammenfassungAm).toBeNull();
    expect(buchungStand({ meta: null }).terminGebucht).toBe(false);
  });
});

/*
 * Dieselbe Frage stellt seit dem 08.09.2026 auch die Zusammenfassungsmail:
 * Steht schon ein Termin, faellt der Knopf „Termin aussuchen" weg. Sie stellt
 * sie ueber genau diesen Helfer, damit es nicht zwei Antworten auf dieselbe
 * Frage gibt.
 */
describe("Der Termin aus dem Meta-Feld", () => {
  it("gibt Datum und Uhrzeit zurück, wenn ein Termin steht", () => {
    expect(terminAusMeta({ erstgespraechDatum: "2026-09-15", erstgespraechUhrzeit: "10:00" }))
      .toEqual({ datum: "2026-09-15", uhrzeit: "10:00" });
  });

  it("kommt ohne Uhrzeit aus", () => {
    expect(terminAusMeta({ erstgespraechDatum: "2026-09-15" }))
      .toEqual({ datum: "2026-09-15", uhrzeit: "" });
  });

  it("meldet nichts, wenn kein Termin steht", () => {
    expect(terminAusMeta(null)).toBeNull();
    expect(terminAusMeta({})).toBeNull();
    // Das Absagen räumt das Feld, es bleibt als leerer Text stehen.
    expect(terminAusMeta({ erstgespraechDatum: "   " })).toBeNull();
  });
});

describe("Der Vermerk nach dem Versand", () => {
  it("hält den vorhandenen Block und hebt die Stufe", () => {
    const neu = vermerkNachBuchungStufe(
      { gesendetAm: "2026-09-01T08:00:00.000Z", erinnerungStufe: 1 },
      "tag3",
      JETZT.toISOString(),
      true,
    );
    expect(neu.gesendetAm).toBe("2026-09-01T08:00:00.000Z");
    expect(neu.erinnerungStufe).toBe(1);
    expect(neu.buchungStufe).toBe(1);
    expect(neu.buchungErinnerungAm).toBe(JETZT.toISOString());
    expect(neu.buchungErinnerungOk).toBe(true);
  });

  it("schreibt für jede Stufe ein eigenes Feld", () => {
    const zwei = vermerkNachBuchungStufe({}, "tag7", JETZT.toISOString(), true);
    expect(zwei.buchungStufe).toBe(2);
    expect(zwei.buchungErinnerung2Am).toBe(JETZT.toISOString());

    const drei = vermerkNachBuchungStufe({}, "hr10", JETZT.toISOString(), true);
    expect(drei.buchungStufe).toBe(3);
    expect(drei.buchungHrMitteilungAm).toBe(JETZT.toISOString());
  });

  it("hält auch einen Fehlschlag fest, damit er sich nicht täglich wiederholt", () => {
    const neu = vermerkNachBuchungErinnerung({}, JETZT.toISOString(), false);
    expect(neu.buchungErinnerungOk).toBe(false);
    // Die Stufe steht danach auf 1, die erste Mail kommt also kein zweites Mal.
    expect(buchungStand({ meta: { kennenlernen: neu } }).stufe).toBe(1);
  });

  it("führt die Kette Stufe für Stufe bis ans Ende", () => {
    let block: Record<string, unknown> = {
      zusammenfassungAm: vorTagen(50),
      einladungAm: vorTagen(30),
    };
    const gesehen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const stand = buchungStand({ status: "Eingang", meta: { kennenlernen: block } });
      const art = faelligeBuchungErinnerung(stand, JETZT);
      if (art === "keine") break;
      gesehen.push(art);
      block = vermerkNachBuchungStufe(block, art, JETZT.toISOString(), true);
    }
    expect(gesehen).toEqual(["tag3", "tag7", "hr10"]);
  });

  it("führt auch die Sichtung Stufe für Stufe und hört dann auf", () => {
    let block: Record<string, unknown> = { zusammenfassungAm: vorTagen(30) };
    const gesehen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const stand = buchungStand({ status: "Eingang", meta: { kennenlernen: block } });
      const art = faelligeBuchungErinnerung(stand, JETZT);
      if (art === "keine") break;
      gesehen.push(art);
      block = vermerkNachBuchungStufe(block, art, JETZT.toISOString(), true);
    }
    expect(gesehen).toEqual(["sichtung3", "sichtung7"]);
    // Eigene Felder, damit die beiden Hälften sich nicht gegenseitig zählen.
    expect(block.sichtungStufe).toBe(2);
    expect(block.buchungStufe).toBeUndefined();
    expect(block.sichtungMeldung2Am).toBe(JETZT.toISOString());
  });
});
