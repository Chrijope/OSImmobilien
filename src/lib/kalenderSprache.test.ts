/**
 * Kalenderdateien in der Kundensprache (Plan Kundensprache, Etappe 2, K3).
 *
 * Zwei Wege erzeugen ICS: die Änderungsmail zu Meetings (`meeting-mail.ts`)
 * und der Link auf `get-ics` aus den Buchungsmails (`buchung-kontext.ts`).
 * Jeder schreibt seine festen Texte in der Sprache des Kunden. Terminnamen
 * aus dem CRM bleiben, wie sie gepflegt sind.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { meetingKalender, meetingMailAuftrag, type MeetingMailJob } from "../../supabase/functions/_shared/meeting-mail";
import { ladeBuchungKontext } from "../../supabase/functions/_shared/buchung-kontext";

describe("Meeting-Änderung", () => {
  const job: MeetingMailJob = {
    id: "j1", meeting_id: "m1", kontakt_id: "k1", benutzer_id: "b1", revision: 2, art: "aenderung",
    email: "k@example.com", lease_id: "l1",
    daten: { titel: "Beratung", datum: "2026-12-10", uhrzeit: "10:00", dauer: 60, start: "2026-12-10T09:00:00Z", modus: "telefon", icsUid: "uid-1" },
  };

  it("schreibt Ort und Dateinamen englisch", () => {
    expect(meetingKalender(job, "host@example.com", new Date(), "en")).toContain("LOCATION:Phone call");
    expect(meetingKalender({ ...job, daten: { ...job.daten, modus: "vor_ort" } }, "", new Date(), "en")).toContain("LOCATION:In person");
    const auftrag = meetingMailAuftrag(job, "host@example.com", "en");
    expect(auftrag.attachments[0].filename).toBe("appointment-updated.ics");
    expect(auftrag.sprache).toBe("en");
    expect(meetingMailAuftrag({ ...job, art: "absage" }, "", "en").attachments[0].filename).toBe("appointment-cancelled.ics");
  });

  it("bleibt ohne Angabe deutsch", () => {
    expect(meetingKalender(job, "")).toContain("LOCATION:Telefontermin");
    expect(meetingMailAuftrag(job, "").attachments[0].filename).toBe("termin-aktualisiert.ics");
  });
});

/** Attrappe: jede Tabelle liefert eine feste Zeile. */
function client(zeilen: Record<string, Record<string, unknown> | null>) {
  return {
    from: (tabelle: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: zeilen[tabelle] ?? null, error: null }) }) }),
    }),
  };
}

describe("Buchungsmails: Link auf get-ics", () => {
  const buchung = {
    id: "b1", mitarbeiter_id: "m1", kontakt_id: "k1", absage_token: "a".repeat(64),
    start_at: "2026-10-15T08:00:00Z", ende_at: "2026-10-15T08:30:00Z", email: "k@example.com",
  };
  const optionen = { supabaseUrl: "https://x.supabase.co", basisAdresse: "https://portal.more.immo" };

  it("hängt lang=en an und nennt den Termin ohne Terminart Appointment", async () => {
    const k = await ladeBuchungKontext(client({ kontakte: { vorname: "Erika", nachname: "Muster", meta: { kundenSprache: "en" } } }), buchung, optionen);
    expect(k.sprache).toBe("en");
    expect(k.icsUrl).toContain("&lang=en");
    expect(k.icsUrl).toContain("title=Appointment");
    expect(k.googleCalendarUrl).toContain("text=Appointment");
  });

  it("bleibt für deutsche Kunden unverändert", async () => {
    const k = await ladeBuchungKontext(client({ kontakte: { vorname: "Max", nachname: "M", meta: {} } }), buchung, optionen);
    expect(k.sprache).toBe("de");
    expect(k.icsUrl).not.toContain("lang=");
    expect(k.icsUrl).toContain("title=Termin");
  });

  it("get-ics kennt lang=en für Rückfalltitel und Dateinamen", () => {
    const quelle = readFileSync(resolve(__dirname, "../../supabase/functions/get-ics/index.ts"), "utf8");
    expect(quelle).toMatch(/searchParams\.get\('lang'\) === 'en'/);
    expect(quelle).toContain("'appointment.ics'");
    expect(quelle).toContain("'Appointment'");
  });
});
