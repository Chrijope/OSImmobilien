/**
 * Tests fuer die Einwilligung im Lead-Formular.
 *
 * Zwei Seiten: Was das Formular baut (`src/lib/leadEinwilligung.ts`) und was
 * die Edge Function daraus macht
 * (`supabase/functions/_shared/lead-einwilligung.ts`).
 *
 * Wichtig ist vor allem, dass Pflicht und Werbung getrennt bleiben. Die
 * Vorlage, an der wir uns orientiert haben, koppelt beides in einem einzigen
 * Pflichthaken, und genau das soll hier nicht passieren.
 */
import { describe, it, expect } from "vitest";
import {
  LEAD_EINWILLIGUNG_TEXT,
  LEAD_EINWILLIGUNG_TEXT_EN,
  LEAD_EINWILLIGUNG_VERSION,
  LEAD_EINWILLIGUNG_VERSION_EN,
  LEAD_WERBUNG_TEXT,
  LEAD_WERBUNG_TEXT_EN,
  baueLeadEinwilligung,
} from "@/lib/leadEinwilligung";
import { leseEinwilligung } from "../../supabase/functions/_shared/lead-einwilligung.ts";

describe("baueLeadEinwilligung", () => {
  it("gibt nichts zurueck, wenn der Pflichthaken fehlt", () => {
    expect(baueLeadEinwilligung(false, false)).toBeNull();
    expect(baueLeadEinwilligung(false, true)).toBeNull();
  });

  it("traegt Wortlaut, Fassung und Zeitpunkt", () => {
    const n = baueLeadEinwilligung(true, false, "2026-09-08T10:00:00.000Z");
    expect(n?.text).toBe(LEAD_EINWILLIGUNG_TEXT);
    expect(n?.version).toBe(LEAD_EINWILLIGUNG_VERSION);
    expect(n?.am).toBe("2026-09-08T10:00:00.000Z");
  });

  it("haelt die Werbung getrennt und laesst sie weg, wenn sie nicht erteilt wurde", () => {
    expect(baueLeadEinwilligung(true, false)?.werbung).toBeUndefined();
    const mit = baueLeadEinwilligung(true, true);
    expect(mit?.werbung?.text).toBe(LEAD_WERBUNG_TEXT);
    // Der Pflichttext darf die Werbung nicht mit abdecken.
    expect(LEAD_EINWILLIGUNG_TEXT).not.toContain("weiteren Angeboten");
  });

  it("speichert bei englischen Formularen den englischen Wortlaut", () => {
    // Der Nachweis muss den Text tragen, den die Person gelesen hat. Ein
    // englischer Haken mit deutschem Wortlaut im Nachweis waere wertlos.
    const n = baueLeadEinwilligung(true, true, "2026-09-17T10:00:00.000Z", "en");
    expect(n?.text).toBe(LEAD_EINWILLIGUNG_TEXT_EN);
    expect(n?.version).toBe(LEAD_EINWILLIGUNG_VERSION_EN);
    expect(n?.werbung?.text).toBe(LEAD_WERBUNG_TEXT_EN);
    expect(n?.version).not.toBe(LEAD_EINWILLIGUNG_VERSION);
  });

  it("bleibt ohne Sprachangabe beim deutschen Wortlaut", () => {
    expect(baueLeadEinwilligung(true, false)?.text).toBe(LEAD_EINWILLIGUNG_TEXT);
  });
});

describe("leseEinwilligung", () => {
  const JETZT = "2026-09-08T12:00:00.000Z";

  it("macht aus dem Nachweis des Formulars einen Vermerk", () => {
    const nachweis = baueLeadEinwilligung(true, true, "2026-09-08T10:00:00.000Z");
    const v = leseEinwilligung(nachweis, JETZT);
    expect(v?.erteiltAm).toBe("2026-09-08T10:00:00.000Z");
    expect(v?.wortlaut).toBe(LEAD_EINWILLIGUNG_TEXT);
    expect(v?.version).toBe(LEAD_EINWILLIGUNG_VERSION);
    expect(v?.werbung?.wortlaut).toBe(LEAD_WERBUNG_TEXT);
  });

  it("laesst die Werbung weg, wenn sie nicht erteilt wurde", () => {
    const v = leseEinwilligung(baueLeadEinwilligung(true, false), JETZT);
    expect(v?.werbung).toBeUndefined();
  });

  it("nimmt ein blosses true von aelteren Zulieferern an", () => {
    const v = leseEinwilligung(true, JETZT);
    expect(v?.erteiltAm).toBe(JETZT);
    expect(v?.wortlaut).toBe("");
  });

  it("gibt nichts zurueck, wenn keine Einwilligung mitkam", () => {
    // Meta Lead Ads und Zapier schicken kein solches Feld. Der Lead muss
    // trotzdem durchgehen, deshalb null statt Fehler.
    expect(leseEinwilligung(undefined, JETZT)).toBeNull();
    expect(leseEinwilligung(null, JETZT)).toBeNull();
    expect(leseEinwilligung(false, JETZT)).toBeNull();
    expect(leseEinwilligung({ erteilt: false }, JETZT)).toBeNull();
  });

  it("ersetzt einen unbrauchbaren Zeitstempel durch den Eingang", () => {
    const v = leseEinwilligung({ erteilt: true, am: "gestern", text: "x" }, JETZT);
    expect(v?.erteiltAm).toBe(JETZT);
  });

  it("kuerzt einen ueberlangen Wortlaut", () => {
    const v = leseEinwilligung({ erteilt: true, text: "a".repeat(5000) }, JETZT);
    expect(v?.wortlaut.length).toBe(2000);
  });
});
