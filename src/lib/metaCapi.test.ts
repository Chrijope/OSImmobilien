/**
 * Tests fuer die Meta-Conversion-API-Bausteine von submit-lead.
 *
 * Die Logik liegt in `supabase/functions/_shared/meta-capi.ts`, weil die Edge
 * Function in Deno laeuft und nichts aus `src/` importieren kann. Getestet
 * wird von hier, so wie bei `kontakt-dublette` und `standort-messung`.
 *
 * Worum es geht: An Meta gehen nur gehashte Kontaktdaten, dieselbe event_id
 * wie im Browser (Deduplizierung), und das Token darf niemals in einer URL
 * oder einem Fehlertext auftauchen. Ein Fehler beim Senden darf nie werfen,
 * sonst wuerde er den Lead aufhalten.
 */
import { describe, it, expect } from "vitest";
import {
  istGueltigePixelId,
  normalisiereEmailFuerMeta,
  normalisiereTelefonFuerMeta,
  sha256Hex,
  baueMetaLeadEvent,
  sendeMetaLeadEvent,
} from "../../supabase/functions/_shared/meta-capi.ts";

describe("normalisiereEmailFuerMeta", () => {
  it("trimmt und schreibt klein", () => {
    expect(normalisiereEmailFuerMeta("  Max.Mustermann@Example.COM ")).toBe(
      "max.mustermann@example.com",
    );
  });
  it("liefert leeren String fuer leere Eingaben", () => {
    expect(normalisiereEmailFuerMeta("")).toBe("");
    expect(normalisiereEmailFuerMeta(null)).toBe("");
    expect(normalisiereEmailFuerMeta(undefined)).toBe("");
  });
});

describe("normalisiereTelefonFuerMeta", () => {
  it("entfernt alles ausser Ziffern und behaelt die Laendervorwahl", () => {
    expect(normalisiereTelefonFuerMeta("+49 170 123-4567")).toBe("491701234567");
  });
  it("macht aus der fuehrenden 0 die deutsche Laendervorwahl", () => {
    expect(normalisiereTelefonFuerMeta("0170 1234567")).toBe("491701234567");
  });
  it("behandelt 00 als Auslandszeichen", () => {
    expect(normalisiereTelefonFuerMeta("0043 660 123456")).toBe("43660123456");
  });
  it("laesst Nummern ohne fuehrende Null unveraendert", () => {
    expect(normalisiereTelefonFuerMeta("43 660 123456")).toBe("43660123456");
  });
  it("verwirft zu kurze Nummern", () => {
    expect(normalisiereTelefonFuerMeta("12345")).toBe("");
    expect(normalisiereTelefonFuerMeta("")).toBe("");
    expect(normalisiereTelefonFuerMeta(null)).toBe("");
  });
});

describe("sha256Hex", () => {
  it("liefert den bekannten Hash des leeren Strings", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
  it("liefert 64 Hex-Zeichen und ist deterministisch", async () => {
    const a = await sha256Hex("max@example.com");
    const b = await sha256Hex("max@example.com");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(await sha256Hex("anders@example.com"));
  });
});

describe("istGueltigePixelId", () => {
  it("akzeptiert Zahlenfolgen und verwirft alles andere", () => {
    expect(istGueltigePixelId("123456789012345")).toBe(true);
    expect(istGueltigePixelId(" 123456789012345 ")).toBe(true);
    expect(istGueltigePixelId("abc")).toBe(false);
    expect(istGueltigePixelId("")).toBe(false);
    expect(istGueltigePixelId(null)).toBe(false);
    expect(istGueltigePixelId(123 as unknown as string)).toBe(false);
  });
});

describe("baueMetaLeadEvent", () => {
  it("baut das Lead-Ereignis mit gehashten Kontaktdaten und der Browser-Event-ID", async () => {
    const event = await baueMetaLeadEvent({
      eventId: "event-123",
      eventTime: 1756725000.9,
      eventSourceUrl: "https://osimmobilien.netlify.app/vp/max-mustermann",
      email: " Max@Example.com ",
      telefon: "0170 1234567",
    });
    expect(event.event_name).toBe("Lead");
    expect(event.action_source).toBe("website");
    expect(event.event_id).toBe("event-123");
    expect(event.event_time).toBe(1756725000);
    expect(event.event_source_url).toBe("https://osimmobilien.netlify.app/vp/max-mustermann");
    expect(event.user_data.em).toEqual([await sha256Hex("max@example.com")]);
    expect(event.user_data.ph).toEqual([await sha256Hex("491701234567")]);
    // Klartext darf nirgends im Ereignis stehen.
    const roh = JSON.stringify(event);
    expect(roh).not.toContain("Max@Example.com");
    expect(roh).not.toContain("max@example.com");
    expect(roh).not.toContain("1234567");
  });

  it("laesst fehlende Kontaktdaten einfach weg", async () => {
    const event = await baueMetaLeadEvent({
      eventId: "event-456",
      eventTime: 1756725000,
      eventSourceUrl: "https://osimmobilien.netlify.app/",
      email: "",
      telefon: "123",
    });
    expect(event.user_data.em).toBeUndefined();
    expect(event.user_data.ph).toBeUndefined();
  });
});

describe("sendeMetaLeadEvent", () => {
  const beispielEvent = {
    event_name: "Lead" as const,
    event_time: 1756725000,
    action_source: "website" as const,
    event_source_url: "https://osimmobilien.netlify.app/vp/max",
    event_id: "event-789",
    user_data: {},
  };

  it("sendet an den Pixel-Endpunkt, Token nur im Koerper, nie in der URL", async () => {
    let gesehenUrl = "";
    let gesehenBody = "";
    const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
      gesehenUrl = String(url);
      gesehenBody = String(init?.body ?? "");
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const ergebnis = await sendeMetaLeadEvent({
      pixelId: "123456789012345",
      token: "GEHEIMES_TOKEN",
      event: beispielEvent,
      fetchFn,
    });
    expect(ergebnis.ok).toBe(true);
    expect(gesehenUrl).toBe("https://graph.facebook.com/v21.0/123456789012345/events");
    expect(gesehenUrl).not.toContain("GEHEIMES_TOKEN");
    const body = JSON.parse(gesehenBody);
    expect(body.access_token).toBe("GEHEIMES_TOKEN");
    expect(body.data).toEqual([beispielEvent]);
  });

  it("sendet nichts ohne Token oder mit ungueltiger Pixel-ID", async () => {
    let aufgerufen = 0;
    const fetchFn = (async () => {
      aufgerufen++;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const ohneToken = await sendeMetaLeadEvent({
      pixelId: "123456789012345",
      token: "  ",
      event: beispielEvent,
      fetchFn,
    });
    const kaputtePixelId = await sendeMetaLeadEvent({
      pixelId: "<script>",
      token: "TOKEN",
      event: beispielEvent,
      fetchFn,
    });
    expect(ohneToken.ok).toBe(false);
    expect(kaputtePixelId.ok).toBe(false);
    expect(aufgerufen).toBe(0);
  });

  it("wirft bei Fehlern nicht, sondern meldet sie als Ergebnis", async () => {
    const fetchFehler = (async () => {
      throw new Error("Netz weg");
    }) as typeof fetch;
    const ergebnis = await sendeMetaLeadEvent({
      pixelId: "123456789012345",
      token: "TOKEN",
      event: beispielEvent,
      fetchFn: fetchFehler,
    });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.fehler).toBe("Netz weg");

    const fetch400 = (async () =>
      new Response('{"error":{"message":"Invalid parameter"}}', { status: 400 })) as typeof fetch;
    const ablehnung = await sendeMetaLeadEvent({
      pixelId: "123456789012345",
      token: "TOKEN",
      event: beispielEvent,
      fetchFn: fetch400,
    });
    expect(ablehnung.ok).toBe(false);
    expect(ablehnung.status).toBe(400);
    expect(ablehnung.fehler).toContain("Invalid parameter");
    expect(ablehnung.fehler).not.toContain("TOKEN");
  });
});
