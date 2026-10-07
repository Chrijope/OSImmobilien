import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { MAIL_ANLEITUNG_PFAD } from "../../supabase/functions/_shared/bewerber-zugangsdaten.ts";

/*
 * Die Anleitung "MOREImmo Mail einrichten" geht als Link in der Mail
 * "Deine persönliche MOREImmo Adresse" an Bewerber, die noch keinen
 * CRM-Zugang haben. Deshalb liegt sie als feste Datei unter public/ und wird
 * nicht erst im Browser erzeugt wie unter Unterlagen.
 *
 * Die Datei ist ein Abzug von generateMailSetupPDF (unterlagenPdfContent.ts).
 * Nach einer Änderung dort neu erzeugen mit:
 *
 *   MAIL_ANLEITUNG_NEU=1 npx vitest run src/lib/mailAnleitungPdf.test.ts
 */
// jsPDF haengt save() an jede Instanz. Statt des Browser-Downloads landet
// die fertige Datei hier in einer Variablen.
let abzug: ArrayBuffer | null = null;
vi.mock("jspdf", async (original) => {
  const m = await original<typeof import("jspdf")>();
  class Abfang extends m.default {
    constructor(...args: ConstructorParameters<typeof m.default>) {
      super(...args);
      this.save = (() => { abzug = this.output("arraybuffer"); return this; }) as unknown as typeof this.save;
    }
  }
  return { ...m, default: Abfang, jsPDF: Abfang };
});

const DATEI = resolve(__dirname, "../../public", MAIL_ANLEITUNG_PFAD.replace(/^\//, ""));

describe("Mail-Anleitung als öffentliche PDF", () => {
  it.runIf(process.env.MAIL_ANLEITUNG_NEU === "1")("erzeugt die Datei aus dem Unterlagen-Generator neu", async () => {
    // Schrift und Logo holt der Generator per fetch von der eigenen Domain.
    // Hier kommen sie aus public/, also exakt dieselben Dateien.
    globalThis.fetch = (async (url: string) => {
      const pfad = resolve(__dirname, "../../public", String(url).replace(/^\//, ""));
      if (!existsSync(pfad)) return { ok: false } as Response;
      const buf = readFileSync(pfad);
      return {
        ok: true,
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        blob: async () => new Blob([buf], { type: "image/png" }),
      } as unknown as Response;
    }) as typeof fetch;
    const { generateMailSetupPDF } = await import("./unterlagenPdfContent");
    await generateMailSetupPDF();
    expect(abzug).not.toBeNull();
    writeFileSync(DATEI, new Uint8Array(abzug!));
  }, 30000);

  it("liegt als echte PDF unter dem Pfad, den Mail und Aktivierung verlinken", async () => {
    expect(existsSync(DATEI)).toBe(true);
    const roh = readFileSync(DATEI);
    expect(roh.subarray(0, 5).toString()).toBe("%PDF-");
    const pdf = await PDFDocument.load(new Uint8Array(roh));
    // Deckblatt plus Anleitung für iPhone, MacBook und Outlook.
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
  });
});
