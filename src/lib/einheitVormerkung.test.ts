import { describe, expect, it } from "vitest";
import {
  VORMERKUNG_MINUTEN,
  vormerkErgebnisLesen,
  vormerkFunktionFehlt,
  vormerkMeldung,
  vormerkenMoeglich,
  vormerkungAktiv,
  vormerkungBlockiert,
  vormerkungKurztext,
  uhrzeit,
} from "@/lib/einheitVormerkung";
import { reservierungNachUnterschrift } from "../../supabase/functions/_shared/einheit-vormerkung";

/*
 * Christians Regeln vom 23.09.2026, als reine Logik:
 *
 *   1. Absenden merkt die Einheit 60 Minuten für genau einen Kunden vor.
 *   2. Danach erlischt die Vormerkung von selbst, allein über den Zeitstempel.
 *   3. Die erste Unterschrift gewinnt, auch gegen eine fremde Vormerkung.
 *   4. Ist die Einheit an einen anderen Kunden reserviert: Konflikt.
 *   5. Während der Vormerkung bleibt die Einheit frei.
 *
 * Entschieden wird in der Datenbank. Diese Prüfungen halten fest, dass
 * Anzeige und Rückfallweg dieselben Regeln sprechen.
 */

const JETZT = new Date("2026-09-23T12:00:00.000Z"); // 14:00 Uhr in Berlin
const IN_30_MIN = "2026-09-23T12:30:00.000Z";
const VOR_1_MIN = "2026-09-23T11:59:00.000Z";

describe("Regel 2: Die Vormerkung erlischt von selbst", () => {
  it("gilt, solange der Zeitstempel in der Zukunft liegt", () => {
    expect(vormerkungAktiv({ vorgemerktBis: IN_30_MIN }, JETZT)).toBe(true);
  });

  it("ist abgelaufen, sobald der Zeitstempel erreicht oder vorbei ist", () => {
    expect(vormerkungAktiv({ vorgemerktBis: VOR_1_MIN }, JETZT)).toBe(false);
    expect(vormerkungAktiv({ vorgemerktBis: JETZT.toISOString() }, JETZT)).toBe(false);
  });

  it("zählt einen fehlenden oder kaputten Zeitstempel nicht als Vormerkung", () => {
    expect(vormerkungAktiv({}, JETZT)).toBe(false);
    expect(vormerkungAktiv({ vorgemerktBis: "" }, JETZT)).toBe(false);
    expect(vormerkungAktiv({ vorgemerktBis: "kein Datum" }, JETZT)).toBe(false);
  });

  it("dauert sechzig Minuten", () => {
    expect(VORMERKUNG_MINUTEN).toBe(60);
  });
});

describe("Regel 1: Wer darf vormerken", () => {
  it("lässt eine freie Einheit ohne Kunden zu", () => {
    expect(vormerkenMoeglich({ status: "frei" }, "k-1", JETZT)).toEqual({ moeglich: true });
    // Ein leerer Status gilt wie im Browser als frei.
    expect(vormerkenMoeglich({ status: null, kundeId: "" }, "k-1", JETZT)).toEqual({ moeglich: true });
  });

  it("weist eine reservierte, gesetzte oder verkaufte Einheit ab", () => {
    for (const status of ["reserviert", "gesetzt", "verkauft", "Reserviert"]) {
      expect(vormerkenMoeglich({ status }, "k-1", JETZT)).toEqual({ moeglich: false, grund: "vergeben" });
    }
  });

  it("weist eine Einheit ab, an der schon ein Kunde hängt, auch wenn sie frei heißt", () => {
    expect(vormerkenMoeglich({ status: "frei", kundeId: "k-9" }, "k-1", JETZT)).toEqual({ moeglich: false, grund: "vergeben" });
  });

  it("weist ab, solange ein anderer Kunde vorgemerkt ist, und nennt das Ende", () => {
    expect(vormerkenMoeglich({ status: "frei", vorgemerktBis: IN_30_MIN, vorgemerktKundeId: "k-9" }, "k-1", JETZT))
      .toEqual({ moeglich: false, grund: "vorgemerkt_von_anderem", bis: IN_30_MIN });
  });

  it("verlängert für denselben Kunden, etwa beim zweiten Versandversuch", () => {
    expect(vormerkenMoeglich({ status: "frei", vorgemerktBis: IN_30_MIN, vorgemerktKundeId: "k-1" }, "k-1", JETZT))
      .toEqual({ moeglich: true });
  });

  it("lässt nach Ablauf jeden anderen Partner wieder vormerken", () => {
    expect(vormerkenMoeglich({ status: "frei", vorgemerktBis: VOR_1_MIN, vorgemerktKundeId: "k-9" }, "k-1", JETZT))
      .toEqual({ moeglich: true });
  });
});

describe("Regel 3 und 4: Nach der Unterschrift", () => {
  it("reserviert eine freie Einheit, auch gegen eine fremde Vormerkung (erste Unterschrift gewinnt)", () => {
    expect(reservierungNachUnterschrift({ status: "frei" }, "k-1")).toBe("frei");
    expect(reservierungNachUnterschrift({ status: "frei", vorgemerktBis: IN_30_MIN, vorgemerktKundeId: "k-9" }, "k-1")).toBe("frei");
  });

  it("erkennt die schon diesem Kunden reservierte Einheit", () => {
    expect(reservierungNachUnterschrift({ status: "reserviert", kundeId: "k-1" }, "k-1")).toBe("schon_fuer_diesen_kunden");
  });

  it("meldet den Konflikt, wenn ein anderer Kunde reserviert hat oder verkauft ist", () => {
    expect(reservierungNachUnterschrift({ status: "reserviert", kundeId: "k-9" }, "k-1")).toBe("vergeben");
    expect(reservierungNachUnterschrift({ status: "reserviert", kundeId: null }, "k-1")).toBe("vergeben");
    expect(reservierungNachUnterschrift({ status: "verkauft", kundeId: "k-1" }, "k-1")).toBe("vergeben");
  });
});

describe("Die Antwort der Datenbank", () => {
  it("liest eine gelungene Vormerkung", () => {
    expect(vormerkErgebnisLesen({ ok: true, grund: "vorgemerkt", vorgemerkt_bis: IN_30_MIN, vorgemerkt_berater_name: "Anna Partner" }))
      .toEqual({ ok: true, grund: "vorgemerkt", vorgemerktBis: IN_30_MIN, beraterName: "Anna Partner" });
  });

  it("liest die Ablehnung mit Grund", () => {
    const e = vormerkErgebnisLesen({ ok: false, grund: "vorgemerkt_von_anderem", vorgemerkt_bis: IN_30_MIN });
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("vorgemerkt_von_anderem");
  });

  it("hält eine unbekannte Antwort nie für Erfolg", () => {
    expect(vormerkErgebnisLesen(null).ok).toBe(false);
    expect(vormerkErgebnisLesen({ ok: true }).grund).toBe("fehler");
    expect(vormerkErgebnisLesen({ ok: true, grund: "vergeben" }).ok).toBe(false);
  });

  it("erkennt nur die fehlende Funktion als fehlende Migration", () => {
    expect(vormerkFunktionFehlt({ code: "PGRST202" })).toBe(true);
    expect(vormerkFunktionFehlt({ code: "42883" })).toBe(true);
    expect(vormerkFunktionFehlt({ message: "Could not find the function public.vormerke_einheit" })).toBe(true);
    // Eine fehlende Spalte ist ein anderer Fehler und darf nicht still ausweichen.
    expect(vormerkFunktionFehlt({ code: "42703", message: "column does not exist" })).toBe(false);
    expect(vormerkFunktionFehlt(null)).toBe(false);
  });
});

describe("Die Meldungen", () => {
  it("nennt die Uhrzeit in deutscher Zeit", () => {
    expect(uhrzeit(IN_30_MIN)).toBe("14:30");
    expect(uhrzeit("Unsinn")).toBe("");
  });

  it("sagt bei einer fremden Vormerkung, bis wann, und dass nichts hinausging", () => {
    const m = vormerkMeldung({ ok: false, grund: "vorgemerkt_von_anderem", vorgemerktBis: IN_30_MIN, beraterName: "Anna Partner" });
    expect(m.titel).toBe("Diese Einheit ist vorgemerkt bis 14:30 Uhr");
    expect(m.text).toContain("Anna Partner");
    expect(m.text).toContain("Es ist nichts an den Kunden hinausgegangen.");
  });

  it("sagt bei einer vergebenen Einheit, dass sie vergeben ist", () => {
    expect(vormerkMeldung({ ok: false, grund: "vergeben" }).titel).toBe("Diese Einheit ist gerade vergeben");
  });

  it("kommt in allen Fällen ohne Gedankenstrich und im Du aus", () => {
    for (const grund of ["vergeben", "vorgemerkt_von_anderem", "keine_berechtigung", "globalobjekt", "exklusiv", "nicht_gefunden", "fehler"] as const) {
      const m = vormerkMeldung({ ok: false, grund, vorgemerktBis: IN_30_MIN });
      expect(`${m.titel} ${m.text}`).not.toMatch(/[–—]/);
      expect(`${m.titel} ${m.text}`).not.toMatch(/\bSie\b/);
    }
  });
});

describe("Die Anzeige an der Einheit", () => {
  const vorgemerkt = { status: "frei", vorgemerktBis: IN_30_MIN, vorgemerktKundeId: "k-9" };

  it("ersetzt den Knopf nur bei einer fremden, laufenden Vormerkung", () => {
    expect(vormerkungBlockiert(vorgemerkt, undefined, JETZT)).toBe(true);
    expect(vormerkungBlockiert(vorgemerkt, "k-1", JETZT)).toBe(true);
    expect(vormerkungBlockiert(vorgemerkt, "k-9", JETZT)).toBe(false);
    expect(vormerkungBlockiert({ ...vorgemerkt, vorgemerktBis: VOR_1_MIN }, undefined, JETZT)).toBe(false);
  });

  it("schreibt „vorgemerkt bis HH:MM“, abgelaufen nichts", () => {
    expect(vormerkungKurztext(vorgemerkt, JETZT)).toBe("vorgemerkt bis 14:30");
    expect(vormerkungKurztext({ ...vorgemerkt, vorgemerktBis: VOR_1_MIN }, JETZT)).toBe("");
  });
});
