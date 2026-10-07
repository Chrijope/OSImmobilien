import { describe, it, expect } from "vitest";
// Die Hilfe liegt bei den Edge Functions, weil finalize-vertrag sie braucht.
// Getestet wird sie hier, weil Vitest nur unterhalb von src sucht, so wie bei
// bewerber-eingangsmail und bewerber-zugangsdaten.
import {
  bewerberAnzeigename,
  bewerberVertragAusloeser,
  BEWERBER_NAME_RUECKFALL,
} from "../../supabase/functions/_shared/bewerber-name.ts";
import { bewerbungIdAusAusloeser } from "./aufgabenStore";

describe("bewerberAnzeigename", () => {
  it("nimmt den Namen aus den Spalten, auch wenn meta ihn nicht kennt", () => {
    // Der Fall aus der Inbox von Sarah: meta ohne vorname/nachname, weil das
    // CRM die beiden nie dorthin schreibt.
    const name = bewerberAnzeigename({
      vorname: "Max",
      nachname: "Mustermann",
      meta: { paketwahl: "junior" } as Record<string, string>,
    });
    expect(name).toBe("Max Mustermann");
  });

  it("faellt auf meta zurueck, wenn die Spalten leer sind", () => {
    expect(bewerberAnzeigename({ vorname: "", nachname: null, meta: { vorname: "Erika", nachname: "Muster" } }))
      .toBe("Erika Muster");
  });

  it("liefert die neutrale Anrede nur, wenn wirklich kein Name da ist", () => {
    expect(bewerberAnzeigename({ vorname: " ", nachname: "", meta: null })).toBe(BEWERBER_NAME_RUECKFALL);
    expect(bewerberAnzeigename(null)).toBe(BEWERBER_NAME_RUECKFALL);
  });

  it("kommt mit nur einem Namensteil zurecht", () => {
    expect(bewerberAnzeigename({ vorname: "Max", nachname: "" })).toBe("Max");
  });
});

describe("Bewerberbezug im Ausloeser-Schluessel", () => {
  it("Function und Inbox verstehen dieselbe Form", () => {
    const id = "6f2a1c3e-0000-4000-8000-000000000001";
    expect(bewerbungIdAusAusloeser(bewerberVertragAusloeser(id))).toBe(id);
  });
});
