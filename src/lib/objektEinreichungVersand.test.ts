/**
 * Der Botschutz der offenen Formulare.
 *
 * Erster Teil: Der Versand der Objekteinreichung geht ueber die Edge
 * Function, nicht mehr direkt in die Tabelle, und der Honigtopf geht mit.
 *
 * Zweiter Teil: Dieselbe Abwehr auf der Serverseite. Deno und SQL laufen
 * nicht im Vitest-Prozess, geprueft wird deshalb der Wortlaut. Das reicht
 * fuer den Fehler, um den es geht: Jemand aendert eine Seite und vergisst die
 * andere, und der Schutz ist still wieder weg.
 *
 * Vorbild: `src/lib/leadZuweisungRechte.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const gesendet: { name: string; body: Record<string, unknown> }[] = [];
let naechsteAntwort: { data: unknown; error: unknown } = { data: { ok: true }, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: async (name: string, optionen: { body: Record<string, unknown> }) => {
        gesendet.push({ name, body: optionen.body });
        return naechsteAntwort;
      },
    },
  },
}));

import { ladeEinreichungsDateiHoch, sendeObjektEinreichung, UPLOAD_GESTOERT, VERSAND_GESTOERT } from "@/lib/objektEinreichungVersand";

const WURZEL = process.cwd();
const lies = (...teile: string[]) => readFileSync(join(WURZEL, ...teile), "utf8");

const EINREICHUNG_FN = ["supabase", "functions", "submit-objekt-einreichung", "index.ts"];
const ZAEHLER_FN = ["supabase", "functions", "analyse-ereignis", "index.ts"];
const LEAD_FN = ["supabase", "functions", "submit-lead", "index.ts"];
const BOTSCHUTZ = ["supabase", "migrations", "20260918180000_botschutz_offene_formulare.sql"];

beforeEach(() => {
  gesendet.length = 0;
  naechsteAntwort = { data: { ok: true }, error: null };
});

afterEach(() => {
  gesendet.length = 0;
});

describe("Der Versand der Objekteinreichung", () => {
  it("geht über die Edge Function und nicht in die Tabelle", async () => {
    const antwort = await sendeObjektEinreichung({ strasse: "Hauptstr.", ort: "Hof" });
    expect(antwort.ok).toBe(true);
    expect(gesendet).toHaveLength(1);
    expect(gesendet[0].name).toBe("submit-objekt-einreichung");
    expect(gesendet[0].body.zeile).toMatchObject({ strasse: "Hauptstr.", ort: "Hof" });
  });

  it("schickt den Honigtopf mit, auch wenn er leer ist", async () => {
    await sendeObjektEinreichung({ strasse: "A", ort: "B" });
    expect(gesendet[0].body.hp).toBe("");
    await sendeObjektEinreichung({ strasse: "A", ort: "B" }, "http://spam.example");
    expect(gesendet[1].body.hp).toBe("http://spam.example");
  });

  it("nennt ein erschöpftes Kontingent beim Namen", async () => {
    naechsteAntwort = { data: null, error: { message: "429", context: { status: 429 } } };
    const antwort = await sendeObjektEinreichung({ strasse: "A", ort: "B" });
    expect(antwort.ok).toBe(false);
    expect(antwort.zuVieleAnfragen).toBe(true);
  });

  it("reicht die Meldung der Datenbank durch, damit das Formular sie einordnen kann", async () => {
    // Daran erkennt das Formular die noch nicht angelegte Spalte `details`
    // und schickt die Einreichung ein zweites Mal ohne sie.
    naechsteAntwort = {
      data: { ok: false, fehler: "Could not find the 'details' column of 'objekt_einreichungen'" },
      error: null,
    };
    const antwort = await sendeObjektEinreichung({ strasse: "A", ort: "B" });
    expect(antwort.ok).toBe(false);
    expect(antwort.fehler).toContain("details");
  });
});

describe("Dieselbe Abwehr auf der Serverseite", () => {
  it("die Einreichung hat Honigtopf und Kontingent je Anschluss", () => {
    const quelle = lies(...EINREICHUNG_FN);
    expect(quelle).toContain("checkEdgeRateLimit");
    expect(quelle).toContain('key: `ip:${clientIp(req)}`');
    // Der Honigtopf antwortet freundlich und schreibt nichts.
    expect(quelle).toContain("koerper.hp");
    expect(quelle).toContain("return antwort({ ok: true });");
    // Und die internen Felder kommen nie von aussen.
    expect(quelle).toContain('status: "eingereicht"');
  });

  it("der Zähler hat das Kontingent je Anschluss", () => {
    const quelle = lies(...ZAEHLER_FN);
    expect(quelle).toContain("checkEdgeRateLimit");
    expect(quelle).toContain('key: `ip:${clientIp(req)}`');
  });

  it("submit-lead wirft einen gefüllten Honigtopf still weg", () => {
    const quelle = lies(...LEAD_FN);
    expect(quelle).toContain('typeof body?.hp === "string" && body.hp.trim().length > 0');
  });

  it("und anon darf auf beiden Tabellen nicht mehr selbst schreiben", () => {
    const sql = lies(...BOTSCHUTZ);
    expect(sql).toContain('DROP POLICY IF EXISTS "Oeffentliche Einreichungen erstellen" ON public.objekt_einreichungen;');
    expect(sql).toContain("REVOKE ALL ON public.objekt_einreichungen FROM anon;");
    expect(sql).toContain("REVOKE ALL ON public.analysetool_ereignisse FROM anon;");
    // Der Zähler bleibt für Angemeldete offen, die Auswertung im CRM auch.
    expect(sql).toContain("TO authenticated");
  });
});

describe("Bilder über den offenen Link (seit 04.10.2026)", () => {
  it("gehen als Formular an die Function und liefern die Adresse", async () => {
    naechsteAntwort = { data: { ok: true, url: "https://x/objekt-medien/einreichungen/public/a.jpg" }, error: null };
    const datei = new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg", { type: "image/jpeg" });
    const url = await ladeEinreichungsDateiHoch(datei);
    expect(url).toContain("/einreichungen/public/");
    expect(gesendet[0].name).toBe("submit-objekt-einreichung");
    expect(gesendet[0].body).toBeInstanceOf(FormData);
  });

  it("sagen dem Einreicher einen lesbaren Satz, wenn es nicht geht", async () => {
    naechsteAntwort = { data: null, error: { message: "x", context: { status: 500 } } };
    await expect(ladeEinreichungsDateiHoch(new File(["a"], "a.jpg"))).rejects.toThrow(UPLOAD_GESTOERT);
  });

  it("die Function prüft Typ, Größe und Menge selbst", () => {
    const quelle = lies(...EINREICHUNG_FN);
    expect(quelle).toContain("multipart/form-data");
    expect(quelle).toContain("const MAX_DATEI = 15 * 1024 * 1024;");
    expect(quelle).toContain('scope: "objekt-einreichung-datei"');
    expect(quelle).toContain("const DATEIEN_PRO_TAG = 60;");
    // Nur Bilder, keine PDF mehr.
    expect(quelle).not.toContain("application/pdf");
    // Ohne Laengenangabe kein Upload.
    expect(quelle).toContain('fehler: "Laenge fehlt." }, 411)');
    // Der Ordner kommt aus der Anmeldung, nicht aus dem Koerper.
    expect(quelle).toContain("`einreichungen/${ordner}/");
    // Der Typ kommt aus den ersten Bytes, nicht aus der Angabe des Browsers.
    expect(quelle).toContain("const typ = dateityp(bytes);");
    expect(quelle).toContain("contentType: typ.mime");
  });

  it("die Seite lädt nicht mehr selbst in den Speicher und nimmt nur die erlaubten Typen", () => {
    const seite = lies("src", "pages", "ObjektAkquise.tsx");
    expect(seite).not.toContain(".storage.from(");
    expect(seite).toContain("ladeEinreichungsDateiHoch(");
    expect(seite).toContain("accept={EINREICHUNG_BILDTYPEN}");
    // Zu große Dateien merkt der Einreicher vor dem Hochladen.
    expect(seite).toContain("file.size > EINREICHUNG_MAX_MB * 1024 * 1024");
  });

  it("die Migration nimmt beide Einreichungsregeln und begrenzt den Eimer", () => {
    const sql = lies("supabase", "migrations", "20261004150000_einreichung_upload_server.sql");
    expect(sql).toContain("DROP POLICY IF EXISTS objekt_medien_anon_einreichung_upload ON storage.objects;");
    expect(sql).toContain("DROP POLICY IF EXISTS objekt_medien_auth_einreichung_upload ON storage.objects;");
    expect(sql).toContain("UPDATE storage.buckets SET file_size_limit = 31457280 WHERE id = 'objekt-medien';");
    // Keine Typliste am Eimer, sonst brechen PDFs und Investagon-Bilder.
    expect(sql).not.toMatch(/SET[^;]*allowed_mime_types/);
    // Und der Eingangskorb traegt dieselbe Fassung.
    expect(lies("supabase", "migrations-inbox", "20261004150000_einreichung_upload_server.sql")).toBe(sql);
    expect(lies("supabase", "migrations-inbox", "00_ALLE_ZUSAMMEN.sql")).toContain(sql);
  });
});

describe("Bremse nicht prüfbar (503)", () => {
  it("der Versand sagt einen lesbaren Satz", async () => {
    naechsteAntwort = { data: null, error: { message: "x", context: { status: 503 } } };
    const antwort = await sendeObjektEinreichung({ strasse: "Hauptstr.", ort: "Hof" });
    expect(antwort.ok).toBe(false);
    expect(antwort.fehler).toBe(VERSAND_GESTOERT);
  });

  it("der Bild-Upload auch", async () => {
    naechsteAntwort = { data: null, error: { message: "x", context: { status: 503 } } };
    await expect(ladeEinreichungsDateiHoch(new File(["a"], "a.jpg"))).rejects.toThrow(UPLOAD_GESTOERT);
  });

  it("die Function schliesst bei nicht prüfbarer Bremse und prüft volle Signaturen", () => {
    const quelle = lies(...EINREICHUNG_FN);
    expect(quelle.match(/failClosed: true/g)?.length).toBe(2);
    expect(quelle).toContain("[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]");
    expect(quelle).toContain('text(0, 6) === "GIF87a" || text(0, 6) === "GIF89a"');
    expect(quelle).toContain('["heic", "heix", "mif1", "msf1"]');
  });
});
