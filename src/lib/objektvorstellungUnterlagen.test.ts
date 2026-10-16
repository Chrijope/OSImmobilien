import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buchungsVorlage, OV_STUFEN, OV_VORLAUF_MS, ovDatumUhrzeit, ovFehlendeUnterlagen, ovSperrSchluessel, ovTerminFaellig,
} from "../../supabase/functions/_shared/objektvorstellung-unterlagen.ts";
import { STUFEN_VOR_OBJEKTVORSTELLUNG, VORLAUF_OBJEKTVORSTELLUNG_MS } from "./mindestunterlagen";

/*
 * Nachfassplan rund um die Objektvorstellung, Serverseite (16.10.2026):
 * Vorlage der Buchungsbestätigung und die Kundenerinnerung zwei Tage vorher.
 */

describe("Buchungsbestätigung je Anlass", () => {
  it("wie meetingVorlage im CRM", () => {
    expect(buchungsVorlage("beratung")).toBe("termin-beratungspraesentation");
    expect(buchungsVorlage("objektvorstellung")).toBe("einladung-objektvorstellung");
    expect(buchungsVorlage("erstgespraech")).toBe("buchung-bestaetigung");
    expect(buchungsVorlage(undefined)).toBe("buchung-bestaetigung");
  });

  it("send-buchung-bestaetigung nimmt sie für den Kunden, die Begleitung bleibt allgemein", () => {
    const quelle = readFileSync(resolve(__dirname, "../../supabase/functions/send-buchung-bestaetigung/index.ts"), "utf8");
    expect(quelle).toContain("buchungsVorlage(buchung.anlass)");
    expect(quelle).toContain("templateName: kundenVorlage,");
    expect(quelle.match(/templateName: 'buchung-bestaetigung'/g)).toHaveLength(1);
  });
});

describe("Erinnerung zwei Tage vor der Objektvorstellung", () => {
  it("Stufen und Vorlauf gleich wie im CRM", () => {
    expect(OV_STUFEN).toEqual(STUFEN_VOR_OBJEKTVORSTELLUNG);
    expect(OV_VORLAUF_MS).toBe(VORLAUF_OBJEKTVORSTELLUNG_MS);
  });

  const jetzt = new Date("2026-10-16T08:00:00Z"); // 10:00 in Berlin
  const termin = (faellig_am: string, uhrzeit = "10:00", extra: Record<string, unknown> = {}) => ({
    id: "a-1", kunde_id: "k-1", beschreibung: "Objektvorstellung Musterstraße", faellig_am, uhrzeit, erledigt_am: null, ...extra,
  });

  it("nur offene Objektvorstellungen in den nächsten zwei Tagen, Berliner Zeit", () => {
    expect(ovTerminFaellig(termin("2026-10-18", "10:00"), jetzt)?.toISOString()).toBe("2026-10-18T08:00:00.000Z");
    expect(ovTerminFaellig(termin("18.10.2026", "09:30"), jetzt)).not.toBeNull();
    expect(ovTerminFaellig(termin("2026-10-18", "10:01"), jetzt)).toBeNull(); // mehr als zwei Tage
    expect(ovTerminFaellig(termin("2026-10-16", "09:00"), jetzt)).toBeNull(); // vorbei
    expect(ovTerminFaellig(termin("2026-10-17", "10:00", { erledigt_am: "2026-10-16" }), jetzt)).toBeNull();
    expect(ovTerminFaellig(termin("2026-10-17", "10:00", { beschreibung: "Beratungsgespräch" }), jetzt)).toBeNull();
    expect(ovTerminFaellig(termin("2026-10-17", "10:00", { kunde_id: null }), jetzt)).toBeNull();
  });

  it("nimmt das Investment vor der Objektvorstellung, dem etwas fehlt", () => {
    expect(ovFehlendeUnterlagen([
      { id: "i-1", meta: { pipelineStufe: "reservierung" } },
      { id: "i-2", meta: { pipelineStufe: "objektauswahl", docStatuses: { Personalausweis: "uploaded" } } },
    ])).toEqual({ investmentId: "i-2", fehlend: ["Letzter Gehaltsnachweis"] });
    expect(ovFehlendeUnterlagen([
      { id: "i-3", meta: { pipelineStufe: "selbstauskunft", docStatuses: { Personalausweis: "approved", "Letzter Gehaltsnachweis": "uploaded" } } },
    ])).toBeNull();
    // Selbständige brauchen nur den Ausweis.
    expect(ovFehlendeUnterlagen([
      { id: "i-4", meta: { pipelineStufe: "selbstauskunft", saData: { beschaeftigungsart: "Selbstständig" }, docStatuses: { Personalausweis: "uploaded" } } },
    ])).toBeNull();
  });

  it("Sperre je Termin und Zeitpunkt, Anzeige in Berliner Zeit", () => {
    const zeit = new Date("2026-10-18T08:00:00Z");
    expect(ovSperrSchluessel("a-1", zeit)).toBe("ov-unterlagen:a-1:2026-10-18T08:00");
    expect(ovDatumUhrzeit(zeit)).toEqual({ datum: "18.10.2026", uhrzeit: "10:00" });
  });

  it("check-document-reminders verschickt die Vorlage nur mit Sperre", () => {
    const quelle = readFileSync(resolve(__dirname, "../../supabase/functions/check-document-reminders/index.ts"), "utf8");
    expect(quelle).toContain('templateName: "erinnerung-unterlagen-objektvorstellung"');
    expect(quelle).toContain('supabase.rpc("buchung_mail_claim", { _schluessel: sperre })');
    expect(quelle.indexOf("buchung_mail_claim")).toBeLessThan(quelle.indexOf("erinnerung-unterlagen-objektvorstellung\""));
  });
});
