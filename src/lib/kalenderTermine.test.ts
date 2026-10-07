import { describe, it, expect } from "vitest";
import { vi } from "vitest";

/**
 * Der CRM-Kalender zeigte lange ausschliesslich fremde Termine. Diese Tests
 * halten fest, was seitdem gilt: Die eigenen Termine sind der Inhalt, sie
 * brauchen keinen verbundenen Kalender, und niemand sieht Termine, die ihn
 * nichts angehen.
 */

// kalenderSync und kalenderRueckrichtung ziehen Datenbank und Netz mit. Fuer
// die reine Rechnerei wird beides ersetzt.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/userSettingsCache", () => ({ getUserSetting: (_s: string, standard: unknown) => standard }));
vi.mock("@/lib/dataCache", () => ({
  cacheGet: () => [],
  cacheFilter: () => [],
  cacheUpdate: async () => true,
}));
vi.mock("@/lib/currentUser", () => ({ getCurrentUserId: () => null }));

import {
  terminSichtbarFuer,
  terminGehoertMir,
  sammleEigeneTermine,
  zuFremdEintrag,
  fuegeTermineZusammen,
  gruppiereNachTag,
  tagSchluessel,
  zeitstempelAus,
  sammleWeeklyCallTermine,
  type KalenderAktivitaet,
} from "@/lib/kalenderTermine";
import { ZOOM_URL } from "@/lib/weeklyCallZeit";

const ICH = "user-ich";
const KOLLEGE = "user-kollege";

function meeting(felder: Partial<KalenderAktivitaet> = {}): KalenderAktivitaet {
  return {
    id: "akt-1",
    kundeId: "kunde-1",
    art: "meeting",
    beschreibung: "Beratung Familie Brandl",
    faelligAm: "2026-08-14",
    uhrzeit: "14:00",
    benutzerId: ICH,
    ...felder,
  };
}

describe("terminGehoertMir", () => {
  it("entscheidet allein nach benutzerId, wenn sie gesetzt ist", () => {
    // Ueber den Buchungslink gebuchte Termine tragen den Gastgeber, und der
    // ist nicht zwingend der zustaendige Berater des Kontakts.
    const eigen = { kundeId: "kunde-1", benutzerId: ICH };
    expect(terminGehoertMir(eigen, { benutzerId: ICH, erlaubteKundeIds: new Set() })).toBe(true);
    expect(terminGehoertMir(eigen, { benutzerId: KOLLEGE, erlaubteKundeIds: new Set(["kunde-1"]) })).toBe(false);
  });

  it("faellt ohne benutzerId auf den zustaendigen Berater des Kontakts zurueck", () => {
    // Altbestand hat kein benutzer_id. Dann zaehlt, wem der Kontakt gehoert,
    // genau wie in der Inbox ueber ownedKundeIds.
    const alt = { kundeId: "kunde-1", benutzerId: undefined };
    expect(terminGehoertMir(alt, { benutzerId: ICH, erlaubteKundeIds: new Set(["kunde-1"]) })).toBe(true);
    expect(terminGehoertMir(alt, { benutzerId: ICH, erlaubteKundeIds: new Set(["kunde-9"]) })).toBe(false);
  });
});

describe("terminSichtbarFuer", () => {
  it("zeigt den Termin einer Kollegin zu meinem Kontakt", () => {
    // Die Inbox zeigt ihn laengst, sie fragt nur nach ownedKundeIds. Waere
    // der Kalender strenger, fehlte hier ein Termin, der dort steht.
    const fremdAngelegt = { kundeId: "kunde-1", benutzerId: KOLLEGE };
    expect(terminSichtbarFuer(fremdAngelegt, { benutzerId: ICH, erlaubteKundeIds: new Set(["kunde-1"]) })).toBe(true);
    expect(terminGehoertMir(fremdAngelegt, { benutzerId: ICH, erlaubteKundeIds: new Set(["kunde-1"]) })).toBe(false);
  });

  it("zeigt den gebuchten Termin auch bei fremdem Kontakt", () => {
    const gebucht = { kundeId: "kunde-fremd", benutzerId: ICH };
    expect(terminSichtbarFuer(gebucht, { benutzerId: ICH, erlaubteKundeIds: new Set() })).toBe(true);
  });

  it("zeigt nichts, was weder mir noch meinem Kontakt gehoert", () => {
    const fremd = { kundeId: "kunde-fremd", benutzerId: KOLLEGE };
    expect(terminSichtbarFuer(fremd, { benutzerId: ICH, erlaubteKundeIds: new Set(["kunde-1"]) })).toBe(false);
  });

  it("zeigt nichts, wenn niemand angemeldet ist", () => {
    expect(
      terminSichtbarFuer({ kundeId: "kunde-1", benutzerId: ICH }, { benutzerId: null, erlaubteKundeIds: new Set() }),
    ).toBe(false);
  });
});

describe("sammleEigeneTermine", () => {
  const basis = { benutzerId: ICH, erlaubteKundeIds: new Set(["kunde-1"]) };

  it("liest Termine aus den Aktivitaeten, ohne dass ein Kalender verbunden ist", () => {
    const termine = sammleEigeneTermine({ aktivitaeten: [meeting()], ...basis });
    expect(termine).toHaveLength(1);
    expect(termine[0].quelle).toBe("crm");
    expect(termine[0].titel).toBe("Beratung Familie Brandl");
    expect(tagSchluessel(termine[0].zeit)).toBe("2026-08-14");
  });

  it("beachtet nur Meetings, keine Notizen oder Anrufe", () => {
    const termine = sammleEigeneTermine({
      aktivitaeten: [meeting({ art: "notiz" }), meeting({ id: "akt-2", art: "anruf" })],
      ...basis,
    });
    expect(termine).toHaveLength(0);
  });

  it("laesst den Termin eines Kollegen zu dessen Kontakt aus", () => {
    const termine = sammleEigeneTermine({
      aktivitaeten: [meeting({ benutzerId: KOLLEGE, kundeId: "kunde-fremd" })],
      ...basis,
    });
    expect(termine).toHaveLength(0);
  });

  it("zeigt den Termin einer Kollegin zum eigenen Kontakt", () => {
    const termine = sammleEigeneTermine({
      aktivitaeten: [meeting({ benutzerId: KOLLEGE })],
      ...basis,
    });
    expect(termine).toHaveLength(1);
  });

  it("setzt einen Termin ohne Uhrzeit auf neun Uhr", () => {
    // Dieselbe Regel wie beim Eintragen in den Fremdkalender. Liefen die
    // beiden auseinander, stuende derselbe Termin zweimal verschieden da.
    const termine = sammleEigeneTermine({
      aktivitaeten: [meeting({ uhrzeit: undefined })],
      ...basis,
    });
    expect(new Date(termine[0].zeit).getHours()).toBe(9);
  });

  it("uebergeht einen Termin ohne Datum", () => {
    expect(sammleEigeneTermine({ aktivitaeten: [meeting({ faelligAm: undefined })], ...basis })).toHaveLength(0);
  });

  it("erkennt den eigenen Videoraum", () => {
    const termine = sammleEigeneTermine({
      aktivitaeten: [meeting({ zoomLink: "/raum/abc123" })],
      ...basis,
    });
    expect(termine[0].video).toBe(true);
    expect(termine[0].videoraumPfad).toBe("/raum/abc123");
  });

  it("haelt einen fremden Videodienst auseinander vom eigenen Raum", () => {
    const termine = sammleEigeneTermine({
      aktivitaeten: [meeting({ zoomLink: "https://zoom.us/j/123" })],
      ...basis,
    });
    expect(termine[0].video).toBe(true);
    expect(termine[0].videoraumPfad).toBeUndefined();
  });

  it("haengt den Kundennamen an", () => {
    const termine = sammleEigeneTermine({
      aktivitaeten: [meeting()],
      ...basis,
      namenJeKunde: new Map([["kunde-1", "Familie Brandl"]]),
    });
    expect(termine[0].kundeName).toBe("Familie Brandl");
    expect(termine[0].kundeId).toBe("kunde-1");
  });

  it("sortiert nach Zeit", () => {
    const termine = sammleEigeneTermine({
      aktivitaeten: [
        meeting({ id: "spaet", faelligAm: "2026-08-20" }),
        meeting({ id: "frueh", faelligAm: "2026-08-10" }),
      ],
      ...basis,
    });
    expect(termine.map((t) => t.id)).toEqual(["crm-frueh", "crm-spaet"]);
  });
});

describe("zuFremdEintrag", () => {
  it("wandelt CalDAV-Zeitstempel aus iCloud um", () => {
    const eintrag = zuFremdEintrag({ id: "ev-1", summary: "Zahnarzt", start: "20260803T140000Z" }, "apple");
    expect(eintrag).not.toBeNull();
    expect(Number.isNaN(eintrag!.zeit)).toBe(false);
    expect(eintrag!.quelle).toBe("apple");
    expect(eintrag!.ganztags).toBe(false);
  });

  it("erkennt ganztaegige Eintraege und laesst sie am richtigen Tag", () => {
    // Ohne lokale Deutung landet "2026-08-03" auf Mitternacht UTC und rutscht
    // westlich von Greenwich auf den Vortag.
    const eintrag = zuFremdEintrag({ id: "ev-2", summary: "Urlaub", start: "20260803" }, "apple");
    expect(eintrag!.ganztags).toBe(true);
    expect(tagSchluessel(eintrag!.zeit)).toBe("2026-08-03");
  });

  it("nimmt ISO aus Google unveraendert", () => {
    const eintrag = zuFremdEintrag(
      { id: "ev-3", summary: "Teammeeting", start: "2026-08-03T09:00:00Z", location: "Büro" },
      "google",
    );
    expect(eintrag!.ort).toBe("Büro");
    expect(eintrag!.fremdEventId).toBe("ev-3");
  });

  it("verwirft einen unlesbaren Zeitstempel", () => {
    expect(zuFremdEintrag({ id: "ev-4", start: "irgendwann" }, "google")).toBeNull();
  });

  it("faellt bei fehlendem Titel auf einen Platzhalter zurueck", () => {
    expect(zuFremdEintrag({ id: "ev-5", start: "2026-08-03T09:00:00Z" }, "google")!.titel).toBe("Ohne Titel");
  });
});

describe("fuegeTermineZusammen", () => {
  const eigener = sammleEigeneTermine({
    aktivitaeten: [meeting({ kalenderEventId: "ev-1" })],
    benutzerId: ICH,
    erlaubteKundeIds: new Set(["kunde-1"]),
  });

  it("zeigt einen bereits uebertragenen Termin nur einmal", () => {
    // Sonst stuende derselbe Termin zweimal am Tag, einmal blau und einmal
    // grau, weil er aus dem Fremdkalender zurueckkommt.
    const fremd = zuFremdEintrag({ id: "ev-1", summary: "Beratung Familie Brandl", start: "2026-08-14T14:00:00" }, "google")!;
    const zusammen = fuegeTermineZusammen(eigener, [fremd]);
    expect(zusammen).toHaveLength(1);
    expect(zusammen[0].quelle).toBe("crm");
  });

  it("behaelt einen fremden Termin, der nicht aus dem CRM stammt", () => {
    const fremd = zuFremdEintrag({ id: "privat-1", summary: "Zahnarzt", start: "2026-08-14T16:00:00" }, "google")!;
    const zusammen = fuegeTermineZusammen(eigener, [fremd]);
    expect(zusammen.map((t) => t.quelle)).toEqual(["crm", "google"]);
  });

  it("stellt bei gleicher Uhrzeit den eigenen Termin nach oben", () => {
    const fremd = zuFremdEintrag({ id: "privat-2", summary: "Blocker", start: "2026-08-14T14:00:00" }, "apple")!;
    const zusammen = fuegeTermineZusammen(eigener, [fremd]);
    expect(zusammen[0].quelle).toBe("crm");
  });

  it("kommt ohne fremde Termine aus", () => {
    expect(fuegeTermineZusammen(eigener, [])).toHaveLength(1);
  });

  it("kommt ohne eigene Termine aus", () => {
    const fremd = zuFremdEintrag({ id: "privat-3", summary: "Zahnarzt", start: "2026-08-14T16:00:00" }, "google")!;
    expect(fuegeTermineZusammen([], [fremd])).toHaveLength(1);
  });
});

describe("gruppiereNachTag", () => {
  it("sortiert Termine in ihren lokalen Tag", () => {
    const eigene = sammleEigeneTermine({
      aktivitaeten: [
        meeting({ id: "a", faelligAm: "2026-08-14", uhrzeit: "08:00" }),
        meeting({ id: "b", faelligAm: "2026-08-14", uhrzeit: "17:00" }),
        meeting({ id: "c", faelligAm: "2026-08-15", uhrzeit: "10:00" }),
      ],
      benutzerId: ICH,
      erlaubteKundeIds: new Set(["kunde-1"]),
    });
    const nachTag = gruppiereNachTag(eigene);
    expect(nachTag.get("2026-08-14")).toHaveLength(2);
    expect(nachTag.get("2026-08-15")).toHaveLength(1);
    expect(nachTag.get("2026-08-16")).toBeUndefined();
  });
});

describe("zeitstempelAus", () => {
  it("gibt bei Leerem und Unlesbarem null", () => {
    expect(zeitstempelAus("")).toBeNull();
    expect(zeitstempelAus("morgen")).toBeNull();
  });

  it("liest einen reinen Tag in lokaler Zeit", () => {
    const ms = zeitstempelAus("2026-08-03")!;
    expect(new Date(ms).getHours()).toBe(0);
    expect(new Date(ms).getDate()).toBe(3);
  });
});

describe("Weekly Sales Call im Kalender", () => {
  // Oktober 2026: Montage sind der 5., 12., 19. und 26.
  const von = new Date(2026, 9, 1);
  const bis = new Date(2026, 9, 31);

  it("steht jeden Montag um 19:30 fuer Vertriebspartner", () => {
    const termine = sammleWeeklyCallTermine({ runden: ["vertriebspartner"], von, bis });
    expect(termine.map((t) => new Date(t.zeit).getDate())).toEqual([5, 12, 19, 26]);
    for (const t of termine) {
      expect(new Date(t.zeit).getDay()).toBe(1);
      expect(new Date(t.zeit).getHours()).toBe(19);
      expect(new Date(t.zeit).getMinutes()).toBe(30);
      expect(t.titel).toBe("Weekly Sales Call Vertriebspartner");
    }
  });

  it("steht um 19:00 fuer Lead-Berater", () => {
    const termine = sammleWeeklyCallTermine({ runden: ["lead_berater"], von, bis });
    expect(termine).toHaveLength(4);
    expect(termine.every((t) => new Date(t.zeit).getHours() === 19 && new Date(t.zeit).getMinutes() === 0)).toBe(true);
  });

  it("zeigt der Leitung beide Calls mit demselben Zoom-Link und den Einwahldaten", () => {
    const termine = sammleWeeklyCallTermine({ runden: ["lead_berater", "vertriebspartner"], von, bis });
    expect(termine).toHaveLength(8);
    expect(new Set(termine.map((t) => t.zoomLink))).toEqual(new Set([ZOOM_URL]));
    expect(termine.every((t) => t.video && t.ort?.includes("Meeting-ID") && t.ort.includes("Kenncode"))).toBe(true);
    expect(new Set(termine.map((t) => t.id)).size).toBe(8);
  });

  it("steht bei Rollen ohne Call gar nicht im Kalender", () => {
    expect(sammleWeeklyCallTermine({ runden: [], von, bis })).toEqual([]);
  });
});
