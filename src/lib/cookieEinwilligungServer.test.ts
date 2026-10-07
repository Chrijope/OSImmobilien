/**
 * Die Serverprüfung der Marketing-Einwilligung (A4-10) und die Anschrift des
 * Partners als gemeinsam Verantwortlicher (A4-09), beides aus
 * `supabase/functions/_shared/cookie-einwilligung.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  COOKIE_EINWILLIGUNG_FASSUNG,
  GUELTIGE_COOKIE_FASSUNGEN,
  einwilligungGiltBis,
  einwilligungsZeitpunktGueltig,
  pixelVerantwortlicherAus,
  pruefePartnerMarketingEinwilligung,
} from "../../supabase/functions/_shared/cookie-einwilligung.ts";
import { EINWILLIGUNG_VERSION } from "@/lib/cookieEinwilligung";

const PARTNER = "11111111-1111-4111-8111-111111111111";
const JETZT = Date.parse("2026-09-27T10:00:00.000Z");
const TAG = 24 * 60 * 60 * 1000;

function rumpf(ueber: Record<string, unknown> = {}, partner: Record<string, unknown> | null = {}) {
  return {
    version: COOKIE_EINWILLIGUNG_FASSUNG,
    statistik: false,
    marketing: false,
    zeitpunkt: new Date(JETZT - TAG).toISOString(),
    partnerMarketing: partner === null ? null : { partnerId: PARTNER, zeitpunkt: new Date(JETZT - TAG).toISOString(), ...partner },
    ...ueber,
  };
}

describe("pruefePartnerMarketingEinwilligung", () => {
  it("Browser und Server kennen dieselbe Fassung", () => {
    expect(EINWILLIGUNG_VERSION).toBe(COOKIE_EINWILLIGUNG_FASSUNG);
    expect(GUELTIGE_COOKIE_FASSUNGEN).toContain(COOKIE_EINWILLIGUNG_FASSUNG);
    expect(GUELTIGE_COOKIE_FASSUNGEN).not.toContain(1);
  });

  it("liefert den Nachweis bei gültiger Einwilligung für genau diesen Partner", () => {
    expect(pruefePartnerMarketingEinwilligung(rumpf(), PARTNER, JETZT)).toEqual({
      fassung: COOKIE_EINWILLIGUNG_FASSUNG,
      zeitpunkt: new Date(JETZT - TAG).toISOString(),
      kategorie: "marketing_partner",
      partnerId: PARTNER,
      geprueftAm: new Date(JETZT).toISOString(),
    });
  });

  it("nimmt ein nacktes marketing: true nicht an", () => {
    expect(pruefePartnerMarketingEinwilligung({ marketing: true }, PARTNER, JETZT)).toBeNull();
    expect(pruefePartnerMarketingEinwilligung(rumpf({ marketing: true }, null), PARTNER, JETZT)).toBeNull();
  });

  it("verwirft fehlende, alte oder erfundene Fassungen", () => {
    expect(pruefePartnerMarketingEinwilligung(rumpf({ version: undefined }), PARTNER, JETZT)).toBeNull();
    expect(pruefePartnerMarketingEinwilligung(rumpf({ version: 1 }), PARTNER, JETZT)).toBeNull();
    expect(pruefePartnerMarketingEinwilligung(rumpf({ version: 99 }), PARTNER, JETZT)).toBeNull();
    expect(pruefePartnerMarketingEinwilligung(rumpf({ version: "2" }), PARTNER, JETZT)).toBeNull();
  });

  it("verwirft eine Einwilligung für einen anderen Partner", () => {
    const anderer = "22222222-2222-4222-8222-222222222222";
    expect(pruefePartnerMarketingEinwilligung(rumpf({}, { partnerId: anderer }), PARTNER, JETZT)).toBeNull();
    expect(pruefePartnerMarketingEinwilligung(rumpf(), anderer, JETZT)).toBeNull();
    expect(pruefePartnerMarketingEinwilligung(rumpf(), null, JETZT)).toBeNull();
  });

  it("verwirft Zeitpunkte in der Zukunft, älter als 13 Monate oder unlesbar", () => {
    const zeit = (ms: number) => ({ zeitpunkt: new Date(ms).toISOString() });
    expect(pruefePartnerMarketingEinwilligung(rumpf({}, zeit(JETZT + 60 * 60 * 1000)), PARTNER, JETZT)).toBeNull();
    expect(pruefePartnerMarketingEinwilligung(rumpf({}, zeit(JETZT - 404 * TAG)), PARTNER, JETZT)).toBeNull();
    expect(pruefePartnerMarketingEinwilligung(rumpf({}, { zeitpunkt: "gestern" }), PARTNER, JETZT)).toBeNull();
    expect(pruefePartnerMarketingEinwilligung(rumpf({}, { zeitpunkt: undefined }), PARTNER, JETZT)).toBeNull();
    // Eine leicht vorgehende Uhr und zwölf Monate sind in Ordnung.
    expect(pruefePartnerMarketingEinwilligung(rumpf({}, zeit(JETZT + 60 * 1000)), PARTNER, JETZT)).not.toBeNull();
    expect(pruefePartnerMarketingEinwilligung(rumpf({}, zeit(JETZT - 365 * TAG)), PARTNER, JETZT)).not.toBeNull();
  });

  it("übersteht Unsinn im Rumpf", () => {
    for (const roh of [null, undefined, "ja", 1, [], { partnerMarketing: "ja" }]) {
      expect(pruefePartnerMarketingEinwilligung(roh, PARTNER, JETZT)).toBeNull();
    }
  });
});

describe("Höchstalter: 13 Kalendermonate (PIXEL-004)", () => {
  const ms = (iso: string) => Date.parse(iso);

  it("läuft genau 13 Kalendermonate später zur selben Uhrzeit ab", () => {
    const erteilt = "2026-09-27T10:00:00.000Z";
    expect(new Date(einwilligungGiltBis(ms(erteilt))).toISOString()).toBe("2027-10-27T10:00:00.000Z");
    // Genau am Ablauf gilt sie noch, eine Millisekunde danach nicht mehr.
    expect(einwilligungsZeitpunktGueltig(erteilt, ms("2027-10-27T10:00:00.000Z"))).toBe(true);
    expect(einwilligungsZeitpunktGueltig(erteilt, ms("2027-10-27T10:00:00.001Z"))).toBe(false);
    // Die alte Rechnung (13 mal 31 Tage) ließ sie bis zum 3. November gelten.
    expect(einwilligungsZeitpunktGueltig(erteilt, ms("2027-11-02T10:00:00.000Z"))).toBe(false);
  });

  it("Monatsende: gibt es den Tag im Zielmonat nicht, gilt der letzte Tag dieses Monats", () => {
    expect(new Date(einwilligungGiltBis(ms("2026-01-31T08:00:00.000Z"))).toISOString()).toBe("2027-02-28T08:00:00.000Z");
    expect(new Date(einwilligungGiltBis(ms("2026-03-31T08:00:00.000Z"))).toISOString()).toBe("2027-04-30T08:00:00.000Z");
    expect(einwilligungsZeitpunktGueltig("2026-01-31T08:00:00.000Z", ms("2027-02-28T08:00:00.000Z"))).toBe(true);
    expect(einwilligungsZeitpunktGueltig("2026-01-31T08:00:00.000Z", ms("2027-03-01T00:00:00.000Z"))).toBe(false);
  });

  it("Schaltjahr: der 29. Februar zählt, wo es ihn gibt", () => {
    // Januar 2027 plus 13 Monate ist Februar 2028, ein Schaltjahr.
    expect(new Date(einwilligungGiltBis(ms("2027-01-31T12:00:00.000Z"))).toISOString()).toBe("2028-02-29T12:00:00.000Z");
    // Vom 29. Februar 2028 aus ist es der 29. März 2029.
    expect(new Date(einwilligungGiltBis(ms("2028-02-29T12:00:00.000Z"))).toISOString()).toBe("2029-03-29T12:00:00.000Z");
  });

  it("die fünf Minuten Spielraum für eine vorgehende Uhr bleiben", () => {
    const jetzt = ms("2026-09-27T10:00:00.000Z");
    expect(einwilligungsZeitpunktGueltig("2026-09-27T10:05:00.000Z", jetzt)).toBe(true);
    expect(einwilligungsZeitpunktGueltig("2026-09-27T10:05:00.001Z", jetzt)).toBe(false);
  });
});

describe("pixelVerantwortlicherAus", () => {
  const voll = { firmenname: "Muster Immobilien", strasse: "Hauptstraße", hausnummer: "1", plz: "80331", ort: "München", land: "Deutschland" };

  it("baut Name und Anschrift aus den Gewerbedaten", () => {
    expect(pixelVerantwortlicherAus(voll, "Max Muster")).toEqual({
      name: "Muster Immobilien",
      anschrift: "Hauptstraße 1, 80331 München",
    });
  });

  it("nennt ein anderes Land und fällt ohne Firmennamen auf den Namen zurück", () => {
    expect(pixelVerantwortlicherAus({ ...voll, firmenname: "", land: "Österreich" }, "Max Muster")).toEqual({
      name: "Max Muster",
      anschrift: "Hauptstraße 1, 80331 München, Österreich",
    });
  });

  it("liefert ohne Straße, PLZ oder Ort nichts, dann lädt kein Pixel", () => {
    expect(pixelVerantwortlicherAus({ ...voll, strasse: "" }, "Max")).toBeNull();
    expect(pixelVerantwortlicherAus({ ...voll, plz: " " }, "Max")).toBeNull();
    expect(pixelVerantwortlicherAus({ ...voll, ort: undefined }, "Max")).toBeNull();
    expect(pixelVerantwortlicherAus(undefined, "Max")).toBeNull();
  });
});
