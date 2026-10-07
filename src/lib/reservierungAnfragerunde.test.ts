/**
 * Reservierung: nur die aktuelle Anfragerunde zählt, ein Neuversand ersetzt
 * keine fertige Reservierung, und die Unterschriften gibt es nur für den, der
 * den Kunden betreuen darf (Befunde Objektbereich Vertriebspartner, 05.10.2026).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aktuelleRvAnfragen,
  darfReservierungVersenden,
  erwarteteRvKaeufer,
  reservierungVollstaendigUnterschrieben,
  rundeVollstaendig,
  RV_UEBERHOLT_SCHLUESSEL,
} from "../../supabase/functions/_shared/reservierung-anfragerunde.ts";

const lies = (pfad: string) => readFileSync(join(resolve(__dirname, "../.."), pfad), "utf8");

const anfrage = (person_type: string, status: string, created_at: string, meta: Record<string, unknown> = {}) =>
  ({ person_type, status, created_at, meta });

describe("aktuelleRvAnfragen", () => {
  it("eine alte Unterschrift zählt nicht, wenn danach neu versendet wurde", () => {
    const runde = aktuelleRvAnfragen([
      anfrage("rv_kaeufer1", "signed", "2026-10-01T10:00:00Z"),
      anfrage("rv_kaeufer1", "pending", "2026-10-03T10:00:00Z"),
    ]);
    expect(runde).toHaveLength(1);
    expect(runde[0].status).toBe("pending");
  });

  it("überholte Anfragen fallen heraus, auch wenn sie die jüngsten wären", () => {
    const runde = aktuelleRvAnfragen([
      anfrage("rv_kaeufer1", "signed", "2026-10-05T10:00:00Z", { [RV_UEBERHOLT_SCHLUESSEL]: "2026-10-05T11:00:00Z" }),
      anfrage("rv_kaeufer1", "pending", "2026-10-04T10:00:00Z"),
    ]);
    expect(runde.map((r) => r.status)).toEqual(["pending"]);
  });

  it("nur überholte Anfragen ergeben eine leere Runde", () => {
    expect(aktuelleRvAnfragen([
      anfrage("rv_kaeufer1", "signed", "2026-10-01T10:00:00Z", { [RV_UEBERHOLT_SCHLUESSEL]: "x" }),
    ])).toEqual([]);
  });

  it("je Käufer eine Anfrage, beide unterschrieben", () => {
    const runde = aktuelleRvAnfragen([
      anfrage("rv_kaeufer1", "signed", "2026-10-03T10:00:00Z"),
      anfrage("rv_kaeufer2", "signed", "2026-10-03T10:00:01Z"),
    ]);
    expect(runde).toHaveLength(2);
    expect(runde.every((r) => r.status === "signed")).toBe(true);
  });

  it("Bestand mit zwei Unterschriften je Käufer: die jüngere gilt", () => {
    const runde = aktuelleRvAnfragen([
      anfrage("rv_kaeufer1", "signed", "2026-09-20T10:00:00Z", { n: 1 }),
      anfrage("rv_kaeufer1", "signed", "2026-09-25T10:00:00Z", { n: 2 }),
    ]);
    expect(runde[0].meta).toEqual({ n: 2 });
  });
});

describe("erwartete Käufer (Prüfung Codex, 05.10.2026)", () => {
  it("Käufer 2 nur mit hatPerson2", () => {
    expect(erwarteteRvKaeufer({ hatPerson2: true })).toEqual(["kaeufer1", "kaeufer2"]);
    expect(erwarteteRvKaeufer({ hatPerson2: "true" })).toEqual(["kaeufer1"]);
    expect(erwarteteRvKaeufer(null)).toEqual(["kaeufer1"]);
  });

  it("vollständig erst, wenn alle erwarteten Käufer der Runde unterschrieben haben", () => {
    const k1 = anfrage("rv_kaeufer1", "signed", "2026-10-05T10:00:00Z");
    expect(rundeVollstaendig([k1], { hatPerson2: true })).toBe(false);
    expect(rundeVollstaendig([k1], {})).toBe(true);
    expect(rundeVollstaendig([k1, anfrage("rv_kaeufer2", "pending", "2026-10-05T10:00:00Z")], {})).toBe(false);
    expect(rundeVollstaendig([k1, anfrage("rv_kaeufer2", "signed", "2026-10-05T10:00:00Z")], { hatPerson2: true })).toBe(true);
    expect(rundeVollstaendig([], {})).toBe(false);
  });

  it("send-reservation-signature legt erst alle an, bricht sonst ab und setzt die Kopie zurück", () => {
    const q = lies("supabase/functions/send-reservation-signature/index.ts");
    expect(q).toContain("for (const personType of erwarteteRvKaeufer(rvData))");
    expect(q).toContain('.in("token", angelegt.map((a) => a.token));');
    expect(q).toContain("rvKopieVersandtAm: null,");
    expect(q.indexOf("angelegt.push(")).toBeLessThan(q.indexOf("sendeVorlage(supabase"));
  });

  it("finalize-reservierung: Widerrufswahl nur mit eigener Anfrage, Rückfall abwarten, Kopie je Runde", () => {
    const q = lies("supabase/functions/finalize-reservierung/index.ts");
    expect(q).toContain("const allSigned = rundeVollstaendig(requests, requests[0]?.sa_data);");
    expect(q).toContain('(eigeneAnfrage ? wahlAusBody : null) ?? wahlVonAnfrage ?? (rvData.widerrufWahl === "sofort" ? "sofort" : "abwarten")');
    expect(q).toContain("rv-kopie-${investmentId}-${meta.rvSignedAt");
  });
});

describe("Neuversand", () => {
  it("lehnt ab, solange die Reservierung unterschrieben und nicht entfallen ist", () => {
    expect(reservierungVollstaendigUnterschrieben({ rvSigned: true })).toBe(true);
    expect(reservierungVollstaendigUnterschrieben({ rvSigned: true, rvReservierungEntfallenAm: "2026-10-01" })).toBe(false);
    expect(reservierungVollstaendigUnterschrieben({ rvSigned: false })).toBe(false);
    expect(reservierungVollstaendigUnterschrieben({ rvSigned: "true" })).toBe(false);
    expect(reservierungVollstaendigUnterschrieben(null)).toBe(false);
  });

  it("Rollen: Vertrieb, Backoffice, Admin und Inhaber, sonst niemand", () => {
    for (const r of ["admin", "inhaber", "vertriebsleiter", "vertriebspartner", "backoffice"]) {
      expect(darfReservierungVersenden([r])).toBe(true);
    }
    for (const r of ["kunde", "marketing", "hr", "buchhaltung", "tippgeber", "objektpartner"]) {
      expect(darfReservierungVersenden([r])).toBe(false);
    }
    expect(darfReservierungVersenden([])).toBe(false);
    expect(darfReservierungVersenden(null)).toBe(false);
  });

  it("send-reservation-signature prüft Rolle und Stand und markiert vor dem Löschen", () => {
    const q = lies("supabase/functions/send-reservation-signature/index.ts");
    expect(q).toContain("darfReservierungVersenden(");
    expect(q).toContain("reservierungVollstaendigUnterschrieben(investmentZeile?.meta)");
    const markieren = q.indexOf("[RV_UEBERHOLT_SCHLUESSEL]: ueberholtAm");
    const loeschen = q.indexOf(".delete()");
    expect(markieren).toBeGreaterThan(0);
    expect(markieren).toBeLessThan(loeschen);
  });
});

describe("finalize-reservierung", () => {
  const q = lies("supabase/functions/finalize-reservierung/index.ts");

  it("zählt nur die aktuelle Runde und nimmt den Link nur aus ihr", () => {
    expect(q).toContain("const requests = aktuelleRvAnfragen((rawRequests as any[]).filter((r) => !aufgehoben(r)));");
    expect(q).toContain("? requests.find((r: any) => r.token === signatureToken");
    expect(q).not.toContain("latestByType");
  });

  it("gibt Unterschriften nur mit der Zugriffsprüfung des Versands heraus", () => {
    expect(q).toContain("pruefeKontaktZugriff(admin,");
    expect(q).not.toContain("is_internal_role");
  });
});
