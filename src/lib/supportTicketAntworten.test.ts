import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Support-Antworten: atomar anhaengen, melden, gelesen/ungelesen.
 *
 * Die Datenbankfunktionen selbst prueft `supportAntwortenMigration.test.ts`
 * am Quelltext. Hier geht es um den Browser: dass er die ganze
 * Nachrichtenliste nicht mehr zurueckschreibt, dass er ohne Migration auf
 * den alten Weg faellt, und um die Regel "ungelesen".
 */

// ── Eine kleine Datenbank im Speicher, die sich wie die Funktion verhaelt ──
type Zeile = { id: string; benutzer_id: string | null; betreff: string; status: string; meta: any; nachricht?: string };
let db: Record<string, Zeile> = {};
let cache: Zeile[] = [];
const cacheUpdateAufrufe: Array<{ id: string; updates: any }> = [];
const rpcAufrufe: Array<{ name: string; args: any }> = [];
const functionAufrufe: Array<{ name: string; body: any }> = [];
let rpcVerhalten: (name: string, args: any) => Promise<{ data: any; error: any }>;
let functionAntwort: { data: any; error: any } = { data: { mail: true }, error: null };
const lokal: Record<string, any> = {};

vi.mock("./dataCache", () => ({
  cacheGet: () => cache,
  cacheSet: (_t: string, zeilen: Zeile[]) => { cache = zeilen; },
  cacheUpdate: vi.fn(async (_t: string, id: string, updates: any) => {
    cacheUpdateAufrufe.push({ id, updates });
    return true;
  }),
  cacheDelete: vi.fn(),
  cacheInsert: vi.fn(),
}));

vi.mock("./dbStoreHelper", () => ({
  isTestAccount: () => false,
  localGet: (k: string, f: any) => (k in lokal ? JSON.parse(JSON.stringify(lokal[k])) : f),
  localSet: (k: string, v: any) => { lokal[k] = v; },
}));

const notifyUser = vi.fn();
vi.mock("./bellNotifications", () => ({
  notifyByRole: vi.fn(),
  notifyUser: (...a: any[]) => notifyUser(...a),
}));

vi.mock("./currentUser", () => ({ getCurrentUserId: () => "support-1" }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: any) => {
      rpcAufrufe.push({ name, args });
      return rpcVerhalten(name, args);
    },
    functions: {
      invoke: async (name: string, { body }: { body: any }) => {
        functionAufrufe.push({ name, body });
        return functionAntwort;
      },
    },
  },
}));

import {
  addNachricht, antwortErneutMelden, darfSupportAntworten, getTickets, istTicketUngelesen,
  supportAbsenderName, ticketGelesenSetzen, ungeleseneTicketIds,
} from "./supportTicketStore";

const FEHLT = { code: "PGRST202", message: "Could not find the function public.support_ticket_nachricht_anhaengen" };

/** Verhaelt sich wie support_ticket_nachricht_anhaengen: liest den aktuellen Stand der Zeile. */
async function wieDieDatenbank(name: string, args: any) {
  await Promise.resolve(); // zwei Aufrufe laufen verschraenkt
  if (name !== "support_ticket_nachricht_anhaengen") return { data: true, error: null };
  const z = db[args.p_ticket_id];
  const neu = {
    id: `n${Object.keys(z.meta.nachrichten).length + 1}`,
    absender: args.p_als === "support" ? "backoffice" : "nutzer",
    absenderName: args.p_als === "support" ? "MOREImmo Support (Testname)" : "Testperson",
    inhalt: args.p_inhalt,
    timestamp: new Date().toISOString(),
  };
  z.meta = { ...z.meta, nachrichten: [...z.meta.nachrichten, neu] };
  if (args.p_als === "support" && z.status === "neu") z.status = "in_bearbeitung";
  return { data: { meta: z.meta, status: z.status, nachricht: neu }, error: null };
}

function ticketZeile(): Zeile {
  return {
    id: "t1",
    benutzer_id: "ersteller-1",
    betreff: "Frage zur Abrechnung",
    status: "neu",
    meta: {
      nummer: 1001,
      nachrichten: [{ id: "n1", ticketId: "t1", absender: "nutzer", absenderName: "Testperson", inhalt: "Hallo", timestamp: "2026-09-20T10:00:00.000Z" }],
    },
  };
}

beforeEach(() => {
  db = { t1: ticketZeile() };
  cache = [ticketZeile()];
  cacheUpdateAufrufe.length = 0;
  rpcAufrufe.length = 0;
  functionAufrufe.length = 0;
  notifyUser.mockClear();
  for (const k of Object.keys(lokal)) delete lokal[k];
  rpcVerhalten = wieDieDatenbank;
  functionAntwort = { data: { mail: true }, error: null };
});

describe("Nachricht anhaengen", () => {
  it("zwei gleichzeitige Antworten landen beide, der Browser schreibt keine Liste zurueck", async () => {
    await Promise.all([
      addNachricht("t1", { absender: "backoffice", absenderName: "egal", inhalt: "Erste Antwort" }),
      addNachricht("t1", { absender: "nutzer", absenderName: "egal", inhalt: "Zweite Nachricht" }),
    ]);
    const inhalte = db.t1.meta.nachrichten.map((n: any) => n.inhalt);
    expect(inhalte).toEqual(["Hallo", "Erste Antwort", "Zweite Nachricht"]);
    expect(cacheUpdateAufrufe).toHaveLength(0);
    expect(rpcAufrufe.map((a) => a.args.p_als)).toEqual(["support", "nutzer"]);
  });

  it("stoesst die Mail nur nach einer Support-Antwort an", async () => {
    await addNachricht("t1", { absender: "nutzer", absenderName: "egal", inhalt: "Noch eine Frage" });
    expect(functionAufrufe).toHaveLength(0);
    await addNachricht("t1", { absender: "backoffice", absenderName: "egal", inhalt: "Antwort" });
    await Promise.resolve();
    expect(functionAufrufe).toEqual([{ name: "support-antwort-mail", body: { ticketId: "t1" } }]);
  });

  it("zeigt die neue Nachricht sofort im Zwischenspeicher, samt Status", async () => {
    await addNachricht("t1", { absender: "backoffice", absenderName: "egal", inhalt: "Antwort" });
    const t = getTickets()[0];
    expect(t.nachrichten.map((n) => n.inhalt)).toContain("Antwort");
    expect(t.status).toBe("in_bearbeitung");
  });

  it("reicht einen echten Fehler weiter, statt still den alten Weg zu nehmen", async () => {
    rpcVerhalten = async () => ({ data: null, error: { code: "42501", message: "Nur Support darf antworten" } });
    await expect(addNachricht("t1", { absender: "backoffice", absenderName: "x", inhalt: "Antwort" }))
      .rejects.toMatchObject({ code: "42501" });
    expect(cacheUpdateAufrufe).toHaveLength(0);
  });
});

describe("Rueckfall ohne Migration", () => {
  beforeEach(() => {
    rpcVerhalten = async () => ({ data: null, error: FEHLT });
  });

  it("haengt wie bisher an und setzt die Glocke fuer den Ersteller aus dem Browser", async () => {
    await addNachricht("t1", { absender: "backoffice", absenderName: supportAbsenderName("Testname Nachname"), inhalt: "Antwort" });
    expect(cacheUpdateAufrufe).toHaveLength(1);
    const liste = cacheUpdateAufrufe[0].updates.meta.nachrichten;
    expect(liste.map((n: any) => n.inhalt)).toEqual(["Hallo", "Antwort"]);
    expect(liste[1].absenderName).toBe("MOREImmo Support (Testname)");
    expect(notifyUser).toHaveBeenCalledWith("ersteller-1", expect.objectContaining({
      link: "/support-kontaktieren?ticket=t1",
    }));
    expect(functionAufrufe).toHaveLength(0);
  });

  it("keine Glocke, wenn der Ersteller selbst schreibt", async () => {
    await addNachricht("t1", { absender: "nutzer", absenderName: "Testperson", inhalt: "Nachtrag" });
    expect(cacheUpdateAufrufe).toHaveLength(1);
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("Antwort erneut melden: Glocke aus dem Browser, keine Mail", async () => {
    const ergebnis = await antwortErneutMelden("t1");
    expect(ergebnis).toEqual({ mail: false, grund: "migration_fehlt" });
    expect(notifyUser).toHaveBeenCalledTimes(1);
    expect(functionAufrufe).toHaveLength(0);
  });

  it("Lesemarke bleibt im Browser und schreibt nichts in die Datenbank", async () => {
    await ticketGelesenSetzen("t1");
    expect(lokal.mi_support_gelesen?.t1).toBeTruthy();
    expect(cacheUpdateAufrufe).toHaveLength(0);
  });
});

describe("Antwort erneut melden", () => {
  it("ruft die Datenbankfunktion und danach die Mail", async () => {
    functionAntwort = { data: { mail: false, grund: "bremse" }, error: null };
    const ergebnis = await antwortErneutMelden("t1");
    expect(rpcAufrufe[0]).toEqual({ name: "support_ticket_antwort_melden", args: { p_ticket_id: "t1" } });
    expect(ergebnis).toEqual({ mail: false, grund: "bremse" });
  });

  it("nur fuer Admin, Inhaber und Backoffice, nach aktiver Rolle", () => {
    for (const r of ["admin", "inhaber", "backoffice"]) expect(darfSupportAntworten(r)).toBe(true);
    for (const r of ["vertriebsleiter", "vertriebspartner", "kunde", "", undefined]) expect(darfSupportAntworten(r)).toBe(false);
  });
});

describe("Ungelesen", () => {
  const antwort = (ts: string) => ({ id: ts, ticketId: "t1", absender: "backoffice" as const, absenderName: "S", inhalt: "x", timestamp: ts });
  const frage = (ts: string) => ({ ...antwort(ts), absender: "nutzer" as const });

  it("Ticket ohne Lesemarke mit Support-Antwort zaehlt als ungelesen", () => {
    expect(istTicketUngelesen({ nachrichten: [frage("2026-09-20T10:00:00.000Z"), antwort("2026-09-21T10:00:00.000Z")] })).toBe(true);
  });

  it("ohne Support-Antwort nie ungelesen", () => {
    expect(istTicketUngelesen({ nachrichten: [frage("2026-09-20T10:00:00.000Z")] })).toBe(false);
  });

  it("gelesen, wenn die Lesemarke nach der letzten Antwort liegt, auch im Format der Datenbank", () => {
    const n = [antwort("2026-09-21T10:00:00.000Z")];
    expect(istTicketUngelesen({ nachrichten: n, gelesenAmErsteller: "2026-09-21T11:00:00.000Z" })).toBe(false);
    expect(istTicketUngelesen({ nachrichten: n, gelesenAmErsteller: "2026-09-21T09:00:00.000Z" })).toBe(true);
    expect(istTicketUngelesen({ nachrichten: n }, "2026-09-21T11:00:00.000Z")).toBe(false);
  });

  it("zaehlt nur eigene Tickets, an der Kennung erkannt", () => {
    cache = [
      { ...ticketZeile(), meta: { ...ticketZeile().meta, nachrichten: [antwort("2026-09-21T10:00:00.000Z")] } },
      { ...ticketZeile(), id: "t2", benutzer_id: "jemand-anders", meta: { nachrichten: [antwort("2026-09-21T10:00:00.000Z")] } },
    ];
    expect([...ungeleseneTicketIds("ersteller-1")]).toEqual(["t1"]);
    expect(ungeleseneTicketIds(null).size).toBe(0);
  });

  it("Lesemarke setzen geht ueber die Funktion fuer das eigene Ticket", async () => {
    await ticketGelesenSetzen("t1");
    expect(rpcAufrufe).toEqual([{ name: "support_ticket_gelesen", args: { p_ticket_id: "t1" } }]);
    expect(cacheUpdateAufrufe).toHaveLength(0);
    expect(getTickets()[0].gelesenAmErsteller).toBeTruthy();
  });
});
