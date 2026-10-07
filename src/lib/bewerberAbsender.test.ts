/**
 * Bewerbermails persönlich und seltener im Spam (26.09.2026).
 *
 * Geprüft wird die reine Entscheidung (welche Vorlage an Bewerber geht, welcher
 * Absender und welche Antwortadresse), dass send-transactional-email sie
 * anwendet, und dass die Linkadresse der Bewerber-Functions fest auf
 * portal.more.immo steht. Die Edge Functions laufen in Deno, dort wird am
 * Quelltext geprüft. Das echte Rendern prüft
 * supabase/functions/_shared/transactional-email-templates/bewerbermail_test.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BEWERBER_ABSENDER_RUECKFALL,
  BEWERBER_INTERNE_VORLAGEN,
  BEWERBER_MAIL_BASIS,
  bewerberAbsender,
  istBewerbermail,
} from "../../supabase/functions/_shared/bewerber-absender";
import { VORLAGEN_ZIELGRUPPE } from "../../supabase/functions/_shared/transactional-email-templates/_zielgruppe";

const lies = (...teile: string[]) => readFileSync(join(process.cwd(), ...teile), "utf8");

describe("istBewerbermail", () => {
  it("erkennt jede bewerber-Vorlage an den Bewerber, aber keine interne Meldung", () => {
    const bewerberVorlagen = Object.keys(VORLAGEN_ZIELGRUPPE).filter((n) => n.startsWith("bewerber-"));
    expect(bewerberVorlagen.length).toBeGreaterThan(15);
    for (const name of bewerberVorlagen) {
      expect(istBewerbermail(name), name).toBe(!BEWERBER_INTERNE_VORLAGEN.has(name));
    }
    for (const name of ["bewerber-kennenlernen-einladung", "bewerber-nicht-erreicht", "bewerber-zugangsdaten",
      "bewerber-nachfass-kennenlernen", "bewerber-termin-bestaetigung", "bewerber-kennenlernen-erinnerung-1"]) {
      expect(istBewerbermail(name), name).toBe(true);
    }
  });

  it("lässt die Meldungen an HR beim neutralen Absender", () => {
    for (const name of ["bewerber-termin-hr", "bewerber-hr-anruf", "bewerber-neu-intern",
      "bewerber-vertrag-unterschrieben-intern"]) {
      expect(istBewerbermail(name), name).toBe(false);
    }
  });

  it("zählt den Startfahrplan mit, aber keine Kunden- oder Vertragsmail", () => {
    expect(istBewerbermail("paket-uebersicht")).toBe(true);
    for (const name of ["nicht-erreicht-mail-1", "vertrag-signatur", "sa-invitation", "chat-nachricht"]) {
      expect(istBewerbermail(name), name).toBe(false);
    }
  });

  it("jede interne Vorlage steht wirklich in der Registry", () => {
    for (const name of BEWERBER_INTERNE_VORLAGEN) expect(VORLAGEN_ZIELGRUPPE[name], name).toBe("intern");
  });
});

describe("bewerberAbsender", () => {
  it("setzt Namen der HR-Ansprechpartnerin und ihre Adresse", () => {
    expect(bewerberAbsender({ name: "Sarah Kaiser-Thom", email: "s.kaiser-thom@more.immo" })).toEqual({
      anzeige: "Sarah Kaiser-Thom | MOREImmo",
      antwortAn: "s.kaiser-thom@more.immo",
    });
  });

  it("fällt ohne Person auf MOREImmo und office@ zurück", () => {
    for (const hr of [undefined, null, {}, { name: "  " }]) {
      expect(bewerberAbsender(hr)).toEqual({ anzeige: BEWERBER_ABSENDER_RUECKFALL, antwortAn: "office@more.immo" });
    }
    expect(BEWERBER_ABSENDER_RUECKFALL).toBe("MOREImmo");
  });

  it("antwortet an office@, wenn die Person keine brauchbare Adresse hat", () => {
    expect(bewerberAbsender({ name: "Sarah Kaiser-Thom", email: "keine adresse" }).antwortAn).toBe("office@more.immo");
    expect(bewerberAbsender({ name: "Sarah Kaiser-Thom" }).anzeige).toBe("Sarah Kaiser-Thom | MOREImmo");
  });

  it("entfernt Zeichen, die den Mailkopf brechen würden", () => {
    const { anzeige } = bewerberAbsender({ name: 'Sarah "X" <evil@x.de>', email: "s@more.immo" });
    expect(anzeige).not.toMatch(/[<>"]/);
    expect(anzeige.endsWith(" | MOREImmo")).toBe(true);
  });
});

describe("send-transactional-email wendet den Bewerber-Absender an", () => {
  const quelle = lies("supabase", "functions", "send-transactional-email", "index.ts");
  const start = quelle.indexOf("3b3.");
  const block = quelle.slice(start, quelle.indexOf("3c.", start));

  it("setzt Absender und Antwortadresse aus der HR-Ansprechpartnerin", () => {
    expect(block).toContain("if (istBewerbermail(templateName))");
    expect(block).toContain("bewerberAbsender(hrFuerBewerber)");
    expect(block).toContain("absenderAnzeige = bewerberKopf.anzeige");
    // Eine ausdrücklich mitgegebene Antwortadresse bleibt stehen.
    expect(block).toContain("if (!replyTo) replyTo = bewerberKopf.antwortAn");
  });

  it("lädt die Person selbst und glaubt dem Aufrufer den Absender nicht", () => {
    expect(quelle).toContain("hrFuerBewerber = await hrAnsprechpartner(supabase as never)");
    expect(block).not.toMatch(/templateData\.hrKontakt|templateData\.berater/);
  });

  it("der Absender landet im From der Warteschlange", () => {
    expect(quelle).toContain("from: `${absenderAnzeige} <noreply@${FROM_DOMAIN}>`");
  });

  it("der Kennenlernen-Versand setzt kein eigenes Reply-To mehr", () => {
    expect(lies("supabase", "functions", "_shared", "kennenlernen-versand.ts")).not.toContain("replyTo:");
  });
});

describe("Links in Bewerbermails zeigen auf portal.more.immo", () => {
  it("die Basis ist fest", () => {
    expect(BEWERBER_MAIL_BASIS).toBe("https://portal.more.immo");
  });

  it("die Bewerber-Functions lesen keine Basisadresse aus der Umgebung", () => {
    for (const fn of ["send-bewerber-termin", "send-bewerber-erstgespraech-reminders"]) {
      const quelle = lies("supabase", "functions", fn, "index.ts");
      expect(quelle, fn).not.toContain('Deno.env.get("APP_BASE_URL")');
      expect(quelle, fn).toContain("BEWERBER_MAIL_BASIS");
    }
  });
});
