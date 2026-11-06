import { describe, expect, it } from "vitest";
import {
  BERATUNG_KURZ, BERATUNG_NAME, istBeratungsName, terminNameAnzeige, terminNameSchluessel,
} from "../../supabase/functions/_shared/termin-name.ts";
import { festeGespraechsArt } from "./festerTerminErgebnis";
import { baueGeplanteAktionen, titelTagSchluessel } from "./kundenNaechsteAktion";
import { sammleInboxTermine } from "./inboxTermine";
import { meetingVorlage } from "./meetingEinladung";
import { gespraechsArt } from "./nachfassplan";
import { bewertePipelineKachel } from "./pipelineAmpel";

const ALT = "Beratungsgespräch";

describe("Anzeige des Gesprächsnamens", () => {
  it("übersetzt gespeicherte Schreibweisen, auch mit Zusatz, und lässt anderes stehen", () => {
    expect(terminNameAnzeige(ALT)).toBe(BERATUNG_NAME);
    expect(terminNameAnzeige("Beratungsgespraech")).toBe(BERATUNG_NAME);
    expect(terminNameAnzeige("Beratungsgespräch Familie Brandl")).toBe(`${BERATUNG_NAME} Familie Brandl`);
    expect(terminNameAnzeige("Objektvorstellung")).toBe("Objektvorstellung");
  });

  it("nennt den Termin in englischen Mails englisch", () => {
    expect(terminNameAnzeige(ALT, true)).toBe("Concept introduction");
  });
});

describe("Alte und neue Titel bleiben derselbe Termin", () => {
  it.each([ALT, BERATUNG_NAME, BERATUNG_KURZ, "  beratungsgespräch "])("erkennt %s", (titel) => {
    expect(istBeratungsName(titel)).toBe(true);
    expect(festeGespraechsArt(titel)).toBe(BERATUNG_NAME);
    expect(terminNameSchluessel(titel)).toBe(terminNameSchluessel(BERATUNG_NAME));
    expect(gespraechsArt(titel)).toBe("beratung");
    expect(meetingVorlage(undefined, titel)).toBe("termin-beratungspraesentation");
  });

  it("hält Erstgespräch und freie Titel getrennt", () => {
    expect(festeGespraechsArt("Erstgespräch")).toBe("Erstgespräch");
    expect(festeGespraechsArt("Beratungsgespräch Familie Brandl")).toBeNull();
    expect(festeGespraechsArt("Notartermin")).toBeNull();
    expect(istBeratungsName(undefined)).toBe(false);
  });

  it("verbindet Aufgabe und Verlaufseintrag über den Namen hinweg", () => {
    expect(titelTagSchluessel(ALT, "2026-09-18")).toBe(titelTagSchluessel(BERATUNG_NAME, "2026-09-18"));
  });

  it("zeigt einen gespeicherten Termin mit neuem Namen und nicht doppelt", () => {
    const jetzt = new Date(2026, 8, 1, 9, 0);
    const liste = baueGeplanteAktionen({
      aktivitaeten: [{ id: "m1", art: "meeting", beschreibung: ALT, faelligAm: "2026-09-18", uhrzeit: "14:00" } as never],
      termine: [{ datum: "2026-09-18", uhrzeit: "14:00", bezeichnung: BERATUNG_NAME }],
    }, jetzt);
    expect(liste.map((x) => x.titel)).toEqual([BERATUNG_NAME]);
  });

  it("legt in der Inbox keinen zweiten Eintrag neben eine Aufgabe mit anderem Namen", () => {
    const termin = { id: "a1", kundeId: "k1", art: "meeting", beschreibung: ALT, faelligAm: "2026-08-10" };
    const aufgabe = { kontaktId: "k1", titel: BERATUNG_KURZ, faelligAm: "2026-08-10" };
    expect(sammleInboxTermine({
      aktivitaeten: [termin],
      erlaubteKundeIds: new Set(["k1"]),
      namenJeKunde: new Map([["k1", "Anna Beispiel"]]),
      aufgaben: [aufgabe],
      jetzt: new Date(2026, 7, 1).getTime(),
    } as never)).toEqual([]);
  });

  it.each([ALT, BERATUNG_NAME, BERATUNG_KURZ])("nennt die Kachel bei %s den neuen Namen", (bezeichnung) => {
    const r = bewertePipelineKachel({
      stufe: "beratungsgespraech",
      tageSeitAenderung: 1,
      naechsterKontakt: { zeitpunkt: "2026-08-01T17:00:00", ueberfaellig: false, quelle: "termin", bezeichnung },
      hatZukuenftigenTermin: true,
      jetzt: new Date(2026, 6, 28, 9, 0).getTime(),
    } as never);
    expect(r.text).toBe("Konzeptvorstellung gebucht");
  });
});
