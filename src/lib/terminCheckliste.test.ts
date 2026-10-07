/**
 * M12 vom 04.10.2026: Termine aus der Checkliste im Kundenprofil
 * (meta.setterTerminDatum/-Uhrzeit) bekommen eine Erinnerung, ohne doppelte.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  alteErinnerungVerschickt,
  MAX_VERSUCHE,
  terminSperrSchluessel,
  versuchsSchluessel,
  checklistenTerminErinnern,
  gleicherZeitpunkt,
} from "../../supabase/functions/_shared/termin-checkliste.ts";

const text = readFileSync(
  join(process.cwd(), "supabase", "functions", "send-termin-erinnerungen", "index.ts"),
  "utf8",
);

const t = (iso: string) => new Date(iso);

describe("termin-checkliste", () => {
  it("erkennt denselben Termin mit einer Minute Toleranz", () => {
    expect(gleicherZeitpunkt(t("2026-10-05T08:00:00Z"), t("2026-10-05T08:00:30Z"))).toBe(true);
    expect(gleicherZeitpunkt(t("2026-10-05T08:00:00Z"), t("2026-10-05T08:05:00Z"))).toBe(false);
    expect(gleicherZeitpunkt(null, t("2026-10-05T08:00:00Z"))).toBe(false);
  });

  it("überspringt nur, wenn die alte Erinnerung genau diese Stufe schon geschickt hat", () => {
    const zeit = t("2026-10-05T08:00:00Z");
    expect(alteErinnerungVerschickt({ remindersSent: ["24h"] }, zeit, zeit, "24h")).toBe(true);
    expect(alteErinnerungVerschickt({ remindersSent: ["24h"] }, zeit, zeit, "6h")).toBe(false);
    // Bis zum 04.10.2026 reichte allein der gleiche Zeitpunkt zum Überspringen.
    expect(alteErinnerungVerschickt({}, zeit, zeit, "24h")).toBe(false);
    expect(alteErinnerungVerschickt({ remindersSent: ["24h"] }, t("2026-10-06T08:00:00Z"), zeit, "24h")).toBe(false);
  });

  it("sperrt je Kontakt, Terminminute und Stufe, für beide Wege gleich", () => {
    const zeit = t("2026-10-05T08:00:00Z");
    expect(terminSperrSchluessel("k1", zeit, "6h")).toBe("termin-erinnerung:k1:2026-10-05T08:00:00.000Z:6h");
    // Sekunden zählen nicht: Aktivität und Checkliste landen beim selben Schlüssel.
    expect(terminSperrSchluessel("k1", t("2026-10-05T08:00:42Z"), "6h")).toBe(terminSperrSchluessel("k1", zeit, "6h"));
    expect(terminSperrSchluessel("k1", zeit, "6h")).not.toBe(terminSperrSchluessel("k1", zeit, "1h"));
  });

  it("zählt höchstens drei Versuche", () => {
    expect(MAX_VERSUCHE).toBe(3);
    expect(versuchsSchluessel("s", 2)).toBe("s:versuch-2");
  });
});

describe("checklistenTerminErinnern", () => {
  const zeit = t("2026-10-05T08:00:00Z");

  it("erinnert an einen Checklisten-Termin ohne Aktivität", () => {
    expect(checklistenTerminErinnern({ pipelineStufe: "erstgespraech_geplant" }, [], zeit)).toBe(true);
  });

  it("schweigt, wenn eine Aktivität zum selben Zeitpunkt existiert, auch erledigt oder abgesagt", () => {
    expect(checklistenTerminErinnern({}, [t("2026-10-05T08:00:20Z")], zeit)).toBe(false);
  });

  it.each(["verloren", "eg_noshow", "bg_noshow"])("schweigt in der Stufe %s", (stufe) => {
    expect(checklistenTerminErinnern({ pipelineStufe: stufe }, [], zeit)).toBe(false);
  });
});

describe("send-termin-erinnerungen", () => {
  it("liest die Checklisten-Termine aus dem Kontakt", () => {
    expect(text).toContain(".in('meta->>setterTerminDatum', tage)");
  });

  it("überspringt eine Aktivität nicht mehr allein wegen der Checkliste", () => {
    expect(text).not.toMatch(/setterZeit && Math\.abs/);
    expect(text).toContain("alteErinnerungVerschickt(meta, checklistenZeit, eintrag.terminAt, eintrag.stufe)");
  });

  it("misst Checklisten-Termine an allen Meetings des Kunden, auch erledigten", () => {
    expect(text).toContain("checklistenTerminErinnern(meta, meetingZeiten.get(kundeId) || [], terminAt)");
    // Die Zeiten werden gesammelt, bevor erledigte Termine aussortiert werden.
    expect(text.indexOf("meetingZeiten.set(")).toBeLessThan(text.indexOf("if (termin.erledigt_am) continue"));
  });

  it("vermerkt einen erfolgreichen Checklisten-Versand in remindersSent", () => {
    expect(text).toContain("_updates: { remindersSent: [...new Set([...bisher, eintrag.stufe])] }");
  });

  it("sperrt beide Wege mit demselben Schlüssel vor dem Versand", () => {
    expect(text).toContain("const sperre = terminSperrSchluessel(eintrag.kundeId, eintrag.terminAt, eintrag.stufe)");
    expect(text).toContain("supabase.rpc('buchung_mail_claim', { _schluessel: sperre })");
    expect(text).toContain("if (claim !== 'frei')");
    expect(text).not.toContain(".upsert(");
  });

  it("gibt die Sperre nach einem Fehlschlag frei, bis die Versuche aufgebraucht sind", () => {
    expect(text).toContain("const endgueltig = !fehlertext || versuch >= MAX_VERSUCHE");
    expect(text).toContain("_erfolg: endgueltig");
  });

  it("verlangt den Ausweis der Automatik", () => {
    expect(text).toContain("automatikSchutz(req, 'send-termin-erinnerungen', corsHeaders)");
  });
});
