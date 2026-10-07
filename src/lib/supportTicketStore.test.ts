import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Ein Support-Ticket muss den Absender mitschicken.
 *
 * Im Code stand `benutzer_id: null` mit dem Kommentar "will be set by RLS".
 * Row Level Security setzt aber nichts, sie prueft nur. Die INSERT-Regel der
 * Tabelle `support_tickets` verlangt `auth.uid() = benutzer_id`, und
 * `auth.uid() = NULL` ergibt NULL, also nicht wahr. Jedes Ticket ueber
 * "Support kontaktieren" wurde damit abgelehnt (Fehler 42501), waehrend die
 * Oberflaeche trotzdem "Ticket erstellt" meldete.
 *
 * Geprueft wird deshalb zweierlei:
 *   1. Beim Anlegen steht die Kennung des angemeldeten Nutzers in
 *      `benutzer_id`, nicht null.
 *   2. Scheitert das Speichern, meldet die Funktion das nach aussen, statt
 *      Erfolg vorzutaeuschen.
 */

const insertAufrufe: Array<{ tabelle: string; zeile: any; opts: any }> = [];
let insertVerhalten: (zeile: any) => void = () => {};

vi.mock("./dataCache", () => ({
  cacheGet: () => [],
  cacheUpdate: vi.fn(),
  cacheDelete: vi.fn(),
  cacheInsert: async (tabelle: string, zeile: any, opts: any) => {
    insertAufrufe.push({ tabelle, zeile, opts });
    insertVerhalten(zeile);
    return zeile;
  },
}));

vi.mock("./dbStoreHelper", () => ({
  isTestAccount: () => false,
  localGet: () => [],
  localSet: () => {},
}));

vi.mock("./bellNotifications", () => ({
  notifyByRole: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  },
}));

import { createTicket } from "./supportTicketStore";

const eingabe = {
  betreff: "Anmeldung klemmt",
  kategorie: "technisch" as const,
  prioritaet: "mittel" as const,
  nachricht: "Ich komme seit heute nicht mehr rein.",
  erstellerName: "Philipp Pintat",
  erstellerEmail: "philipp.pintat@mail.de",
  erstellerRolle: "vertriebspartner",
};

describe("Support-Ticket anlegen", () => {
  beforeEach(() => {
    insertAufrufe.length = 0;
    insertVerhalten = () => {};
  });

  it("schreibt die Kennung des angemeldeten Nutzers in benutzer_id", async () => {
    const ticket = await createTicket(eingabe);

    expect(insertAufrufe).toHaveLength(1);
    expect(insertAufrufe[0].tabelle).toBe("support_tickets");
    expect(insertAufrufe[0].zeile.benutzer_id).toBe("u1");
    expect(insertAufrufe[0].zeile.benutzer_id).not.toBeNull();
    expect(insertAufrufe[0].zeile.betreff).toBe("Anmeldung klemmt");
    expect(ticket.betreff).toBe("Anmeldung klemmt");
  });

  it("meldet einen Fehlschlag nach aussen, statt Erfolg vorzutaeuschen", async () => {
    insertVerhalten = () => {
      throw { code: "42501", message: "new row violates row-level security policy" };
    };

    await expect(createTicket(eingabe)).rejects.toMatchObject({ code: "42501" });
  });
});
