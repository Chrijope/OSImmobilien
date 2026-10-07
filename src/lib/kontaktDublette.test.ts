import { describe, it, expect } from "vitest";
// Die Logik liegt bei der Edge Function, weil sie dort gebraucht wird. Getestet
// wird sie hier, weil Vitest nur unterhalb von src sucht.
import {
  findeKontaktDublette,
  nurZiffern,
  telefonVergleichsform,
  emailVergleichsform,
  nachnameVergleichsform,
} from "../../supabase/functions/_shared/kontakt-dublette.ts";

const ANNA = {
  id: "id-anna",
  vorname: "Anna",
  nachname: "Beispiel",
  email: "anna@example.com",
  telefon: "+49 170 1234567",
};

describe("Telefonnormalisierung", () => {
  it("behält nur Ziffern, wie regexp_replace in der Datenbank", () => {
    expect(nurZiffern("+49 (170) 12-34 567")).toBe("491701234567");
    expect(nurZiffern(null)).toBe("");
  });

  it("verwirft zu kurze Nummern als Vergleichsform", () => {
    expect(telefonVergleichsform("12345")).toBe("");
    expect(telefonVergleichsform("123456")).toBe("123456");
  });
});

describe("Vergleichsformen", () => {
  it("vergleicht E-Mail ohne Rücksicht auf Groß- und Kleinschreibung", () => {
    expect(emailVergleichsform("  Anna@Example.COM ")).toBe("anna@example.com");
  });

  it("wertet den Nachname-Platzhalter als unbekannt", () => {
    expect(nachnameVergleichsform("—")).toBe("");
    expect(nachnameVergleichsform("  Von  Muster ")).toBe("von muster");
  });
});

describe("findeKontaktDublette", () => {
  it("findet den bestehenden Kontakt über die E-Mail-Adresse", () => {
    const treffer = findeKontaktDublette(
      { email: "ANNA@example.com", telefon: "0800 000000", nachname: "Anders" },
      [ANNA],
    );
    expect(treffer).toEqual({ art: "email", id: "id-anna", name: "Anna Beispiel" });
  });

  it("findet den bestehenden Kontakt über die Telefonnummer bei gleichem Nachnamen", () => {
    const treffer = findeKontaktDublette(
      { email: "anna.privat@example.com", telefon: "+49-170-1234567", nachname: "beispiel" },
      [ANNA],
    );
    expect(treffer).toEqual({ art: "telefon", id: "id-anna", name: "Anna Beispiel" });
  });

  it("legt zwei Menschen unter derselben Firmennummer NICHT zusammen", () => {
    const treffer = findeKontaktDublette(
      { email: "bernd@firma.de", telefon: "+49 170 1234567", nachname: "Muster" },
      [ANNA],
    );
    expect(treffer).toEqual({ art: "keine" });
  });

  it("nimmt den Nachname-Platzhalter nicht als Übereinstimmung", () => {
    const treffer = findeKontaktDublette(
      { email: "neu@example.com", telefon: "+49 170 1234567", nachname: "—" },
      [{ ...ANNA, nachname: "—" }],
    );
    expect(treffer).toEqual({ art: "keine" });
  });

  it("legt bei mehreren passenden Kontakten nichts zusammen", () => {
    const treffer = findeKontaktDublette({ email: "anna@example.com" }, [
      ANNA,
      { ...ANNA, id: "id-zweit" },
    ]);
    expect(treffer).toEqual({ art: "mehrdeutig", grund: "email", anzahl: 2 });
  });

  it("meldet keinen Treffer bei unbekanntem Interessenten", () => {
    const treffer = findeKontaktDublette(
      { email: "neu@example.com", telefon: "+49 171 9999999", nachname: "Neu" },
      [ANNA],
    );
    expect(treffer).toEqual({ art: "keine" });
  });

  it("vergleicht keine zu kurzen Telefonnummern", () => {
    const treffer = findeKontaktDublette(
      { email: "", telefon: "12345", nachname: "Beispiel" },
      [{ ...ANNA, email: "", telefon: "12345" }],
    );
    expect(treffer).toEqual({ art: "keine" });
  });

  it("nutzt die E-Mail vor der Telefonnummer", () => {
    const perTelefon = { ...ANNA, id: "id-telefon", email: "andere@example.com" };
    const perEmail = {
      id: "id-email",
      vorname: "Carla",
      nachname: "Muster",
      email: "anna@example.com",
      telefon: "+49 999 999999",
    };
    const treffer = findeKontaktDublette(
      { email: "anna@example.com", telefon: "+49 170 1234567", nachname: "Beispiel" },
      [perTelefon, perEmail],
    );
    expect(treffer).toEqual({ art: "email", id: "id-email", name: "Carla Muster" });
  });
});
