import { describe, it, expect, vi } from "vitest";
import {
  ANKER_FESTER_TERMIN,
  aktionArtLabel,
  aktionFaelligkeitText,
  aktionZeitpunktText,
  baueGeplanteAktionen,
  festerTerminSchluessel,
  naechsteAktion,
  titelTagSchluessel,
} from "@/lib/kundenNaechsteAktion";
import type { Aufgabe } from "@/lib/aufgabenStore";
import type { FollowUp } from "@/lib/followUpStore";
import type { AktivitaetEntry } from "@/lib/aktivitaetenStore";
import { abschlussWeg, sammelbareAufgaben } from "@/lib/aktionAbschluss";

// Der Aufgaben-Store zieht beim Laden den Supabase-Client nach. Für den
// Vergleich der Schlüsselregel reicht eine Attrappe.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));

/** Dienstag, 15. September 2026, 14 Uhr. Alle Erwartungen rechnen gegen diesen Zeitpunkt. */
const JETZT = new Date(2026, 8, 15, 14, 0);

function aufgabe(teil: Partial<Aufgabe> & { id: string }): Aufgabe {
  return {
    benutzerId: "u1",
    kontaktId: "k1",
    typ: "aufgabe",
    prioritaet: "mittel",
    status: "offen",
    titel: "Aufgabe",
    ...teil,
  } as Aufgabe;
}

function followUp(teil: Partial<FollowUp> & { id: string }): FollowUp {
  return {
    kundeId: "k1",
    kundeName: "Kunde",
    berater: "Berater",
    pipelineStufe: "erstgespraech_geplant",
    typ: "anruf",
    titel: "Follow-up",
    beschreibung: "",
    faelligAm: "2026-09-20",
    erstelltAm: "2026-09-01",
    status: "offen",
    prioritaet: "mittel",
    automatisch: false,
    ...teil,
  } as FollowUp;
}

function aktivitaet(teil: Partial<AktivitaetEntry> & { id: string }): AktivitaetEntry {
  return {
    kundeId: "k1",
    art: "meeting",
    beschreibung: "Meeting",
    von: "Berater",
    datum: "2026-09-01T10:00:00",
    ...teil,
  } as AktivitaetEntry;
}

describe("baueGeplanteAktionen: Quellen und Arten", () => {
  it("führt Aufgaben, Follow-ups, Meetings und feste Termine chronologisch zusammen", () => {
    const liste = baueGeplanteAktionen(
      {
        aufgaben: [aufgabe({ id: "a1", titel: "Unterlagen prüfen", faelligAm: "2026-09-22", uhrzeit: "10:00" })],
        followUps: [followUp({ id: "f1", titel: "Nachfassen", faelligAm: "2026-09-20" })],
        aktivitaeten: [aktivitaet({ id: "m1", beschreibung: "Objektvorstellung", faelligAm: "2026-09-18", uhrzeit: "14:00" })],
        termine: [{ datum: "2026-09-25", uhrzeit: "11:00", bezeichnung: "Notartermin" }],
      },
      JETZT,
    );
    expect(liste.map((x) => x.titel)).toEqual(["Objektvorstellung", "Nachfassen", "Unterlagen prüfen", "Notartermin"]);
    expect(liste.map((x) => x.art)).toEqual(["termin", "follow_up", "aufgabe", "termin"]);
    expect(liste.every((x) => !x.ueberfaellig)).toBe(true);
  });

  it("nennt ein Meeting mit Videolink Videomeeting und ein Follow-up aus der Aufgabentabelle Follow-up", () => {
    const liste = baueGeplanteAktionen(
      {
        aufgaben: [
          aufgabe({ id: "a1", typ: "meeting", titel: "Beratung", faelligAm: "2026-09-18", uhrzeit: "14:00" }),
          aufgabe({ id: "a2", typ: "follow_up", titel: "Rückruf", faelligAm: "2026-09-19", uhrzeit: "09:00" }),
        ],
        aktivitaeten: [aktivitaet({ id: "m1", beschreibung: "Beratung", faelligAm: "2026-09-18", uhrzeit: "14:00", zoomLink: "/raum/abc" })],
      },
      JETZT,
    );
    expect(liste.map((x) => x.art)).toEqual(["videotermin", "follow_up"]);
    expect(aktionArtLabel("videotermin")).toBe("Videomeeting");
  });

  it("lässt erledigte Aufgaben, Aufgaben ohne Fälligkeit, Bewerber und Wiedervorlagen weg", () => {
    const liste = baueGeplanteAktionen(
      {
        aufgaben: [
          aufgabe({ id: "a1", status: "erledigt", faelligAm: "2026-09-20" }),
          aufgabe({ id: "a2", titel: "Ohne Termin" }),
          aufgabe({ id: "a3", bewerbungId: "b1", faelligAm: "2026-09-20" }),
          aufgabe({ id: "a4", ausloeserSchluessel: "nicht_erreicht:1", faelligAm: "2026-09-20" }),
          aufgabe({ id: "a5", titel: "Zählt", faelligAm: "2026-09-20" }),
          // Handbuch-Lead: steht nur unter "Offene Aufgaben".
          aufgabe({ id: "a6", titel: "Objekt-Vorstellungstermin vereinbaren", ausloeserSchluessel: "objekt_vorstellung:k1", faelligAm: "2026-09-15" }),
        ],
        aktivitaeten: [aktivitaet({ id: "m1", beschreibung: "Alt", faelligAm: "2026-09-10", erledigtAm: "2026-09-10T12:00:00" })],
      },
      JETZT,
    );
    expect(liste.map((x) => x.schluessel)).toEqual(["aufgabe:a5"]);
  });
});

describe("baueGeplanteAktionen: Entdopplung und Sprungziele", () => {
  it("zeigt eine Aufgabe nur einmal und springt zu ihrer Kopie im Verlauf", () => {
    const liste = baueGeplanteAktionen(
      {
        aufgaben: [aufgabe({ id: "a1", titel: "Unterlagen prüfen", faelligAm: "2026-09-22T09:00:00" })],
        aktivitaeten: [aktivitaet({ id: "k1", art: "aufgabe", beschreibung: "Unterlagen prüfen", faelligAm: "2026-09-22" })],
      },
      JETZT,
    );
    expect(liste).toHaveLength(1);
    expect(liste[0].sprungziel).toEqual({ reiter: "aktivitaeten", ankerId: "aktivitaet-k1" });
  });

  it("führt ohne Kopie zur Zeile der Aufgabe selbst, bei automatischen Aufgaben nirgendwohin", () => {
    const liste = baueGeplanteAktionen(
      {
        aufgaben: [
          aufgabe({ id: "a1", titel: "Von Hand", faelligAm: "2026-09-22" }),
          aufgabe({ id: "a2", titel: "Vom System", faelligAm: "2026-09-23", ausloeserSchluessel: "notar_foto_fehlt:x" }),
        ],
      },
      JETZT,
    );
    expect(liste[0].sprungziel).toEqual({ reiter: "aktivitaeten", ankerId: "aktivitaet-aufgabe-a1" });
    expect(liste[1].sprungziel).toBeNull();
  });

  it("zeigt ein Follow-up nicht doppelt, wenn es auch als Aufgabe gespeichert ist", () => {
    const liste = baueGeplanteAktionen(
      {
        aufgaben: [aufgabe({ id: "a1", typ: "follow_up", titel: "Nachfassen", faelligAm: "2026-09-20" })],
        followUps: [followUp({ id: "f1", titel: "Nachfassen", faelligAm: "2026-09-20" })],
      },
      JETZT,
    );
    expect(liste.map((x) => x.schluessel)).toEqual(["aufgabe:a1"]);
  });

  it("nimmt die am Kontakt gemerkte Uhrzeit des Follow-ups nur bei gleichem Tag", () => {
    const [mit, ohne] = baueGeplanteAktionen(
      {
        followUps: [
          followUp({ id: "f1", titel: "Heute", faelligAm: "2026-09-16" }),
          followUp({ id: "f2", titel: "Später", faelligAm: "2026-09-17" }),
        ],
        followUpUhrzeit: { tag: "2026-09-16", uhrzeit: "10:30" },
      },
      JETZT,
    );
    expect(mit.hatUhrzeit).toBe(true);
    expect(aktionZeitpunktText(mit, JETZT)).toBe("Mi 16.09., 10:30");
    expect(ohne.hatUhrzeit).toBe(false);
    expect(aktionZeitpunktText(ohne, JETZT)).toBe("Do 17.09.");
  });

  it("zählt einen festen Termin nicht, wenn zur selben Zeit ein Meeting im Verlauf steht, und springt sonst in die Stammdaten", () => {
    const liste = baueGeplanteAktionen(
      {
        aktivitaeten: [aktivitaet({ id: "m1", beschreibung: "Beratungsgespräch", faelligAm: "2026-09-18", uhrzeit: "14:00" })],
        termine: [
          { datum: "2026-09-18", uhrzeit: "14:00", bezeichnung: "Beratungsgespräch" },
          { datum: "2026-09-18", uhrzeit: "14:00", bezeichnung: "Beratungsgespräch" },
          { datum: "2026-10-02", uhrzeit: "09:00", bezeichnung: "Notartermin" },
        ],
      },
      JETZT,
    );
    expect(liste.map((x) => x.titel)).toEqual(["Beratungsgespräch", "Notartermin"]);
    expect(liste[0].sprungziel).toEqual({ reiter: "aktivitaeten", ankerId: "aktivitaet-m1" });
    expect(liste[1].sprungziel).toEqual({ reiter: "stammdaten", ankerId: ANKER_FESTER_TERMIN });
  });

  it("rechnet den Schlüssel genauso wie der Aufgaben-Store", async () => {
    const { aufgabenSchluessel } = await import("@/lib/aufgabenStore");
    for (const [titel, tag] of [["  Unterlagen Prüfen ", "2026-09-22T09:00:00"], ["", ""], ["x", undefined]] as const) {
      expect(titelTagSchluessel(titel, tag)).toBe(aufgabenSchluessel(titel, tag));
    }
  });
});

describe("naechsteAktion und Beschriftung", () => {
  it("wählt den nächsten bevorstehenden Schritt, sonst den zuletzt fälligen", () => {
    const liste = baueGeplanteAktionen(
      {
        aufgaben: [
          aufgabe({ id: "a1", titel: "Längst fällig", faelligAm: "2026-09-01" }),
          aufgabe({ id: "a2", titel: "Gestern", faelligAm: "2026-09-14" }),
          aufgabe({ id: "a3", titel: "Bald", faelligAm: "2026-09-20" }),
        ],
      },
      JETZT,
    );
    expect(liste.map((x) => x.titel)).toEqual(["Längst fällig", "Gestern", "Bald"]);
    expect(naechsteAktion(liste)?.titel).toBe("Bald");
    expect(naechsteAktion(liste.slice(0, 2))?.titel).toBe("Gestern");
    expect(naechsteAktion([])).toBeNull();
  });

  it("schreibt Wochentag, Datum und Uhrzeit, heute nur heute, andere Jahre mit Jahr", () => {
    const liste = baueGeplanteAktionen(
      {
        aufgaben: [
          aufgabe({ id: "a1", titel: "Heute", faelligAm: "2026-09-15", uhrzeit: "16:00" }),
          aufgabe({ id: "a2", titel: "Donnerstag", faelligAm: "2026-09-17", uhrzeit: "14:00" }),
          aufgabe({ id: "a3", titel: "Nächstes Jahr", faelligAm: "2027-01-05" }),
          aufgabe({ id: "a4", titel: "Vorbei", faelligAm: "2026-09-10", uhrzeit: "09:30" }),
        ],
      },
      JETZT,
    );
    const nach = (titel: string) => liste.find((x) => x.titel === titel)!;
    expect(aktionFaelligkeitText(nach("Heute"), JETZT)).toBe("heute, 16:00");
    expect(aktionFaelligkeitText(nach("Donnerstag"), JETZT)).toBe("Do 17.09., 14:00");
    expect(aktionFaelligkeitText(nach("Nächstes Jahr"), JETZT)).toBe("Di 05.01.2027");
    expect(aktionFaelligkeitText(nach("Vorbei"), JETZT)).toBe("überfällig seit Do 10.09., 09:30");
  });
});

describe("wartende Unterschriften", () => {
  const versendet = (tageHer: number) => JETZT.getTime() - tageHer * 86_400_000;

  it("füllt die Kachel, während die Reservierung auf die Unterschrift wartet", () => {
    const liste = baueGeplanteAktionen(
      { unterschriften: [{ investmentId: "inv-1", bezeichnung: "Reservierungsvereinbarung", versendetMs: versendet(3) }] },
      JETZT,
    );
    expect(liste).toHaveLength(1);
    expect(liste[0].titel).toBe("Reservierungsvereinbarung wartet seit 3 Tagen auf Unterschrift");
    expect(liste[0].art).toBe("unterschrift");
    expect(aktionArtLabel(liste[0].art)).toBe("Unterschrift offen");
    // Vorher stand hier "Nichts geplant".
    expect(naechsteAktion(liste)?.schluessel).toBe("unterschrift:inv-1");
  });

  it("nennt in der Unterzeile den Versandtag, nicht eine Überfälligkeit", () => {
    const [eintrag] = baueGeplanteAktionen(
      { unterschriften: [{ investmentId: "inv-1", bezeichnung: "Reservierungsvereinbarung", versendetMs: versendet(3) }] },
      JETZT,
    );
    expect(aktionFaelligkeitText(eintrag, JETZT)).toBe("versendet am Sa 12.09.");
  });

  it("zeigt eine Vereinbarung ohne Versandzeitpunkt ohne Tagesangabe", () => {
    const liste = baueGeplanteAktionen(
      { unterschriften: [{ investmentId: "inv-alt", bezeichnung: "Reservierungsvereinbarung", versendetMs: null }] },
      JETZT,
    );
    expect(liste).toHaveLength(1);
    expect(liste[0].titel).toBe("Reservierungsvereinbarung versendet, wartet auf Unterschrift");
    expect(aktionFaelligkeitText(liste[0], JETZT)).toBe("Versanddatum nicht erfasst");
    expect(naechsteAktion(liste)?.schluessel).toBe("unterschrift:inv-alt");
    expect(abschlussWeg(liste[0])).toBe("hinweis");
  });

  it("lässt den zeitlosen Eintrag hinter einer überfälligen Aufgabe zurück", () => {
    const liste = baueGeplanteAktionen(
      {
        aufgaben: [aufgabe({ id: "a1", titel: "Unterlagen nachfordern", faelligAm: "2026-09-14" })],
        unterschriften: [{ investmentId: "inv-alt", bezeichnung: "Reservierungsvereinbarung", versendetMs: null }],
      },
      JETZT,
    );
    expect(naechsteAktion(liste)?.titel).toBe("Unterlagen nachfordern");
    expect(liste).toHaveLength(2);
  });

  it("schweigt am Versandtag, da ist noch nichts liegen geblieben", () => {
    const liste = baueGeplanteAktionen(
      { unterschriften: [{ investmentId: "inv-1", bezeichnung: "Reservierungsvereinbarung", versendetMs: versendet(0) }] },
      JETZT,
    );
    expect(liste).toEqual([]);
  });

  it("verschwindet, sobald keine Unterschrift mehr aussteht", () => {
    // Nach der Unterschrift liefert der Store keinen Eintrag mehr.
    expect(baueGeplanteAktionen({ unterschriften: [] }, JETZT)).toEqual([]);
  });

  it("lässt sich nicht abhaken, denn erledigt ist sie erst mit der Unterschrift", () => {
    const liste = baueGeplanteAktionen(
      { unterschriften: [{ investmentId: "inv-1", bezeichnung: "Reservierungsvereinbarung", versendetMs: versendet(4) }] },
      JETZT,
    );
    expect(abschlussWeg(liste[0])).toBe("hinweis");
    expect(sammelbareAufgaben(liste)).toEqual([]);
  });

  it("verdrängt keinen geplanten Termin aus der Kachel", () => {
    const liste = baueGeplanteAktionen(
      {
        aufgaben: [aufgabe({ id: "a1", titel: "Rückruf", faelligAm: "2026-09-18" })],
        unterschriften: [{ investmentId: "inv-1", bezeichnung: "Reservierungsvereinbarung", versendetMs: versendet(6) }],
      },
      JETZT,
    );
    expect(naechsteAktion(liste)?.titel).toBe("Rückruf");
    expect(liste.map((x) => x.schluessel)).toContain("unterschrift:inv-1");
  });
});

describe("baueGeplanteAktionen: Meeting und gekoppelte Aufgabe", () => {
  // Die Terminseite legt "Erstgespräch" als Meeting und "Erstgespräch mit
  // <Kunde>" als Aufgabe an, verbunden über meeting_aktivitaet_id.
  const aufgabeZumMeeting = aufgabe({
    id: "a1",
    typ: "meeting",
    titel: "Erstgespräch mit Kunde",
    faelligAm: "2026-09-30T08:00:00+00:00",
    uhrzeit: "10:00",
    meetingAktivitaetId: "m1",
  });
  const meeting = aktivitaet({ id: "m1", beschreibung: "Erstgespräch", faelligAm: "2026-09-30", uhrzeit: "10:00" });

  it("zeigt beide als einen Eintrag mit dem Titel des Meetings", () => {
    const liste = baueGeplanteAktionen({ aufgaben: [aufgabeZumMeeting], aktivitaeten: [meeting] }, JETZT);
    expect(liste).toHaveLength(1);
    expect(liste[0].titel).toBe("Erstgespräch");
    expect(liste[0].art).toBe("termin");
  });

  it("führt der Klick in den Ergebnis-Dialog des Meetings", () => {
    const [eintrag] = baueGeplanteAktionen({ aufgaben: [aufgabeZumMeeting], aktivitaeten: [meeting] }, JETZT);
    expect(eintrag.aktivitaetId).toBe("m1");
    expect(abschlussWeg(eintrag)).toBe("termin_dialog");
    expect(eintrag.sprungziel).toEqual({ reiter: "aktivitaeten", ankerId: "aktivitaet-m1" });
  });

  it("kennt das Meeting über die Kennung, auch wenn es noch nicht geladen ist", () => {
    const liste = baueGeplanteAktionen({ aufgaben: [aufgabeZumMeeting], aktivitaeten: [] }, JETZT);
    expect(liste).toHaveLength(1);
    expect(liste[0].aktivitaetId).toBe("m1");
    expect(abschlussWeg(liste[0])).toBe("termin_dialog");
  });

  it("zeigt nichts mehr, sobald das Meeting abgeschlossen ist", () => {
    const erledigt = { ...meeting, erledigtAm: "2026-09-30T09:00:00Z" };
    expect(baueGeplanteAktionen({ aufgaben: [aufgabeZumMeeting], aktivitaeten: [erledigt] }, JETZT)).toEqual([]);
  });
});

describe("baueGeplanteAktionen: überfälliger fester Termin", () => {
  it("trägt den Schlüssel, über den der Haken ihn als stattgefunden vermerkt", () => {
    const [eintrag] = baueGeplanteAktionen(
      { termine: [{ datum: "2026-06-24", uhrzeit: "12:30", bezeichnung: "Beratungsgespräch" }] },
      JETZT,
    );
    expect(eintrag.ueberfaellig).toBe(true);
    expect(abschlussWeg(eintrag)).toBe("fester_termin");
    expect(eintrag.terminSchluessel).toBe(festerTerminSchluessel("2026-06-24", "12:30"));
    expect(eintrag.terminSchluessel).toBe("2026-06-24 12:30");
  });
});
