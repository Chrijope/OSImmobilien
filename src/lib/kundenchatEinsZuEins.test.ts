import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Kundenchat eins zu eins (Prüfung 16.10.2026).
 *
 * Ausfuehren laesst sich die Migration hier nicht; ausgefuehrt und mit 40
 * Faellen geprueft wurde sie in PGlite (Bericht in den Sitzungsnotizen). Der
 * Quelltext haelt die Regeln fest, dazu der Weg des Kundenprofils.
 */

const lies = (pfad: string) => readFileSync(resolve(__dirname, "../..", pfad), "utf-8");
const SQL = lies("supabase/migrations/20261016236000_kundenchat_eins_zu_eins.sql");
const CODE = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

function funktion(name: string): string {
  const a = CODE.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(a, name).toBeGreaterThanOrEqual(0);
  return CODE.slice(a, CODE.indexOf("END $$;", a) + 7);
}

describe("Migration kundenchat_eins_zu_eins", () => {
  it("laeuft in einem Zug und aendert keine Bestandsdaten", () => {
    expect(CODE.trim().startsWith("BEGIN;")).toBe(true);
    expect(CODE).toContain("COMMIT;");
    // Kein UPDATE oder DELETE ausserhalb von Funktionen.
    const ausserhalb = CODE.replace(/AS \$\$[\s\S]*?\$\$;/g, "");
    expect(ausserhalb).not.toMatch(/^\s*(UPDATE|DELETE|INSERT)\b/m);
    expect(CODE).toMatch(/CHECK \(char_length\(btrim\(inhalt\)\) BETWEEN 1 AND 10000\) NOT VALID/);
  });

  it("der Kunde startet als Person 1 oder Person 2, nicht bei gesperrtem Portal", () => {
    const f = funktion("kundenchat_starten");
    expect(f).toContain("meta -> 'person2' ->> 'authUserId'");
    expect(f).toContain("kundenportal_gesperrt_fuer_mich()");
    expect(f).toContain("kundenchat_teilnehmer_abgleichen");
  });

  it("im CRM holen nur Admin, Inhaber und der Zustaendige den Kundenchat, ohne zweite Gruppe", () => {
    const f = funktion("kundenchat_sicherstellen");
    expect(f).toContain("public.is_admin_role(_uid) OR _kontakt.zustaendig_id = _uid");
    expect(f).toContain("public.kundenchat_gruppe(_kontakt.id)");
    // Die Leitung wird nicht Teilnehmer, sonst bekaeme sie zu jeder
    // Kundennachricht Glocke und Mail.
    expect(f).not.toMatch(/INSERT INTO public\.chat_teilnehmer/);
  });

  it("die eine Gruppe ist die aelteste, wie im Kundenprofil und im Zaehler", () => {
    expect(CODE).toMatch(/ORDER BY g\.erstellt_am, g\.id\s+LIMIT 1/);
  });

  it("beim Wechsel des Zustaendigen geht der alte hinaus und der neue hinein", () => {
    const f = funktion("kundenchat_zustaendigen_nachziehen");
    expect(f).toContain("DELETE FROM public.chat_teilnehmer");
    expect(f).toContain("OLD.zustaendig_id");
    expect(f).toContain("NOT public.is_admin_role(OLD.zustaendig_id)");
    expect(CODE).toMatch(/AFTER UPDATE OF zustaendig_id ON public\.kontakte[\s\S]*WHEN \(OLD\.zustaendig_id IS DISTINCT FROM NEW\.zustaendig_id\)/);
  });

  it("Kunden und Ersteller loeschen keine Chats mehr und haengen sie nicht um", () => {
    expect(CODE).toContain('DROP POLICY IF EXISTS "Nutzer löschen eigene Chats" ON public.chat_gruppen;');
    expect(CODE).not.toMatch(/CREATE POLICY "Nutzer löschen eigene Chats"/);
    const festhalten = funktion("chat_gruppe_zuordnung_festhalten");
    expect(festhalten).toContain("'kundeId', 'kind', 'typ'");
    expect(festhalten).toContain("NEW.erstellt_von := OLD.erstellt_von");
    expect(festhalten).toContain("current_user NOT IN ('authenticated', 'anon')");
  });

  it("Kundengruppen legt direkt nur die Leitung an", () => {
    const regel = CODE.slice(CODE.indexOf('CREATE POLICY "Nutzer erstellen Chats"'));
    expect(regel.slice(0, 400)).toContain("<> 'kundenkommunikation'");
    expect(regel.slice(0, 400)).toContain("is_admin_role(auth.uid())");
  });

  it("die inneren Helfer sind fuer den Browser gesperrt", () => {
    for (const f of ["kundenchat_teilnehmer_abgleichen(uuid, uuid)", "kundenchat_gruppe(uuid)",
      "kundenchat_gruppe_anlegen(public.kontakte)", "kundenchat_zustaendigen_nachziehen()"]) {
      expect(CODE).toContain(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`);
    }
  });
});

const { rpcAntwort, neuGeladen } = vi.hoisted(() => ({
  rpcAntwort: { wert: { data: null as unknown, error: null as unknown } },
  neuGeladen: [] as string[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: () => Promise.resolve(rpcAntwort.wert) },
}));
vi.mock("./dataCache", async (original) => ({
  ...(await original<typeof import("./dataCache")>()),
  cacheReload: async (tabelle: string) => { neuGeladen.push(tabelle); },
}));

describe("kundenchatSicherstellen", () => {
  beforeEach(() => { neuGeladen.length = 0; });

  it("liefert die Gruppe und laedt Gruppen und Teilnehmer neu", async () => {
    const { kundenchatSicherstellen } = await import("./chatStore");
    rpcAntwort.wert = { data: "chat-1", error: null };
    expect(await kundenchatSicherstellen("k1")).toEqual({ chatId: "chat-1" });
    expect(neuGeladen.sort()).toEqual(["chat_gruppen", "chat_teilnehmer"]);
  });

  it("nicht zustaendig: keine Gruppe, kein Anlegen", async () => {
    const { kundenchatSicherstellen } = await import("./chatStore");
    rpcAntwort.wert = { data: null, error: { code: "42501", message: "Den Kundenchat fuehrt der zustaendige Partner" } };
    expect(await kundenchatSicherstellen("k1")).toMatchObject({ grund: "nicht_zustaendig" });
    expect(neuGeladen).toEqual([]);
  });

  it("ohne Migration: Rueckfall auf den alten Weg", async () => {
    const { kundenchatSicherstellen } = await import("./chatStore");
    rpcAntwort.wert = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    expect(await kundenchatSicherstellen("k1")).toEqual({ grund: "funktion_fehlt" });
  });

  it("ohne Zustaendigen", async () => {
    const { kundenchatSicherstellen } = await import("./chatStore");
    rpcAntwort.wert = { data: null, error: { code: "P0001", message: "Fuer diesen Kunden ist kein Partner zustaendig" } };
    expect(await kundenchatSicherstellen("k1")).toMatchObject({ grund: "kein_partner" });
  });
});
