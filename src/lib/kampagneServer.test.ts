/**
 * Die serverseitige Pruefung der Kampagnenkennungen.
 *
 * `submit-lead` ist eine oeffentliche Adresse. Wer will, schickt ihr ein
 * eigenes `meta` mit einem Kampagnenobjekt beliebiger Groesse. Der Browser
 * saeubert seine Werte zwar schon, aber niemand muss den Browser benutzen.
 *
 * Der Wortlaut liegt bei der Edge Function, geprueft wird er hier, weil Vitest
 * nur unterhalb von src sucht.
 */
import { describe, expect, it } from "vitest";
import {
  kampagneAusLeadFeldern,
  kampagnenName,
  saeubereKampagne,
} from "../../supabase/functions/_shared/kampagne.ts";

describe("Ohne Kampagne", () => {
  it("liefert null, damit das Feld gar nicht erst gesetzt wird", () => {
    expect(saeubereKampagne(undefined)).toBeNull();
    expect(saeubereKampagne(null)).toBeNull();
    expect(saeubereKampagne({})).toBeNull();
    expect(saeubereKampagne("Steuerrechner")).toBeNull();
    expect(saeubereKampagne([{ utmCampaign: "X" }])).toBeNull();
  });

  it("wirft ein Objekt weg, in dem nur unbekannte Felder stehen", () => {
    expect(saeubereKampagne({ eigenesFeld: "x", pipelineStufe: "zugewiesen" })).toBeNull();
  });
});

describe("Die Begrenzung", () => {
  it("kappt einen UTM-Wert bei 120 Zeichen", () => {
    const gepruefte = saeubereKampagne({ utmCampaign: "a".repeat(5000) });
    expect(gepruefte?.utmCampaign).toHaveLength(120);
  });

  it("kappt eine Klickkennung bei 255 Zeichen", () => {
    const gepruefte = saeubereKampagne({ fbclid: "b".repeat(5000) });
    expect(gepruefte?.fbclid).toHaveLength(255);
  });

  it("laesst nur die sieben bekannten Felder durch", () => {
    const gepruefte = saeubereKampagne({
      utmSource: "meta",
      utmMedium: "cpc",
      utmCampaign: "Hof_09",
      utmContent: "Bild_A",
      utmTerm: "steuern sparen",
      gclid: "ABC-1",
      fbclid: "IwAR_2",
      // Alles Weitere hat in der Kampagne nichts zu suchen.
      pipelineStufe: "abgeschlossen",
      erstelltVonId: "11111111-2222-3333-4444-555555555555",
    });
    expect(Object.keys(gepruefte || {}).sort()).toEqual([
      "fbclid",
      "gclid",
      "utmCampaign",
      "utmContent",
      "utmMedium",
      "utmSource",
      "utmTerm",
    ]);
  });

  it("wirft Steuerzeichen und Markup weg", () => {
    const gepruefte = saeubereKampagne({ utmCampaign: '<b>Hof</b>\n\t"09"' });
    expect(gepruefte?.utmCampaign).not.toContain("<");
    expect(gepruefte?.utmCampaign).not.toContain(">");
    expect(gepruefte?.utmCampaign).not.toContain("\n");
    expect(gepruefte?.utmCampaign).toContain("Hof");
  });

  it("nimmt nur Zeichenketten, keine Zahlen oder Objekte", () => {
    expect(saeubereKampagne({ utmCampaign: 42, utmSource: { a: 1 } })).toBeNull();
  });

  it("uebernimmt einen Erfassungszeitpunkt nur, wenn er ein Datum ist", () => {
    expect(saeubereKampagne({ utmCampaign: "X", erfasstAm: "morgen" })?.erfasstAm).toBeUndefined();
    expect(
      saeubereKampagne({ utmCampaign: "X", erfasstAm: "2026-09-08T10:00:00.000Z" })?.erfasstAm,
    ).toBe("2026-09-08T10:00:00.000Z");
  });
});

describe("Der Name in der Auswertung", () => {
  it("gruppiert nach utm_campaign", () => {
    expect(kampagnenName({ utmSource: "meta", utmCampaign: "Hof_09" })).toBe("Hof_09");
  });

  it("nennt Leads ohne Kennung ehrlich beim Namen", () => {
    expect(kampagnenName(null)).toBe("Ohne Kampagne");
  });
});

describe("Der letzte Kontakt", () => {
  it("bleibt unter 'zuletzt' erhalten und wird genauso geprueft", () => {
    const gepruefte = saeubereKampagne({
      utmCampaign: "Erste",
      zuletzt: { utmCampaign: "Zweite<script>", fremd: "weg" },
    });
    expect(gepruefte?.utmCampaign).toBe("Erste");
    expect(gepruefte?.zuletzt).toEqual({ utmCampaign: "Zweitescript" });
  });

  it("geht nur eine Ebene tief", () => {
    const gepruefte = saeubereKampagne({
      utmCampaign: "A",
      zuletzt: { utmCampaign: "B", zuletzt: { utmCampaign: "C" } },
    });
    expect(gepruefte?.zuletzt).toEqual({ utmCampaign: "B" });
  });
});

describe("Formularleads von Meta ueber Zapier", () => {
  it("uebernimmt Kampagne, Anzeigengruppe und Anzeige, wenn der Zap sie liefert", () => {
    expect(
      kampagneAusLeadFeldern({
        full_name: "Max Muster",
        campaign_name: "meta_herbst_steuer",
        adset_name: "Muenchen 30 bis 45",
        ad_name: "video2",
        platform: "ig",
      }),
    ).toEqual({
      utmCampaign: "meta_herbst_steuer",
      utmTerm: "Muenchen 30 bis 45",
      utmContent: "video2",
      utmSource: "ig",
    });
  });

  it("liest auch die Schreibweisen aus der Zapier-Oberflaeche und utm_* direkt", () => {
    expect(kampagneAusLeadFeldern({ "Campaign Name": "Herbst", "Ad Name": "Bild 1" })).toEqual({
      utmCampaign: "Herbst",
      utmContent: "Bild 1",
    });
    expect(kampagneAusLeadFeldern({ utm_source: "google", utm_campaign: "suche" })).toEqual({
      utmSource: "google",
      utmCampaign: "suche",
    });
  });

  it("raet nichts, wenn der Zap nur Namen und Quelle schickt", () => {
    expect(kampagneAusLeadFeldern({ full_name: "Max", quelle: "Meta Lead Form netto Muenchen" })).toBeNull();
    expect(kampagneAusLeadFeldern(null)).toBeNull();
    expect(kampagneAusLeadFeldern("x")).toBeNull();
  });
});
