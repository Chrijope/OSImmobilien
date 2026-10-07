import { describe, it, expect } from "vitest";
import { sammleInboxTermine, type TerminAktivitaet, type TerminAufgabe } from "@/lib/inboxTermine";

const JETZT = new Date("2026-07-28T12:00:00").getTime();

const meineKunden = new Set(["k1", "k2"]);
const namen = new Map([
  ["k1", "Anna Adler"],
  ["k2", "Bernd Berger"],
]);

const basis = (over: Partial<TerminAktivitaet> = {}): TerminAktivitaet => ({
  id: "a1",
  kundeId: "k1",
  art: "meeting",
  beschreibung: "Beratungsgespräch",
  faelligAm: "2026-08-10",
  uhrzeit: "10:00",
  ...over,
});

const sammle = (aktivitaeten: TerminAktivitaet[], aufgaben: TerminAufgabe[] = []) =>
  sammleInboxTermine({
    aktivitaeten,
    erlaubteKundeIds: meineKunden,
    namenJeKunde: namen,
    aufgaben,
    jetzt: JETZT,
  });

describe("Termine für die Inbox", () => {
  it("nimmt ein Meeting aus den Aktivitäten auf, auch ohne zugehörige Aufgabe", () => {
    const [t] = sammle([basis()]);
    expect(t.titel).toBe("Beratungsgespräch");
    expect(t.kundeName).toBe("Anna Adler");
    expect(t.uhrzeit).toBe("10:00");
    expect(t.id).toBe("termin-a1");
  });

  it("lässt alles weg, was kein Meeting, erledigt oder ohne Datum ist", () => {
    const liste = sammle([
      basis({ id: "a2", art: "notiz" }),
      basis({ id: "a3", erledigtAm: "2026-07-01" }),
      basis({ id: "a4", faelligAm: undefined }),
    ]);
    expect(liste).toEqual([]);
  });

  it("lässt vergangene Termine weg", () => {
    const liste = sammle([
      basis({ id: "alt", faelligAm: "2026-07-27", uhrzeit: "10:00" }),
      basis({ id: "neu", faelligAm: "2026-07-29", uhrzeit: "10:00" }),
    ]);
    expect(liste.map((t) => t.id)).toEqual(["termin-neu"]);
  });

  it("sortiert nach Zeit", () => {
    const liste = sammle([
      basis({ id: "spaet", faelligAm: "2026-09-01" }),
      basis({ id: "frueh", faelligAm: "2026-08-01" }),
      basis({ id: "mitte", faelligAm: "2026-08-10" }),
    ]);
    expect(liste.map((t) => t.id)).toEqual(["termin-frueh", "termin-mitte", "termin-spaet"]);
  });

  it("zeigt nur Termine der Kontakte, die der Nutzer sehen darf", () => {
    const liste = sammle([
      basis({ id: "meiner", kundeId: "k2" }),
      basis({ id: "fremder", kundeId: "k9" }),
    ]);
    expect(liste.map((t) => t.id)).toEqual(["termin-meiner"]);
  });

  it("zeigt ein von Hand angelegtes Meeting nicht doppelt", () => {
    // Die Schnellaktion schreibt beides aus denselben Feldern: eine Aufgabe
    // und eine Aktivität. Die Aufgabe hat Vorrang, weil nur sie abhakbar ist.
    const liste = sammle(
      [basis()],
      [{ kontaktId: "k1", titel: "Beratungsgespräch", faelligAm: "2026-08-10T08:00:00.000Z" }],
    );
    expect(liste).toEqual([]);
  });

  it("ordnet trotz unterschiedlicher Schreibweise von Datum und Titel zu", () => {
    const liste = sammle(
      [basis({ faelligAm: "10.08.2026", beschreibung: "  BERATUNGSGESPRÄCH " })],
      [{ kontaktId: "k1", titel: "Beratungsgespräch", faelligAm: "2026-08-10" }],
    );
    expect(liste).toEqual([]);
  });

  it("hält eine Aufgabe eines anderen Kunden nicht für dieselbe", () => {
    const liste = sammle(
      [basis()],
      [{ kontaktId: "k2", titel: "Beratungsgespräch", faelligAm: "2026-08-10" }],
    );
    expect(liste).toHaveLength(1);
  });

  it("erkennt den eigenen Videoraum und einen fremden Dienst als Videomeeting", () => {
    const liste = sammle([
      basis({ id: "raum", zoomLink: "/raum/abc123" }),
      basis({ id: "zoom", zoomLink: "https://zoom.us/j/999" }),
      basis({ id: "vorOrt", zoomLink: undefined }),
    ]);
    const video = Object.fromEntries(liste.map((t) => [t.id, t.video]));
    expect(video).toEqual({ "termin-raum": true, "termin-zoom": true, "termin-vorOrt": false });
  });

  it("setzt einen Strich, wenn keine Uhrzeit hinterlegt ist", () => {
    const [t] = sammle([basis({ uhrzeit: undefined })]);
    expect(t.uhrzeit).toBe("—");
  });
});
