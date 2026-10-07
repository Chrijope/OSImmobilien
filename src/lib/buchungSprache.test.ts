/**
 * Englische Buchung, englische Mails (04.10.2026): Die Buchungsseite gibt
 * die ausdrücklich gewählte Sprache an `buchung_anlegen` weiter. Ohne die
 * Migration 20261004180000 bucht sie trotzdem, nur ohne Sprache.
 */
import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stand = vi.hoisted(() => ({
  aufrufe: [] as Record<string, unknown>[],
  spracheFehlt: false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      stand.aufrufe.push(args);
      if (stand.spracheFehlt && "_sprache" in args) {
        return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
      }
      return {
        data: { id: "b1", absage_token: "t1", start_at: "2026-10-10T08:00:00Z", ende_at: "2026-10-10T08:30:00Z" },
        error: null,
      };
    },
    functions: { invoke: async () => ({ error: null }) },
  },
}));

const { buche } = await import("./buchungStore");

const grund = {
  token: "tok",
  terminartId: "art",
  startISO: "2026-10-10T08:00:00Z",
  name: "Jane Doe",
  email: "jane@example.com",
};

describe("buche mit Sprache", () => {
  beforeEach(() => {
    stand.aufrufe.length = 0;
    stand.spracheFehlt = false;
  });

  it("schickt _sprache mit, wenn sie gewählt ist", async () => {
    await buche({ ...grund, sprache: "en" });
    expect(stand.aufrufe).toHaveLength(1);
    expect(stand.aufrufe[0]._sprache).toBe("en");
  });

  it("ohne gewählte Sprache kein _sprache, wie bisher", async () => {
    await buche(grund);
    expect(stand.aufrufe[0]).not.toHaveProperty("_sprache");
  });

  it("ohne Migration: zweiter Aufruf ohne _sprache, Begleitung bleibt", async () => {
    stand.spracheFehlt = true;
    const antwort = await buche({ ...grund, sprache: "en", begleitung: { name: "B", email: "b@example.com" } });
    expect(antwort?.absageToken).toBe("t1");
    expect(stand.aufrufe).toHaveLength(2);
    expect(stand.aufrufe[1]).not.toHaveProperty("_sprache");
    expect(stand.aufrufe[1]._begleitung).toEqual({ name: "B", email: "b@example.com" });
  });
});

describe("Buchungsseite und Migration", () => {
  it("die Seite gibt nur die Sprache aus der Adresse mit", () => {
    expect(readFileSync("src/pages/BuchungPublic.tsx", "utf8")).toContain("sprache: langAusAdresse ?? undefined");
  });

  const DATEI = "20261004180000_buchung_sprache.sql";
  const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");

  it("neue Fassung mit Pflichtparameter, alte bleibt unberührt", () => {
    expect(SQL).toMatch(/_email text,\s+_sprache text,\s+_telefon text DEFAULT NULL/);
    expect(SQL).not.toMatch(/DROP FUNCTION/);
    expect(SQL).toContain("_begleitung => _begleitung");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.buchung_anlegen(text, uuid, timestamptz, text, text, text, text, text, jsonb) TO anon, authenticated;");
  });

  it("setzt die Sprache nur am gerade angelegten Kontakt ohne Sprache", () => {
    expect(SQL).toContain("AND k.quelle = 'Buchungslink'");
    expect(SQL).toContain("AND k.erstellt_am = now()");
    expect(SQL).toContain("AND NOT (coalesce(k.meta, '{}'::jsonb) ? 'kundenSprache')");
    expect(SQL).toContain("'kundenSpracheGesetztVon', 'buchung:Terminseite'");
  });

  it("liegt im Eingangskorb und in der Sammeldatei", () => {
    const korb = `supabase/migrations-inbox/${DATEI}`;
    expect(existsSync(korb)).toBe(true);
    expect(readFileSync(korb, "utf8")).toBe(SQL);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(SQL.trim());
    expect(readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8")).toContain("77.1");
  });
});
