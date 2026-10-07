/**
 * Zweite Runde der Handbuch-Seite (26.09.2026): Wege, Stand je Lead, offene
 * Selbstauskunft, Quelle „Konfigurator“, reservierte Kürzel, Liquid Glass.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), functions: { invoke: vi.fn() }, channel: () => ({ on: () => ({ subscribe: () => ({}) }) }) },
}));

import { kanalText, konfiguratorPfad, offeneSelbstauskunftPfad, handbuchStartseite, saTokenPfad } from "./wege";
import { konfiguratorAngaben, leadStufe, liegtSeitText, quelleFuerAuswertung, rahmenKurz, leseStandZeilen } from "./leadStand";
import { handbuchSaRumpf } from "./leadAbsenden";
import { handbuchAntwort, offenerSaLink, HANDBUCH_SA_OFFEN_NOTIZ } from "../../../supabase/functions/_shared/handbuch-anlage.ts";
import { HANDBUCH_QUELLE, istKonfiguratorQuelle, istPlausibleTelefonnummer, handbuchRahmen } from "../../../supabase/functions/_shared/handbuch-funnel.ts";
import { istReserviertesKuerzel, slugBasis } from "../../../supabase/functions/_shared/vp-slug.ts";
import { linkBezeichnung } from "../../../supabase/functions/_shared/lead-zuordnung.ts";
import { HANDBUCH_EINWILLIGUNG_KURZ, HANDBUCH_EINWILLIGUNG_TEXT, HANDBUCH_EINWILLIGUNG_VERSION } from "@/lib/leadEinwilligung";

describe("Wege der Handbuch-Seite", () => {
  it("der Wizard behält Kürzel und Kampagnenkennung", () => {
    expect(konfiguratorPfad(null, "")).toBe("/handbuch/konfigurator");
    expect(konfiguratorPfad("maria", "?utm_source=meta&utm_campaign=steuer")).toBe("/handbuch/maria/konfigurator?utm_source=meta&utm_campaign=steuer");
    expect(konfiguratorPfad("maria", "utm_source=google")).toBe("/handbuch/maria/konfigurator?utm_source=google");
    expect(offeneSelbstauskunftPfad(null)).toBe("/handbuch/selbstauskunft");
    expect(offeneSelbstauskunftPfad("maria")).toBe("/handbuch/maria/selbstauskunft");
    expect(handbuchStartseite("maria")).toBe("/handbuch/maria");
    // Seit dem 26.09.2026 dieselbe Seite wie „An Kunde senden“.
    expect(saTokenPfad("abc")).toBe("/sa/abc");
    expect(offenerSaLink("maria")).toBe("https://portal.more.immo/handbuch/maria/selbstauskunft");
  });

  it("die festen Unterseiten sind als Partnerkürzel gesperrt", () => {
    for (const k of ["konfigurator", "selbstauskunft", "ergebnis", "Konfigurator"]) expect(istReserviertesKuerzel(k)).toBe(true);
    expect(istReserviertesKuerzel("maria-muster")).toBe(false);
    expect(slugBasis("Konfigurator", "12345678-aaaa")).toBe("konfigurator-berater");
    expect(slugBasis("Maria Muster", "12345678-aaaa")).toBe("maria-muster");
  });

  it("der Kanal steht in Klartext, ohne Kennung „direkt“", () => {
    expect(kanalText(null)).toBe("direkt");
    expect(kanalText({ utmSource: "meta", utmCampaign: "steuer" })).toBe("Meta, Kampagne steuer");
    expect(kanalText({ utmSource: "google" })).toBe("Google");
    expect(kanalText({ fbclid: "x" })).toBe("Meta");
    expect(kanalText({ utmCampaign: "herbst" })).toBe("Kampagne herbst");
  });
});

describe("Quelle „Konfigurator“", () => {
  it("gilt für neue und alte Leads der Handbuch-Seite", () => {
    expect(HANDBUCH_QUELLE).toBe("Konfigurator");
    expect(istKonfiguratorQuelle("Konfigurator")).toBe(true);
    expect(istKonfiguratorQuelle("Handbuch-Seite")).toBe(true);
    expect(istKonfiguratorQuelle("Analysetool")).toBe(false);
    expect(quelleFuerAuswertung("Handbuch-Seite")).toBe("Konfigurator");
    expect(quelleFuerAuswertung("")).toBe("Unbekannt");
    expect(linkBezeichnung("Konfigurator")).toBe("Handbuch-Link");
  });
});

describe("Stand je Lead", () => {
  const meta = { handbuchFunnel: { antworten: { ziel: "steuer", beruf: "angestellt", brutto: "80_120", ueberschuss: "1000_1500", eigenkapital: "30_60", start: "drei_monate" }, ausgang: "passt", zeitpunkt: "2026-09-26T10:00:00Z" } };

  it("liest Rahmen, Ausgang und Antworten aus dem Kontakt", () => {
    const a = konfiguratorAngaben({ quelle: "Konfigurator", meta });
    expect(a.ausHandbuch).toBe(true);
    expect(a.ausgang).toBe("passt");
    expect(rahmenKurz(a.rahmen)).toBe("158 bis 222 T€");
    expect(konfiguratorAngaben({ quelle: "Zapier", meta: {} }).ausHandbuch).toBe(false);
    expect(konfiguratorAngaben({ quelle: "Konfigurator", meta: { handbuchSelbstauskunft: { zeitpunkt: "x" } } }).nurSelbstauskunft).toBe(true);
  });

  it("nimmt den höchsten erreichten Stand", () => {
    const leer = { kontaktId: "k", handbuchAm: null, geoeffnetAm: null, pdfAm: null, saGeoeffnetAm: null, saUnterschrieben: false, saPdfImInvestment: false };
    expect(leadStufe({ nurSelbstauskunft: false }, null)).toBe("erhalten");
    expect(leadStufe({ nurSelbstauskunft: true }, null)).toBe("sa_angefragt");
    expect(leadStufe({ nurSelbstauskunft: false }, { ...leer, geoeffnetAm: "t" })).toBe("gelesen");
    expect(leadStufe({ nurSelbstauskunft: false }, { ...leer, geoeffnetAm: "t", pdfAm: "t" })).toBe("pdf");
    expect(leadStufe({ nurSelbstauskunft: false }, { ...leer, pdfAm: "t", saGeoeffnetAm: "t" })).toBe("sa_begonnen");
    expect(leadStufe({ nurSelbstauskunft: false }, { ...leer, saGeoeffnetAm: "t", saUnterschrieben: true })).toBe("sa_liegt_vor");
    expect(leseStandZeilen([{ kontaktId: "a", saUnterschrieben: true }, { x: 1 }])).toHaveLength(1);
  });

  it("zeigt, wie lange ein Lead liegt, und kurze Rahmen", () => {
    const jetzt = Date.parse("2026-09-26T12:00:00Z");
    expect(liegtSeitText("2026-09-26T11:40:00Z", jetzt)).toBe("0,5 Std.");
    expect(liegtSeitText("2026-09-26T09:00:00Z", jetzt)).toBe("3 Std.");
    expect(liegtSeitText("2026-09-25T10:00:00Z", jetzt)).toBe("1 Tag");
    expect(liegtSeitText("2026-09-23T10:00:00Z", jetzt)).toBe("3 Tage");
    expect(rahmenKurz(handbuchRahmen({ ueberschuss: "unter_500", eigenkapital: "unter_10" }))).toBe("noch kein Rahmen");
  });
});

describe("Offene Selbstauskunft", () => {
  it("schickt keine Antworten, nur Kontakt, Kürzel und Zeitfalle, mit eigener Einwilligung", () => {
    const r = handbuchSaRumpf({
      kontakt: { vorname: "Erika", nachname: "Muster", email: "erika@beispiel.de", telefon: "0151 23456789", einwilligung: true, werbeeinwilligung: false, hp: "" },
      beraterSlug: "maria",
      dauerMs: 9000,
    });
    expect(r).not.toHaveProperty("handbuchFunnel");
    expect(r.handbuchSelbstauskunft).toEqual({ dauerMs: 9000 });
    expect(r.quelle).toBe("Konfigurator");
    expect(r.beraterSlug).toBe("maria");
    expect((r.dsgvo_consent as { version: string }).version).toBe("2026-09-handbuch-sa-v1");
    // Seit 27.09.2026 nichts für Meta aus dieser Seite (Punkt 6).
    expect(r).not.toHaveProperty("metaEventId");
    expect(r).not.toHaveProperty("cookieEinwilligung");
  });

  it("die Antwort an den Browser verrät nie, ob es den Kontakt schon gab", () => {
    expect(handbuchAntwort(null)).toEqual({ success: true, handbuchToken: null, saToken: null, zustellung: "ok" });
    expect(Object.keys(handbuchAntwort({ handbuchToken: "a", saToken: "b", zustellung: "ok" })).sort()).toEqual(["handbuchToken", "saToken", "success", "zustellung"]);
    expect(HANDBUCH_SA_OFFEN_NOTIZ).toContain("automatisch per E-Mail");
    expect(HANDBUCH_SA_OFFEN_NOTIZ).toContain("gespeicherte Adresse");
  });

  it("die Handynummer muss plausibel sein, deutsch wie international", () => {
    for (const ok of ["0151 23456789", "+49 151 23456789", "0049 89 123456", "(089) 12 34 56", "+41 79 123 45 67"]) expect(istPlausibleTelefonnummer(ok), ok).toBe(true);
    for (const nein of ["", "12ab", "123", "+49", "0151-23456789012345678", 42]) expect(istPlausibleTelefonnummer(nein), String(nein)).toBe(false);
  });
});

describe("Einwilligung im Wizard", () => {
  it("der Kurzsatz steht vorn, gespeichert wird weiter der volle Text in Fassung v1", () => {
    expect(HANDBUCH_EINWILLIGUNG_VERSION).toBe("2026-09-handbuch-v1");
    expect(HANDBUCH_EINWILLIGUNG_TEXT).toMatch(/^Ich möchte mein persönliches Immobilienhandbuch erhalten\./);
    expect(HANDBUCH_EINWILLIGUNG_KURZ.length).toBeLessThan(HANDBUCH_EINWILLIGUNG_TEXT.length);
  });
});

describe("Liquid Glass auf der Handbuch-Seite", () => {
  const css = readFileSync("src/styles/handbuchSeiteLiquid.css", "utf8");
  it("hängt am Schalter und wirkt nur am Bildschirm", () => {
    expect(css).toContain("@media screen");
    const regeln = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+\{/g) ?? [];
    for (const r of regeln) {
      const sel = r.trim();
      if (sel.startsWith("@") || /^\d+%|^(from|to)\b/.test(sel)) continue;
      expect(sel, sel).toContain('[data-glas="liquid"]');
    }
  });
  it("keine Neigung, stiller Grund bei weniger Bewegung, am Handy ohne Weichzeichnung", () => {
    expect(css).not.toMatch(/rotate[XY]|perspective/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{[\s\S]*?animation: none/);
    expect(css).toMatch(/max-width: 767px\)\s*\{[\s\S]*?backdrop-filter: none/);
    expect(css).not.toContain("!important");
  });
});
