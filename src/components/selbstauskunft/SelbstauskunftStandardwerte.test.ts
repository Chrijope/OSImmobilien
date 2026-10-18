import { describe, it, expect, vi } from "vitest";

/*
 * Gespeicherte Selbstauskünfte sind oft unvollständig, zum Beispiel Person 2
 * des Beispielkunden ohne `anstellung`. Der Schritt „Einnahmen“ stürzte dann
 * beim Weiterklicken ab (17.10.2026). `vollstaendigeSa` füllt beim Laden auf.
 */

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/kundenStore", () => ({ getKontaktById: () => null }));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => true }));

import { vollstaendigeSa, EMPTY_DATA } from "./SelbstauskunftForm";
import { BEISPIEL_SA } from "@/lib/beispielkunde";

describe("vollstaendigeSa", () => {
  it("ergänzt fehlende verschachtelte Felder von Person 2 (Beispielkunde)", () => {
    const sa = vollstaendigeSa(BEISPIEL_SA);
    expect(sa.person2Data.anstellung.branche).toBe("");
    expect(sa.person2Data.selbstaendigkeit.firma).toBe("");
    expect(sa.person2Data.einkommen.netto).toBe("2.400");
  });

  it("behält gespeicherte Werte und ergänzt nur Lücken", () => {
    const sa = vollstaendigeSa({ vorname: "Max", anstellung: { firma: "Beispiel GmbH" } });
    expect(sa.vorname).toBe("Max");
    expect(sa.anstellung.firma).toBe("Beispiel GmbH");
    expect(sa.anstellung.branche).toBe("");
    expect(sa.bankkonten).toEqual(EMPTY_DATA.bankkonten);
  });

  it("verträgt null und leere Stände", () => {
    expect(vollstaendigeSa(null).einkommen).toEqual(EMPTY_DATA.einkommen);
    expect(vollstaendigeSa({ person2Data: null }).person2Data.anstellung.branche).toBe("");
  });
});
