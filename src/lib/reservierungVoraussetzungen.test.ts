import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fehlendeMindestunterlagenAusMeta,
  objektAngabenAusInvestment,
  objektEingetragen,
  pruefeReservierungsVoraussetzungen,
  RV_OBJEKT_FEHLT,
  RV_SA_FEHLT,
  RV_SA_NEU_AUSSTEHEND,
  rvUnterlagenFehlen,
  SA_ENTFAELLT_META_SCHLUESSEL,
  selbstauskunftErledigt,
} from "../../supabase/functions/_shared/reservierung-voraussetzungen.ts";
import { ZUGRIFF_ABGELEHNT } from "../../supabase/functions/_shared/kontakt-signatur-zugriff.ts";

/**
 * Die gemeinsame Regel fuer den Versand der Reservierung (29.09.2026).
 *
 * `send-reservation-signature` und die Oberflaeche lesen dieselbe Datei.
 * Hier stehen die Faelle der Regel selbst, der Vergleich mit der
 * Objekt-Lesart der Oberflaeche und die Pruefung der Function ohne Datenbank.
 */

// Die Oberflaechen-Lesart (`vorhandeneObjektDaten`) liest ueber den Store.
// Die Attrappe bildet `fromDb` nach: weNr aus meta oder der Spalte `wohnung`.
let zeile: { id: string; kunde_id: string; wohnung?: string | null; meta: Record<string, unknown> } | null = null;
vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentById: () =>
    zeile ? { id: zeile.id, objektId: zeile.meta.objektId, weNr: zeile.meta.weNr || zeile.wohnung } : undefined,
  getInvestmentMetaField: (_id: string, key: string, fallback: unknown) =>
    zeile?.meta?.[key] !== undefined ? zeile.meta[key] : fallback,
  getInvestmentMeta: (_id: string, key: string, fallback: unknown) =>
    zeile?.meta?.[key] !== undefined ? zeile.meta[key] : fallback,
}));
vi.mock("@/lib/objekteStore", () => ({ getWohnungKurz: () => null }));

const { vorhandeneObjektDaten, objektDatenFehlen } = await import("./objektDatenPflicht");
const { SA_ENTFAELLT_SCHLUESSEL } = await import("./selbstauskunftEntfaellt");
const { fehlendeMindestunterlagen } = await import("./mindestunterlagen");
const { fehlendeUnterlagenFuerReservierung } = await import("./reservierungStart");

beforeEach(() => {
  zeile = null;
});

const KONTAKT = "11111111-1111-1111-1111-111111111111";
const FREMD = "22222222-2222-2222-2222-222222222222";
const UNTERLAGEN = { docStatuses: { Personalausweis: "uploaded", "Letzter Gehaltsnachweis": "approved" } };
const OBJEKT = {
  rvVirtualWohnung: { objAdresse: "Hauptstr. 1", objOrt: "Leipzig", weNr: "4", kaufpreis: 189000 },
};

describe("selbstauskunftErledigt", () => {
  it("gilt bei echter Unterschrift", () => {
    expect(selbstauskunftErledigt({ saSigned: true })).toBe(true);
  });

  it("nimmt saSigned als Text nicht an", () => {
    expect(selbstauskunftErledigt({ saSigned: "true" })).toBe(false);
  });

  it("gilt mit fertigem PDF ohne ausstehende Unterschrift (auch Bestand)", () => {
    expect(selbstauskunftErledigt({ saPdf: "SA.pdf" })).toBe(true);
    expect(selbstauskunftErledigt({ saPdf: "   " })).toBe(false);
  });

  it("zaehlt nach einer Korrektur ab 26.09. das alte PDF nicht mehr", () => {
    const korrigiert = { saPdf: "SA_alt.pdf", saSigned: false, saNeueUnterschriftSeit: "2026-09-27T08:00:00.000Z" };
    expect(selbstauskunftErledigt(korrigiert)).toBe(false);
    // Neu unterschrieben: wieder erledigt.
    expect(selbstauskunftErledigt({ ...korrigiert, saSigned: true })).toBe(true);
    // Papier-Selbstauskunft hochgeladen: keine Unterschrift mehr ausstehend.
    expect(selbstauskunftErledigt({ ...korrigiert, saPapierUpload: "papier.pdf" })).toBe(true);
  });

  it("gilt mit dem Vermerk „Kunde finanziert selbst“, nur wenn er aktiv ist", () => {
    expect(selbstauskunftErledigt({ [SA_ENTFAELLT_META_SCHLUESSEL]: { aktiv: true } })).toBe(true);
    expect(selbstauskunftErledigt({ [SA_ENTFAELLT_META_SCHLUESSEL]: { aktiv: false } })).toBe(false);
    expect(selbstauskunftErledigt({ [SA_ENTFAELLT_META_SCHLUESSEL]: { aktiv: "true" } })).toBe(false);
  });

  it("liest den Vermerk unter demselben Schluessel wie die Oberflaeche", () => {
    expect(SA_ENTFAELLT_META_SCHLUESSEL).toBe(SA_ENTFAELLT_SCHLUESSEL);
  });

  it("haelt leere und kaputte Angaben auf", () => {
    expect(selbstauskunftErledigt(null)).toBe(false);
    expect(selbstauskunftErledigt({ saData: { fortschritt: 80 } })).toBe(false);
    expect(selbstauskunftErledigt("saSigned")).toBe(false);
  });
});

describe("objektEingetragen", () => {
  it("verlangt Strasse, Ort, Wohneinheit und Kaufpreis", () => {
    const voll = { strasse: "Hauptstr. 1", ort: "Leipzig", weNr: "4", kaufpreis: 189000 };
    expect(objektEingetragen(voll)).toBe(true);
    expect(objektEingetragen({ ...voll, strasse: " " })).toBe(false);
    expect(objektEingetragen({ ...voll, ort: "" })).toBe(false);
    expect(objektEingetragen({ ...voll, weNr: "" })).toBe(false);
    expect(objektEingetragen({ ...voll, kaufpreis: 0 })).toBe(false);
  });

  it("laesst ein Objekt aus der Objektseite genuegen, auch das ganze Haus", () => {
    expect(objektEingetragen({ objektId: "obj-1" })).toBe(true);
    expect(objektEingetragen({})).toBe(false);
  });
});

describe("objektAngabenAusInvestment gegen vorhandeneObjektDaten", () => {
  const faelle: Array<[string, { wohnung?: string | null; meta: Record<string, unknown> }]> = [
    ["Objekt aus „Objekt eintragen“", { meta: { ...OBJEKT } }],
    ["Schnappschuss und Spalte wohnung", {
      wohnung: "7",
      meta: { objektSnapshot: { adresse: "Ring 2", ort: "Halle" }, wohnungSnapshot: { vkGesamt: 210000 } },
    }],
    ["weNr am Investment, Kaufpreis oben", {
      meta: { weNr: "12", kaufpreis: 150000, objektSnapshot: { strasse: "Weg 3", ort: "Jena" } },
    }],
    ["leer", { meta: {} }],
    ["unvollstaendig", { meta: { rvVirtualWohnung: { objAdresse: "Hauptstr. 1" } } }],
  ];

  for (const [name, fall] of faelle) {
    it(`liest dasselbe: ${name}`, () => {
      zeile = { id: "i1", kunde_id: KONTAKT, ...fall };
      const ui = vorhandeneObjektDaten("i1");
      const server = objektAngabenAusInvestment(zeile);
      expect(server.strasse).toBe(ui.strasse);
      expect(server.ort).toBe(ui.ort);
      expect(server.weNr).toBe(ui.weNr);
      expect(server.kaufpreis).toBe(ui.kaufpreis);
      expect(objektEingetragen({ ...server, objektId: null })).toBe(!objektDatenFehlen("i1"));
    });
  }
});

describe("pruefeReservierungsVoraussetzungen", () => {
  const bereit = { kunde_id: KONTAKT, meta: { saSigned: true, ...UNTERLAGEN, ...OBJEKT } };

  it("laesst den vollstaendigen Vorgang durch", () => {
    expect(pruefeReservierungsVoraussetzungen(KONTAKT, bereit)).toEqual({ ok: true });
  });

  it("lehnt ein fremdes oder fehlendes Investment neutral ab", () => {
    expect(pruefeReservierungsVoraussetzungen(KONTAKT, { ...bereit, kunde_id: FREMD }))
      .toEqual({ ok: false, status: 403, fehler: ZUGRIFF_ABGELEHNT });
    expect(pruefeReservierungsVoraussetzungen(KONTAKT, null))
      .toEqual({ ok: false, status: 403, fehler: ZUGRIFF_ABGELEHNT });
    expect(pruefeReservierungsVoraussetzungen("", bereit))
      .toEqual({ ok: false, status: 403, fehler: ZUGRIFF_ABGELEHNT });
  });

  it("verlangt die Selbstauskunft vor dem Objekt", () => {
    expect(pruefeReservierungsVoraussetzungen(KONTAKT, { kunde_id: KONTAKT, meta: {} }))
      .toEqual({ ok: false, status: 409, fehler: RV_SA_FEHLT });
  });

  it("nennt die ausstehende neue Unterschrift nach einer Korrektur", () => {
    const meta = { ...OBJEKT, saPdf: "SA_alt.pdf", saSigned: false, saNeueUnterschriftSeit: "2026-09-27T08:00:00.000Z" };
    expect(pruefeReservierungsVoraussetzungen(KONTAKT, { kunde_id: KONTAKT, meta }))
      .toEqual({ ok: false, status: 409, fehler: RV_SA_NEU_AUSSTEHEND });
  });

  it("verlangt ein Objekt, ohne Blanko-Ausnahme fuer Investagon", () => {
    const meta = { saSigned: true, ...UNTERLAGEN, quelle: "investagon" };
    expect(pruefeReservierungsVoraussetzungen(KONTAKT, { kunde_id: KONTAKT, meta }))
      .toEqual({ ok: false, status: 409, fehler: RV_OBJEKT_FEHLT });
  });

  it("laesst Vermerk und Objekt aus der Objektseite genuegen", () => {
    // Beim Vermerk genuegt der Ausweis, die Gehaltsabrechnung entfaellt.
    const meta = {
      [SA_ENTFAELLT_META_SCHLUESSEL]: { aktiv: true }, objektId: "obj-1",
      docStatuses: { Personalausweis: "uploaded" },
    };
    expect(pruefeReservierungsVoraussetzungen(KONTAKT, { kunde_id: KONTAKT, meta })).toEqual({ ok: true });
  });

  it("nennt die fehlenden Mindestunterlagen nach der Selbstauskunft, vor dem Objekt (16.10.2026)", () => {
    expect(pruefeReservierungsVoraussetzungen(KONTAKT, { kunde_id: KONTAKT, meta: { saSigned: true } }))
      .toEqual({ ok: false, status: 409, fehler: rvUnterlagenFehlen(["Personalausweis", "Letzter Gehaltsnachweis"]) });
    expect(rvUnterlagenFehlen(["Personalausweis", "Letzter Gehaltsnachweis"]))
      .toBe("Für die Reservierung fehlen noch: Personalausweis, letzte Gehaltsabrechnung. Sie müssen zuerst im Portal liegen.");
    const ohneGehalt = { saSigned: true, ...OBJEKT, docStatuses: { Personalausweis: "approved", "Letzter Gehaltsnachweis": "rejected" } };
    expect(pruefeReservierungsVoraussetzungen(KONTAKT, { kunde_id: KONTAKT, meta: ohneGehalt }))
      .toEqual({ ok: false, status: 409, fehler: rvUnterlagenFehlen(["Letzter Gehaltsnachweis"]) });
  });
});

describe("Mindestunterlagen: Server gegen Oberflaeche (16.10.2026)", () => {
  const faelle: Array<[string, Record<string, unknown>]> = [
    ["nichts da", {}],
    ["beide hochgeladen", { ...UNTERLAGEN }],
    ["Gehalt abgelehnt", { docStatuses: { Personalausweis: "approved", "Letzter Gehaltsnachweis": "rejected" } }],
    ["nur Gehalt", { docStatuses: { "Letzter Gehaltsnachweis": "uploaded" } }],
    ["selbststaendig ohne Gehalt", { saData: { beschaeftigungsart: "Selbstständig" }, docStatuses: { Personalausweis: "uploaded" } }],
    ["freiberuflich laut Schnappschuss, ohne Ausweis", { saSnapshot: { beschaeftigungsart: "Freiberufler" } }],
    ["angestellt laut saData", { saData: { beschaeftigungsart: "Angestellt" }, docStatuses: { Personalausweis: "uploaded" } }],
    ["Vermerk finanziert selbst", { [SA_ENTFAELLT_META_SCHLUESSEL]: { aktiv: true }, docStatuses: { Personalausweis: "uploaded" } }],
    ["Vermerk inaktiv", { [SA_ENTFAELLT_META_SCHLUESSEL]: { aktiv: false }, docStatuses: { Personalausweis: "uploaded" } }],
    ["Status unbekannt", { docStatuses: { Personalausweis: "pending", "Letzter Gehaltsnachweis": "" } }],
  ];

  for (const [name, meta] of faelle) {
    it(`liest dasselbe: ${name}`, () => {
      zeile = { id: "i1", kunde_id: KONTAKT, meta };
      const server = fehlendeMindestunterlagenAusMeta(meta);
      expect(server).toEqual(fehlendeMindestunterlagen(meta));
      expect(server).toEqual(fehlendeUnterlagenFuerReservierung("i1"));
    });
  }
});
