import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// Die Logik liegt bei der Edge Function, getestet wird sie hier, weil Vitest
// nur unterhalb von src sucht (wie bei finanzierung-starten-mail).
import {
  darfFinanzierungspartnerMelden,
  finanzierungPfad,
  hatMeldeRolle,
  meldungenZusammenfuehren,
  objektMitEinheit,
  partnerEmpfaenger,
  partnerMailDaten,
} from "../../supabase/functions/_shared/finanzierung-partner-benachrichtigen.ts";
import { kundenUnterlagenDateien } from "./finanzierungUnterlagenZip";

const quelle = (pfad: string) => readFileSync(resolve(__dirname, "../..", pfad), "utf-8");

describe("Empfaenger der Mail an die Finanzierungspartner", () => {
  const profile = [
    { id: "fp1", name: "Erika Partner", email: "erika@example.org" },
    { id: "fp2", name: "Ohne Mail", email: "  " },
    { id: "kunde", name: "Ein Kunde", email: "kunde@example.org" },
  ];

  it("schreibt nur gewaehlte Nutzer mit der Rolle Finanzierungspartner an", () => {
    const { empfaenger, uebersprungen } = partnerEmpfaenger(["fp1", "kunde", "fp1"], ["fp1", "fp2"], profile);
    expect(empfaenger).toEqual([{ id: "fp1", name: "Erika Partner", email: "erika@example.org" }]);
    expect(uebersprungen).toEqual([{ id: "kunde", grund: "kein Finanzierungspartner" }]);
  });

  it("benennt einen Partner ohne Mailadresse", () => {
    const { empfaenger, uebersprungen } = partnerEmpfaenger(["fp2"], ["fp1", "fp2"], profile);
    expect(empfaenger).toEqual([]);
    expect(uebersprungen).toEqual([{ id: "fp2", grund: "keine Mailadresse hinterlegt" }]);
  });

  it("laesst nur interne Rollen mit Bearbeitungsrecht senden, nie den Finanzierungspartner", () => {
    expect(hatMeldeRolle(["finanzierungspartner"])).toBe(false);
    expect(hatMeldeRolle(["kunde", "vertriebspartner"])).toBe(true);
    expect(hatMeldeRolle("admin")).toBe(false);
    expect(darfFinanzierungspartnerMelden("backoffice")).toBe(true);
    expect(darfFinanzierungspartnerMelden("finanzierungspartner")).toBe(false);
  });

  it("haelt je Partner nur die letzte Meldung", () => {
    const alt = [{ userId: "fp1", am: "2026-10-01T08:00:00Z" }, { userId: "fp2", am: "2026-10-02T08:00:00Z" }, { kaputt: true }];
    expect(meldungenZusammenfuehren(alt, [{ userId: "fp1", am: "2026-10-16T09:00:00Z" }])).toEqual([
      { userId: "fp1", am: "2026-10-16T09:00:00Z" },
      { userId: "fp2", am: "2026-10-02T08:00:00Z" },
    ]);
  });
});

describe("Inhalt der Mail an die Finanzierungspartner", () => {
  it("fuehrt Kunde, Objekt mit Einheit, Kaufpreis, Datum und Link", () => {
    expect(partnerMailDaten({
      partnerName: "Erika Partner",
      kundeName: "Max Mustermann",
      objekt: objektMitEinheit("Musterstraße 1", "WE 12"),
      kaufpreis: "132.000 €",
      unterschriebenAm: "16.10.2026",
      link: `https://crm.example${finanzierungPfad("k1", "i1")}`,
    })).toEqual({
      finanzierungspartnerName: "Erika Partner",
      kundeName: "Max Mustermann",
      objektTitel: "Musterstraße 1, WE 12",
      kaufpreis: "132.000 €",
      unterschriebenAm: "16.10.2026",
      link: "https://crm.example/kunden/k1?tab=investments&investment=i1#finanzierung",
    });
  });

  it("verdoppelt die Einheit nicht und faellt ohne Namen auf einen Satz zurueck", () => {
    expect(objektMitEinheit("Musterstraße 1 WE 12", "12")).toBe("Musterstraße 1 WE 12");
    expect(objektMitEinheit("Musterstraße 1", "")).toBe("Musterstraße 1");
    expect(partnerMailDaten({ kaufpreis: "x", link: "l" }).kundeName).toBe("Ein Kunde");
  });

  it("schickt keine Anhaenge und nennt Knopf und Kernsatz", () => {
    const vorlage = quelle("supabase/functions/_shared/transactional-email-templates/finanzierung-starten.tsx");
    expect(vorlage).toContain("Der Finanzierungsprozess kann gestartet werden.");
    expect(vorlage).toContain('text="Unterlagen im CRM öffnen"');
    expect(vorlage).toContain("als ZIP bereit");
    const fn = quelle("supabase/functions/finanzierung-partner-benachrichtigen/index.ts");
    expect(fn).not.toMatch(/attachments\s*:/);
    expect(quelle("supabase/config.toml")).toMatch(/\[functions\.finanzierung-partner-benachrichtigen\]\s*\nverify_jwt = true/);
  });
});

describe("ZIP Kundenunterlagen", () => {
  it("nimmt jede Datei einmal und legt den Kundenordner mit Unterordnern ab", () => {
    const dateien = kundenUnterlagenDateien({
      rvPdfPath: "reservierung/k1/i1/RV.pdf",
      saPdfPath: "kundenordner/k1/i1/SA.pdf",
      saPdf: "Selbstauskunft Max.pdf",
      docFileUrls: {
        Personalausweis: "k1/ausweis.pdf",
        Reservierung: "https://x.supabase.co/storage/v1/object/sign/unterlagen/reservierung/k1/i1/RV.pdf?token=abc",
      },
      kundenordner: [
        { id: "o1", parent_id: null, typ: "ordner", name: "Steuer", storage_path: null },
        { id: "d1", parent_id: "o1", typ: "datei", name: "Bescheid.pdf", storage_path: "kunden/k1/b.pdf" },
        { id: "d2", parent_id: null, typ: "datei", name: "Ohne Pfad", storage_path: null },
      ],
    });
    expect(dateien.map((d) => [d.ordner, d.name])).toEqual([
      ["Reservierung", "Reservierungsvereinbarung"],
      ["Selbstauskunft", "Selbstauskunft Max.pdf"],
      ["Bonitätsunterlagen", "Personalausweis"],
      ["Kundenordner › Steuer", "Bescheid.pdf"],
    ]);
  });
});
