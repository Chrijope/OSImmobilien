import { describe, it, expect } from "vitest";
import {
  baueKundenAufgabenListe,
  faelligkeitText,
  quelleLabel,
  zaehleKundenAufgaben,
} from "@/lib/kundenAufgabenListe";
import type { Aufgabe } from "@/lib/aufgabenStore";
import type { FollowUp } from "@/lib/followUpStore";

/** 15. September 2026, 14 Uhr. Alle Erwartungen unten rechnen gegen diesen Zeitpunkt. */
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

describe("baueKundenAufgabenListe: beide Quellen", () => {
  it("führt Aufgaben und Follow-ups zu einer Liste zusammen", () => {
    const liste = baueKundenAufgabenListe(
      [aufgabe({ id: "a1", titel: "Unterlagen prüfen", faelligAm: "2026-09-20" })],
      [followUp({ id: "f1", titel: "Nachfassen", faelligAm: "2026-09-21" })],
      JETZT,
    );
    expect(liste.map((e) => e.schluessel)).toEqual(["aufgabe:a1", "follow_up:f1"]);
    expect(liste.map((e) => e.quelle)).toEqual(["aufgabe", "follow_up"]);
  });

  it("lässt erledigte und abgesagte Aufgaben weg", () => {
    const liste = baueKundenAufgabenListe(
      [
        aufgabe({ id: "a1", status: "erledigt" }),
        aufgabe({ id: "a2", status: "abgesagt" }),
        aufgabe({ id: "a3", status: "in_bearbeitung" }),
      ],
      [],
      JETZT,
    );
    expect(liste.map((e) => e.id)).toEqual(["a3"]);
  });

  it("nimmt vom Follow-up nur offen und überfällig", () => {
    const liste = baueKundenAufgabenListe(
      [],
      [
        followUp({ id: "f1", status: "offen" }),
        followUp({ id: "f2", status: "ueberfallig", faelligAm: "2026-09-01" }),
        followUp({ id: "f3", status: "erledigt" }),
      ],
      JETZT,
    );
    expect(liste.map((e) => e.id)).toEqual(["f2", "f1"]);
  });

  it("lässt Aufgaben mit Bewerbungsbezug weg, die gehören nicht zum Kunden", () => {
    const liste = baueKundenAufgabenListe(
      [aufgabe({ id: "a1", bewerbungId: "b1" }), aufgabe({ id: "a2" })],
      [],
      JETZT,
    );
    expect(liste.map((e) => e.id)).toEqual(["a2"]);
  });

  it("verträgt leere Eingaben", () => {
    expect(baueKundenAufgabenListe([], [], JETZT)).toEqual([]);
  });
});

describe("baueKundenAufgabenListe: überfällig", () => {
  it("stuft ein Datum vor heute als überfällig ein", () => {
    const [e] = baueKundenAufgabenListe([aufgabe({ id: "a1", faelligAm: "2026-09-14" })], [], JETZT);
    expect(e.ueberfaellig).toBe(true);
    expect(e.heute).toBe(false);
  });

  it("gibt bei einem Termin heute ohne Uhrzeit den ganzen Tag Zeit", () => {
    const [e] = baueKundenAufgabenListe([aufgabe({ id: "a1", faelligAm: "2026-09-15" })], [], JETZT);
    expect(e.ueberfaellig).toBe(false);
    expect(e.heute).toBe(true);
  });

  it("entscheidet bei einem Termin heute die Uhrzeit", () => {
    const frueh = baueKundenAufgabenListe(
      [aufgabe({ id: "a1", faelligAm: "2026-09-15", uhrzeit: "09:00" })],
      [],
      JETZT,
    )[0];
    const spaet = baueKundenAufgabenListe(
      [aufgabe({ id: "a2", faelligAm: "2026-09-15", uhrzeit: "17:00" })],
      [],
      JETZT,
    )[0];
    expect(frueh.ueberfaellig).toBe(true);
    expect(spaet.ueberfaellig).toBe(false);
    expect(spaet.heute).toBe(true);
  });

  it("macht aus einem Vorgang ohne Termin keinen überfälligen", () => {
    const [e] = baueKundenAufgabenListe([aufgabe({ id: "a1", faelligAm: undefined })], [], JETZT);
    expect(e.ueberfaellig).toBe(false);
    expect(e.heute).toBe(false);
    expect(e.faelligTag).toBe("");
  });
});

describe("baueKundenAufgabenListe: Reihenfolge", () => {
  it("setzt überfällige nach oben, das Älteste zuerst", () => {
    const liste = baueKundenAufgabenListe(
      [
        aufgabe({ id: "morgen", faelligAm: "2026-09-16" }),
        aufgabe({ id: "alt", faelligAm: "2026-09-01" }),
        aufgabe({ id: "gestern", faelligAm: "2026-09-14" }),
      ],
      [],
      JETZT,
    );
    expect(liste.map((e) => e.id)).toEqual(["alt", "gestern", "morgen"]);
  });

  it("stellt Vorgänge ohne Termin ans Ende", () => {
    const liste = baueKundenAufgabenListe(
      [aufgabe({ id: "ohne" }), aufgabe({ id: "mit", faelligAm: "2026-09-30" })],
      [],
      JETZT,
    );
    expect(liste.map((e) => e.id)).toEqual(["mit", "ohne"]);
  });

  it("sortiert am selben Tag nach Uhrzeit, Termine ohne Uhrzeit zuletzt", () => {
    const liste = baueKundenAufgabenListe(
      [
        aufgabe({ id: "ohne", faelligAm: "2026-09-16" }),
        aufgabe({ id: "spaet", faelligAm: "2026-09-16", uhrzeit: "16:00" }),
        aufgabe({ id: "frueh", faelligAm: "2026-09-16", uhrzeit: "08:30" }),
      ],
      [],
      JETZT,
    );
    expect(liste.map((e) => e.id)).toEqual(["frueh", "spaet", "ohne"]);
  });
});

describe("zaehleKundenAufgaben", () => {
  it("zählt alles Offene und davon die überfälligen", () => {
    const liste = baueKundenAufgabenListe(
      [
        aufgabe({ id: "a1", faelligAm: "2026-09-01" }),
        aufgabe({ id: "a2", faelligAm: "2026-09-30" }),
      ],
      [followUp({ id: "f1", faelligAm: "2026-09-10" })],
      JETZT,
    );
    expect(zaehleKundenAufgaben(liste)).toEqual({ gesamt: 3, ueberfaellig: 2 });
  });

  it("zählt eine leere Liste als null", () => {
    expect(zaehleKundenAufgaben([])).toEqual({ gesamt: 0, ueberfaellig: 0 });
  });
});

describe("faelligkeitText", () => {
  const text = (teil: Partial<Aufgabe> & { id: string }) =>
    faelligkeitText(baueKundenAufgabenListe([aufgabe(teil)], [], JETZT)[0]);

  it("sagt bei heute heute", () => {
    expect(text({ id: "a1", faelligAm: "2026-09-15" })).toBe("heute");
    expect(text({ id: "a2", faelligAm: "2026-09-15", uhrzeit: "17:00" })).toBe("heute, 17:00 Uhr");
  });

  it("benennt überfällige mit Datum", () => {
    expect(text({ id: "a1", faelligAm: "2026-09-01" })).toBe("überfällig seit 01.09.2026");
  });

  it("zeigt künftige Termine als deutsches Datum", () => {
    expect(text({ id: "a1", faelligAm: "2026-10-02" })).toBe("02.10.2026");
  });

  it("nennt fehlende Termine beim Namen", () => {
    expect(text({ id: "a1" })).toBe("Ohne Termin");
  });
});

describe("quelleLabel", () => {
  it("benennt die Herkunft auf Deutsch", () => {
    expect(quelleLabel("aufgabe")).toBe("Aufgabe");
    expect(quelleLabel("follow_up")).toBe("Follow-up");
  });
});
