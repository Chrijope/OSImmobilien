/**
 * Der persönliche Handbuch-Link aus der Willkommensmail (30.09.2026): sechs
 * Fragen, kein Kontaktformular, nur der Pflicht-Haken. Geprüft werden die
 * reinen Helfer und am Quelltext die Zusagen, die sich ohne Datenbank nicht
 * ausführen lassen.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { einladungGueltig, einladungsLink, maskiereEmail, neueEinladung } from "../../../supabase/functions/_shared/handbuch-einladung";
import { istHandbuchToken } from "../../../supabase/functions/_shared/handbuch-funnel";
import { handbuchEinwilligungGueltig } from "../../../supabase/functions/_shared/lead-einwilligung";
import { einladungRumpf } from "./einladung";
import { BEISPIEL_ANTWORTEN } from "@/pages/HandbuchLanding";

const lies = (p: string) => readFileSync(p, "utf8");

describe("Helfer für den persönlichen Link", () => {
  it("kürzt die Mail so, dass der Lead sie erkennt, ein Dritter sie aber nicht liest", () => {
    expect(maskiereEmail("hermann.muster@gmail.com")).toBe("h•••@gmail.com");
    expect(maskiereEmail("  a@b.de ")).toBe("a•••@b.de");
    expect(maskiereEmail("")).toBe("");
    expect(maskiereEmail("keine-adresse")).toBe("");
    expect(maskiereEmail("@gmail.com")).toBe("");
  });

  it("legt einen Link mit Handbuch-Token und 30 Tagen Laufzeit an", () => {
    const jetzt = Date.parse("2026-09-30T10:00:00Z");
    const e = neueEinladung(jetzt);
    expect(istHandbuchToken(e.token)).toBe(true);
    expect(e.gueltigBis).toBe("2026-10-30T10:00:00.000Z");
    expect(einladungGueltig(e, jetzt)).toBe(true);
    expect(einladungGueltig(e, Date.parse("2026-10-31T00:00:00Z"))).toBe(false);
    expect(einladungGueltig(null)).toBe(false);
    expect(einladungGueltig({ gueltigBis: "kaputt" })).toBe(false);
  });

  it("baut den Link außerhalb von /handbuch/:slug, mit Kampagnenkennung", () => {
    expect(einladungsLink("https://portal.more.immo", "abc", "utm_source=mail")).toBe(
      "https://portal.more.immo/handbuch-einladung/abc?utm_source=mail",
    );
  });
});

describe("Absenden vom persönlichen Link", () => {
  it("schickt keine Kontaktdaten, aber eine Einwilligung, die der Server annimmt", () => {
    const rumpf = einladungRumpf({ token: "t", antworten: BEISPIEL_ANTWORTEN, einwilligung: true, sprache: "de" });
    expect(rumpf).toMatchObject({ aktion: "absenden", token: "t", antworten: BEISPIEL_ANTWORTEN, sprache: "de" });
    expect(rumpf).not.toHaveProperty("email");
    expect(rumpf).not.toHaveProperty("telefon");
    expect(handbuchEinwilligungGueltig(rumpf.dsgvo_consent, "konfigurator")).toBe(true);
  });

  it("ohne Haken keine Einwilligung", () => {
    const rumpf = einladungRumpf({ token: "t", antworten: BEISPIEL_ANTWORTEN, einwilligung: false });
    expect(handbuchEinwilligungGueltig(rumpf.dsgvo_consent, "konfigurator")).toBe(false);
  });
});

describe("Zusagen am Quelltext", () => {
  it("die Seite lädt kein Meta Pixel, das Token steht in der Adresse", () => {
    const seite = lies("src/pages/HandbuchEinladung.tsx");
    expect(seite).not.toContain("useMetaPixel");
    expect(lies("src/lib/handbuch/einladung.ts")).not.toContain("meldeMetaLead");
  });

  it("der Server gibt nur Vorname und gekürzte Mail heraus und nie ein Handbuch-Token", () => {
    const fn = lies("supabase/functions/handbuch-einladung/index.ts");
    const lesen = fn.slice(fn.indexOf('body.aktion === "lesen"'), fn.indexOf('body.aktion !== "absenden"'));
    expect(lesen).toContain("maskiereEmail(");
    expect(lesen).not.toContain("telefon");
    expect(lesen).not.toContain("nachname");
    expect(fn).toContain("handbuchDublettenAntwort(ergebnis)");
    expect(fn).toContain('handbuchEinwilligungGueltig(body.dsgvo_consent, "konfigurator")');
    expect(fn).toContain('erkanntUeber: "email"');
  });

  it("die Willkommensmail legt den Link vor dem Versand am Kontakt ab", () => {
    const fn = lies("supabase/functions/send-lead-zuweisung-mail/index.ts");
    expect(fn.indexOf("handbuchEinladung: einladung")).toBeGreaterThan(-1);
    expect(fn.indexOf("handbuchEinladung: einladung")).toBeLessThan(fn.indexOf("sendeVorlage(supabase"));
  });
});
