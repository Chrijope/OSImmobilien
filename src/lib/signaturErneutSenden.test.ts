/**
 * Ein neuer Unterschriftslink, und eine ehrliche Rückmeldung darüber.
 *
 * Christian hat am 16.09.2026 entschieden, dass Selbstauskunft und
 * Reservierungsvereinbarung vierzehn Tage gelten und danach erneut versendet
 * werden können. Der Knopf dafür darf auf keinen Fall Erfolg melden, wenn
 * nichts rausging: Der Partner glaubt sonst, der Kunde habe einen Link, und
 * wartet auf eine Unterschrift, die nie kommt.
 *
 * Geprüft wird deshalb:
 *   1. Die richtige Function wird gerufen, mit dem richtigen Datenfeld.
 *   2. Ein Fehlschlag kommt als Fehler zurück, in allen drei Formen
 *      (Ausnahme, `error`, `results` mit `sent: false`).
 *   3. Eine abgelehnte Berechtigung wird verständlich, nicht technisch.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

/** Was `supabase.functions.invoke` beim nächsten Aufruf zurückgeben soll. */
let antwort: () => Promise<{ data: any; error: any }> = async () => ({
  data: { success: true, results: [{ personType: "person1", email: "a@b.de", sent: true }] },
  error: null,
});
const aufrufe: { name: string; body: any }[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: async (name: string, opts: any) => {
        aufrufe.push({ name, body: opts?.body });
        return antwort();
      },
    },
  },
}));

const { signaturErneutSenden, ABLEHNUNG_TEXT, ANMELDUNG_ABGELAUFEN_TEXT } = await import("./signaturErneutSenden");
const { sendeVorlage } = await import("../../supabase/functions/_shared/transactional-versand");

/** Ein Fehler, wie ihn `functions.invoke` ab Status 400 liefert. */
function edgeFehler(status: number, rumpf: unknown) {
  const fehler: any = new Error("Edge Function returned a non-2xx status code");
  fehler.context = {
    status,
    clone: () => ({ text: async () => JSON.stringify(rumpf) }),
    text: async () => JSON.stringify(rumpf),
  };
  return fehler;
}

const auftragSa = {
  art: "selbstauskunft" as const,
  kontaktId: "k-1",
  investmentId: "inv-1",
  daten: { vorname: "Anna" },
  personen: [{ name: "Anna Beispiel", personType: "person1" }],
};

beforeEach(() => {
  aufrufe.length = 0;
  antwort = async () => ({
    data: { success: true, results: [{ personType: "person1", email: "a@b.de", sent: true }] },
    error: null,
  });
});

describe("signaturErneutSenden: welche Function und welche Daten", () => {
  it("ruft für die Selbstauskunft send-signature-request mit saData", async () => {
    await signaturErneutSenden(auftragSa);
    expect(aufrufe[0].name).toBe("send-signature-request");
    expect(aufrufe[0].body.saData).toEqual({ vorname: "Anna" });
    expect(aufrufe[0].body.rvData).toBeUndefined();
  });

  it("ruft für die Reservierung send-reservation-signature mit rvData", async () => {
    antwort = async () => ({
      data: { success: true, results: [{ personType: "kaeufer1", email: "a@b.de", sent: true }] },
      error: null,
    });
    await signaturErneutSenden({ ...auftragSa, art: "reservierung" });
    expect(aufrufe[0].name).toBe("send-reservation-signature");
    expect(aufrufe[0].body.rvData).toEqual({ vorname: "Anna" });
    expect(aufrufe[0].body.saData).toBeUndefined();
  });

  it("schickt keine E-Mail-Adresse mit, die holt die Function aus dem Kontakt", async () => {
    await signaturErneutSenden(auftragSa);
    expect(JSON.stringify(aufrufe[0].body)).not.toContain("@");
  });
});

describe("signaturErneutSenden: Erfolg nur, wenn wirklich versendet wurde", () => {
  it("meldet ok, wenn alle Empfänger bestätigt sind", async () => {
    expect(await signaturErneutSenden(auftragSa)).toEqual({ art: "ok" });
  });

  it("meldet einen Fehler, wenn invoke wirft", async () => {
    antwort = async () => { throw new Error("Netzwerk weg"); };
    const ergebnis = await signaturErneutSenden(auftragSa);
    expect(ergebnis.art).toBe("fehler");
    expect((ergebnis as any).text).toContain("Netzwerk weg");
  });

  it("nennt den Grund aus dem Antwortrumpf statt des englischen Satzes", async () => {
    antwort = async () => ({ data: null, error: edgeFehler(429, { error: "Zu viele Anfragen, bitte später erneut." }) });
    const ergebnis = await signaturErneutSenden(auftragSa);
    expect(ergebnis.art).toBe("fehler");
    expect((ergebnis as any).text).toBe("Zu viele Anfragen, bitte später erneut.");
  });

  it("meldet einen Fehler, wenn die Mail unterdrückt wurde (Status 200, sent: false)", async () => {
    antwort = async () => ({
      data: { success: true, results: [{ personType: "person1", email: "a@b.de", sent: false, grund: "email_suppressed" }] },
      error: null,
    });
    const ergebnis = await signaturErneutSenden(auftragSa);
    expect(ergebnis.art).toBe("fehler");
    expect((ergebnis as any).text).toContain("a@b.de");
  });

  it("meldet teilweise, wenn nur einer von zweien die Mail bekommen hat", async () => {
    antwort = async () => ({
      data: {
        success: true,
        results: [
          { personType: "kaeufer1", email: "a@b.de", sent: true },
          { personType: "kaeufer2", email: "c@d.de", sent: false },
        ],
      },
      error: null,
    });
    const ergebnis = await signaturErneutSenden({ ...auftragSa, art: "reservierung" });
    expect(ergebnis.art).toBe("teilweise");
  });
});

describe("signaturErneutSenden: fehlende Berechtigung", () => {
  it("wird zu einer verständlichen Meldung, nicht zum Servertext", async () => {
    antwort = async () => ({
      data: null,
      error: edgeFehler(403, { error: "Fuer diesen Kontakt darf keine Unterschrift angefordert werden." }),
    });
    const ergebnis = await signaturErneutSenden(auftragSa);
    expect(ergebnis).toEqual({ art: "fehler", text: ABLEHNUNG_TEXT });
    expect((ergebnis as any).text).not.toContain("Fuer");
  });

  it("greift auch, wenn der Rumpf nichts hergibt und nur der Status 403 ankommt", async () => {
    antwort = async () => ({ data: null, error: edgeFehler(403, {}) });
    const ergebnis = await signaturErneutSenden(auftragSa);
    expect(ergebnis).toEqual({ art: "fehler", text: ABLEHNUNG_TEXT });
  });
});

describe("signaturErneutSenden: 401, verständlich statt technisch (27.09.2026)", () => {
  it("die Function erkennt den Nutzer nicht: Hinweis auf neue Anmeldung", async () => {
    antwort = async () => ({ data: null, error: edgeFehler(401, { error: "Nicht autorisiert" }) });
    const ergebnis = await signaturErneutSenden(auftragSa);
    expect(ergebnis).toEqual({ art: "fehler", text: ANMELDUNG_ABGELAUFEN_TEXT });
  });

  it("der Mailversand dahinter lehnt mit 401 ab: lesbarer Grund, kein englischer Satz", async () => {
    // So antwortet supabase-js in der Function, wenn send-transactional-email 401 liefert.
    const versand = await sendeVorlage(
      { functions: { invoke: async () => ({ data: null, error: edgeFehler(401, { error: "Anmeldung erforderlich" }) }) } },
      { templateName: "selbstauskunft-signatur", recipientEmail: "a@b.de", idempotencyKey: "k", templateData: {} },
    );
    expect(versand.ok).toBe(false);
    antwort = async () => ({
      data: { success: true, results: [{ personType: "person1", email: "a@b.de", sent: false, grund: versand.grund }] },
      error: null,
    });
    const ergebnis = await signaturErneutSenden(auftragSa);
    expect(ergebnis.art).toBe("fehler");
    const text = (ergebnis as { text: string }).text;
    expect(text).toContain("HTTP 401");
    expect(text).not.toContain("non-2xx");
    // Keine Aufforderung zur neuen Anmeldung: Der Nutzer ist ja angemeldet.
    expect(text).not.toBe(ANMELDUNG_ABGELAUFEN_TEXT);
  });
});
