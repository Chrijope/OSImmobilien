import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  istVorstellungsToken, vorstellungsAntwort, type LeseClient,
} from "../../supabase/functions/get-objektvorstellung/antwort.ts";

/**
 * Wächter über `get-objektvorstellung` seit der Abschaltung am 23.09.2026.
 *
 * Die Function gab bis dahin zu jedem Token ganze Zeilen heraus: Kontakt samt
 * Selbstauskunft, Investment, Objekt und Einheiten samt `meta.investagonRaw`
 * (darin die Provision), Kundendokumente mit signierten Adressen. Jetzt darf
 * sie zu einem gültigen Token nur noch Name, Telefon, E-Mail und Bild des
 * Partners herausgeben.
 *
 * Die Datenbank-Attrappe liefert bewusst vergiftete Zeilen, egal welche
 * Spalten gefragt sind, so als hätte jemand wieder `select("*")` geschrieben.
 * Nichts mit „GIFT“ darf in der Antwort stehen.
 */

const TOKEN = "0123456789abcdef0123456789abcdef";

const VORSTELLUNG = {
  id: "v1", token: TOKEN, kontakt_id: "k1", erstellt_von: "u-ersteller", investment_id: "inv-GIFT",
  titel: "GIFT Titel", begruessung: "GIFT Begrüßung", aufrufe: 3,
  konfig: { objektId: "o-GIFT", dokumentIds: ["d-GIFT"], freitext: "GIFT Freitext", aiVergleich: { x: { result: "GIFT" } } },
};

const KONTAKT = {
  id: "k1", vorname: "GIFT Kundin", nachname: "GIFT", email: "gift-kunde@example.com", zustaendig_id: "u-partner",
  meta: { investagonRaw: { commission: 8.403 }, saData: { einkommen: { netto: "GIFT 4000" } } },
};

const PARTNER = {
  id: "u-partner", name: "Paula Partner", telefon: "0171 234567", email: "paula@more.immo",
  avatar_url: "https://cdn.example/paula.jpg",
  rolle: "GIFT Rolle", buchungslink: "https://GIFT.example/buchen", beratungslink: "https://GIFT.example/beratung",
  iban: "GIFT DE00", meta: { investagonRaw: { commission: 8.403 } },
};

type Zeilen = Record<string, { data: unknown; error?: unknown }>;

/** Eine Attrappe, die jeden Lesezugriff mitschreibt und jeden Schreibzugriff als Spion anbietet. */
function attrappe(zeilen: Zeilen) {
  const gelesen: Array<{ tabelle: string; spalten: string; spalte: string; wert: string }> = [];
  const schreiben = { update: vi.fn(), insert: vi.fn(), upsert: vi.fn(), delete: vi.fn() };
  const db = {
    from(tabelle: string) {
      return {
        ...schreiben,
        select(spalten: string) {
          return {
            eq(spalte: string, wert: string) {
              return {
                maybeSingle: async () => {
                  gelesen.push({ tabelle, spalten, spalte, wert });
                  const z = zeilen[tabelle];
                  return { data: z?.data ?? null, error: z?.error ?? null };
                },
              };
            },
          };
        },
      };
    },
    rpc: vi.fn(),
    storage: { from: vi.fn() },
  };
  return { db: db as unknown as LeseClient, gelesen, schreiben, rpc: db.rpc, storage: db.storage.from };
}

describe("get-objektvorstellung: nur noch der Partner", () => {
  it("gibt zu einem gültigen Token genau die vier Angaben des Partners heraus, sonst nichts", async () => {
    const { db, gelesen, schreiben, rpc, storage } = attrappe({
      objektvorstellungen: { data: VORSTELLUNG },
      kontakte: { data: KONTAKT },
      profiles: { data: PARTNER },
    });

    const { status, body } = await vorstellungsAntwort(db, TOKEN);

    expect(status).toBe(410);
    expect(body).toEqual({
      nichtMehrVerfuegbar: true,
      ansprechpartner: { name: "Paula Partner", telefon: "0171 234567", email: "paula@more.immo", bild: "https://cdn.example/paula.jpg" },
      sprache: "de",
    });
    const text = JSON.stringify(body);
    for (const gift of ["GIFT", "8.403", "commission", "saData", "u-partner", "k1", "gift-kunde"]) {
      expect(text).not.toContain(gift);
    }

    // Genau drei Zeilen, jeweils nur die nötigen Spalten, nie alles.
    expect(gelesen).toEqual([
      { tabelle: "objektvorstellungen", spalten: "kontakt_id, erstellt_von", spalte: "token", wert: TOKEN },
      { tabelle: "kontakte", spalten: "zustaendig_id, meta", spalte: "id", wert: "k1" },
      { tabelle: "profiles", spalten: "name, telefon, email, avatar_url", spalte: "id", wert: "u-partner" },
    ]);

    // Nichts wird geschrieben, auch der Aufrufzähler nicht mehr.
    for (const spion of [...Object.values(schreiben), rpc, storage]) expect(spion).not.toHaveBeenCalled();
  });

  it("nimmt ohne zuständigen Partner den Ersteller der Objektvorstellung", async () => {
    const { db, gelesen } = attrappe({
      objektvorstellungen: { data: VORSTELLUNG },
      kontakte: { data: { ...KONTAKT, zustaendig_id: null } },
      profiles: { data: { ...PARTNER, id: "u-ersteller" } },
    });
    const { status, body } = await vorstellungsAntwort(db, TOKEN);
    expect(status).toBe(410);
    expect(gelesen[2]).toMatchObject({ tabelle: "profiles", wert: "u-ersteller" });
    expect(body).toMatchObject({ ansprechpartner: { name: "Paula Partner" } });
  });

  it("schickt ein Bild nur als https-Adresse, einen Speicherpfad nicht", async () => {
    const { db } = attrappe({
      objektvorstellungen: { data: VORSTELLUNG },
      kontakte: { data: KONTAKT },
      profiles: { data: { ...PARTNER, avatar_url: "avatars/u-partner.jpg" } },
    });
    const { body } = await vorstellungsAntwort(db, TOKEN);
    expect(body).toEqual({
      nichtMehrVerfuegbar: true,
      ansprechpartner: { name: "Paula Partner", telefon: "0171 234567", email: "paula@more.immo" },
      sprache: "de",
    });
  });

  it("gibt die Sprache des Kunden mit, damit der Hinweis englisch erscheint (Kundensprache, Etappe 3)", async () => {
    const { db } = attrappe({
      objektvorstellungen: { data: VORSTELLUNG },
      kontakte: { data: { ...KONTAKT, meta: { ...KONTAKT.meta, kundenSprache: "en" } } },
      profiles: { data: PARTNER },
    });
    const { body } = await vorstellungsAntwort(db, TOKEN);
    expect(body).toMatchObject({ nichtMehrVerfuegbar: true, sprache: "en" });

    // Ohne Kontaktzeile keine Sprache, die Seite bleibt deutsch.
    const ohneKontakt = attrappe({ objektvorstellungen: { data: VORSTELLUNG }, profiles: { data: PARTNER } });
    const ohne = await vorstellungsAntwort(ohneKontakt.db, TOKEN);
    expect(ohne.body).not.toHaveProperty("sprache");
  });

  it("gibt den Hinweis ohne Partner, wenn keiner zu finden ist", async () => {
    const ohneAlle = attrappe({
      objektvorstellungen: { data: { ...VORSTELLUNG, erstellt_von: null } },
      kontakte: { data: { ...KONTAKT, zustaendig_id: null } },
    });
    expect(await vorstellungsAntwort(ohneAlle.db, TOKEN)).toEqual({ status: 410, body: { nichtMehrVerfuegbar: true, sprache: "de" } });
    expect(ohneAlle.gelesen.map((g) => g.tabelle)).toEqual(["objektvorstellungen", "kontakte"]);

    const profilFehler = attrappe({
      objektvorstellungen: { data: VORSTELLUNG },
      kontakte: { data: KONTAKT },
      profiles: { data: PARTNER, error: new Error("GIFT Datenbankfehler") },
    });
    expect(await vorstellungsAntwort(profilFehler.db, TOKEN)).toEqual({ status: 410, body: { nichtMehrVerfuegbar: true, sprache: "de" } });
  });

  it("antwortet auf einen unbekannten Token mit 404 ohne jede Angabe", async () => {
    const unbekannt = attrappe({ objektvorstellungen: { data: null } });
    expect(await vorstellungsAntwort(unbekannt.db, TOKEN)).toEqual({ status: 404, body: { error: "Nicht gefunden" } });
    expect(unbekannt.gelesen).toHaveLength(1);

    const fehler = attrappe({ objektvorstellungen: { data: VORSTELLUNG, error: new Error("GIFT") } });
    expect(await vorstellungsAntwort(fehler.db, TOKEN)).toEqual({ status: 404, body: { error: "Nicht gefunden" } });
  });

  it("fragt bei einem kaputten Token gar nicht erst die Datenbank", async () => {
    for (const kaputt of [undefined, null, "", "abc", "a".repeat(64), "../../etc/passwd", "g".repeat(32), 42]) {
      const { db, gelesen } = attrappe({ objektvorstellungen: { data: VORSTELLUNG } });
      expect(await vorstellungsAntwort(db, kaputt)).toEqual({ status: 404, body: { error: "Nicht gefunden" } });
      expect(gelesen).toHaveLength(0);
    }
    expect(istVorstellungsToken(TOKEN)).toBe(true);
    expect(istVorstellungsToken(TOKEN.toUpperCase())).toBe(true);
  });
});

/** Quelltext ohne Kommentare: Die Erklärungen nennen die alten Zugriffe bewusst beim Namen. */
const lies = (pfad: string) => readFileSync(resolve(__dirname, "../..", pfad), "utf-8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("get-objektvorstellung: Quelltext", () => {
  it("liest nur über antwort.ts und gibt keinen Fehlertext hinaus", () => {
    const index = lies("supabase/functions/get-objektvorstellung/index.ts");
    expect(index).toContain("vorstellungsAntwort(");
    expect(index).not.toMatch(/\.from\(/);
    expect(index).not.toMatch(/\.message/);
  });

  it("fasst keine Tabelle außer Objektvorstellung, Kontakt und Profil an und schreibt nichts", () => {
    const antwort = lies("supabase/functions/get-objektvorstellung/antwort.ts");
    expect(antwort).not.toContain('select("*")');
    expect(antwort).not.toMatch(/\.(update|insert|upsert|delete|rpc)\(/);
    expect(antwort).not.toMatch(/storage|createSignedUrl/);
    for (const tabelle of ["investments", "kunde_dokumente", "objekte", "wohnungen", "objekt_bilder", "standorte", "user_settings"]) {
      expect(antwort).not.toContain(`"${tabelle}"`);
    }
  });
});

describe("Die beiden KI-Functions der Objektvorstellung sind stillgelegt", () => {
  it.each(["ai-compare-berechnungen", "ai-analyze-pdf-berechnungen"])("%s liest, schreibt und fragt nichts mehr", (name) => {
    const quelle = lies(`supabase/functions/${name}/index.ts`);
    expect(quelle).toContain("status: 410");
    for (const verboten of ["createClient", ".from(", "LOVABLE_API_KEY", "fetch(", "objektvorstellungen\")"]) {
      expect(quelle).not.toContain(verboten);
    }
  });
});
