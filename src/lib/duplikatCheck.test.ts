import { describe, it, expect } from "vitest";
import type { KundeData } from "@/lib/kundenStore";
import {
  duplikatEtikett,
  duplikatKriterien,
  emailSchluessel,
  findeDuplikatGruppen,
  findPotentialDuplicates,
  nameSchluessel,
  sindDuplikate,
  telefonSchluessel,
  type DuplikatEintrag,
} from "./duplikatCheck";

// Alle Namen, Nummern und Adressen sind erfunden.

let laufendeId = 0;
function e(felder: Partial<DuplikatEintrag>): DuplikatEintrag {
  laufendeId += 1;
  return { id: `t${laufendeId}`, vorname: "", nachname: "", email: "", telefon: "", ...felder };
}

describe("Regel: wann zwei Eintraege Duplikate sind", () => {
  it("gleicher Vorname allein ist kein Duplikat", () => {
    const a = e({ vorname: "Testa", nachname: "Beispielfrau", telefon: "0170 1111111", email: "a@test.invalid" });
    const b = e({ vorname: "Testa", nachname: "Musterling", telefon: "0170 2222222", email: "b@test.invalid" });
    expect(sindDuplikate(a, b)).toBe(false);
  });

  it("gleicher Nachname allein ist kein Duplikat", () => {
    const a = e({ vorname: "Erfundo", nachname: "Probemann", telefon: "0170 3333333" });
    const b = e({ vorname: "Fiktiva", nachname: "Probemann", telefon: "0170 4444444" });
    expect(sindDuplikate(a, b)).toBe(false);
  });

  it("aehnliche Namen sind kein Duplikat (kein Tippfehler-Abgleich)", () => {
    expect(sindDuplikate(e({ vorname: "Jonas", nachname: "Probemann" }), e({ vorname: "Jonah", nachname: "Probemann" }))).toBe(false);
    expect(sindDuplikate(e({ vorname: "Lena", nachname: "Testmeier" }), e({ vorname: "Lena", nachname: "Testmaier" }))).toBe(false);
    expect(sindDuplikate(e({ vorname: "Tim", nachname: "Probmüller" }), e({ vorname: "Tim", nachname: "Probmueller" }))).toBe(false);
  });

  it("vertauschter Vor- und Nachname ist kein Duplikat", () => {
    expect(sindDuplikate(e({ vorname: "Probe", nachname: "Kurt" }), e({ vorname: "Kurt", nachname: "Probe" }))).toBe(false);
  });

  it("identischer voller Name ist ein Duplikat, auch mit anderer Schreibung", () => {
    const a = e({ vorname: "Testa", nachname: "Beispielfrau", telefon: "0170 1111111" });
    const b = e({ vorname: "  TESTA ", nachname: "beispielfrau", telefon: "0170 2222222" });
    expect(duplikatKriterien(a, b)).toEqual(["name"]);
    const c = e({ vorname: "Anna  Lena", nachname: "Probe" });
    const d = e({ vorname: "anna lena", nachname: " Probe" });
    expect(sindDuplikate(c, d)).toBe(true);
  });

  it("Unicode-NFC: zusammengesetztes und vorkomponiertes ü sind gleich", () => {
    const zerlegt = "Prüfling";
    const fertig = "Prüfling";
    expect(nameSchluessel("Test", zerlegt)).toBe(nameSchluessel("Test", fertig));
  });

  it("gleiche E-Mail ist ein Duplikat, unabhaengig von Schreibung und Leerzeichen", () => {
    const a = e({ vorname: "Erfundo", nachname: "Eins", email: "Probe.Person@Test.invalid" });
    const b = e({ vorname: "Fiktiva", nachname: "Zwei", email: " probe.person@test.invalid " });
    expect(duplikatKriterien(a, b)).toEqual(["email"]);
  });

  it("gleiche Nummer in verschiedenen Schreibweisen ist ein Duplikat", () => {
    const schreibweisen = [
      "+49 171 5550123",
      "0171 5550123",
      "0049 171 5550123",
      "+49 (0) 171 555 01 23",
      "0171/555-0123",
      "+491715550123",
    ];
    const schluessel = new Set(schreibweisen.map(telefonSchluessel));
    expect(schluessel.size).toBe(1);
    expect([...schluessel][0]).toBe("1715550123");
    const a = e({ vorname: "Erfundo", nachname: "Eins", telefon: schreibweisen[0] });
    const b = e({ vorname: "Fiktiva", nachname: "Zwei", telefon: schreibweisen[1] });
    expect(duplikatKriterien(a, b)).toEqual(["telefon"]);
  });

  it("nur '+49' oder zu kurze Nummern zaehlen nicht", () => {
    expect(telefonSchluessel("+49")).toBe("");
    expect(telefonSchluessel("+49 ")).toBe("");
    expect(telefonSchluessel("0049")).toBe("");
    expect(telefonSchluessel("0")).toBe("");
    expect(telefonSchluessel("+49 12345")).toBe("");
    expect(telefonSchluessel("+49 123456")).toBe("123456");
    const a = e({ vorname: "Erfundo", nachname: "Eins", telefon: "+49" });
    const b = e({ vorname: "Fiktiva", nachname: "Zwei", telefon: "+49" });
    expect(sindDuplikate(a, b)).toBe(false);
  });

  it("auslaendische Nummer faellt nicht mit einer deutschen zusammen", () => {
    expect(telefonSchluessel("+43 171 5550123")).not.toBe(telefonSchluessel("0171 5550123"));
    expect(telefonSchluessel("+43 171 5550123")).toBe(telefonSchluessel("0043 171 5550123"));
  });

  it("leere Felder sind nie ein Duplikat", () => {
    expect(sindDuplikate(e({}), e({}))).toBe(false);
    expect(sindDuplikate(e({ vorname: "Testa" }), e({ vorname: "Testa" }))).toBe(false);
    expect(sindDuplikate(e({ nachname: "Probe" }), e({ nachname: "Probe" }))).toBe(false);
    expect(sindDuplikate(e({ vorname: "Testa", nachname: "—" }), e({ vorname: "Testa", nachname: "—" }))).toBe(false);
    expect(sindDuplikate(e({ email: "  " }), e({ email: "" }))).toBe(false);
    expect(sindDuplikate(e({ email: "keine-mail" }), e({ email: "keine-mail" }))).toBe(false);
    expect(sindDuplikate(e({ email: "x@example.com" }), e({ email: "x@example.com" }))).toBe(false);
    expect(emailSchluessel(null)).toBe("");
  });
});

describe("findeDuplikatGruppen", () => {
  it("bildet keine Gruppe aus nur aehnlichen oder teilgleichen Namen", () => {
    const liste = [
      e({ vorname: "Testa", nachname: "Beispielfrau", telefon: "0170 1111111", email: "a@test.invalid" }),
      e({ vorname: "Testa", nachname: "Musterling", telefon: "0170 2222222", email: "b@test.invalid" }),
      e({ vorname: "Jonas", nachname: "Probemann", telefon: "+49" }),
      e({ vorname: "Jonah", nachname: "Probemann", telefon: "+49" }),
    ];
    expect(findeDuplikatGruppen(liste)).toEqual([]);
  });

  it("findet Gruppen nach E-Mail, Telefon und Namen mit ehrlichem Etikett", () => {
    const m1 = e({ vorname: "Erfundo", nachname: "Eins", email: "gleich@test.invalid" });
    const m2 = e({ vorname: "Erfundo", nachname: "Eins", email: "GLEICH@test.invalid" });
    const t1 = e({ vorname: "Fiktiva", nachname: "Zwei", telefon: "0171 5550123" });
    const t2 = e({ vorname: "Probina", nachname: "Drei", telefon: "+49 171 5550123" });
    const n1 = e({ vorname: "Testo", nachname: "Vier", telefon: "0170 1000001" });
    const n2 = e({ vorname: "testo", nachname: "VIER", telefon: "0170 1000002" });
    const allein = e({ vorname: "Solo", nachname: "Fuenf" });

    const gruppen = findeDuplikatGruppen([m1, t1, n1, allein, m2, t2, n2]);
    expect(gruppen.map((g) => [g.kriterium, g.eintraege.map((x) => x.id)])).toEqual([
      ["email", [m1.id, m2.id]],
      ["telefon", [t1.id, t2.id]],
      ["name", [n1.id, n2.id]],
    ]);
    expect(duplikatEtikett(gruppen[0].kriterien)).toBe("gleiche E-Mail und gleicher Name");
    expect(duplikatEtikett(gruppen[1].kriterien)).toBe("gleiche Telefonnummer");
    expect(duplikatEtikett(gruppen[2].kriterien)).toBe("gleicher Name");
    expect(gruppen[0].schluessel).toBe("email:gleich@test.invalid");
    expect(gruppen[1].schluessel).toBe("phone:1715550123");
    expect(gruppen[2].schluessel).toBe("name:testo|vier");
  });

  it("nennt die frueheren Schluessel, damit Ignoriertes ignoriert bleibt", () => {
    const a = e({ vorname: "Jörg", nachname: "Prüf-Mann", telefon: "0171 5550123" });
    const b = e({ vorname: "JÖRG", nachname: "prüf-mann", telefon: "+49 171 5550123" });
    const [gruppe] = findeDuplikatGruppen([a, b]);
    expect(gruppe.kriterium).toBe("telefon");
    // Frueher: die letzten neun Ziffern der Rohnummer.
    expect(gruppe.alteSchluessel).toEqual(["phone:715550123"]);

    const c = e({ vorname: "Jörg", nachname: "Prüf-Mann" });
    const d = e({ vorname: "jörg", nachname: "Prüf-Mann " });
    const [namensGruppe] = findeDuplikatGruppen([c, d]);
    // Frueher: Umlaute umgeschrieben, Bindestrich entfernt.
    expect(namensGruppe.alteSchluessel).toEqual(["name:joerg|pruefmann"]);
  });

  it("drei Etiketten werden mit Komma und 'und' verbunden", () => {
    expect(duplikatEtikett(["name", "email", "telefon"])).toBe(
      "gleiche E-Mail, gleiche Telefonnummer und gleicher Name",
    );
  });
});

describe("findPotentialDuplicates beim Anlegen", () => {
  const k = (felder: Partial<KundeData>) => ({ ...e(felder as Partial<DuplikatEintrag>), ...felder }) as KundeData;

  it("meldet keinen Treffer bei nur gleichem Vornamen oder nur '+49'", () => {
    const bestand = [k({ vorname: "Testa", nachname: "Musterling", telefon: "+49", email: "" })];
    expect(findPotentialDuplicates({ vorname: "Testa", nachname: "Beispielfrau", telefon: "+49" }, bestand)).toEqual([]);
  });

  it("meldet gleiche Nummer in anderer Schreibweise als harten Treffer", () => {
    const bestand = [k({ vorname: "Fiktiva", nachname: "Zwei", telefon: "+49 171 5550123" })];
    const treffer = findPotentialDuplicates({ vorname: "Neu", nachname: "Person", telefon: "0171 5550123" }, bestand);
    expect(treffer.map((t) => t.grund)).toEqual(["telefon"]);
  });

  it("meldet den vollen Namen, E-Mail geht vor", () => {
    const bestand = [
      k({ vorname: "Testo", nachname: "Vier" }),
      k({ vorname: "Andere", nachname: "Person", email: "treffer@test.invalid" }),
      k({ vorname: "Testo", nachname: "Vier", geloescht: true }),
    ];
    const treffer = findPotentialDuplicates(
      { vorname: "TESTO", nachname: "vier", email: "Treffer@test.invalid" },
      bestand,
    );
    expect(treffer.map((t) => t.grund)).toEqual(["name_exakt", "email"]);
  });
});
