/**
 * Der Weg der Auswertung vom Browser zum Postfach.
 *
 * Geprueft wird, was an die Edge Function geht, und vor allem, was passiert,
 * wenn unterwegs etwas ausfaellt. Die Auswertung wird in jedem Fall
 * zurueckgegeben, damit der Aufrufer den Interessenten nie mit leeren Haenden
 * dastehen laesst.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const baueSteuerAuswertungPdf = vi.hoisted(() =>
  vi.fn(async () => ({
    blob: new Blob(["%PDF-1.4 abc"], { type: "application/pdf" }),
    dateiname: "OS Immobilien-Steuerauswertung-2026-09-08.pdf",
  })),
);

vi.mock("@/lib/steuerrechnerPdf", () => ({ baueSteuerAuswertungPdf }));

import { sendeSteuerAuswertung } from "@/lib/steuerrechnerVersand";
import { berechne } from "@/lib/steuerRechner";
import { standardAntworten, zuEingaben } from "@/lib/steuerrechnerStrecke";
import type { BeraterInfo } from "@/pages/AnalysePublic";

const ANTWORTEN = { ...standardAntworten(), jahresbrutto: 85000, startzeitpunkt: "sofort" as const };
const ERGEBNIS = berechne(zuEingaben(ANTWORTEN));
const EINGABE = { vorname: " Max ", nachname: "Mustermann", email: " max@example.com " };
const BERATER: BeraterInfo = {
  name: "Christian Peetz",
  telefon: "0171 1111111",
  email: "os@os-immobilien.com",
  position: "Vertriebspartner",
  userId: "u-1",
};

let letzterAufruf: { url: string; body: Record<string, unknown> } | null = null;

function antworteMit(json: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      letzterAufruf = { url, body: JSON.parse(init.body) };
      return { ok, json: async () => json } as Response;
    }),
  );
}

beforeEach(() => {
  letzterAufruf = null;
  baueSteuerAuswertungPdf.mockClear();
  antworteMit({ pdfUrl: "https://ablage.example/a.pdf", mailVersendet: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Was an die Edge Function geht", () => {
  it("ruft steuer-auswertung-versand und schickt das PDF als Base64 mit", async () => {
    await sendeSteuerAuswertung(EINGABE, ERGEBNIS, ANTWORTEN, BERATER);
    expect(letzterAufruf?.url).toContain("/functions/v1/steuer-auswertung-versand");
    const base64 = letzterAufruf?.body.pdfBase64 as string;
    expect(base64).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(atob(base64)).toContain("%PDF");
  });

  it("trimmt die Eingaben und reicht nur die Kennung des Partners durch", async () => {
    await sendeSteuerAuswertung(EINGABE, ERGEBNIS, ANTWORTEN, BERATER);
    expect(letzterAufruf?.body.vorname).toBe("Max");
    expect(letzterAufruf?.body.email).toBe("max@example.com");
    expect(letzterAufruf?.body.beraterUserId).toBe("u-1");
    // Name, Adresse und Telefon liest der Server aus dem Partnerprofil.
    expect(letzterAufruf?.body).not.toHaveProperty("beraterName");
    expect(letzterAufruf?.body).not.toHaveProperty("beraterEmail");
    expect(letzterAufruf?.body).not.toHaveProperty("beraterTelefon");
  });

  it("schickt das Kuerzel vor der Kennung, wie beim Lead", async () => {
    await sendeSteuerAuswertung(EINGABE, ERGEBNIS, ANTWORTEN, { ...BERATER, slug: "christian-peetz" });
    expect(letzterAufruf?.body.beraterSlug).toBe("christian-peetz");
    expect(letzterAufruf?.body.beraterUserId).toBe("");
  });

  it("gibt Honigtopf und Dauer an den Server", async () => {
    await sendeSteuerAuswertung({ ...EINGABE, hp: "", dauerMs: 42000 }, ERGEBNIS, ANTWORTEN, BERATER);
    expect(letzterAufruf?.body.hp).toBe("");
    expect(letzterAufruf?.body.dauerMs).toBe(42000);
  });

  it("meldet Erfolg samt Adresse zurueck", async () => {
    const r = await sendeSteuerAuswertung(EINGABE, ERGEBNIS, ANTWORTEN, BERATER);
    expect(r.ok).toBe(true);
    expect(r.mailVersendet).toBe(true);
    expect(r.pdfUrl).toBe("https://ablage.example/a.pdf");
  });
});

describe("Wenn unterwegs etwas ausfaellt", () => {
  it("gibt die Auswertung auch dann zurueck, wenn der Server ablehnt", async () => {
    antworteMit({ error: "Zu viele Anfragen" }, false);
    const r = await sendeSteuerAuswertung(EINGABE, ERGEBNIS, ANTWORTEN);
    expect(r.ok).toBe(false);
    expect(r.mailVersendet).toBe(false);
    expect(r.blob).toBeInstanceOf(Blob);
    expect(r.dateiname).toMatch(/\.pdf$/);
  });

  it("gibt sie auch bei einem Netzfehler zurueck", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const r = await sendeSteuerAuswertung(EINGABE, ERGEBNIS, ANTWORTEN);
    expect(r.ok).toBe(false);
    expect(r.blob).toBeInstanceOf(Blob);
  });

  it("meldet ehrlich, wenn die Ablage geklappt hat, die Mail aber nicht", async () => {
    // Etwa, wenn die Adresse auf der Sperrliste steht. Der Aufrufer zeigt dann
    // die Auswertung direkt auf der Seite.
    antworteMit({ pdfUrl: "https://ablage.example/a.pdf", mailVersendet: false });
    const r = await sendeSteuerAuswertung(EINGABE, ERGEBNIS, ANTWORTEN);
    expect(r.ok).toBe(true);
    expect(r.mailVersendet).toBe(false);
    expect(r.pdfUrl).toBe("https://ablage.example/a.pdf");
  });

  it("verschickt nichts, wenn schon das PDF nicht entsteht", async () => {
    baueSteuerAuswertungPdf.mockRejectedValueOnce(new Error("jsPDF kaputt"));
    const r = await sendeSteuerAuswertung(EINGABE, ERGEBNIS, ANTWORTEN);
    expect(r.ok).toBe(false);
    expect(r.blob).toBeUndefined();
    expect(letzterAufruf).toBeNull();
  });
});

describe("Sprache der Auswertung (Plan Kundensprache, D20 und M33)", () => {
  it("Englisch: das PDF wird englisch gebaut und `sprache` geht an die Function", async () => {
    await sendeSteuerAuswertung(EINGABE, ERGEBNIS, ANTWORTEN, BERATER, "en");
    expect(letzterAufruf?.body.sprache).toBe("en");
    expect(baueSteuerAuswertungPdf.mock.calls[0]).toContain("en");
  });

  it("ohne Angabe Deutsch", async () => {
    await sendeSteuerAuswertung(EINGABE, ERGEBNIS, ANTWORTEN, BERATER);
    expect(letzterAufruf?.body.sprache).toBe("de");
  });

  it("Fehlermeldungen an den Besucher kommen in seiner Sprache", async () => {
    antworteMit({}, false);
    const r = await sendeSteuerAuswertung(EINGABE, ERGEBNIS, ANTWORTEN, BERATER, "en");
    expect(r.fehler).toBe("Your analysis could not be sent.");
  });
});

describe("Bremse nicht prüfbar (503)", () => {
  it("gibt die Auswertung trotzdem mit, die Seite laedt sie dann selbst herunter", async () => {
    antworteMit({ error: "Der Versand ist gerade nicht möglich." }, false);
    const r = await sendeSteuerAuswertung(EINGABE, ERGEBNIS, ANTWORTEN, BERATER);
    expect(r.ok).toBe(false);
    expect(r.mailVersendet).toBe(false);
    expect(r.blob).toBeInstanceOf(Blob);
    expect(r.dateiname).toBeTruthy();
  });
});
