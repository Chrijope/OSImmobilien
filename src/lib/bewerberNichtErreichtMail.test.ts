/**
 * „Bewerber nicht erreicht": nur noch zwei Mails (26.09.2026).
 *
 * Eine Mail nach dem ersten und eine nach dem fünften erfolglosen Anruf, je
 * Bewerber und Stufe höchstens einmal. Geprüft wird die reine Entscheidung und
 * der tatsächliche Versand über logKontaktversuch.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(() => Promise.resolve({ data: null, error: null })),
}));
vi.mock("@/integrations/supabase/client", () => {
  // Der stündliche Deckel fragt email_send_log; hier ist er nie erreicht.
  const kette: Record<string, unknown> = {};
  kette.select = () => kette;
  kette.eq = () => kette;
  kette.gte = () => Promise.resolve({ count: 0, error: null });
  return { supabase: { functions: { invoke }, from: () => kette } };
});
vi.mock("@/lib/bewerbungStore", () => ({ getBewerberById: vi.fn(), updateBewerber: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import {
  LETZTER_MAIL_VERSUCH,
  nichtErreichtIdempotenzSchluessel,
  nichtErreichtMailStufe,
} from "./bewerberNichtErreichtMail";
import { logKontaktversuch } from "./bewerberKontaktversuch";
import { getBewerberById, updateBewerber, type Kontaktversuch } from "./bewerbungStore";

describe("nichtErreichtMailStufe", () => {
  it("schreibt nur nach dem ersten und dem letzten Versuch", () => {
    const stufen = Array.from({ length: 10 }, (_, i) => nichtErreichtMailStufe(i + 1));
    expect(stufen).toEqual(["erster", null, null, null, "letzter", null, null, null, null, null]);
  });

  it("der letzte Versuch ist der fünfte, ab dem die Vorlage nicht mehr schreibt", () => {
    expect(LETZTER_MAIL_VERSUCH).toBe(5);
  });

  it("unsinnige Zählerstände lösen keine Mail aus", () => {
    for (const v of [0, -1, 1.5, Number.NaN]) expect(nichtErreichtMailStufe(v), String(v)).toBeNull();
  });

  it("der Schlüssel ist je Bewerber und Stufe eindeutig und passt zu früheren Mails", () => {
    expect(nichtErreichtIdempotenzSchluessel("b1", "erster")).toBe("bewerber-nicht-erreicht-b1-v1");
    expect(nichtErreichtIdempotenzSchluessel("b1", "letzter")).toBe("bewerber-nicht-erreicht-b1-v5");
    expect(nichtErreichtIdempotenzSchluessel("b2", "erster")).not.toBe(nichtErreichtIdempotenzSchluessel("b1", "erster"));
  });
});

describe("logKontaktversuch verschickt nur zwei Mails", () => {
  let verlauf: Kontaktversuch[] = [];

  beforeEach(() => {
    invoke.mockClear();
    verlauf = [];
    vi.mocked(getBewerberById).mockImplementation(() => ({
      id: "b1", vorname: "Max", nachname: "Muster", email: "max@example.com",
      status: "Eingang", kontaktversuche: verlauf,
    }) as never);
    vi.mocked(updateBewerber).mockImplementation(async (_id, patch) => {
      const p = patch as { kontaktversuche?: Kontaktversuch[] };
      // Den Mindestabstand zwischen zwei Anrufen überspringen: Jeder Eintrag
      // liegt zwei Tage zurück.
      if (p.kontaktversuche) {
        verlauf = p.kontaktversuche.map((k) => ({ ...k, datum: new Date(Date.now() - 48 * 3_600_000).toISOString() }));
      }
    });
  });

  it("acht erfolglose Anrufe ergeben genau zwei Mails, nach Versuch 1 und 5", async () => {
    for (let i = 0; i < 8; i++) {
      const { ok } = await logKontaktversuch({ bewerberId: "b1", ergebnis: "nicht_erreicht", beraterName: "Jana" });
      expect(ok).toBe(true);
    }
    expect(invoke).toHaveBeenCalledTimes(2);
    const aufrufe = invoke.mock.calls as unknown as Array<[string, { body: { idempotencyKey: string; templateData: Record<string, unknown> } }]>;
    expect(aufrufe.map(([, a]) => a.body.templateData.versuch)).toEqual([1, 5]);
    expect(aufrufe.map(([, a]) => a.body.idempotencyKey)).toEqual([
      "bewerber-nicht-erreicht-b1-v1",
      "bewerber-nicht-erreicht-b1-v5",
    ]);
    // Die Ansprechpartnerin kommt vom Server, über ihre Kennung.
    for (const [, a] of aufrufe) {
      expect(a.body.templateData).not.toHaveProperty("berater");
      expect(a.body.templateData).not.toHaveProperty("beraterName");
    }
    // Der Verlauf vermerkt die Mail genau bei diesen beiden Versuchen.
    expect(verlauf.map((k) => k.emailGesendet)).toEqual([true, false, false, false, true, false, false, false]);
  });
});
