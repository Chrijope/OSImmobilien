/**
 * M17 vom 04.10.2026: Eine zweite Bewerbung derselben Adresse hängt an der
 * bestehenden, ohne Groß- und Kleinschreibung, und HR bekommt eine Glocke.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  emailMuster,
  erlaubterLebenslauf,
  findeBewerbungNachEmail,
  metaMitWeitererBewerbung,
} from "../../supabase/functions/_shared/bewerber-dublette.ts";

const lies = (name: string) =>
  readFileSync(join(process.cwd(), "supabase", "functions", name, "index.ts"), "utf8");

describe("emailMuster", () => {
  it("vergleicht klein und maskiert Platzhalter", () => {
    expect(emailMuster(" Anna.Muster@Example.DE ")).toBe("anna.muster@example.de");
    expect(emailMuster("a_b%c@x.de")).toBe("a\\_b\\%c@x.de");
  });
});

describe("findeBewerbungNachEmail", () => {
  it("sucht mit ilike und nimmt höchstens einen Treffer", async () => {
    const aufrufe: string[] = [];
    const kette = {
      select: () => kette,
      ilike: (spalte: string, wert: string) => { aufrufe.push(`ilike:${spalte}:${wert}`); return kette; },
      order: (spalte: string, o: { ascending: boolean }) => { aufrufe.push(`order:${spalte}:${o.ascending}`); return kette; },
      limit: async (n: number) => {
        aufrufe.push(`limit:${n}`);
        return { data: [{ id: "b1", vorname: "Anna", nachname: "", telefon: null, meta: {} }], error: null };
      },
    };
    const treffer = await findeBewerbungNachEmail({ from: () => kette }, "Anna@Example.de");
    expect(treffer?.id).toBe("b1");
    // Die neueste Bewerbung, nicht die aelteste.
    expect(aufrufe).toEqual(["ilike:email:anna@example.de", "order:erstellt_am:false", "limit:1"]);
  });

  it("wirft bei einem Lesefehler, statt still nichts zu finden", async () => {
    const kette = {
      select: () => kette,
      ilike: () => kette,
      order: () => kette,
      limit: async () => ({ data: null, error: new Error("kaputt") }),
    };
    await expect(findeBewerbungNachEmail({ from: () => kette }, "a@b.de")).rejects.toThrow("kaputt");
  });
});

describe("metaMitWeitererBewerbung", () => {
  it("hängt die Anfrage an und lässt alles andere stehen", () => {
    const meta = metaMitWeitererBewerbung(
      { quelle: "Website", weitereAnfragen: [{ eingegangenAm: "alt" }] },
      { eingegangenAm: "2026-10-04T10:00:00Z", quelle: "Meta (Zapier)", angaben: { ort: "Berlin" } },
    );
    expect(meta.quelle).toBe("Website");
    expect((meta.weitereAnfragen as unknown[]).length).toBe(2);
    expect(meta.letzteAnfrageQuelle).toBe("Meta (Zapier)");
  });

  it("begrenzt die Liste auf 25 Einträge", () => {
    const voll = { weitereAnfragen: Array.from({ length: 25 }, (_, i) => ({ i })) };
    const meta = metaMitWeitererBewerbung(voll, { eingegangenAm: "x", quelle: "y", angaben: {} });
    expect((meta.weitereAnfragen as unknown[]).length).toBe(25);
  });
});

describe("erlaubterLebenslauf", () => {
  it("lässt nur ein PDF als data:-Adresse zu", () => {
    expect(erlaubterLebenslauf("data:application/pdf;base64,JVBERi0xLjQ=")).toBe(true);
    // Als PDF ausgegeben, aber HTML im Inhalt.
    expect(erlaubterLebenslauf("data:application/pdf;base64,PGh0bWw+PC9odG1sPg==")).toBe(false);
    // Größer als bisher erlaubt.
    expect(erlaubterLebenslauf(`data:application/pdf;base64,JVBERi0x${"A".repeat(11_000_000)}`)).toBe(false);
    expect(erlaubterLebenslauf("data:text/html;base64,PGgxPg==")).toBe(false);
    expect(erlaubterLebenslauf("https://example.com/cv.pdf")).toBe(false);
  });
});

describe("Eingangswege", () => {
  it("zapier-bewerber-webhook verwirft nicht mehr still und setzt keinen Gedankenstrich als Namen", () => {
    const text = lies("zapier-bewerber-webhook");
    expect(text).toContain("findeBewerbungNachEmail(admin, email)");
    expect(text).toContain("meldeErneuteBewerbung(admin");
    expect(text).not.toMatch(/\.eq\("email", email\)\s*\.maybeSingle\(\)/);
    expect(text).not.toContain('nachname = "—"');
    expect(text).not.toContain('vorname = "—"');
  });

  it("submit-bewerbung speichert die Adresse klein und hängt Dubletten an", () => {
    const text = lies("submit-bewerbung");
    expect(text).toContain("const email = data.email.toLowerCase();");
    expect(text).toContain("findeBewerbungNachEmail(admin, email)");
    expect(text).toContain("meldeErneuteBewerbung(admin");
    expect(text).not.toMatch(/email: data\.email,/);
  });

  it("submit-bewerbung antwortet bei einer Dublette in derselben Form wie neu und bremst je IP", () => {
    const text = lies("submit-bewerbung");
    expect(text).toContain('JSON.stringify({ ok: true, id: crypto.randomUUID(), seiteToken: "" })');
    expect(text).toContain('checkEdgeRateLimit({ scope: "submit-bewerbung", key: clientIp(req)');
    expect(text).toContain("!erlaubterLebenslauf(data.lebenslaufUrl)");
    // Der Lebenslauf der erneuten Bewerbung steht an der Anfrage.
    expect(text).toContain('lebenslaufUrl: istTippgeber ? "" : data.lebenslaufUrl,');
  });
});
