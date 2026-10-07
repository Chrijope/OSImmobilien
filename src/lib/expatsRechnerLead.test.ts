/**
 * Der Weg vom EXPATS Calculator zum Lead.
 *
 * Gehalten wird hier genau die Zusage aus dem Auftrag: Jeder Lead aus diesem
 * Rechner erscheint in der Lead-Verwaltung, und die Quelle sagt, woher er kommt.
 *
 * Das haengt an drei Dingen, und alle drei sind stille Fehler, wenn sie kippen:
 *   1  Die Quelle geht unveraendert raus. Wuerde jemand "Meta" in den Namen
 *      schreiben, benennt `formatMetaQuelle` in `submit-lead` sie stillschweigend
 *      in "Meta Ads: …" um, und in der Spalte "Quelle" stuende etwas anderes.
 *   2  Es geht KEINE Beraterkennung und KEIN Beratername mit. Beides wuerde in
 *      `submit-lead` `zustaendig_id` setzen, und ein Lead mit `zustaendig_id`
 *      faellt aus `istOffenerPoolLead` heraus, steht also nicht mehr in der
 *      Lead-Verwaltung.
 *   3  Die Glocke nennt den richtigen Weg, falls der Rechner spaeter einmal an
 *      einem persoenlichen Partnerlink haengt.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXPATS_QUELLE, expatsLeadNotiz, sendeExpatsLead } from "@/lib/expatsRechnerLead";
import { berechneExpats, type ExpatsEingabe } from "@/lib/expatsRechner";
import { istOffenerPoolLead } from "@/lib/leadPool";
import type { KundeData } from "@/lib/kundenStore";
import { herkunftBezeichnung } from "../../supabase/functions/_shared/lead-zuordnung";

const EINGABE: ExpatsEingabe = { eigenkapital: 50000, jahresbrutto: 100000, verheiratet: false };
const ERGEBNIS = berechneExpats(EINGABE);

const LEAD = {
  vorname: " Jane ",
  nachname: "Doe",
  email: " jane@example.com ",
  telefon: "0170 1234567",
  einwilligung: true,
};

let letzterAufruf: { url: string; body: Record<string, unknown> } | null = null;

beforeEach(() => {
  letzterAufruf = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      letzterAufruf = { url, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ kontaktId: "kontakt-1" }) } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Die Quelle", () => {
  it("heisst wie die Seite und geht unveraendert mit dem Lead raus", async () => {
    expect(EXPATS_QUELLE).toBe("EXPATS Calculator");
    await sendeExpatsLead(LEAD, EINGABE, ERGEBNIS);
    expect(letzterAufruf?.body.quelle).toBe(EXPATS_QUELLE);
    expect(letzterAufruf?.url).toContain("/functions/v1/submit-lead");
  });

  it("enthaelt kein Wort, das submit-lead zu einer Meta-Quelle umschreibt", () => {
    // `formatMetaQuelle` greift bei "meta", "facebook" und "lead form".
    expect(/meta|facebook|lead form/i.test(EXPATS_QUELLE)).toBe(false);
  });

  it("wird von der Glocke als eigener Weg erkannt, nicht als grosser Steuerrechner", () => {
    expect(herkunftBezeichnung(EXPATS_QUELLE)).toBe("den EXPATS Calculator");
  });
});

describe("Kundensprache", () => {
  it("die Seite ist englisch, also meldet sie Englisch an submit-lead", async () => {
    await sendeExpatsLead(LEAD, EINGABE, ERGEBNIS);
    expect(letzterAufruf?.body.sprache).toBe("en");
    // Nicht frei ueber `meta`: submit-lead verwirft Sprachschluessel dort.
    expect((letzterAufruf?.body.meta as Record<string, unknown>)?.kundenSprache).toBeUndefined();
  });
});

describe("Der Lead gehoert in die Lead-Verwaltung", () => {
  it("schickt weder Beraterkennung noch Beraternamen mit", async () => {
    await sendeExpatsLead(LEAD, EINGABE, ERGEBNIS);
    expect(letzterAufruf?.body.beraterUserId).toBe("");
    expect(letzterAufruf?.body.beraterName).toBe("");
  });

  it("ein solcher Lead steht danach im offenen Pool", () => {
    /* So legt `submit-lead` ihn an: ohne `zustaendig_id`, ohne Ersteller.
       `leadTyp` ist dort woertlich "standard". Der Typ `KundeData` kennt diesen
       Wert nicht, deshalb die Umdeutung. Die Abweichung ist alt und gehoert
       nicht zu dieser Aenderung, sie soll hier nur nicht stillschweigend
       verschwinden. */
    const lead = {
      id: "1",
      leadTyp: "standard",
      quelle: EXPATS_QUELLE,
      status: "neu",
    } as unknown as Partial<KundeData>;
    expect(istOffenerPoolLead(lead, { rolle: "admin", benutzerId: "egal" })).toBe(true);
    // Mit Zustaendigem waere er aus der Lead-Verwaltung verschwunden.
    expect(
      istOffenerPoolLead({ ...lead, zustaendig_id: "irgendwer" }, { rolle: "admin", benutzerId: "egal" }),
    ).toBe(false);
  });
});

describe("Die Notiz fuer den Partner", () => {
  it("nennt den Rechner beim Namen und bleibt deutsch", () => {
    const notiz = expatsLeadNotiz(EINGABE, ERGEBNIS);
    expect(notiz.startsWith("EXPATS Calculator (englische Seite")).toBe(true);
    expect(notiz).toContain("keine Steuerberatung");
  });
});
