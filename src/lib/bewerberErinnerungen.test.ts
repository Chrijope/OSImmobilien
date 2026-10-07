import { describe, it, expect } from "vitest";
import {
  bewerberErinnerungen,
  bedenkzeitErinnerungsTag,
  bedenkzeitRueckrufAktiv,
  bedenkzeitRueckrufText,
  istBewerberErinnerungId,
  bewerberIdAusErinnerungId,
  tageVorher,
  kanalLabel,
  erinnerungLabel,
} from "./bewerberErinnerungen";
import type { Bewerber } from "./bewerbungStore";

function bewerber(teil: Partial<Bewerber> = {}): Bewerber {
  return {
    id: "b-1", vorname: "Max", nachname: "Muster", status: "Bedenkzeit",
    ...teil,
  } as Bewerber;
}

describe("bewerberErinnerungen", () => {
  it("ohne Follow-Up und ohne Bedenkzeit gibt es keine Einträge", () => {
    expect(bewerberErinnerungen(bewerber({ status: "Closing" }))).toEqual([]);
  });

  it("das manuelle Follow-Up erscheint wie bisher am Tag selbst mit Notiz", () => {
    const [e] = bewerberErinnerungen(bewerber({
      status: "FollowUp", followUpDatum: "25.08.2026", followUpUhrzeit: "11:00", followUpNotiz: "Einwand klären",
    }));
    expect(e).toMatchObject({
      id: "bw-b-1", quelle: "followUp", faelligAm: "25.08.2026", uhrzeit: "11:00",
      titel: "Follow-Up Bewerber: Max Muster", beschreibung: "📝 Einwand klären",
    });
  });

  it("der Bedenkzeit-Rückruf erscheint standardmäßig einen Tag vorher", () => {
    const liste = bewerberErinnerungen(bewerber({
      closingEntscheidung: "bedenkzeit", bedenkzeitRueckrufAm: "2026-09-09",
      bedenkzeitRueckrufUhrzeit: "10:00", bedenkzeitVorbereitung: "Zwei Exposés mitschicken",
    }));
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({
      id: "bz-b-1", quelle: "bedenkzeit", faelligAm: "08.09.2026", uhrzeit: "10:00",
      titel: "Rückruf Bedenkzeit: Max Muster",
    });
    expect(liste[0].beschreibung).toBe("Rückruf (Bedenkzeit) am 09.09.2026 um 10:00 Uhr per Telefon. 📝 Zwei Exposés mitschicken");
  });

  it("der Vorlauf ist einstellbar, 0 heißt am Tag des Rückrufs", () => {
    expect(bedenkzeitErinnerungsTag("09.09.2026", 0)).toBe("09.09.2026");
    expect(bedenkzeitErinnerungsTag("09.09.2026", 7)).toBe("02.09.2026");
    expect(bedenkzeitErinnerungsTag("01.09.2026", 1)).toBe("31.08.2026");
    expect(bedenkzeitErinnerungsTag("", 1)).toBe("");
  });

  it("Follow-Up und Bedenkzeit-Rückruf können nebeneinander bestehen, getrennte Kennungen", () => {
    const liste = bewerberErinnerungen(bewerber({
      followUpDatum: "20.08.2026",
      closingEntscheidung: "bedenkzeit", bedenkzeitRueckrufAm: "09.09.2026", bedenkzeitErinnerungTage: 2,
      bedenkzeitKanal: "whatsapp",
    }));
    expect(liste.map((e) => e.id)).toEqual(["bw-b-1", "bz-b-1"]);
    expect(liste[1].faelligAm).toBe("07.09.2026");
    expect(liste[1].beschreibung).toContain("per WhatsApp");
  });

  it("nach der Entscheidung oder bei Absage verschwindet der Rückruf von selbst", () => {
    expect(bedenkzeitRueckrufAktiv(bewerber({ closingEntscheidung: "ja", bedenkzeitRueckrufAm: "09.09.2026" }))).toBe(false);
    expect(bedenkzeitRueckrufAktiv(bewerber({ closingEntscheidung: "bedenkzeit", bedenkzeitRueckrufAm: "" }))).toBe(false);
    expect(bedenkzeitRueckrufAktiv(bewerber({ closingEntscheidung: "bedenkzeit", bedenkzeitRueckrufAm: "09.09.2026", status: "Abgelehnt" }))).toBe(false);
    expect(bedenkzeitRueckrufAktiv(bewerber({ closingEntscheidung: "bedenkzeit", bedenkzeitRueckrufAm: "09.09.2026" }))).toBe(true);
  });

  it("Kennungen beider Quellen werden als Bewerber-Erinnerung erkannt", () => {
    expect(istBewerberErinnerungId("bw-abc")).toBe(true);
    expect(istBewerberErinnerungId("bz-abc")).toBe(true);
    expect(istBewerberErinnerungId("fu-abc")).toBe(false);
    expect(bewerberIdAusErinnerungId("bz-abc")).toBe("abc");
  });

  it("Verschieben der Erinnerung ergibt den neuen Vorlauf in Tagen, nie negativ", () => {
    expect(tageVorher("09.09.2026", new Date(2026, 8, 7))).toBe(2);
    expect(tageVorher("09.09.2026", new Date(2026, 8, 12))).toBe(0);
  });

  it("Beschriftungen mit Standardwerten Telefon und 1 Tag vorher", () => {
    expect(kanalLabel(undefined)).toBe("Telefon");
    expect(kanalLabel("videocall")).toBe("Videocall");
    expect(erinnerungLabel(undefined)).toBe("1 Tag vorher");
    expect(erinnerungLabel(0)).toBe("am Tag des Rückrufs");
    expect(bedenkzeitRueckrufText(bewerber({ bedenkzeitRueckrufAm: "09.09.2026" }))).toBe("Rückruf (Bedenkzeit) am 09.09.2026 per Telefon.");
  });
});
