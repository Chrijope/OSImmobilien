import { describe, it, expect } from "vitest";
import {
  baueBewerberEreignisse,
  gruppiereNachTag,
  zaehleArten,
  uhrzeitAus,
  type BewerberEreignis,
} from "./bewerberEreignisse";

/*
 * Die Beispiele sind echte Feldnamen und echte Werte, so wie sie in der
 * Bewerberakte stehen. Wer hier etwas ändert, ändert damit die Aussage der
 * Aktivitätenübersicht.
 */

function titel(liste: BewerberEreignis[]): string[] {
  return liste.map((e) => e.titel);
}

function finde(liste: BewerberEreignis[], id: string): BewerberEreignis | undefined {
  return liste.find((e) => e.id === id);
}

describe("baueBewerberEreignisse", () => {
  it("gibt für eine leere Akte eine leere Liste zurück", () => {
    expect(baueBewerberEreignisse({ bewerber: {} })).toEqual([]);
  });

  it("macht aus jeder Trackingzeile eine Mail mit ihrem deutschen Namen", () => {
    const liste = baueBewerberEreignisse({
      bewerber: {},
      mails: [
        {
          token: "t1",
          kind: "kennenlernen_einladung",
          sent_at: "2026-09-12T12:22:00.000Z",
          opened_at: null,
          clicked_at: null,
          tracked: true,
        },
        {
          token: "t2",
          kind: "muster_vertrag",
          paket_titel: "Lead Berater",
          sent_at: "2026-09-13T09:00:00.000Z",
          opened_at: null,
          clicked_at: null,
          tracked: true,
        },
      ],
    });
    expect(titel(liste)).toEqual(['Mustervertrag „Lead Berater"', "Einladung zum Kennenlernbogen"]);
  });

  it("zeigt den Linkaufruf als Marke, und sagt bei Stille nicht „ungelesen“", () => {
    const liste = baueBewerberEreignisse({
      bewerber: {},
      mails: [
        {
          token: "offen",
          kind: "kennenlernen_einladung",
          sent_at: "2026-09-12T12:22:00.000Z",
          opened_at: "2026-09-12T12:40:00.000Z",
          clicked_at: "2026-09-12T12:41:00.000Z",
          tracked: true,
        },
        {
          token: "still",
          kind: "kennenlernen_erinnerung_1",
          sent_at: "2026-09-14T06:00:00.000Z",
          opened_at: null,
          clicked_at: null,
          tracked: true,
        },
      ],
    });
    const offen = finde(liste, "mail:offen");
    // Seit dem 26.09.2026 ohne Zählpixel: opened_at allein ist keine Marke mehr.
    expect(offen?.marken.map((m) => m.ton)).toEqual(["gut"]);
    expect(offen?.marken[0].text).toMatch(/^Link geöffnet \d{2}:\d{2}$/);
    const still = finde(liste, "mail:still");
    expect(still?.marken).toEqual([{ text: "Link noch nicht geöffnet", ton: "still" }]);
  });

  it("lässt eine ungezählte Mail ohne Marke", () => {
    const liste = baueBewerberEreignisse({
      bewerber: {},
      mails: [
        {
          token: "ohne",
          kind: "paket_uebersicht",
          sent_at: "2026-09-10T08:00:00.000Z",
          opened_at: null,
          clicked_at: null,
          tracked: false,
        },
      ],
    });
    expect(finde(liste, "mail:ohne")?.marken).toEqual([]);
  });

  it("nimmt den Vermerk am Bewerber nur, wenn keine Trackingzeile dieser Art vorliegt", () => {
    const mitZeile = baueBewerberEreignisse({
      bewerber: { kennenlernenGesendetAm: "2026-09-12T12:22:00.000Z" },
      mails: [
        {
          token: "t1",
          kind: "kennenlernen_einladung",
          sent_at: "2026-09-12T12:22:00.000Z",
          tracked: true,
        },
      ],
    });
    expect(mitZeile).toHaveLength(1);
    expect(finde(mitZeile, "mail:t1")).toBeDefined();

    const ohneZeile = baueBewerberEreignisse({
      bewerber: { kennenlernenGesendetAm: "2026-09-12T12:22:00.000Z", kennenlernenGesendetVon: "Jana Kirchner" },
    });
    expect(ohneZeile).toHaveLength(1);
    expect(ohneZeile[0].text).toBe("Versendet von Jana Kirchner");
  });

  it("führt Vertragsversand, Erinnerungen und Zugangsdaten als Mails", () => {
    const liste = baueBewerberEreignisse({
      bewerber: {
        vertragErstVersandAt: "2026-09-01T10:00:00.000Z",
        vertragErinnerungenAt: ["2026-09-04T10:00:00.000Z", "2026-09-08T10:00:00.000Z"],
        zugangsdatenGesendetAm: "2026-09-10T10:00:00.000Z",
        zugangsdatenGesendetAn: "m.beispiel@example.de",
      },
    });
    expect(titel(liste)).toEqual([
      "Zugangsdaten versendet",
      "Erinnerung an den Vertrag (2.)",
      "Erinnerung an den Vertrag (1.)",
      "Vertrag zur Unterschrift versendet",
    ]);
    expect(liste[0].text).toBe("An m.beispiel@example.de");
    expect(liste.every((e) => e.art === "mail")).toBe(true);
  });

  it("liest den Erstgesprächstermin im deutschen Format samt Uhrzeit", () => {
    const liste = baueBewerberEreignisse({
      bewerber: { erstgespraechDatum: "24.09.2026", erstgespraechUhrzeit: "11:30", erstgespraechBerater: "Jana Kirchner" },
    });
    const termin = finde(liste, "termin:erstgespraech");
    expect(termin?.art).toBe("termin");
    expect(termin?.nurTag).toBe(false);
    expect(termin?.text).toBe("Mit Jana Kirchner");
    expect(new Date(termin!.ms).getHours()).toBe(11);
  });

  it("merkt sich, wenn ein Termin keine Uhrzeit hat", () => {
    const liste = baueBewerberEreignisse({ bewerber: { followUpDatum: "2026-10-01" } });
    expect(finde(liste, "termin:followup")?.nurTag).toBe(true);
  });

  it("nimmt bei vorhandener Buchung nicht zusätzlich den Termin aus der Akte", () => {
    const liste = baueBewerberEreignisse({
      bewerber: { closingTerminDatum: "24.09.2026", closingTerminUhrzeit: "11:30" },
      buchung: { id: "b1", startAt: "2026-09-24T09:30:00.000Z", status: "offen", bezeichnung: "Videocall" },
    });
    expect(finde(liste, "termin:closing")).toBeUndefined();
    const gebucht = finde(liste, "termin:buchung:b1");
    expect(gebucht?.titel).toBe("Videocall");
    expect(gebucht?.marken).toEqual([{ text: "selbst gebucht", ton: "info" }]);
  });

  it("zeigt eine Absage als eigenes Ereignis mit Warnmarke", () => {
    const liste = baueBewerberEreignisse({
      bewerber: {},
      buchung: {
        id: "b1",
        startAt: "2026-09-24T09:30:00.000Z",
        status: "abgesagt",
        abgesagtAt: "2026-09-20T08:00:00.000Z",
        bezeichnung: "Videocall",
      },
    });
    const absage = finde(liste, "termin:absage:b1");
    expect(absage?.titel).toBe("Termin abgesagt");
    expect(absage?.marken[0].ton).toBe("warnung");
  });

  it("führt die eingereichten Bögen als eigene Art", () => {
    const liste = baueBewerberEreignisse({
      bewerber: {},
      kennenlernEingereichtAm: "2026-09-16T07:31:00.000Z",
      vorabEingereichtAm: "2026-08-02T07:31:00.000Z",
    });
    expect(liste.map((e) => e.art)).toEqual(["bogen", "bogen"]);
    expect(titel(liste)).toEqual(["Kennenlernbogen ausgefüllt", "Vorabbogen ausgefüllt"]);
  });

  it("nimmt erledigte Onboarding-Schritte auf, offene nicht", () => {
    const liste = baueBewerberEreignisse({
      bewerber: {
        onboardingChecklist: [
          { id: "c1", label: "Zugang eingerichtet", done: true, doneAt: "2026-09-15T10:00:00.000Z", doneBy: "Nadine" },
          { id: "c2", label: "Noch offen", done: false, doneAt: "", doneBy: "" },
        ],
        academyPflichtModule: [
          { id: "a1", label: "Grundlagenmodul", done: true, doneAt: "2026-09-16T10:00:00.000Z", doneBy: "Markus" },
        ],
      },
    });
    expect(titel(liste)).toEqual(["Grundlagenmodul", "Zugang eingerichtet"]);
    expect(liste[1].text).toBe("Erledigt von Nadine");
  });

  it("zeigt die Selbstabmeldung mit Grund und Warnmarke", () => {
    const liste = baueBewerberEreignisse({
      bewerber: { selbstAbgemeldetAm: "2026-09-13T18:00:00.000Z", selbstAbgemeldetGrund: "Zeitlich nicht machbar" },
    });
    expect(liste[0].titel).toBe("Selbst abgemeldet");
    expect(liste[0].text).toBe("Zeitlich nicht machbar");
    expect(liste[0].marken[0].ton).toBe("warnung");
  });

  it("sortiert das Jüngste nach oben, auch quer über die Quellen", () => {
    const liste = baueBewerberEreignisse({
      bewerber: {
        beworben: "02.09.2026",
        quelle: "Meta",
        aktivAm: "2026-09-20T10:00:00.000Z",
      },
      mails: [{ token: "t1", kind: "kennenlernen_einladung", sent_at: "2026-09-12T12:22:00.000Z", tracked: true }],
      kennenlernEingereichtAm: "2026-09-16T07:31:00.000Z",
    });
    expect(titel(liste)).toEqual([
      "Als Partner aktiviert",
      "Kennenlernbogen ausgefüllt",
      "Einladung zum Kennenlernbogen",
      "Bewerbung eingegangen",
    ]);
    expect(liste[3].text).toBe("Über Meta");
  });

  it("überspringt unlesbare Zeitangaben, statt sie auf 1970 zu setzen", () => {
    const liste = baueBewerberEreignisse({
      bewerber: { aktivAm: "irgendwann", erstgespraechDatum: "demnächst" },
    });
    expect(liste).toEqual([]);
  });

  it("erfindet keinen Stufenwechsel, auch wenn eine Stufe gesetzt ist", () => {
    const liste = baueBewerberEreignisse({ bewerber: { status: "Closing" } });
    expect(liste).toEqual([]);
  });
});

describe("gruppiereNachTag", () => {
  const jetzt = new Date(2026, 8, 17, 12, 0, 0); // 17.09.2026, Ortszeit

  it("benennt heute und gestern und hängt das Datum an", () => {
    const ereignisse = baueBewerberEreignisse({
      bewerber: {
        erstgespraechDatum: "17.09.2026",
        erstgespraechUhrzeit: "09:00",
        followUpDatum: "16.09.2026",
        followUpUhrzeit: "10:00",
        onboardingTerminDatum: "02.09.2026",
        onboardingTerminUhrzeit: "10:00",
      },
    });
    const gruppen = gruppiereNachTag(ereignisse, jetzt);
    expect(gruppen.map((g) => g.label)).toEqual(["Heute, 17.09.2026", "Gestern, 16.09.2026", "02.09.2026"]);
    expect(gruppen[0].ereignisse).toHaveLength(1);
  });

  it("behält die Reihenfolge der Liste bei", () => {
    const ereignisse = baueBewerberEreignisse({
      bewerber: { aktivAm: "2026-09-17T08:00:00.000Z", vertragSignedAt: "2026-09-17T07:00:00.000Z" },
    });
    const gruppen = gruppiereNachTag(ereignisse, jetzt);
    expect(gruppen).toHaveLength(1);
    expect(titel(gruppen[0].ereignisse)).toEqual(["Als Partner aktiviert", "Vertrag unterschrieben"]);
  });
});

describe("zaehleArten", () => {
  it("zählt je Art und insgesamt", () => {
    const ereignisse = baueBewerberEreignisse({
      bewerber: { erstgespraechDatum: "24.09.2026", erstgespraechUhrzeit: "11:30", aktivAm: "2026-09-20T10:00:00.000Z" },
      mails: [{ token: "t1", kind: "kennenlernen_einladung", sent_at: "2026-09-12T12:22:00.000Z", tracked: true }],
    });
    expect(zaehleArten(ereignisse)).toEqual({ alle: 3, termin: 1, schritt: 1, mail: 1 });
  });
});

describe("uhrzeitAus", () => {
  it("gibt für leere und unlesbare Werte nichts zurück", () => {
    expect(uhrzeitAus("")).toBe("");
    expect(uhrzeitAus(null)).toBe("");
    expect(uhrzeitAus("kein Datum")).toBe("");
  });
});
