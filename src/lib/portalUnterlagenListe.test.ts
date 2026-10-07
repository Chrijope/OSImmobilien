import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { buildBankpruefungDocListe } from "./bankpruefungListe";
import { sammleNaechsteSchritte } from "./portalNaechsteSchritte";
import { portalUnterlagenListe } from "./portalUnterlagenListe";

/**
 * Eine Liste im Portal (Entscheidung Christian, 25.09.2026). /kunde/profil
 * und /kunde/investments zeigen dieselbe Pflichtliste wie das CRM, und die
 * Übersicht zählt ihre offenen Unterlagen aus derselben Liste. Alle Fälle
 * sind erfunden.
 */

const lies = (pfad: string) => readFileSync(resolve(__dirname, "..", "..", pfad), "utf8");

beforeAll(async () => {
  await i18n.changeLanguage("de");
});

const sa = {
  beschaeftigungsart: "angestellt",
  mietart: "Zur Miete",
  bankkonten: [
    { konto: "Girokonto", institut: "Bank A", iban: "" },
    { konto: "Girokonto", institut: "", iban: "" },
  ],
  vermoegenswerte: [{ art: "Bank- & Sparguthaben", institut: "Bank A", betrag: "20.000,00" }],
  person2Data: {
    beschaeftigungsart: "angestellt",
    mietart: "Zur Miete",
    bankkonten: [{ konto: "Girokonto", institut: "", iban: "" }],
    vermoegenswerte: [{ art: "Bank- & Sparguthaben", institut: "", betrag: "" }],
  },
};

const zeile = (docStatuses: Record<string, string> = {}) => ({
  id: "inv-test",
  meta: { saData: sa, saSigned: true, docStatuses },
});

describe("portalUnterlagenListe", () => {
  it("enthält die volle Bankprüfung wie im CRM, samt Kontoauszügen und Nachweisen", () => {
    const liste = portalUnterlagenListe({ investmentRow: zeile(), kontaktMeta: {} });
    const crm = buildBankpruefungDocListe({ person: 1, saData: sa }).map((d) => d.name);
    const namen = liste.p1.bank.map((d) => d.name);
    expect(namen).toEqual(crm);
    expect(namen).toContain("Kontoauszüge der letzten 3 Monate");
    expect(namen).toContain("Nachweis: Girokonto – Bank A");
    expect(namen).toContain("Nachweis: Bank- & Sparguthaben – Bank A");
    // Leere zweite Kontozeile ergibt nichts, Eigenkapital ist je Vermögenswert belegt.
    expect(namen).not.toContain("Nachweis: Girokonto");
    expect(namen).not.toContain("Eigenkapitalnachweis");
  });

  it("Person 2 richtet sich nach ihren eigenen Angaben", () => {
    const liste = portalUnterlagenListe({ investmentRow: zeile(), kontaktMeta: {} });
    const p2 = liste.p2.aktiv.filter((d) => d.required).map((d) => d.name);
    expect(p2).toContain("Eigenkapitalnachweis Person 2");
    expect(p2).not.toContain("Nachweis: Girokonto Person 2");
  });

  it("hängt von Hand ergänzte Unterlagen und Altzeilen mit Datei an", () => {
    const liste = portalUnterlagenListe({
      investmentRow: zeile(),
      kontaktMeta: { customBankDocs: [{ id: "cbd-1", name: "Erbschein", required: true }] },
      docStatuses: { Eigenkapitalnachweis: "approved", "Nachweis: Girokonto": "rejected" },
    });
    const bank = liste.p1.bank;
    expect(bank.find((d) => d.name === "Erbschein")?.required).toBe(true);
    expect(bank.find((d) => d.name === "Eigenkapitalnachweis")?.required).toBe(false);
    expect(bank.find((d) => d.name === "Nachweis: Girokonto")?.required).toBe(false);
  });

  it("verlangt vor der Freischaltung nur die Startunterlagen", () => {
    const liste = portalUnterlagenListe({
      investmentRow: { id: "inv-test", meta: { saData: sa, unterlagenFreigeschaltet: false } },
      kontaktMeta: {},
    });
    expect(liste.freigeschaltet).toBe(false);
    expect(liste.p1.aktiv.filter((d) => d.required).map((d) => d.name)).toEqual([
      "Personalausweis",
      "Letzter Gehaltsnachweis",
    ]);
    // Angezeigt (und für den Handy-Scan angeboten) wird trotzdem alles.
    expect(liste.p1.alle.map((d) => d.name)).toContain("Kontoauszüge der letzten 3 Monate");
  });
});

describe("Beide Portalseiten liefern dieselbe Liste", () => {
  const seiten = ["src/pages/Kundenprofilseite.tsx", "src/pages/KundeInvestments.tsx"];

  it("beide Seiten bauen ihre Liste über portalUnterlagenListe", () => {
    for (const seite of seiten) {
      const code = lies(seite);
      expect(code, seite).toMatch(/portalUnterlagenListe\(\{/);
      expect(code, seite).toMatch(/const allP1Docs = portalListe\.p1\.alle;/);
      expect(code, seite).toMatch(/const allP2Docs = portalListe\.p2\.alle;/);
      expect(code, seite).toMatch(/const activeP1Docs = portalListe\.p1\.aktiv;/);
      // Der Handy-Scan bekommt genau diese Liste.
      expect(code, seite).toMatch(/docList=\{\((scanPerson|scanDialogPerson) === 2 \? allP2Docs : allP1Docs\)/);
    }
  });

  it("keine Seite hält mehr eine eigene Unterlagenliste", () => {
    for (const seite of seiten) {
      const code = lies(seite);
      expect(code, seite).not.toMatch(/const INITIAL_PFLICHT_DOCS\b/);
      expect(code, seite).not.toMatch(/const GEHALTS_DOCS_P1\b/);
      expect(code, seite).not.toMatch(/buildBankpruefungBaseDocs/);
      expect(code, seite).not.toMatch(/variant: "kompakt"/);
    }
  });

  it("die Übersicht zählt offene Unterlagen aus derselben Liste", () => {
    const liste = portalUnterlagenListe({ investmentRow: zeile(), kontaktMeta: {} });
    const pflicht = liste.p1.aktiv.filter((d) => d.required).map((d) => d.name);
    // Alles bis auf zwei Pflichtzeilen ist hochgeladen.
    const docStatuses = Object.fromEntries(pflicht.slice(2).map((n) => [n, "uploaded"]));
    const schritte = sammleNaechsteSchritte({
      investments: [{ id: "inv-test", objekt: "Musterhaus", meta: { pipelineStufe: "bonitaetsunterlagen", saData: sa, saSigned: true, docStatuses } }],
      kontaktMeta: {},
      jetzt: new Date("2026-09-25T09:00:00"),
    });
    const aufgaben = schritte.filter((s) => s.art === "aufgabe");
    expect(aufgaben).toHaveLength(1);
    expect(aufgaben[0].titel).toBe("2 Unterlagen fehlen noch");
  });
});
