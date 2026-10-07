import { describe, it, expect } from "vitest";
import {
  pipelineToEmpfehlungStatus,
  entscheideEmpfehlungStatusSync,
  praemiePatchFuerAbschluss,
  mergeEmpfehlungMeta,
  tippgeberGruppeFuerStufe,
  ALLE_EMPFEHLUNG_STATUS,
  EMPFEHLUNG_STATUS_CONFIG,
  EMPFEHLUNG_STATUS_LABEL,
  PORTAL_STATUS_TEXT_KEY,
  TIPPGEBER_GRUPPE_LABEL,
  type TippgeberGruppe,
} from "./empfehlungenStore";
import deJson from "../i18n/locales/de.json";
import enJson from "../i18n/locales/en.json";

describe("pipelineToEmpfehlungStatus", () => {
  // Alle 22 aktuellen Stufen aus PIPELINE_STUFEN (ohne Legacy-Aliase)
  const erwartet: Array<[string, string]> = [
    ["neuer_lead", "offen"],
    ["bestandsimport", "offen"],
    ["nicht_erreicht", "kontaktiert"],
    ["erreicht", "kontaktiert"],
    ["follow_up", "kontaktiert"],
    ["eg_noshow", "kontaktiert"],
    ["erstgespraech_geplant", "termin"],
    ["erstgespraech", "termin"],
    ["beratungsgespraech", "termin"],
    ["bg_noshow", "termin"],
    ["selbstauskunft", "in_beratung"],
    ["objektauswahl", "in_beratung"],
    // Manuelle Follow-Up-Stufe nach der Objektvorstellung: liegt zwischen
    // Objektauswahl und Reservierung und mappt wie die Objektauswahl.
    ["follow_up_objekt", "in_beratung"],
    ["reservierung", "in_abwicklung"],
    ["bonitaetsunterlagen", "in_abwicklung"],
    ["finanzierung", "in_abwicklung"],
    ["notar", "in_abwicklung"],
    ["faelligkeit", "abgeschlossen"],
    ["abrechnung", "abgeschlossen"],
    ["abgeschlossen", "abgeschlossen"],
    ["verloren", "verloren"],
    ["archiviert", "verloren"],
  ];

  it("deckt alle 22 aktuellen Stufen ab", () => {
    expect(erwartet).toHaveLength(22);
    for (const [stufe, status] of erwartet) {
      expect(pipelineToEmpfehlungStatus(stufe), stufe).toBe(status);
    }
  });

  it("normalisiert Legacy-Stufen vor dem Mapping", () => {
    expect(pipelineToEmpfehlungStatus("zugewiesen")).toBe("offen");
    expect(pipelineToEmpfehlungStatus("kontaktversuche")).toBe("kontaktiert");
    expect(pipelineToEmpfehlungStatus("vermoegensaufbau")).toBe("kontaktiert");
    expect(pipelineToEmpfehlungStatus("closing")).toBe("in_beratung");
    expect(pipelineToEmpfehlungStatus("after_sales")).toBe("abgeschlossen");
    expect(pipelineToEmpfehlungStatus("aftersales")).toBe("abgeschlossen");
    expect(pipelineToEmpfehlungStatus("notar_mit_gs")).toBe("in_abwicklung");
    expect(pipelineToEmpfehlungStatus("notar_ohne_gs")).toBe("in_abwicklung");
  });

  it("liefert null fuer unbekannte oder leere Stufen", () => {
    expect(pipelineToEmpfehlungStatus("gibt_es_nicht")).toBeNull();
    expect(pipelineToEmpfehlungStatus("")).toBeNull();
    expect(pipelineToEmpfehlungStatus(null)).toBeNull();
    expect(pipelineToEmpfehlungStatus(undefined)).toBeNull();
  });
});

describe("entscheideEmpfehlungStatusSync", () => {
  it("bewegt den Status vorwaerts", () => {
    expect(entscheideEmpfehlungStatusSync("offen", false, "erreicht")).toBe("kontaktiert");
    expect(entscheideEmpfehlungStatusSync("kontaktiert", false, "beratungsgespraech")).toBe("termin");
    expect(entscheideEmpfehlungStatusSync("termin", false, "selbstauskunft")).toBe("in_beratung");
    expect(entscheideEmpfehlungStatusSync("in_beratung", false, "reservierung")).toBe("in_abwicklung");
    expect(entscheideEmpfehlungStatusSync("in_abwicklung", false, "abgeschlossen")).toBe("abgeschlossen");
  });

  it("darf Stufen ueberspringen, aber nie zurueckfallen", () => {
    expect(entscheideEmpfehlungStatusSync("offen", false, "notar")).toBe("in_abwicklung");
    expect(entscheideEmpfehlungStatusSync("in_abwicklung", false, "erstgespraech")).toBeNull();
    expect(entscheideEmpfehlungStatusSync("abgeschlossen", false, "reservierung")).toBeNull();
    expect(entscheideEmpfehlungStatusSync("termin", false, "neuer_lead")).toBeNull();
  });

  it("aendert nichts bei gleichem Rang", () => {
    expect(entscheideEmpfehlungStatusSync("termin", false, "erstgespraech")).toBeNull();
    // "neu" und "offen" teilen sich den Rang 0
    expect(entscheideEmpfehlungStatusSync("neu", false, "neuer_lead")).toBeNull();
    expect(entscheideEmpfehlungStatusSync("offen", false, "bestandsimport")).toBeNull();
  });

  it("behandelt einen fehlenden Ist-Status wie neu", () => {
    expect(entscheideEmpfehlungStatusSync(null, false, "erreicht")).toBe("kontaktiert");
    expect(entscheideEmpfehlungStatusSync(undefined, false, "neuer_lead")).toBeNull();
  });

  it("erreicht verloren von ueberall, auch aus abgeschlossen", () => {
    expect(entscheideEmpfehlungStatusSync("offen", false, "verloren")).toBe("verloren");
    expect(entscheideEmpfehlungStatusSync("in_abwicklung", false, "archiviert")).toBe("verloren");
    expect(entscheideEmpfehlungStatusSync("abgeschlossen", false, "verloren")).toBe("verloren");
  });

  it("folgt der Pipeline aus verloren heraus, wenn der Kontakt wiederbelebt wird", () => {
    expect(entscheideEmpfehlungStatusSync("verloren", false, "beratungsgespraech")).toBe("termin");
    expect(entscheideEmpfehlungStatusSync("verloren", false, "abgeschlossen")).toBe("abgeschlossen");
    expect(entscheideEmpfehlungStatusSync("verloren", false, "verloren")).toBeNull();
  });

  it("ueberschreibt dublette nie", () => {
    expect(entscheideEmpfehlungStatusSync("dublette", false, "abgeschlossen")).toBeNull();
    expect(entscheideEmpfehlungStatusSync("dublette", false, "verloren")).toBeNull();
    expect(entscheideEmpfehlungStatusSync("dublette", false, "erreicht")).toBeNull();
  });

  it("respektiert manuell gesetzte Status, ausser bei abgeschlossen und verloren", () => {
    expect(entscheideEmpfehlungStatusSync("kontaktiert", true, "objektauswahl")).toBeNull();
    expect(entscheideEmpfehlungStatusSync("offen", true, "reservierung")).toBeNull();
    expect(entscheideEmpfehlungStatusSync("kontaktiert", true, "abgeschlossen")).toBe("abgeschlossen");
    expect(entscheideEmpfehlungStatusSync("kontaktiert", true, "verloren")).toBe("verloren");
  });

  it("aendert nichts bei unbekannter Stufe", () => {
    expect(entscheideEmpfehlungStatusSync("offen", false, "gibt_es_nicht")).toBeNull();
    expect(entscheideEmpfehlungStatusSync("offen", false, null)).toBeNull();
  });
});

describe("praemiePatchFuerAbschluss", () => {
  const heute = "2026-08-18";

  it("setzt Praemie auf berechtigt und traegt das Abschlussdatum ein", () => {
    expect(praemiePatchFuerAbschluss({}, heute)).toEqual({
      praemieStatus: "berechtigt",
      abgeschlossenAm: heute,
    });
    expect(praemiePatchFuerAbschluss({ praemieStatus: "ausstehend" }, heute)).toEqual({
      praemieStatus: "berechtigt",
      abgeschlossenAm: heute,
    });
    expect(praemiePatchFuerAbschluss(undefined, heute)).toEqual({
      praemieStatus: "berechtigt",
      abgeschlossenAm: heute,
    });
  });

  it("laesst eine ausgezahlte Praemie in Ruhe", () => {
    expect(praemiePatchFuerAbschluss({ praemieStatus: "ausgezahlt" }, heute)).toEqual({
      abgeschlossenAm: heute,
    });
    expect(
      praemiePatchFuerAbschluss({ praemieStatus: "ausgezahlt", abgeschlossenAm: "2026-01-01" }, heute),
    ).toBeNull();
  });

  it("ueberschreibt ein vorhandenes Abschlussdatum nicht", () => {
    expect(
      praemiePatchFuerAbschluss({ praemieStatus: "ausstehend", abgeschlossenAm: "2026-01-01" }, heute),
    ).toEqual({ praemieStatus: "berechtigt" });
    expect(
      praemiePatchFuerAbschluss({ praemieStatus: "berechtigt", abgeschlossenAm: "2026-01-01" }, heute),
    ).toBeNull();
  });
});

describe("Status-Labels in allen drei Oberflaechen", () => {
  it("hat fuer jeden Statuswert ein internes Label (Empfehlungsseite, Kundenprofil)", () => {
    for (const status of ALLE_EMPFEHLUNG_STATUS) {
      expect(EMPFEHLUNG_STATUS_CONFIG[status]?.label, status).toBeTruthy();
      expect(EMPFEHLUNG_STATUS_CONFIG[status]?.color, status).toBeTruthy();
      expect(EMPFEHLUNG_STATUS_LABEL[status], status).toBe(EMPFEHLUNG_STATUS_CONFIG[status].label);
      expect(EMPFEHLUNG_STATUS_LABEL[status], status).not.toBe("Unbekannt");
    }
  });

  it("zeigt die neuen Statuswerte mit den vereinbarten Texten", () => {
    expect(EMPFEHLUNG_STATUS_LABEL.in_beratung).toBe("In Beratung");
    expect(EMPFEHLUNG_STATUS_LABEL.in_abwicklung).toBe("Abschluss in Abwicklung");
    expect(EMPFEHLUNG_STATUS_LABEL.dublette).toBe("Bereits bekannt");
  });

  it("hat fuer jeden Statuswert einen Portal-Textschluessel, der in de.json und en.json existiert", () => {
    const aufloesen = (json: unknown, pfad: string): unknown =>
      pfad.split(".").reduce<unknown>(
        (obj, teil) => (obj && typeof obj === "object" ? (obj as Record<string, unknown>)[teil] : undefined),
        json,
      );

    for (const status of ALLE_EMPFEHLUNG_STATUS) {
      const schluessel = PORTAL_STATUS_TEXT_KEY[status];
      expect(schluessel, status).toBeTruthy();
      expect(aufloesen(deJson, schluessel), `de: ${schluessel}`).toBeTruthy();
      expect(aufloesen(enJson, schluessel), `en: ${schluessel}`).toBeTruthy();
    }
  });
});

describe("tippgeberGruppeFuerStufe", () => {
  it("ordnet die Stufen den groben Portal-Gruppen zu", () => {
    expect(tippgeberGruppeFuerStufe("neuer_lead")).toBe("offen");
    expect(tippgeberGruppeFuerStufe("erreicht")).toBe("kontaktiert");
    expect(tippgeberGruppeFuerStufe("beratungsgespraech")).toBe("termin");
    expect(tippgeberGruppeFuerStufe("objektauswahl")).toBe("in_beratung");
    expect(tippgeberGruppeFuerStufe("notar")).toBe("in_abwicklung");
    expect(tippgeberGruppeFuerStufe("faelligkeit")).toBe("abgeschlossen");
    expect(tippgeberGruppeFuerStufe("verloren")).toBe("verloren");
  });

  it("behandelt archivierte Kontakte als nicht zustande gekommen", () => {
    expect(tippgeberGruppeFuerStufe("reservierung", true)).toBe("verloren");
    expect(tippgeberGruppeFuerStufe(null, true)).toBe("verloren");
  });

  it("faellt bei fehlender oder unbekannter Stufe auf Eingegangen zurueck", () => {
    expect(tippgeberGruppeFuerStufe(null)).toBe("offen");
    expect(tippgeberGruppeFuerStufe(undefined)).toBe("offen");
    expect(tippgeberGruppeFuerStufe("gibt_es_nicht")).toBe("offen");
  });

  it("normalisiert Legacy-Stufen", () => {
    expect(tippgeberGruppeFuerStufe("zugewiesen")).toBe("offen");
    expect(tippgeberGruppeFuerStufe("closing")).toBe("in_beratung");
    expect(tippgeberGruppeFuerStufe("after_sales")).toBe("abgeschlossen");
  });

  it("hat fuer jede Gruppe den vereinbarten Portal-Text", () => {
    const erwartet: Record<TippgeberGruppe, string> = {
      offen: "Eingegangen",
      kontaktiert: "Kontakt aufgenommen",
      termin: "Im Gespräch",
      in_beratung: "In Beratung",
      in_abwicklung: "Abschluss in Abwicklung",
      abgeschlossen: "Abgeschlossen",
      verloren: "Nicht zustande gekommen",
    };
    expect(TIPPGEBER_GRUPPE_LABEL).toEqual(erwartet);
    // Interne Stufennamen duerfen nicht in den Portal-Texten auftauchen.
    for (const label of Object.values(TIPPGEBER_GRUPPE_LABEL)) {
      expect(label).not.toMatch(/notar|bonitaet|reservierung|finanzierung|faelligkeit|lead/i);
    }
  });
});

describe("statusManuell-Rundlauf", () => {
  it("manuell gesetzt: Automatik greift nicht mehr, ausser Abschluss und Verlust", () => {
    // Vertriebspartner setzt von Hand auf "termin", Pipeline steht weiter vorn
    expect(entscheideEmpfehlungStatusSync("termin", true, "erreicht")).toBeNull();
    // Pipeline zieht an dem manuellen Status vorbei: Automatik bleibt stumm
    expect(entscheideEmpfehlungStatusSync("termin", true, "reservierung")).toBeNull();
    // Nur Abschluss und Verlust brechen die manuelle Sperre
    expect(entscheideEmpfehlungStatusSync("termin", true, "abgeschlossen")).toBe("abgeschlossen");
    expect(entscheideEmpfehlungStatusSync("termin", true, "verloren")).toBe("verloren");
  });

  it("zurueck auf Automatik: Status wird direkt aus der effektiven Stufe abgeleitet", () => {
    // Der Reset-Knopf nutzt pipelineToEmpfehlungStatus direkt, ohne
    // Monotonie: Ein manuell zu weit gesetzter Status darf zurueckfallen.
    expect(pipelineToEmpfehlungStatus("erreicht")).toBe("kontaktiert");
    // Danach laeuft die Automatik normal weiter
    expect(entscheideEmpfehlungStatusSync("kontaktiert", false, "beratungsgespraech")).toBe("termin");
  });
});

describe("mergeEmpfehlungMeta", () => {
  it("erhaelt bestehende Felder wie neuerKontaktId beim Statuswechsel", () => {
    const bestehend = {
      neuerKontaktId: "k-1",
      programmId: "p-1",
      statusManuell: true,
      praemieStatus: "ausstehend",
    };
    const ergebnis = mergeEmpfehlungMeta(bestehend, { praemieStatus: "berechtigt", berater: "Anna" });
    expect(ergebnis).toEqual({
      neuerKontaktId: "k-1",
      programmId: "p-1",
      statusManuell: true,
      praemieStatus: "berechtigt",
      berater: "Anna",
    });
  });

  it("kommt mit fehlendem oder kaputtem Bestand zurecht", () => {
    expect(mergeEmpfehlungMeta(null, { a: 1 })).toEqual({ a: 1 });
    expect(mergeEmpfehlungMeta(undefined, { a: 1 })).toEqual({ a: 1 });
    expect(mergeEmpfehlungMeta("kein-objekt", { a: 1 })).toEqual({ a: 1 });
    expect(mergeEmpfehlungMeta([1, 2], { a: 1 })).toEqual({ a: 1 });
  });

  it("ueberschreibt nur die uebergebenen Felder", () => {
    const ergebnis = mergeEmpfehlungMeta({ statusManuell: true, x: "bleibt" }, { statusManuell: false });
    expect(ergebnis).toEqual({ statusManuell: false, x: "bleibt" });
  });
});
